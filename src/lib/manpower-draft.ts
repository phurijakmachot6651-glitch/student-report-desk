import { supabase } from "@/integrations/supabase/client";
import type { ManpowerSheetData } from "./manpower-sheet-config";

const MANPOWER_DRAFT_KEY = "student-report-desk:manpower-draft:v1";
const MANPOWER_CLOUD_KEY_PREFIX = "manpower_draft_v1:";

export type ManpowerDraft = {
  reportDate: string;
  signatureId: string;
  importText: string;
  data: ManpowerSheetData;
  savedAt: string;
};

function isManpowerDraft(value: unknown): value is ManpowerDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<ManpowerDraft>;
  const reportDate = draft.reportDate || "";
  const parsedDate = new Date(`${reportDate}T00:00:00`);
  return Boolean(
    /^\d{4}-\d{2}-\d{2}$/u.test(reportDate) &&
    !Number.isNaN(parsedDate.getTime()) &&
    typeof draft.signatureId === "string" &&
    typeof draft.importText === "string" &&
    typeof draft.savedAt === "string" &&
    !Number.isNaN(Date.parse(draft.savedAt)) &&
    draft.data &&
    typeof draft.data === "object" &&
    Array.isArray(draft.data.entries),
  );
}

function parseManpowerDraft(value: string | null): ManpowerDraft | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isManpowerDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readManpowerDraft(): ManpowerDraft | null {
  if (typeof window === "undefined") return null;
  try {
    return parseManpowerDraft(window.localStorage.getItem(MANPOWER_DRAFT_KEY));
  } catch {
    return null;
  }
}

export function saveManpowerDraft(draft: ManpowerDraft): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(MANPOWER_DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

async function cloudDraftKey(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return `${MANPOWER_CLOUD_KEY_PREFIX}${data.user.id}`;
}

/** Read the current admin's draft so another browser can continue the same form. */
export async function readCloudManpowerDraft(): Promise<ManpowerDraft | null> {
  try {
    const key = await cloudDraftKey();
    if (!key) return null;
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) return null;
    return parseManpowerDraft(data?.value || null);
  } catch {
    return null;
  }
}

/** Save to the existing admin-only settings store; local storage remains the offline fallback. */
export async function saveCloudManpowerDraft(draft: ManpowerDraft): Promise<boolean> {
  try {
    const key = await cloudDraftKey();
    if (!key) return false;
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key, value: JSON.stringify(draft) }, { onConflict: "key" });
    return !error;
  } catch {
    return false;
  }
}
