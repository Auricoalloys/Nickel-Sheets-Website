# Enquiry lead pipeline

Website enquiry form → Supabase Edge Function → your CRM, with the lead stored
in Supabase first so a CRM outage can never lose one.

```
floating-form.js  ──POST──▶  lead-intake  ──1──▶  leads table  (always)
                                          ──2──▶  your CRM     (retried on failure)
                                lead-retry ─────▶  your CRM     (scheduled sweep)
```

The visitor sees success only if step 1 committed. Step 2 failing is invisible
to them and is retried automatically — which is the behaviour the old Google
Apps Script setup did not have.

## What you need to fill in

Only two things are CRM-specific, and both live in
`functions/_shared/crm.ts` (imported by both functions, so there is one copy):

1. **`toCrmPayload()`** — map our fields onto your CRM's field names.
2. **`extractCrmId()`** — pull your CRM's record id out of its response so it
   gets stored on the lead. Return `null` if your CRM doesn't return one.

Everything else is generic.

## Where the credentials go

**Never in this repository.** It is a public GitHub repo published by Jekyll;
anything committed here is permanent and world-readable.

Credentials go in Supabase Edge Function secrets. Recommended route, because it
keeps the values out of your shell history:

> Supabase dashboard → your project → **Project Settings → Edge Functions →
> Secrets** → *Add new secret*, one row per variable.

| Secret | Required | Notes |
| --- | --- | --- |
| `CRM_WEBHOOK_URL` | yes | Your CRM's lead intake endpoint. |
| `CRM_AUTH_HEADER` | no | Header name for the auth token. Defaults to `Authorization`. |
| `CRM_AUTH_VALUE` | no | Full header value, e.g. `Bearer abc123`. Include the scheme. |
| `CRM_API_KEY` | no | Sent as a separate header alongside the auth header. |
| `CRM_API_KEY_HEADER` | no | Header name for the API key. Defaults to `x-api-key`. |
| `CRM_TIMEOUT_MS` | no | Defaults to `8000`. |
| `SHEET_WEBHOOK_URL` | no | Existing Google Apps Script `/exec` URL. Set it to keep the Google Sheet filling in parallel during the switch to the CRM; unset it when you no longer need the sheet. |

Set only what your CRM actually needs — the auth header and the API key are
independent, so you can use either, both, or neither.

If you prefer the CLI, put them in a gitignored file rather than typing them as
arguments (shell history captures arguments, and `.env` is already gitignored):

```bash
supabase secrets set --env-file ./supabase/.env
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do
not set them yourself, and never put the service role key in any file under
`javascript/`.

## Setup

```bash
supabase link --project-ref nnxiioeqroxutwwcqnpg
supabase db push
```

Deploy:

```bash
supabase functions deploy lead-intake --no-verify-jwt
supabase functions deploy lead-retry
```

`--no-verify-jwt` is required on `lead-intake` because the public website calls
it without a session. It is protected by origin allow-listing, a honeypot,
required-field validation and a 5-minute duplicate guard instead.

## Scheduling the retry sweep

In the Supabase dashboard, add a scheduled function (or `pg_cron` job) calling
`lead-retry` every 15 minutes. It processes up to 50 leads per run with
exponential backoff and gives up after 8 attempts, leaving `crm_last_error` set
for inspection.

## Operating it

Leads that never reached the CRM:

```sql
select id, created_at, name, email, crm_attempts, crm_last_error
from leads
where crm_status in ('pending', 'failed')
order by created_at desc;
```

Attribution — which pages actually produce enquiries:

```sql
select page_path, count(*) as leads
from leads
group by page_path
order by leads desc
limit 25;
```

`crm_status = 'skipped'` means `CRM_WEBHOOK_URL` was not set when the lead
arrived. The retry sweep picks these up automatically once the secret exists —
no manual re-queue needed. To push them immediately rather than waiting for the
next scheduled run, invoke the function once by hand from the dashboard.

## Security notes

- The `leads` table has RLS enabled with **no policies**, so the anon key
  published in the site's JavaScript cannot read it. Do not add an anon policy.
- The Edge Functions use the service role key, which bypasses RLS. That key must
  stay server-side only.
- `ALLOWED_ORIGINS` in `lead-intake/index.ts` restricts which sites may submit.
  Update it if the domain changes.
