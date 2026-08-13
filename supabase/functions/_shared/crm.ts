// Shared CRM adapter, imported by both lead-intake and lead-retry so the
// payload mapping only exists in one place.
//
// Configuration comes entirely from Edge Function secrets — never from a file
// in this repository. See supabase/README.md.

export const CRM_WEBHOOK_URL =
  Deno.env.get("CRM_WEBHOOK_URL") ?? Deno.env.get("CRM_ENDPOINT") ?? "";

const CRM_AUTH_HEADER = Deno.env.get("CRM_AUTH_HEADER") ?? "Authorization";
const CRM_AUTH_VALUE = Deno.env.get("CRM_AUTH_VALUE") ?? "";

const CRM_API_KEY = Deno.env.get("CRM_API_KEY") ?? "";
// Header your CRM expects the API key in. Override if it isn't x-api-key.
const CRM_API_KEY_HEADER = Deno.env.get("CRM_API_KEY_HEADER") ?? "x-api-key";

const CRM_TIMEOUT_MS = Number(Deno.env.get("CRM_TIMEOUT_MS") ?? "8000");

export interface LeadRecord {
  id?: string;
  created_at?: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  inquiry: string;
  page_url?: string;
  page_path?: string;
  page_title?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
}

// ---------------------------------------------------------------------------
// EDIT THIS to match your CRM's expected field names.
// This is the only part of the pipeline specific to your system.
// ---------------------------------------------------------------------------
export function toCrmPayload(lead: LeadRecord, id: string): Record<string, unknown> {
  return {
    external_id: id, // our leads.id — use it to dedupe on the CRM side
    source: "website",
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    country: lead.country,
    message: lead.inquiry,
    product_page: lead.page_url,
    page_title: lead.page_title,
    campaign: lead.utm_campaign,
    utm_source: lead.utm_source,
    utm_medium: lead.utm_medium,
    utm_term: lead.utm_term,
    utm_content: lead.utm_content,
    gclid: lead.gclid,
    referrer: lead.referrer,
    created_at: lead.created_at ?? new Date().toISOString(),
  };
}

// Pull your CRM's own record id out of its response. Return null if it doesn't
// return one — that is not treated as a failure.
export function extractCrmId(body: unknown): string | null {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    for (const key of ["id", "lead_id", "record_id", "data"]) {
      const v = b[key];
      if (typeof v === "string" || typeof v === "number") return String(v);
    }
  }
  return null;
}
// ---------------------------------------------------------------------------

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (CRM_AUTH_VALUE) headers[CRM_AUTH_HEADER] = CRM_AUTH_VALUE;
  if (CRM_API_KEY) headers[CRM_API_KEY_HEADER] = CRM_API_KEY;
  return headers;
}

// Optional: keep the existing Google Apps Script / Sheet fed in parallel, so the
// team's current workflow keeps working during the switch to the CRM. Unset
// this secret once you no longer need the sheet.
const SHEET_WEBHOOK_URL = Deno.env.get("SHEET_WEBHOOK_URL") ?? "";

/**
 * Mirrors the lead into the existing Google Sheet.
 *
 * Best-effort by design: the lead is already committed to Postgres before this
 * runs, so a sheet failure is logged and ignored rather than surfaced. Field
 * names match what the existing Apps Script already expects.
 */
export async function mirrorToSheet(lead: LeadRecord): Promise<void> {
  if (!SHEET_WEBHOOK_URL) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CRM_TIMEOUT_MS);
  try {
    await fetch(SHEET_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        country: lead.country,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        inquiry: lead.inquiry,
        privacy: "Accepted",
        timestamp: lead.created_at ?? new Date().toISOString(),
        page: lead.page_path ?? "",
      }),
      signal: controller.signal,
    });
  } catch (e) {
    console.error("sheet mirror failed:", e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}

export type PushResult =
  | { status: "synced"; crmId: string | null; error: null }
  | { status: "failed" | "skipped"; crmId: null; error: string };

export async function pushToCrm(lead: LeadRecord, id: string): Promise<PushResult> {
  if (!CRM_WEBHOOK_URL) {
    return { status: "skipped", crmId: null, error: "CRM_WEBHOOK_URL not configured" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CRM_TIMEOUT_MS);

  try {
    const res = await fetch(CRM_WEBHOOK_URL, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(toCrmPayload(lead, id)),
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      // Truncated so a verbose CRM error page can't bloat the leads table.
      return {
        status: "failed",
        crmId: null,
        error: `CRM responded ${res.status}: ${text.slice(0, 500)}`,
      };
    }

    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* non-JSON response is fine */ }
    return { status: "synced", crmId: extractCrmId(parsed), error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      status: "failed",
      crmId: null,
      error: controller.signal.aborted ? `CRM timeout after ${CRM_TIMEOUT_MS}ms` : msg,
    };
  } finally {
    clearTimeout(timer);
  }
}
