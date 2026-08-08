-- Phase 3: authenticated, retry-safe CSV evidence imports.
--
-- CSV parsing and mapping previews happen in the browser. Only mapped rows and
-- a minimal audit trail reach Postgres. Accepted rows remain ordinary Research
-- evidence so existing search, review, tagging, citation, and deletion rules
-- continue to apply.

create table public.evidence_import_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  client_ref uuid not null,
  filename text not null check (char_length(btrim(filename)) between 1 and 255),
  source_kind text not null default 'csv' check (source_kind = 'csv'),
  duplicate_policy text not null default 'skip' check (duplicate_policy in ('skip', 'import')),
  status text not null default 'completed' check (status in ('completed', 'completed_with_errors')),
  total_rows integer not null default 0 check (total_rows between 0 and 500),
  accepted_rows integer not null default 0 check (accepted_rows >= 0),
  duplicate_rows integer not null default 0 check (duplicate_rows >= 0),
  rejected_rows integer not null default 0 check (rejected_rows >= 0),
  field_mapping jsonb not null default '{}'::jsonb check (jsonb_typeof(field_mapping) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (owner_id, client_ref),
  check (accepted_rows + duplicate_rows + rejected_rows = total_rows)
);

create table public.evidence_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid not null references public.evidence_import_runs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  row_number integer not null check (row_number >= 2 and row_number <= 501),
  status text not null check (status in ('accepted', 'duplicate', 'rejected')),
  source_title text check (source_title is null or char_length(source_title) <= 500),
  content_hash text check (content_hash is null or char_length(content_hash) = 32),
  research_item_id uuid references public.research_items(id) on delete set null,
  duplicate_of uuid references public.research_items(id) on delete set null,
  error_messages text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  unique (import_run_id, row_number)
);

alter table public.evidence_import_runs enable row level security;
alter table public.evidence_import_rows enable row level security;

create policy "project members manage own evidence import runs"
on public.evidence_import_runs
for all
to authenticated
using (
  owner_id = (select auth.uid())
  and public.can_access_project(project_id)
)
with check (
  owner_id = (select auth.uid())
  and public.can_access_project(project_id)
);

create policy "project members manage own evidence import rows"
on public.evidence_import_rows
for all
to authenticated
using (
  public.can_access_project(project_id)
  and exists (
    select 1
    from public.evidence_import_runs run
    where run.id = import_run_id
      and run.project_id = evidence_import_rows.project_id
      and run.owner_id = (select auth.uid())
  )
)
with check (
  public.can_access_project(project_id)
  and exists (
    select 1
    from public.evidence_import_runs run
    where run.id = import_run_id
      and run.project_id = evidence_import_rows.project_id
      and run.owner_id = (select auth.uid())
  )
);

create policy "permanent authenticated users only"
on public.evidence_import_runs
as restrictive
for all
to authenticated
using (coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) is false)
with check (coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) is false);

create policy "permanent authenticated users only"
on public.evidence_import_rows
as restrictive
for all
to authenticated
using (coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) is false)
with check (coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) is false);

create index evidence_import_runs_project_created_idx
  on public.evidence_import_runs (project_id, created_at desc, id desc);
create index evidence_import_runs_owner_id_idx
  on public.evidence_import_runs (owner_id);
create index evidence_import_rows_run_status_idx
  on public.evidence_import_rows (import_run_id, status, row_number);
create index evidence_import_rows_project_id_idx
  on public.evidence_import_rows (project_id);
create index evidence_import_rows_research_item_id_idx
  on public.evidence_import_rows (research_item_id)
  where research_item_id is not null;
create index evidence_import_rows_duplicate_of_idx
  on public.evidence_import_rows (duplicate_of)
  where duplicate_of is not null;
create index research_items_project_content_hash_idx
  on public.research_items (project_id, (metadata ->> 'content_hash'))
  where metadata ? 'content_hash';
create index research_items_project_normalized_url_idx
  on public.research_items (project_id, lower(btrim(url)))
  where url is not null;

create trigger set_evidence_import_runs_updated_at
before update on public.evidence_import_runs
for each row execute function public.set_updated_at();

