-- Lock down the product-content table.
--
-- `busbarproduct` had Row-Level Security DISABLED, which Supabase reported as a
-- critical advisory (rls_disabled_in_public) on 06 Sep 2026. With RLS off, the
-- default grants to `anon` apply in full — and on this site the anon key is not
-- a secret: GitHub Pages serves javascript/product-page-runtime.js verbatim, so
-- the key and the project URL are in View Source on every product page.
--
-- Verified before writing this, with the key taken from the deployed JS:
--
--   DELETE /rest/v1/busbarproduct?slug=eq.<no-such-slug>   ->  HTTP 204
--
-- The filter matched nothing, so nothing was deleted, but 204 rather than 401 is
-- the whole point: the grant was there. `?id=gt.0` would have emptied the
-- product catalogue, and every product page with it.
--
-- The content itself is public marketing copy and MUST stay world-readable —
-- product-page-runtime.js renders each page from it at runtime with the anon
-- key, and a page whose row it cannot read renders nothing at all. So reads stay
-- open and only writing is taken away. Rows are added by hand in the Supabase
-- dashboard (docs/product-page-migration.md), which connects as a privileged
-- role and bypasses RLS — so authoring is unaffected.
--
-- Compare public.leads, which is RLS-on with NO policy because it holds customer
-- contact details. Same mechanism, opposite answer: what differs is whether the
-- data is meant to be public, not how careful we are being.
--
-- Safe to run more than once.

alter table public.busbarproduct enable row level security;

-- Reads: open to the world, which is what a public catalogue means.
drop policy if exists "Product content is publicly readable" on public.busbarproduct;
create policy "Product content is publicly readable"
  on public.busbarproduct
  for select
  to anon, authenticated
  using (true);

-- Writes: nobody holding the public key. Enabling RLS with only a SELECT policy
-- already blocks these; dropping the grants as well means a future policy added
-- in haste cannot quietly re-open them.
revoke insert, update, delete, truncate, references, trigger
  on public.busbarproduct from anon, authenticated;

comment on table public.busbarproduct is
  'Product page content, rendered client-side by javascript/product-page-runtime.js. '
  'World-readable by design; writable only by the dashboard/service_role. '
  'Do not grant write access to anon — the anon key is public in the site JS.';

-- ── Verification ───────────────────────────────────────────────────────────────
-- Expect rls_enabled = true, select_policies = 1, anon_write_grants = 0.
select
  (select relrowsecurity from pg_class where oid = 'public.busbarproduct'::regclass)
    as rls_enabled,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'busbarproduct' and cmd = 'SELECT')
    as select_policies,
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'busbarproduct'
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE'))
    as anon_write_grants;

-- Anything ELSE in this project with the same hole. The advisory email lists one
-- table per card and is easy to scroll past; this answers the question directly.
-- Expect zero rows. Any table listed here is readable AND writable by the public
-- key today, and needs its own decision: public data gets a select policy like
-- the one above, private data gets the leads treatment (RLS, no policy).
select
  c.relname as table_without_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and not c.relrowsecurity
order by c.relname;
