-- Resolve the PL/pgSQL tag identifier after the initial CSV import migration.
-- The replacement keeps the public function signature and access grants intact.

create or replace function public.import_evidence_csv(
  p_project_id uuid,
  p_client_ref uuid,
  p_filename text,
  p_field_mapping jsonb,
  p_duplicate_policy text,
  p_rows jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  run_id uuid;
  existing_run_id uuid;
  candidate jsonb;
  candidate_index integer := 0;
  candidate_row integer;
  candidate_title text;
  candidate_url text;
  candidate_author text;
  candidate_publication text;
  candidate_published_text text;
  candidate_published_at date;
  candidate_item_type text;
  candidate_source_text text;
  candidate_notes text;
  candidate_key_findings text;
  candidate_collection text;
  candidate_tags text[];
  candidate_identity text;
  candidate_hash text;
  candidate_errors text[];
  matched_id uuid;
  inserted_id uuid;
  tag_name text;
  resolved_tag_id uuid;
  accepted_count integer := 0;
  duplicate_count integer := 0;
  rejected_count integer := 0;
begin
  if caller_id is null
    or coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true)
    or not public.can_access_project(p_project_id) then
    raise exception 'Evidence import is unavailable to this account.' using errcode = '42501';
  end if;
  if p_client_ref is null then
    raise exception 'Evidence import needs a stable retry identifier.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_filename, ''))) not between 1 and 255 then
    raise exception 'Evidence import filename is invalid.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_field_mapping) <> 'object' then
    raise exception 'Evidence import field mapping is invalid.' using errcode = '22023';
  end if;
  if p_duplicate_policy not in ('skip', 'import') then
    raise exception 'Evidence import duplicate policy is invalid.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array'
    or jsonb_array_length(p_rows) < 1
    or jsonb_array_length(p_rows) > 500 then
    raise exception 'Evidence import must contain between 1 and 500 rows.' using errcode = '22023';
  end if;

  select run.id into existing_run_id
  from public.evidence_import_runs run
  where run.owner_id = caller_id and run.client_ref = p_client_ref;

  if existing_run_id is not null then
    return jsonb_build_object(
      'run', (select to_jsonb(run) from public.evidence_import_runs run where run.id = existing_run_id),
      'rows', coalesce((
        select jsonb_agg(to_jsonb(import_row) order by import_row.row_number)
        from public.evidence_import_rows import_row
        where import_row.import_run_id = existing_run_id
      ), '[]'::jsonb),
      'retried', true
    );
  end if;

  insert into public.evidence_import_runs (
    project_id, owner_id, client_ref, filename, duplicate_policy,
    status, total_rows, accepted_rows, duplicate_rows, rejected_rows, field_mapping
  ) values (
    p_project_id, caller_id, p_client_ref, btrim(p_filename), p_duplicate_policy,
    'completed', jsonb_array_length(p_rows), 0, 0, jsonb_array_length(p_rows), p_field_mapping
  ) returning id into run_id;

  for candidate in select value from jsonb_array_elements(p_rows)
  loop
    candidate_index := candidate_index + 1;
    candidate_row := case when coalesce(candidate ->> 'rowNumber', '') ~ '^\d+$'
      then greatest(2, least(501, (candidate ->> 'rowNumber')::integer))
      else candidate_index + 1 end;
    candidate_title := left(btrim(coalesce(candidate ->> 'title', '')), 500);
    candidate_url := nullif(left(btrim(coalesce(candidate ->> 'url', '')), 2000), '');
    candidate_author := nullif(left(btrim(coalesce(candidate ->> 'author', '')), 300), '');
    candidate_publication := nullif(left(btrim(coalesce(candidate ->> 'publication', '')), 300), '');
    candidate_published_text := nullif(left(btrim(coalesce(candidate ->> 'publishedAt', '')), 10), '');
    candidate_item_type := coalesce(nullif(left(btrim(coalesce(candidate ->> 'itemType', '')), 80), ''), 'Imported source');
    candidate_source_text := nullif(left(btrim(coalesce(candidate ->> 'sourceText', '')), 20000), '');
    candidate_notes := nullif(left(btrim(coalesce(candidate ->> 'notes', '')), 10000), '');
    candidate_key_findings := nullif(left(btrim(coalesce(candidate ->> 'keyFindings', '')), 10000), '');
    candidate_collection := coalesce(nullif(left(btrim(coalesce(candidate ->> 'collection', '')), 120), ''), 'CSV imports');
    candidate_tags := array(
      select distinct left(btrim(tag.value), 40)
      from jsonb_array_elements_text(case when jsonb_typeof(candidate -> 'tags') = 'array' then candidate -> 'tags' else '[]'::jsonb end) tag(value)
      where btrim(tag.value) <> ''
      limit 10
    );
    candidate_errors := '{}';

    if candidate_title = '' then candidate_errors := array_append(candidate_errors, 'Title is required.'); end if;
    if candidate_url is not null and (
      candidate_url !~* '^https?://'
      or candidate_url ~* '^https?://[^/]*@'
    ) then candidate_errors := array_append(candidate_errors, 'URL must be a valid http or https address.'); end if;
    if candidate_published_text is not null then
      if candidate_published_text !~ '^\d{4}-\d{2}-\d{2}$'
        or to_char(to_date(candidate_published_text, 'YYYY-MM-DD'), 'YYYY-MM-DD') <> candidate_published_text then
        candidate_errors := array_append(candidate_errors, 'Published date is not valid.');
      else
        candidate_published_at := to_date(candidate_published_text, 'YYYY-MM-DD');
      end if;
    else
      candidate_published_at := null;
    end if;

    candidate_identity := lower(regexp_replace(candidate_title, '[[:space:]]+', ' ', 'g'))
      || '|' || lower(regexp_replace(coalesce(candidate_url, ''), '[[:space:]]+', ' ', 'g'))
      || '|' || lower(regexp_replace(coalesce(candidate_source_text, ''), '[[:space:]]+', ' ', 'g'));
    candidate_hash := md5(candidate_identity);

    if cardinality(candidate_errors) > 0 then
      rejected_count := rejected_count + 1;
      insert into public.evidence_import_rows (
        import_run_id, project_id, row_number, status, source_title, content_hash, error_messages
      ) values (
        run_id, p_project_id, candidate_row, 'rejected', nullif(candidate_title, ''), candidate_hash, candidate_errors
      );
      continue;
    end if;

    matched_id := null;
    select item.id into matched_id
    from public.research_items item
    where item.project_id = p_project_id
      and (
        item.metadata ->> 'content_hash' = candidate_hash
        or (candidate_url is not null and lower(btrim(item.url)) = lower(candidate_url))
      )
    order by item.created_at, item.id
    limit 1;

    if matched_id is not null and p_duplicate_policy = 'skip' then
      duplicate_count := duplicate_count + 1;
      insert into public.evidence_import_rows (
        import_run_id, project_id, row_number, status, source_title, content_hash, duplicate_of
      ) values (
        run_id, p_project_id, candidate_row, 'duplicate', candidate_title, candidate_hash, matched_id
      );
      continue;
    end if;

    insert into public.research_items (
      project_id, created_by, client_ref, title, url, author, publication,
      published_at, item_type, notes, key_findings, collection_name, metadata
    ) values (
      p_project_id,
      caller_id,
      format('csv:%s:%s', p_client_ref, candidate_row),
      candidate_title,
      candidate_url,
      candidate_author,
      candidate_publication,
      candidate_published_at,
      candidate_item_type,
      candidate_notes,
      candidate_key_findings,
      candidate_collection,
      jsonb_strip_nulls(jsonb_build_object(
        'sift_origin', 'csv_import',
        'capture_method', 'import',
        'source_label', coalesce(candidate_publication, 'CSV import'),
        'source_text', candidate_source_text,
        'processing_status', 'unprocessed',
        'content_hash', candidate_hash,
        'import_run_id', run_id,
        'import_row_number', candidate_row,
        'import_filename', btrim(p_filename),
        'duplicate_override_of', case when p_duplicate_policy = 'import' then matched_id else null end,
        'tags', to_jsonb(candidate_tags)
      ))
    ) returning id into inserted_id;

    foreach tag_name in array candidate_tags
    loop
      select tag.id into resolved_tag_id
      from public.tags tag
      where tag.project_id = p_project_id and lower(tag.name) = lower(tag_name)
      order by tag.created_at, tag.id
      limit 1;

      if resolved_tag_id is null then
        insert into public.tags (project_id, name)
        values (p_project_id, tag_name)
        on conflict (project_id, name) do update set name = excluded.name
        returning id into resolved_tag_id;
      end if;

      insert into public.item_tags (project_id, tag_id, item_type, item_id)
      values (p_project_id, resolved_tag_id, 'research'::public.item_kind, inserted_id)
      on conflict (tag_id, item_type, item_id) do nothing;
    end loop;

    accepted_count := accepted_count + 1;
    insert into public.evidence_import_rows (
      import_run_id, project_id, row_number, status, source_title, content_hash, research_item_id, duplicate_of
    ) values (
      run_id, p_project_id, candidate_row, 'accepted', candidate_title, candidate_hash, inserted_id, matched_id
    );
  end loop;

  update public.evidence_import_runs
  set accepted_rows = accepted_count,
      duplicate_rows = duplicate_count,
      rejected_rows = rejected_count,
      status = case when rejected_count > 0 then 'completed_with_errors' else 'completed' end,
      completed_at = timezone('utc', now())
  where id = run_id and owner_id = caller_id;

  return jsonb_build_object(
    'run', (select to_jsonb(run) from public.evidence_import_runs run where run.id = run_id),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(import_row) order by import_row.row_number)
      from public.evidence_import_rows import_row
      where import_row.import_run_id = run_id
    ), '[]'::jsonb),
    'retried', false
  );
end;
$$;
