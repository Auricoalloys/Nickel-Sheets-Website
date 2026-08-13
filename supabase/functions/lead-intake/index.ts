// Enquiry form intake.
//
// Order of operations matters: the lead is committed to the `leads` table
// BEFORE the CRM is called. If the CRM is down, slow, or misconfigured, the
// lead is still captured and the retry worker will push it later. The visitor
// only sees an error if we genuinely failed to store the enquiry.
//
// Deploy:  supabase functions deploy lead-intake --no-verify-jwt
// Secrets: set CRM_WEBHOOK_URL / CRM_AUTH_* / CRM_API_KEY in the Supabase
//          dashboard (Edge Functions -> Secrets). Never in this repo.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { mirrorToSheet, pushToCrm } from "../_shared/crm.ts";

const ALLOWED_ORIGINS = [
  "https://www.nickelsheets.com",
  "https://nickelsheets.com",
  "http://localhost:4000", // jekyll serve
];

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

// Deliberately permissive: this rejects obvious junk without bouncing the
// unusual-but-valid addresses that real B2B enquiries arrive from.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface Lead {
  name: string;
  email: string;
  phone: string;
  country: string;
  inquiry: string;
  privacy_accepted: boolean;
  page_path: string;
  page_url: string;
  page_title: string;
  referrer: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
  gclid: string;
  user_agent: string;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405, origin);
  }

  let raw: Record<string, unknown>;
  try {
    raw = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400, origin);
  }

  // Honeypot. Real users never see this field, so anything in it is a bot.
  // Return 200 so the bot believes it succeeded and doesn't retry.
  if (str(raw.company_website, 200)) {
    return json({ ok: true, id: null }, 200, origin);
  }

  const lead: Lead = {
    name: str(raw.name, 200),
    email: str(raw.email, 320).toLowerCase(),
    phone: str(raw.phone, 60),
    country: str(raw.country, 100),
    inquiry: str(raw.inquiry, 5000),
    privacy_accepted: raw.privacy_accepted === true || raw.privacy === "Accepted",
    page_path: str(raw.page_path, 500),
    page_url: str(raw.page_url, 1000),
    page_title: str(raw.page_title, 300),
    referrer: str(raw.referrer, 1000),
    utm_source: str(raw.utm_source, 200),
    utm_medium: str(raw.utm_medium, 200),
    utm_campaign: str(raw.utm_campaign, 200),
    utm_term: str(raw.utm_term, 200),
    utm_content: str(raw.utm_content, 200),
    gclid: str(raw.gclid, 300),
    user_agent: str(req.headers.get("user-agent"), 500),
  };

  const missing = (["name", "email", "phone", "country", "inquiry"] as const)
    .filter((f) => !lead[f]);
  if (missing.length) {
    return json({ ok: false, error: `Missing required field(s): ${missing.join(", ")}` }, 400, origin);
  }
  if (!EMAIL_RE.test(lead.email)) {
    return json({ ok: false, error: "Please enter a valid email address." }, 400, origin);
  }
  if (!lead.privacy_accepted) {
    return json({ ok: false, error: "Please accept the privacy policy to continue." }, 400, origin);
  }

  // Double-click / double-submit guard.
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
  // limit(1) matters: maybeSingle() errors if more than one row comes back, and
  // two prior identical submissions inside the window is possible.
  const { data: dupe } = await admin
    .from("leads")
    .select("id")
    .eq("email", lead.email)
    .eq("inquiry", lead.inquiry)
    .gte("created_at", fiveMinAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (dupe) {
    return json({ ok: true, id: dupe.id, duplicate: true }, 200, origin);
  }

  // 1. Commit the lead. This is the step that must not fail.
  const { data: inserted, error: insertErr } = await admin
    .from("leads")
    .insert(lead)
    .select("id")
    .single();

  if (insertErr || !inserted) {
    console.error("lead insert failed", insertErr);
    return json(
      { ok: false, error: "We could not record your enquiry. Please email info@auricoalloys.com." },
      500,
      origin,
    );
  }

  // 2. Fan out to the CRM and the existing Google Sheet in parallel. Neither is
  //    allowed to fail the request — the lead is already safe in Postgres, and
  //    the retry worker will chase a failed CRM push.
  const [result] = await Promise.all([
    pushToCrm(lead, inserted.id),
    mirrorToSheet({ ...lead, id: inserted.id, created_at: new Date().toISOString() }),
  ]);

  await admin
    .from("leads")
    .update({
      crm_status: result.status,
      crm_id: result.crmId,
      crm_last_error: result.error,
      crm_attempts: 1,
      crm_synced_at: result.status === "synced" ? new Date().toISOString() : null,
    })
    .eq("id", inserted.id);

  if (result.status !== "synced") {
    console.error(`CRM push ${result.status} for lead ${inserted.id}: ${result.error}`);
  }

  return json({ ok: true, id: inserted.id }, 200, origin);
});