revoke all on table public.evidence_import_runs from public, anon, authenticated, service_role;
revoke all on table public.evidence_import_rows from public, anon, authenticated, service_role;
grant select, insert, update on table public.evidence_import_runs to authenticated;
grant select, insert on table public.evidence_import_rows to authenticated;

create or replace function public.preview_evidence_csv_duplicates(
  p_project_id uuid,
  p_rows jsonb
)
returns table (
  row_number integer,
  duplicate_of uuid,
  reason text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  candidate jsonb;
  candidate_row integer;
  candidate_title text;
  candidate_url text;
  candidate_source_text text;
  candidate_identity text;
  candidate_hash text;
  matched public.research_items%rowtype;
begin
  if (select auth.uid()) is null
    or coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true)
    or not public.can_access_project(p_project_id) then
    raise exception 'Evidence import preview is unavailable to this account.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'Evidence import preview must contain at most 500 rows.' using errcode = '22023';
  end if;

  for candidate in select value from jsonb_array_elements(p_rows)
  loop
    candidate_row := case when coalesce(candidate ->> 'rowNumber', '') ~ '^\d+$'
      then (candidate ->> 'rowNumber')::integer else null end;
    candidate_title := left(btrim(coalesce(candidate ->> 'title', '')), 500);
    candidate_url := nullif(left(btrim(coalesce(candidate ->> 'url', '')), 2000), '');
    candidate_source_text := nullif(left(btrim(coalesce(candidate ->> 'sourceText', '')), 20000), '');
    candidate_identity := lower(regexp_replace(candidate_title, '[[:space:]]+', ' ', 'g'))
      || '|' || lower(regexp_replace(coalesce(candidate_url, ''), '[[:space:]]+', ' ', 'g'))
      || '|' || lower(regexp_replace(coalesce(candidate_source_text, ''), '[[:space:]]+', ' ', 'g'));
    candidate_hash := md5(candidate_identity);

    select item.* into matched
    from public.research_items item
    where item.project_id = p_project_id
      and (
        item.metadata ->> 'content_hash' = candidate_hash
        or (candidate_url is not null and lower(btrim(item.url)) = lower(candidate_url))
      )
    order by item.created_at, item.id
    limit 1;

    if matched.id is not null then
      row_number := candidate_row;
      duplicate_of := matched.id;
      reason := case when matched.metadata ->> 'content_hash' = candidate_hash
        then 'same_content' else 'same_url' end;
      return next;
    end if;
  end loop;
end;
$$;

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
  tag_id uuid;
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
      select tag.id into tag_id
      from public.tags tag
      where tag.project_id = p_project_id and lower(tag.name) = lower(tag_name)
      order by tag.created_at, tag.id
      limit 1;

      if tag_id is null then
        insert into public.tags (project_id, name)
        values (p_project_id, tag_name)
        on conflict (project_id, name) do update set name = excluded.name
        returning id into tag_id;
      end if;

      insert into public.item_tags (project_id, tag_id, item_type, item_id)
      values (p_project_id, tag_id, 'research'::public.item_kind, inserted_id)
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

revoke all on function public.preview_evidence_csv_duplicates(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.import_evidence_csv(uuid, uuid, text, jsonb, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.preview_evidence_csv_duplicates(uuid, jsonb) to authenticated;
grant execute on function public.import_evidence_csv(uuid, uuid, text, jsonb, text, jsonb) to authenticated;

comment on table public.evidence_import_runs is
  'Private, project-scoped audit summaries for bounded evidence imports. Raw CSV files are not stored.';
comment on table public.evidence_import_rows is
  'Minimal row outcomes for evidence import troubleshooting; accepted source content remains in research_items.';
comment on function public.preview_evidence_csv_duplicates(uuid, jsonb) is
  'Returns existing Research matches for up to 500 mapped CSV candidates without storing the preview.';
comment on function public.import_evidence_csv(uuid, uuid, text, jsonb, text, jsonb) is
  'Validates and imports up to 500 mapped CSV rows as Research evidence with idempotent audit history.';
