-- Enquiry form leads.
--
-- Every submission is written here FIRST, before any CRM call, so that a CRM
-- outage can never lose a lead. The CRM push then updates crm_status in place.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- captured from the enquiry form
  name              text not null,
  email             text not null,
  phone             text not null,
  country           text not null,
  inquiry           text not null,
  privacy_accepted  boolean not null default false,

  -- attribution: which page and which campaign produced this lead
  page_path     text,
  page_url      text,
  page_title    text,
  referrer      text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_term      text,
  utm_content   text,
  gclid         text,
  user_agent    text,

  -- CRM sync state
  crm_status     text not null default 'pending'
                 check (crm_status in ('pending', 'synced', 'failed', 'skipped')),
  crm_id         text,
  crm_attempts   integer not null default 0,
  crm_last_error text,
  crm_synced_at  timestamptz
);

-- Retry worker scans for work by status; keep that lookup cheap.
create index if not exists leads_crm_status_idx
  on public.leads (crm_status, created_at)
  where crm_status in ('pending', 'failed');

create index if not exists leads_created_at_idx on public.leads (created_at desc);

-- Cheap duplicate guard: same email + same enquiry text inside 5 minutes is a
-- double-click, not two leads. Enforced in the Edge Function, indexed here.
create index if not exists leads_email_created_idx on public.leads (email, created_at desc);

-- RLS on with NO policies: the anon key published in the site's JavaScript gets
-- no access at all. The Edge Function uses the service_role key, which bypasses
-- RLS. Do not add an anon policy to this table.
alter table public.leads enable row level security;

revoke all on public.leads from anon, authenticated;

comment on table public.leads is
  'Website enquiry form submissions. Written before the CRM call so leads survive CRM downtime. Not readable with the anon key.';
