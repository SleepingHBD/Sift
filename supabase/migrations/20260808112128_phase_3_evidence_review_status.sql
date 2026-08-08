-- Phase 3: durable project evidence review states across existing source tables.
-- Source content remains in its purpose-built table; the inbox updates only
-- review_status and reviewed_at through the caller's existing RLS boundary.

alter table public.mentions
  add column if not exists review_status text not null default 'unreviewed',
  add column if not exists reviewed_at timestamptz;

alter table public.research_items
  add column if not exists review_status text not null default 'unreviewed',
  add column if not exists reviewed_at timestamptz;

alter table public.inspiration_items
  add column if not exists review_status text not null default 'unreviewed',
  add column if not exists reviewed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'mentions_review_status_check'
      and conrelid = 'public.mentions'::regclass
  ) then
    alter table public.mentions
      add constraint mentions_review_status_check
      check (review_status in ('unreviewed', 'relevant', 'irrelevant', 'archived'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'research_items_review_status_check'
      and conrelid = 'public.research_items'::regclass
  ) then
    alter table public.research_items
      add constraint research_items_review_status_check
      check (review_status in ('unreviewed', 'relevant', 'irrelevant', 'archived'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inspiration_items_review_status_check'
      and conrelid = 'public.inspiration_items'::regclass
  ) then
    alter table public.inspiration_items
      add constraint inspiration_items_review_status_check
      check (review_status in ('unreviewed', 'relevant', 'irrelevant', 'archived'));
  end if;
end
$$;

update public.mentions
set review_status = metadata ->> 'review_status'
where review_status = 'unreviewed'
  and metadata ->> 'review_status' in ('relevant', 'irrelevant', 'archived');

update public.research_items
set review_status = metadata ->> 'review_status'
where review_status = 'unreviewed'
  and metadata ->> 'review_status' in ('relevant', 'irrelevant', 'archived');

update public.inspiration_items
set review_status = metadata ->> 'review_status'
where review_status = 'unreviewed'
  and metadata ->> 'review_status' in ('relevant', 'irrelevant', 'archived');

update public.mentions
set reviewed_at = coalesce(reviewed_at, updated_at, created_at)
where review_status <> 'unreviewed'
  and reviewed_at is null;

update public.research_items
set reviewed_at = coalesce(reviewed_at, updated_at, created_at)
where review_status <> 'unreviewed'
  and reviewed_at is null;

update public.inspiration_items
set reviewed_at = coalesce(reviewed_at, updated_at, created_at)
where review_status <> 'unreviewed'
  and reviewed_at is null;

comment on column public.mentions.review_status is
  'Project evidence review state: unreviewed, relevant, irrelevant, or archived.';
comment on column public.research_items.review_status is
  'Project evidence review state: unreviewed, relevant, irrelevant, or archived.';
comment on column public.inspiration_items.review_status is
  'Project evidence review state: unreviewed, relevant, irrelevant, or archived.';
comment on column public.mentions.reviewed_at is
  'Timestamp of the latest explicit evidence review action; null when reset to unreviewed.';
comment on column public.research_items.reviewed_at is
  'Timestamp of the latest explicit evidence review action; null when reset to unreviewed.';
comment on column public.inspiration_items.reviewed_at is
  'Timestamp of the latest explicit evidence review action; null when reset to unreviewed.';
