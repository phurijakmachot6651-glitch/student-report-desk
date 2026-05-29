import type { DispatchCategory, Entry } from "@/lib/thai";

export const DEFAULT_REPORT_TIME = "05.45";

const ROW_ORDER_STEP = 10000;
const ROW_META_SUBCATEGORY = "__report_row_meta__";
const ROW_META_ORDER_BASE = -1000000;

export type StoredDispatchEntry = Entry & {
  id?: string;
  display_order?: number | null;
};

export type StoredDailyReport = {
  id: string;
  report_time?: string | null;
  reporter_name?: string | null;
  reporter_position?: string | null;
  dispatch_entries?: StoredDispatchEntry[] | null;
};

export type ReportRowData = {
  reportTime: string;
  reporterName: string;
  reporterPosition: string;
  entries: StoredDispatchEntry[];
};

export function normalizeReportTime(value: string | null | undefined): string {
  const rawValue = value?.trim();
  if (!rawValue) return DEFAULT_REPORT_TIME;

  const compactValue = rawValue.replace(/\s+/g, "");
  const separatedTime = compactValue.match(/^(\d{1,2})[:.](\d{1,2})$/);
  const compactTime = compactValue.match(/^(\d{1,2})(\d{2})$/);
  const match = separatedTime || compactTime;

  if (!match) return rawValue;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return rawValue;

  return `${String(hours).padStart(2, "0")}.${String(minutes).padStart(2, "0")}`;
}

export function isReportRowMetaEntry(entry: Pick<Entry, "category" | "subcategory">): boolean {
  return entry.category === "other" && entry.subcategory === ROW_META_SUBCATEGORY;
}

function localDisplayOrder(entry: StoredDispatchEntry): number {
  const displayOrder = Number(entry.display_order) || 0;
  return displayOrder >= ROW_ORDER_STEP ? displayOrder % ROW_ORDER_STEP : displayOrder;
}

function rowIndexFromEntry(entry: StoredDispatchEntry): number {
  const displayOrder = Number(entry.display_order) || 0;
  return displayOrder >= ROW_ORDER_STEP ? Math.floor(displayOrder / ROW_ORDER_STEP) : 0;
}

function rowIndexFromMeta(entry: StoredDispatchEntry): number {
  const count = Number(entry.count) || 0;
  return Math.max(0, count - 1);
}

function createRow(reportTime: string, reporterName = "", reporterPosition = ""): ReportRowData {
  return {
    reportTime: normalizeReportTime(reportTime),
    reporterName,
    reporterPosition,
    entries: [],
  };
}

export function decodeReportRows(report: StoredDailyReport | null | undefined): ReportRowData[] {
  if (!report) return [];

  const rawEntries = report.dispatch_entries || [];
  const rowsByIndex = new Map<number, ReportRowData>();
  const metaEntries = rawEntries.filter(isReportRowMetaEntry);

  if (metaEntries.length > 0) {
    metaEntries.forEach((entry) => {
      rowsByIndex.set(
        rowIndexFromMeta(entry),
        createRow(entry.cadet_name, entry.reason, entry.location),
      );
    });
  } else {
    rowsByIndex.set(
      0,
      createRow(report.report_time, report.reporter_name || "", report.reporter_position || ""),
    );
  }

  rawEntries
    .filter((entry) => !isReportRowMetaEntry(entry))
    .forEach((entry) => {
      const rowIndex = rowIndexFromEntry(entry);
      const row =
        rowsByIndex.get(rowIndex) ||
        createRow(
          rowIndex === 0 ? report.report_time : DEFAULT_REPORT_TIME,
          rowIndex === 0 ? report.reporter_name || "" : "",
          rowIndex === 0 ? report.reporter_position || "" : "",
        );

      row.entries.push(entry);
      rowsByIndex.set(rowIndex, row);
    });

  return Array.from(rowsByIndex.entries())
    .sort(([a], [b]) => a - b)
    .map(([, row]) => ({
      ...row,
      entries: row.entries
        .slice()
        .sort((a, b) => localDisplayOrder(a) - localDisplayOrder(b)),
    }));
}

export function getReportRow(
  report: StoredDailyReport | null | undefined,
  reportTime: string,
): ReportRowData | null {
  const selectedTime = normalizeReportTime(reportTime);
  return (
    decodeReportRows(report).find((row) => normalizeReportTime(row.reportTime) === selectedTime) ||
    null
  );
}

export function getReportRowFromReports(
  reports: StoredDailyReport[],
  reportTime: string,
): { report: StoredDailyReport; row: ReportRowData } | null {
  for (const report of reports) {
    const row = getReportRow(report, reportTime);
    if (row) return { report, row };
  }

  return null;
}

export function encodeReportRows(rows: ReportRowData[]): (Entry & { display_order: number })[] {
  return rows.flatMap((row, rowIndex) => {
    const metaEntry: Entry & { display_order: number } = {
      category: "other" as DispatchCategory,
      cadet_name: normalizeReportTime(row.reportTime),
      reason: row.reporterName,
      location: row.reporterPosition,
      subcategory: ROW_META_SUBCATEGORY,
      count: rowIndex + 1,
      display_order: ROW_META_ORDER_BASE + rowIndex,
    };

    const entries = row.entries.map((entry, entryIndex) => ({
      category: entry.category,
      cadet_name: entry.cadet_name || "",
      reason: entry.reason || "",
      location: entry.location || "",
      subcategory: entry.subcategory || "",
      count: Number(entry.count) || 0,
      display_order: rowIndex * ROW_ORDER_STEP + entryIndex,
    }));

    return [metaEntry, ...entries];
  });
}
