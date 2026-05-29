import { DEFAULT_REPORT_TIME, normalizeReportTime } from "@/lib/report-rows";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const ACTIVE_REPORT_TIME_SETTING_KEY = "active_report_time";

type AppSupabaseClient = SupabaseClient<Database>;

export function normalizeActiveReportTime(value: string | null | undefined): string {
  return normalizeReportTime(value) || DEFAULT_REPORT_TIME;
}

export async function fetchActiveReportTime(client: AppSupabaseClient): Promise<string> {
  const { data, error } = await client
    .from("app_settings")
    .select("value")
    .eq("key", ACTIVE_REPORT_TIME_SETTING_KEY)
    .maybeSingle();
  if (error) throw error;
  return normalizeActiveReportTime(data?.value);
}

export async function saveActiveReportTime(
  client: AppSupabaseClient,
  value: string,
): Promise<string> {
  const normalizedTime = normalizeActiveReportTime(value);
  const { error } = await client
    .from("app_settings")
    .upsert(
      { key: ACTIVE_REPORT_TIME_SETTING_KEY, value: normalizedTime },
      { onConflict: "key" },
    );
  if (error) throw error;
  return normalizedTime;
}
