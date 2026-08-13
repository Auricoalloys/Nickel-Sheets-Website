// Retries leads whose CRM push did not succeed.
//
// Run on a schedule (see supabase/README.md). Picks up anything left in
// 'pending' or 'failed', retries with backoff, and gives up after MAX_ATTEMPTS
// so a permanently-rejected lead doesn't spin forever — it stays in the table
// with crm_last_error set for a human to look at.
//
// Deploy: supabase functions deploy lead-retry

import { createClient } from "jsr:@supabase/supabase-js@2";
import { CRM_WEBHOOK_URL, pushToCrm } from "../_shared/crm.ts";

const MAX_ATTEMPTS = 8;
const BATCH_SIZE = 50;

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// Exponential backoff: only retry once the lead is old enough for this attempt
// number. 1st retry after ~2min, then 4, 8, 16... capped at 6 hours.
function isDue(createdAt: string, attempts: number): boolean {
  const delayMs = Math.min(2 ** attempts * 60_000, 6 * 60 * 60_000);
  return Date.now() - new Date(createdAt).getTime() >= delayMs;
}

Deno.serve(async () => {
  if (!CRM_WEBHOOK_URL) {
    return new Response(
      JSON.stringify({ ok: false, error: "CRM_WEBHOOK_URL not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const { data: leads, error } = await admin
    .from("leads")
    .select("*")
    .in("crm_status", ["pending", "failed", "skipped"])
    .lt("crm_attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("retry query failed", error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let synced = 0, failed = 0, skipped = 0;

  for (const lead of leads ?? []) {
    if (!isDue(lead.created_at, lead.crm_attempts)) {
      skipped++;
      continue;
    }

    const result = await pushToCrm(lead, lead.id);
    const attempts = lead.crm_attempts + 1;

    await admin
      .from("leads")
      .update({
        crm_status: result.status === "synced" ? "synced" : "failed",
        crm_id: result.crmId ?? lead.crm_id,
        crm_attempts: attempts,
        crm_last_error: result.error,
        crm_synced_at: result.status === "synced" ? new Date().toISOString() : null,
      })
      .eq("id", lead.id);

    if (result.status === "synced") {
      synced++;
    } else {
      failed++;
      if (attempts >= MAX_ATTEMPTS) {
        console.error(`lead ${lead.id} exhausted retries: ${result.error}`);
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, examined: leads?.length ?? 0, synced, failed, skipped }),
    { headers: { "Content-Type": "application/json" } },
  );
});
