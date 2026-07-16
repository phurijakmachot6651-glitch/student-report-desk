import { DEFAULT_REPORT_TIME, isValidReportTime, normalizeReportTime } from "@/lib/report-rows";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const ACTIVE_REPORT_TIME_SETTING_KEY = "active_report_time";
export const REPORT_TIMES_SETTING_KEY = "report_times";
export const REPORT_TIME_SETTINGS_QUERY_KEY = ["report-time-settings"] as const;
export const REPORT_TIME_SETTINGS_QUERY_OPTIONS = {
  staleTime: 0,
  refetchOnMount: "always",
  refetchOnReconnect: "always",
  refetchInterval: 10_000,
} as const;

type AppSupabaseClient = SupabaseClient<Database>;
export type ReportTimeSettings = {
  activeReportTime: string;
  reportTimes: string[];
};

export function normalizeActiveReportTime(value: string | null | undefined): string {
  return isValidReportTime(value) ? normalizeReportTime(value) : DEFAULT_REPORT_TIME;
}

export function normalizeReportTimes(values: string[] | null | undefined): string[] {
  const normalizedTimes = (values || [])
    .filter((value) => isValidReportTime(value))
    .map((value) => normalizeReportTime(value));
  const uniqueTimes = Array.from(new Set(normalizedTimes));

  return (uniqueTimes.length > 0 ? uniqueTimes : [DEFAULT_REPORT_TIME]).sort((a, b) =>
    a.localeCompare(b),
  );
}

export function buildReportTimeOptions(
  activeReportTime: string | null | undefined,
  reportTimes: string[] | null | undefined,
): string[] {
  return normalizeReportTimes([
    normalizeActiveReportTime(activeReportTime),
    ...(reportTimes || []),
  ]);
}

function parseStoredReportTimes(value: string | null | undefined): string[] {
  if (!value) return [DEFAULT_REPORT_TIME];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return normalizeReportTimes(
        parsed.filter((item): item is string => typeof item === "string"),
      );
    }
  } catch {
    return normalizeReportTimes(value.split(","));
  }

  return [DEFAULT_REPORT_TIME];
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

export async function fetchReportTimes(client: AppSupabaseClient): Promise<string[]> {
  const { data, error } = await client
    .from("app_settings")
    .select("value")
    .eq("key", REPORT_TIMES_SETTING_KEY)
    .maybeSingle();
  if (error) throw error;
  return parseStoredReportTimes(data?.value);
}

export async function fetchReportTimeSettings(
  client: AppSupabaseClient,
): Promise<ReportTimeSettings> {
  const [activeReportTime, reportTimes] = await Promise.all([
    fetchActiveReportTime(client),
    fetchReportTimes(client),
  ]);

  return { activeReportTime, reportTimes };
}

export async function saveActiveReportTime(
  client: AppSupabaseClient,
  value: string,
): Promise<string> {
  const normalizedTime = normalizeActiveReportTime(value);
  const { error } = await client
    .from("app_settings")
    .upsert({ key: ACTIVE_REPORT_TIME_SETTING_KEY, value: normalizedTime }, { onConflict: "key" });
  if (error) throw error;
  return normalizedTime;
}

export async function saveReportTimes(
  client: AppSupabaseClient,
  values: string[],
): Promise<string[]> {
  const normalizedTimes = normalizeReportTimes(values);
  const currentActiveTime = await fetchActiveReportTime(client);
  const activeTime = normalizedTimes.includes(currentActiveTime)
    ? currentActiveTime
    : normalizedTimes[0] || DEFAULT_REPORT_TIME;
  const { error } = await client.from("app_settings").upsert(
    [
      { key: REPORT_TIMES_SETTING_KEY, value: JSON.stringify(normalizedTimes) },
      { key: ACTIVE_REPORT_TIME_SETTING_KEY, value: activeTime },
    ],
    { onConflict: "key" },
  );
  if (error) throw error;
  return normalizedTimes;
}

