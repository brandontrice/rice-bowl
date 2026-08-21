import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS, so it must never be constructed in
 * response to an unauthenticated request — it exists for background work
 * (cron scoring, the player sync) that has no signed-in user to act as.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY, which is server-only and must never
 * be exposed with a NEXT_PUBLIC_ prefix.
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — background jobs cannot run without it.",
    );
  }

  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Guards a cron route. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 * Returns null when the caller is legitimate, or the reason it isn't.
 */
export function verifyCronRequest(request: Request): string | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return "CRON_SECRET is not configured";
  const header = request.headers.get("authorization");
  if (header !== `Bearer ${secret}`) return "unauthorized";
  return null;
}
