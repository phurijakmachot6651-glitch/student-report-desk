import {
  getDispatchPeriodKey,
  isContinuingDispatchEntry,
  isDispatchPeriodActiveAt,
  parseDispatchPeriod,
  reportDateTimeToTimestamp,
} from "@/lib/dispatch-period";
import {
  decodeReportRows,
  type StoredDailyReport,
  type StoredDispatchEntry,
} from "@/lib/report-rows";

export function mergeActiveContinuingEntries(
  reports: StoredDailyReport[],
  currentEntries: StoredDispatchEntry[],
  reportDate: string,
  reportTime: string,
): StoredDispatchEntry[] {
  const targetTimestamp = reportDateTimeToTimestamp(reportDate, reportTime);
  if (!targetTimestamp) return currentEntries;

  const latestEntries = new Map<string, { timestamp: string; entry: StoredDispatchEntry }>();

  reports.forEach((report) => {
    if (!report.report_date) return;

    decodeReportRows(report).forEach((row) => {
      const timestamp = reportDateTimeToTimestamp(report.report_date || "", row.reportTime);
      if (!timestamp || timestamp >= targetTimestamp) return;

      row.entries.forEach((entry) => {
        if (!isContinuingDispatchEntry(entry)) return;
        const key = getDispatchPeriodKey(entry);
        const previous = latestEntries.get(key);
        if (!previous || previous.timestamp <= timestamp) {
          latestEntries.set(key, { timestamp, entry });
        }
      });
    });
  });

  const currentKeys = new Set(
    currentEntries
      .filter((entry) => isContinuingDispatchEntry(entry))
      .map((entry) => getDispatchPeriodKey(entry)),
  );
  const carriedEntries = Array.from(latestEntries.values())
    .map(({ entry }) => entry)
    .filter(
      (entry) =>
        !currentKeys.has(getDispatchPeriodKey(entry)) &&
        isDispatchPeriodActiveAt(parseDispatchPeriod(entry.subcategory), targetTimestamp),
    );

  return [...currentEntries, ...carriedEntries];
}
