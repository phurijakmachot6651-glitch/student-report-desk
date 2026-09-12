import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DispatchSummaryDialog,
  type DispatchSummaryDetail,
} from "@/components/dispatch-summary-dialog";
import {
  Activity,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Eye,
  LogIn,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserMinus,
  UserX,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  cleanReportEntries,
  countDispatchEntry,
  splitCadetNames,
  summarizeDispatchEntries,
  todayISO,
  type DispatchCategory,
  type Entry,
} from "@/lib/thai";
import { thaiToArabicNumerals } from "@/lib/thai-numerals";
import {
  DEFAULT_REPORT_TIME,
  decodeReportRows,
  encodeReportRows,
  getReportRowFromReports,
  normalizeReportTime,
  type ReportRowData,
  type StoredDailyReport,
  type StoredDispatchEntry,
} from "@/lib/report-rows";
import {
  buildReportTimeOptions,
  fetchReportTimeSettings,
  REPORT_TIME_SETTINGS_QUERY_KEY,
  REPORT_TIME_SETTINGS_QUERY_OPTIONS,
} from "@/lib/report-settings";
import { isReportTimeApproaching } from "@/lib/report-time-alert";
import {
  createDispatchPeriod,
  formatDispatchUpdatedDateTime,
  getDispatchPeriodKey,
  getDispatchUpdatedAt,
  hasDispatchPeriod,
  isContinuingDispatchEntry,
  isDispatchPeriodActiveAt,
  isDutyAssignmentEntry,
  isMedicalAdmissionEntry,
  parseDispatchPeriod,
  parseDispatchBatch,
  reportDateTimeToTimestamp,
  serializeDispatchBatch,
  serializeDispatchPeriod,
  stampDispatchEntryUpdatedAt,
  unwrapDispatchMetadata,
  validateDispatchPeriod,
  type DispatchDateTimeParts,
} from "@/lib/dispatch-period";
import studentsData from "@/data/students.json";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "เช็คยอดกองร้อยที่ 4" },
      { name: "description", content: "ระบบจัดทำยอดกำลังพลนักเรียนนายร้อยตำรวจ" },
      {
        property: "og:image",
        content: "https://student-report-desk-neon.vercel.app/dragon_logo.png",
      },
      {
        name: "twitter:image",
        content: "https://student-report-desk-neon.vercel.app/dragon_logo.png",
      },
    ],
  }),
  component: Home,
});

function toThaiDate(isoDate: string) {
  const date = new Date(isoDate + "T00:00:00");
  return date.toLocaleDateString("th-TH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

type HomeSummaryCategory = "sick" | "leave" | "official" | "other" | "absent";

const HOME_SUMMARY_CATEGORIES: Array<{
  category: HomeSummaryCategory;
  icon: LucideIcon;
}> = [
  { category: "sick", icon: Activity },
  { category: "leave", icon: CalendarDays },
  { category: "official", icon: BriefcaseBusiness },
  { category: "other", icon: MoreHorizontal },
  { category: "absent", icon: UserX },
];

type HomeDispatchDetail = {
  id: string;
  category: HomeSummaryCategory;
  companyName: string;
  cadetName: string;
  reason: string;
  location: string;
  count: number;
};

type HomeDispatchRecord = {
  id: string;
  reportId: string;
  companyId: string;
  companyName: string;
  companyDisplayOrder: number;
  reportTime: string;
  reportDate: string;
  category: HomeSummaryCategory;
  entry: StoredDispatchEntry;
  names: string[];
  reason: string;
  location: string;
  count: number;
  updatedAt: string | null;
};

type HomeDispatchGroup = {
  key: string;
  batchId: string | null;
  category: HomeSummaryCategory;
  companyId: string;
  companyName: string;
  companyDisplayOrder: number;
  reportId: string;
  reportTime: string;
  reportDate: string;
  records: HomeDispatchRecord[];
  names: string[];
  reason: string;
  location: string;
  count: number;
  updatedAt: string | null;
};

function buildHomeDispatchDetails(companyName: string, entries: Entry[]): HomeDispatchDetail[] {
  return cleanReportEntries(entries).flatMap((entry, entryIndex) => {
    if (!HOME_SUMMARY_CATEGORIES.some(({ category }) => category === entry.category)) {
      return [];
    }

    const category = entry.category as HomeSummaryCategory;
    const names = splitCadetNames(entry.cadet_name);
    const count = countDispatchEntry(entry);
    const batch = parseDispatchBatch(entry.subcategory);
    const reason =
      entry.reason.trim() ||
      (category === "other" ? batch?.value?.trim() || entry.subcategory.trim() : "");
    const location = entry.location.trim();
    const detailBase = { category, companyName, reason, location };

    if (names.length > 0) {
      return names.map((cadetName, nameIndex) => ({
        ...detailBase,
        id: `${companyName}-${entryIndex}-${nameIndex}-${cadetName}`,
        cadetName,
        count: 1,
      }));
    }

    if (count <= 0) return [];

    return [
      {
        ...detailBase,
        id: `${companyName}-${entryIndex}-unnamed`,
        cadetName: "ไม่ระบุรายชื่อ",
        count,
      },
    ];
  });
}

function buildHomeDispatchRecords(
  company: HomeCompany,
  report: HomeReport,
  reportTime: string,
  entries: Entry[],
): HomeDispatchRecord[] {
  return cleanReportEntries(entries).flatMap((rawEntry, entryIndex) => {
    if (!HOME_SUMMARY_CATEGORIES.some(({ category }) => category === rawEntry.category)) {
      return [];
    }

    const entry = rawEntry as StoredDispatchEntry;
    const category = entry.category as HomeSummaryCategory;
    const names = splitCadetNames(entry.cadet_name);
    const count = countDispatchEntry(entry);
    const batch = parseDispatchBatch(entry.subcategory);
    if (names.length === 0 && count <= 0) return [];

    return [
      {
        id: entry.id || `${report.id}-${reportTime}-${entryIndex}`,
        reportId: report.id,
        companyId: company.id,
        companyName: company.name,
        companyDisplayOrder: company.display_order,
        reportTime: normalizeReportTime(reportTime),
        reportDate: report.report_date || "",
        category,
        entry,
        names,
        reason:
          entry.reason.trim() ||
          (category === "other" ? batch?.value?.trim() || entry.subcategory.trim() : ""),
        location: entry.location.trim(),
        count,
        updatedAt: getDispatchUpdatedAt(entry.subcategory) || entry.created_at || null,
      },
    ];
  });
}

function buildHomeDispatchGroups(
  records: HomeDispatchRecord[],
  category: HomeSummaryCategory | null,
): HomeDispatchGroup[] {
  const groups = new Map<string, HomeDispatchGroup>();

  records
    .filter((record) => category === null || record.category === category)
    .forEach((record) => {
      const batch = parseDispatchBatch(record.entry.subcategory);
      const key = [
        batch?.id ||
          [
            record.category,
            record.reason.trim().toLocaleLowerCase("th"),
            record.location.trim().toLocaleLowerCase("th"),
            unwrapDispatchMetadata(record.entry.subcategory),
          ].join("\u0000"),
      ].join("\u0000");
      const existing = groups.get(key);

      if (!existing) {
        groups.set(key, {
          key,
          batchId: batch?.id || null,
          category: record.category,
          companyId: record.companyId,
          companyName: record.companyName,
          companyDisplayOrder: record.companyDisplayOrder,
          reportId: record.reportId,
          reportTime: record.reportTime,
          reportDate: record.reportDate,
          records: [record],
          names: [...record.names],
          reason: record.reason,
          location: record.location,
          count: record.count,
          updatedAt: record.updatedAt,
        });
        return;
      }

      existing.records.push(record);
      existing.count += record.count;
      if (record.updatedAt && (!existing.updatedAt || record.updatedAt > existing.updatedAt)) {
        existing.updatedAt = record.updatedAt;
      }
      record.names.forEach((name) => {
        if (!existing.names.some((currentName) => quickStudentsMatch(currentName, name))) {
          existing.names.push(name);
        }
      });
    });

  return Array.from(groups.values()).sort(
    (first, second) =>
      first.reason.localeCompare(second.reason, "th") ||
      first.location.localeCompare(second.location, "th") ||
      first.companyDisplayOrder - second.companyDisplayOrder,
  );
}

function getActiveHomeCarriedEntries(
  reports: HomeReport[],
  companyId: string,
  reportDate: string,
  reportTime: string,
): Array<{ entry: StoredDispatchEntry; report: HomeReport; reportTime: string }> {
  const targetTimestamp = reportDateTimeToTimestamp(reportDate, reportTime);
  if (!targetTimestamp) return [];

  const latestEntries = new Map<
    string,
    { timestamp: string; entry: StoredDispatchEntry; report: HomeReport; reportTime: string }
  >();

  reports
    .filter((report) => report.company_id === companyId && Boolean(report.report_date))
    .forEach((report) => {
      decodeReportRows(report).forEach((row) => {
        const rowTimestamp = reportDateTimeToTimestamp(report.report_date || "", row.reportTime);
        if (!rowTimestamp || rowTimestamp >= targetTimestamp) return;

        row.entries.forEach((entry) => {
          if (!isContinuingDispatchEntry(entry)) return;
          const key = getDispatchPeriodKey(entry);
          const previous = latestEntries.get(key);
          if (!previous || previous.timestamp <= rowTimestamp) {
            latestEntries.set(key, {
              timestamp: rowTimestamp,
              entry,
              report,
              reportTime: row.reportTime,
            });
          }
        });
      });
    });

  return Array.from(latestEntries.values())
    .filter(({ entry }) =>
      isDispatchPeriodActiveAt(parseDispatchPeriod(entry.subcategory), targetTimestamp),
    )
    .map(({ entry, report, reportTime: sourceReportTime }) => ({
      entry,
      report,
      reportTime: sourceReportTime,
    }));
}

function formatDispatchStudentName(value: string): { number: string; name: string } {
  const student = studentsData.find((candidate) =>
    quickStudentsMatch(candidate.display_name, value),
  );
  if (student) {
    return {
      number: thaiToArabicNumerals(student.number),
      name: [student.name, student.surname].filter(Boolean).join(" ") || value,
    };
  }

  const numberMatch = value.match(/เลขที่\s*([๐-๙\d]+)/u);
  return {
    number: numberMatch ? thaiToArabicNumerals(numberMatch[1]) : "-",
    name: value.replace(/^นรต\.\s*/u, "").replace(/\s+เลขที่\s*[๐-๙\d]+\s*$/u, ""),
  };
}

type HomeReportWriteInput = {
  companyId: string;
  reportDate: string;
  report: HomeReport | null;
  rows: ReportRowData[];
};

async function writeHomeReportRows({
  companyId,
  reportDate,
  report,
  rows,
}: HomeReportWriteInput): Promise<void> {
  const reportPayload = {
    company_id: companyId,
    report_date: reportDate,
    reporter_name: rows[0]?.reporterName || report?.reporter_name || "",
    reporter_position: rows[0]?.reporterPosition || report?.reporter_position || "",
    report_time: rows[0]?.reportTime || report?.report_time || DEFAULT_REPORT_TIME,
  };

  const reportResult = report
    ? await supabase
        .from("daily_reports")
        .update(reportPayload)
        .eq("id", report.id)
        .select()
        .single()
    : await supabase
        .from("daily_reports")
        .upsert(reportPayload, { onConflict: "company_id,report_date" })
        .select()
        .single();

  const { data: savedReport, error: reportError } = reportResult;
  if (reportError) throw reportError;

  const { error: deleteError } = await supabase
    .from("dispatch_entries")
    .delete()
    .eq("report_id", savedReport.id);
  if (deleteError) throw deleteError;

  const encodedEntries = encodeReportRows(rows);
  if (encodedEntries.length === 0) return;

  const { error: entriesError } = await supabase.from("dispatch_entries").insert(
    encodedEntries.map((entry) => ({
      report_id: savedReport.id,
      category: entry.category,
      cadet_name: entry.cadet_name,
      reason: entry.reason,
      location: entry.location,
      subcategory: entry.subcategory,
      count: entry.count,
      display_order: entry.display_order,
    })),
  );
  if (entriesError) throw entriesError;
}

async function fetchLatestHomeReport(
  companyId: string,
  reportDate: string,
): Promise<HomeReport | null> {
  const { data, error } = await supabase
    .from("daily_reports")
    .select(
      "id,company_id,report_date,reporter_name,reporter_position,report_time,dispatch_entries(id,category,cadet_name,reason,location,subcategory,count,display_order,created_at)",
    )
    .eq("company_id", companyId)
    .eq("report_date", reportDate)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as HomeReport | null) || null;
}

async function fetchHomeReportsThroughDate(
  companyId: string,
  reportDate: string,
): Promise<HomeReport[]> {
  const { data, error } = await supabase
    .from("daily_reports")
    .select(
      "id,company_id,report_date,reporter_name,reporter_position,report_time,dispatch_entries(id,category,cadet_name,reason,location,subcategory,count,display_order,created_at)",
    )
    .eq("company_id", companyId)
    .lte("report_date", reportDate)
    .order("report_date", { ascending: true });
  if (error) throw error;
  return (data as unknown as HomeReport[]) || [];
}

function homeEntryMatchesTarget(entry: StoredDispatchEntry, target: HomeDispatchRecord): boolean {
  if (target.entry.id && entry.id === target.entry.id) return true;

  return (
    entry.category === target.entry.category &&
    entry.cadet_name === target.entry.cadet_name &&
    entry.reason === target.entry.reason &&
    entry.location === target.entry.location &&
    entry.subcategory === target.entry.subcategory
  );
}

function uniqueStudentNames(names: string[]): string[] {
  return names.reduce<string[]>((unique, name) => {
    if (!unique.some((currentName) => quickStudentsMatch(currentName, name))) {
      unique.push(name);
    }
    return unique;
  }, []);
}

function DispatchDetailsDialog({
  category,
  groups,
  companies,
  reports,
  reportDate,
  reportTime,
  onClose,
  onAdd,
}: {
  category: HomeSummaryCategory | null;
  groups: HomeDispatchGroup[];
  companies: HomeCompany[];
  reports: HomeReport[];
  reportDate: string;
  reportTime: string;
  onClose: () => void;
  onAdd: () => void;
}) {
  const queryClient = useQueryClient();
  const categoryLabel = category ? CATEGORY_LABELS[category] : "";
  const categoryTitle =
    category === "other" ? "รายการอื่น ๆ ทั้งหมด" : `การ${categoryLabel}ทั้งหมด`;
  const CategoryIcon =
    HOME_SUMMARY_CATEGORIES.find((item) => item.category === category)?.icon || Activity;
  const categoryGroups = category ? groups.filter((group) => group.category === category) : [];
  const total = categoryGroups.reduce((sum, group) => sum + group.count, 0);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [editingGroup, setEditingGroup] = useState<HomeDispatchGroup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HomeDispatchGroup | null>(null);

  useEffect(() => {
    setExpandedGroups({});
    if (category === null) {
      setEditingGroup(null);
      setDeleteTarget(null);
    }
  }, [category]);

  const removeGroup = useMutation({
    mutationFn: async (target: HomeDispatchGroup) => {
      const continuingKeys = new Set(
        target.records
          .filter((record) => isContinuingDispatchEntry(record.entry))
          .map((record) => getDispatchPeriodKey(record.entry)),
      );
      if (continuingKeys.size > 0) {
        const companyIds = Array.from(new Set(target.records.map((record) => record.companyId)));
        for (const companyId of companyIds) {
          const historicalReports = await fetchHomeReportsThroughDate(companyId, reportDate);
          for (const historicalReport of historicalReports) {
            const rows = decodeReportRows(historicalReport);
            let changed = false;
            const nextRows = rows.map((row) => ({
              ...row,
              entries: row.entries.filter((entry) => {
                const matches =
                  isContinuingDispatchEntry(entry) &&
                  continuingKeys.has(getDispatchPeriodKey(entry));
                if (matches) changed = true;
                return !matches;
              }),
            }));
            if (!changed) continue;

            await writeHomeReportRows({
              companyId,
              reportDate: historicalReport.report_date || reportDate,
              report: historicalReport,
              rows: nextRows,
            });
          }
        }
        return;
      }

      const sourceRecords = Array.from(
        new Map(
          target.records.map((record) => [
            `${record.companyId}\u0000${record.reportDate}\u0000${record.reportTime}`,
            record,
          ]),
        ).values(),
      );
      for (const sourceRecord of sourceRecords) {
        const latestReport = await fetchLatestHomeReport(
          sourceRecord.companyId,
          sourceRecord.reportDate || reportDate,
        );
        if (!latestReport) throw new Error("ไม่พบข้อมูลการจำหน่ายที่ต้องการลบ");

        const latestRows = decodeReportRows(latestReport);
        const targetRow = latestRows.find(
          (row) =>
            normalizeReportTime(row.reportTime) === normalizeReportTime(sourceRecord.reportTime),
        );
        if (!targetRow) throw new Error("ไม่พบรอบเวลาที่ต้องการลบ");

        const companyRecords = target.records.filter(
          (record) =>
            record.companyId === sourceRecord.companyId &&
            record.reportDate === sourceRecord.reportDate &&
            normalizeReportTime(record.reportTime) === normalizeReportTime(sourceRecord.reportTime),
        );
        const nextRows = latestRows.map((row) =>
          normalizeReportTime(row.reportTime) !== normalizeReportTime(sourceRecord.reportTime)
            ? row
            : {
                ...row,
                entries: row.entries.filter(
                  (entry) =>
                    !companyRecords.some((record) => homeEntryMatchesTarget(entry, record)),
                ),
              },
        );
        await writeHomeReportRows({
          companyId: sourceRecord.companyId,
          reportDate: sourceRecord.reportDate || reportDate,
          report: latestReport,
          rows: nextRows,
        });
      }
    },
    onSuccess: (_, target) => {
      toast.success(`ลบรายการ${CATEGORY_LABELS[target.category]} แล้ว`);
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["home-summary", reportDate] });
      queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
      queryClient.invalidateQueries({ queryKey: ["report"] });
    },
    onError: (error: Error) => toast.error(error.message || "ลบรายการไม่สำเร็จ"),
  });

  return (
    <>
      <Dialog open={category !== null} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8 text-xl">
              {category && <CategoryIcon className="h-5 w-5 text-primary" />}
              {categoryTitle}
            </DialogTitle>
            <DialogDescription>
              {toThaiDate(reportDate)} เวลา {reportTime} น. รวม {total} นาย
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-end border-b border-border/60 pb-3">
            <Button type="button" size="sm" onClick={onAdd}>
              <Plus className="h-4 w-4" />
              เพิ่มรายการ
            </Button>
          </div>

          <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
            {categoryGroups.length > 0 ? (
              categoryGroups.map((group) => {
                const expanded = expandedGroups[group.key] !== false;
                const namedStudents = uniqueStudentNames(group.names);

                return (
                  <section
                    key={group.key}
                    className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 bg-muted/20 p-3">
                      <div className="min-w-0 space-y-1">
                        <h3 className="text-base font-semibold text-primary">
                          {group.reason || "ไม่ระบุสาเหตุ"}
                          {group.updatedAt && (
                            <span className="ml-2 whitespace-nowrap text-xs font-normal text-muted-foreground">
                              (บันทึกตอน {formatDispatchUpdatedDateTime(group.updatedAt)})
                            </span>
                          )}
                        </h3>
                        <div className="text-xs text-muted-foreground">{group.count} นาย</div>
                        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                          <span>{group.location || "ไม่ระบุสถานที่"}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          onClick={() => setEditingGroup(group)}
                          aria-label={`แก้ไขรายการ ${group.reason || categoryLabel}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          แก้ไข
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => setDeleteTarget(group)}
                          aria-label={`ลบรายการ ${group.reason || categoryLabel}`}
                          title="ลบรายการ"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="hidden sm:inline">ลบ</span>
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            setExpandedGroups((current) => ({
                              ...current,
                              [group.key]: !expanded,
                            }))
                          }
                          aria-label={expanded ? "ซ่อนรายชื่อ" : "แสดงรายชื่อ"}
                          title={expanded ? "ซ่อนรายชื่อ" : "แสดงรายชื่อ"}
                        >
                          {expanded ? (
                            <ChevronUp className="h-5 w-5 text-primary" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-primary" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="divide-y divide-border/50 px-3">
                        {namedStudents.length > 0 ? (
                          namedStudents.map((name) => {
                            const student = formatDispatchStudentName(name);
                            const rosterStudent = findQuickStudent(name);
                            return (
                              <div
                                key={`${group.key}-${name}`}
                                className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-2 py-2 text-sm"
                              >
                                <span className="text-muted-foreground">
                                  เลขที่ {student.number}
                                </span>
                                <span className="min-w-0 truncate text-foreground">
                                  {student.name}
                                </span>
                                <Badge variant="secondary" className="shrink-0 text-[11px]">
                                  {rosterStudent
                                    ? `หมวด ${thaiToArabicNumerals(rosterStudent.squad)}`
                                    : thaiToArabicNumerals(group.companyName)}
                                </Badge>
                              </div>
                            );
                          })
                        ) : (
                          <div className="py-4 text-center text-xs text-muted-foreground">
                            รายการนี้ยังไม่ได้ระบุรายชื่อ
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                );
              })
            ) : (
              <div className="rounded-lg border border-dashed border-border/70 px-3 py-8 text-center text-sm text-muted-foreground">
                ยังไม่มีรายละเอียดการจำหน่ายประเภทนี้ในช่วงเวลาที่เลือก
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบรายการนี้?</AlertDialogTitle>
            <AlertDialogDescription>
              รายชื่อทั้งหมดในรายการ “{deleteTarget?.reason || categoryLabel}”
              จะถูกนำออกจากยอดจำหน่าย และไม่สามารถกู้คืนจากหน้าจอนี้ได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeGroup.isPending}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeGroup.isPending || !deleteTarget}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) removeGroup.mutate(deleteTarget);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeGroup.isPending ? "กำลังลบ..." : "ลบรายการ"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DispatchGroupEditorDialog
        group={editingGroup}
        companies={companies}
        reports={reports}
        reportDate={reportDate}
        reportTime={reportTime}
        onClose={() => setEditingGroup(null)}
      />
    </>
  );
}

type HomeCompany = {
  id: string;
  name: string;
  full_strength: number;
  display_order: number;
};

type HomeReport = StoredDailyReport & {
  company_id: string;
};

type QuickDispatchStudent = (typeof studentsData)[number];

const QUICK_DISPATCH_HOURS = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, "0"),
);
const QUICK_DISPATCH_MINUTES = Array.from({ length: 60 }, (_, index) =>
  String(index).padStart(2, "0"),
);

function normalizeQuickStudentName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("th");
}

function quickStudentNameKeys(value: string): string[] {
  const normalized = normalizeQuickStudentName(value);
  const withoutPrefix = normalized.replace(/^นรต\.\s*/u, "");
  const withoutNumber = withoutPrefix.replace(/\s+เลขที่\s+[๐-๙\d]+\s*$/u, "");
  return Array.from(new Set([normalized, withoutPrefix, withoutNumber]));
}

function quickStudentsMatch(first: string, second: string): boolean {
  const secondKeys = new Set(quickStudentNameKeys(second));
  return quickStudentNameKeys(first).some((key) => secondKeys.has(key));
}

function quickStudentIdentity(student: QuickDispatchStudent): string {
  return `${student.squad}:${thaiToArabicNumerals(student.number)}`;
}

function normalizeQuickSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("th")
    .replace(/\p{M}/gu, "")
    .replace(/นรต\.?/gu, "")
    .replace(/เลขที่/gu, "")
    .replace(/[\s._-]+/gu, "");
}

function quickSearchConsonants(value: string): string {
  return Array.from(normalizeQuickSearchText(value))
    .filter((character) => /[ก-ฮa-z0-9]/iu.test(character))
    .join("");
}

function isQuickSearchSubsequence(query: string, candidate: string): boolean {
  if (!query) return false;

  let queryIndex = 0;
  for (const character of candidate) {
    if (character === query[queryIndex]) queryIndex += 1;
    if (queryIndex === query.length) return true;
  }

  return false;
}

function quickStudentSearchText(student: QuickDispatchStudent): string {
  return normalizeQuickSearchText(`${student.name} ${student.surname} ${student.number}`);
}

function quickStudentMatchesSearch(student: QuickDispatchStudent, rawQuery: string): boolean {
  const query = normalizeQuickSearchText(rawQuery);
  if (!query) return false;

  const searchText = quickStudentSearchText(student);
  if (searchText.includes(query)) return true;

  const queryConsonants = quickSearchConsonants(rawQuery);
  return isQuickSearchSubsequence(queryConsonants, quickSearchConsonants(searchText));
}

function quickStudentSearchScore(student: QuickDispatchStudent, rawQuery: string): number {
  const query = normalizeQuickSearchText(rawQuery);
  const searchText = quickStudentSearchText(student);
  if (searchText === query) return 0;
  if (searchText.startsWith(query)) return 1;
  if (searchText.includes(query)) return 2;
  return isQuickSearchSubsequence(query, quickSearchConsonants(searchText)) ? 3 : 99;
}

function findQuickStudent(value: string, squad?: string): QuickDispatchStudent | null {
  const candidates = squad
    ? studentsData.filter((student) => student.squad === squad)
    : studentsData;

  const exactMatch = candidates.find(
    (student) =>
      normalizeQuickStudentName(student.display_name) === normalizeQuickStudentName(value) ||
      normalizeQuickStudentName([student.name, student.surname].filter(Boolean).join(" ")) ===
        normalizeQuickStudentName(value),
  );
  if (exactMatch) return exactMatch;

  const numberMatch = value.match(/เลขที่\s*([๐-๙\d]+)/u);
  const normalizedNumber = numberMatch ? thaiToArabicNumerals(numberMatch[1]) : "";

  if (normalizedNumber) {
    const byNumber = candidates.find(
      (student) => thaiToArabicNumerals(student.number) === normalizedNumber,
    );
    if (byNumber) return byNumber;
  }

  return (
    candidates.find((student) => quickStudentsMatch(student.display_name, value)) ||
    candidates.find((student) =>
      quickStudentsMatch([student.name, student.surname].filter(Boolean).join(" "), value),
    ) ||
    null
  );
}

/**
 * Build a lookup of the latest dispatch category for each named student in a
 * report row.  Entries are traversed in display order, so malformed legacy
 * data that contains a name more than once still resolves to the last entry.
 */
function buildStudentDispatchCategoryMap(
  companies: HomeCompany[],
  reports: HomeReport[],
  reportTime: string,
): Map<string, DispatchCategory> {
  const categories = new Map<string, DispatchCategory>();

  companies.forEach((company) => {
    const report = reports.find((candidate) => candidate.company_id === company.id);
    const row = report ? getReportRowFromReports([report], reportTime)?.row : null;
    if (!row) return;

    row.entries.forEach((entry) => {
      splitCadetNames(entry.cadet_name).forEach((name) => {
        const student = findQuickStudent(name, String(company.display_order));
        if (student) categories.set(quickStudentIdentity(student), entry.category);
      });
    });
  });

  return categories;
}

function studentMatchesTarget(name: string, target: QuickDispatchStudent, squad: string): boolean {
  const resolved = findQuickStudent(name, squad);
  return resolved
    ? quickStudentIdentity(resolved) === quickStudentIdentity(target)
    : quickStudentsMatch(name, target.display_name);
}

/** Remove selected students from every named entry before adding them to a new category. */
function removeStudentsFromEntries(
  entries: StoredDispatchEntry[],
  students: QuickDispatchStudent[],
  squad: string,
  updatedAt?: string,
): StoredDispatchEntry[] {
  if (students.length === 0) return entries;

  return entries.map((entry) => {
    const names = splitCadetNames(entry.cadet_name);
    if (names.length === 0) return entry;

    const remainingNames = names.filter(
      (name) => !students.some((student) => studentMatchesTarget(name, student, squad)),
    );
    if (remainingNames.length === names.length) return entry;

    const updatedEntry = {
      ...entry,
      cadet_name: remainingNames.join(", "),
      count: remainingNames.length,
    };

    return updatedAt ? stampDispatchEntryUpdatedAt(updatedEntry, updatedAt) : updatedEntry;
  });
}

function QuickDispatchDateTimeInput({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: DispatchDateTimeParts;
  onChange: (value: DispatchDateTimeParts) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_auto] gap-1.5">
        <Input
          type="date"
          aria-label={`${label} วันที่`}
          className="min-w-0"
          disabled={disabled}
          value={value.date}
          onChange={(event) => onChange({ ...value, date: event.target.value })}
        />
        <select
          aria-label={`${label} ชั่วโมง`}
          disabled={disabled}
          className="flex h-10 w-full rounded-md border border-input bg-transparent px-1 py-1 text-center text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          value={value.hour}
          onChange={(event) => onChange({ ...value, hour: event.target.value })}
        >
          <option value="">--</option>
          {QUICK_DISPATCH_HOURS.map((hour) => (
            <option key={hour} value={hour}>
              {hour}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label} นาที`}
          disabled={disabled}
          className="flex h-10 w-full rounded-md border border-input bg-transparent px-1 py-1 text-center text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          value={value.minute}
          onChange={(event) => onChange({ ...value, minute: event.target.value })}
        >
          <option value="">--</option>
          {QUICK_DISPATCH_MINUTES.map((minute) => (
            <option key={minute} value={minute}>
              {minute}
            </option>
          ))}
        </select>
        <span className="flex items-center text-sm text-muted-foreground">น.</span>
      </div>
    </div>
  );
}

function DispatchGroupEditorDialog({
  group,
  companies,
  reports,
  reportDate,
  reportTime,
  onClose,
}: {
  group: HomeDispatchGroup | null;
  companies: HomeCompany[];
  reports: HomeReport[];
  reportDate: string;
  reportTime: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [reason, setReason] = useState("");
  const [location, setLocation] = useState("");
  const [start, setStart] = useState<DispatchDateTimeParts>({
    date: "",
    hour: "",
    minute: "",
  });
  const [end, setEnd] = useState<DispatchDateTimeParts>({
    date: "",
    hour: "",
    minute: "",
  });
  const [medicalAdmission, setMedicalAdmission] = useState(false);
  const [dutyAssignment, setDutyAssignment] = useState(false);

  useEffect(() => {
    if (!group) return;

    const sourceEntry = group.records[0]?.entry;
    const period = sourceEntry ? parseDispatchPeriod(sourceEntry.subcategory) : null;
    setSelectedNames(uniqueStudentNames(group.names));
    setSearchQuery("");
    setReason(group.reason);
    setLocation(group.location);
    setStart(period?.start || { date: "", hour: "", minute: "" });
    setEnd(period?.end || { date: "", hour: "", minute: "" });
    setMedicalAdmission(sourceEntry ? isMedicalAdmissionEntry(sourceEntry) : false);
    setDutyAssignment(sourceEntry ? isDutyAssignmentEntry(sourceEntry) : false);
  }, [group]);

  const groupCompanies = useMemo(() => {
    if (!group) return [];

    const companyIds = Array.from(new Set(group.records.map((record) => record.companyId)));
    return companyIds
      .map((companyId) => companies.find((company) => company.id === companyId))
      .filter((company): company is HomeCompany => Boolean(company));
  }, [companies, group]);
  const currentRowsByCompany = useMemo(() => {
    const rows = new Map<string, ReportRowData>();
    companies.forEach((company) => {
      const report = reports.find((storedReport) => storedReport.company_id === company.id);
      const row = report
        ? getReportRowFromReports([report], group?.reportTime || reportTime)?.row
        : null;
      if (row) rows.set(company.id, row);
    });
    return rows;
  }, [companies, group?.reportTime, reportTime, reports]);
  const studentDispatchCategories = useMemo(() => {
    const categories = new Map<string, DispatchCategory>();
    if (!group) return categories;

    companies.forEach((company) => {
      const row = currentRowsByCompany.get(company.id);
      (row?.entries || []).forEach((entry) => {
        const isEditingEntry = group.records.some(
          (record) => record.companyId === company.id && homeEntryMatchesTarget(entry, record),
        );
        if (isEditingEntry) return;

        splitCadetNames(entry.cadet_name).forEach((name) => {
          const student = findQuickStudent(name, String(company.display_order));
          if (student) categories.set(quickStudentIdentity(student), entry.category);
        });
      });
    });

    return categories;
  }, [companies, currentRowsByCompany, group]);
  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) return [];
    return studentsData
      .filter((student) => quickStudentMatchesSearch(student, query))
      .sort(
        (first, second) =>
          quickStudentSearchScore(first, query) - quickStudentSearchScore(second, query) ||
          Number(first.squad) - Number(second.squad) ||
          Number(first.number) - Number(second.number),
      );
  }, [searchQuery]);

  const toggleStudent = (student: QuickDispatchStudent) => {
    const name = student.display_name;
    const studentId = quickStudentIdentity(student);

    setSelectedNames((current) =>
      current.some((currentName) => {
        const currentStudent = findQuickStudent(currentName, student.squad);
        return currentStudent
          ? quickStudentIdentity(currentStudent) === studentId
          : quickStudentsMatch(currentName, name);
      })
        ? current.filter((currentName) => {
            const currentStudent = findQuickStudent(currentName, student.squad);
            return currentStudent
              ? quickStudentIdentity(currentStudent) !== studentId
              : !quickStudentsMatch(currentName, name);
          })
        : [...current, name],
    );
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!group) throw new Error("ไม่พบรายการที่ต้องการแก้ไข");
      if (!reason.trim() || !location.trim()) {
        throw new Error("กรุณากรอกสาเหตุและสถานที่ให้ครบ");
      }

      const periodIssue = hasDispatchPeriod(group.category)
        ? validateDispatchPeriod({
            id: group.records[0]?.entry.id || crypto.randomUUID(),
            start,
            end,
            endIndefinite: false,
          })
        : null;
      if (periodIssue === "incomplete") {
        throw new Error("กรุณากรอกวันและเวลาเริ่มต้นและสิ้นสุดให้ครบ");
      }
      if (periodIssue === "order") {
        throw new Error("วันและเวลาสิ้นสุดต้องอยู่หลังวันและเวลาเริ่มต้น");
      }

      const selectedStudents = selectedNames
        .map((name) => {
          // Preserve the original squad when a name is already part of this
          // group; newly added names can be resolved from the full roster.
          const sourceRecord = group.records.find((record) =>
            record.names.some((currentName) => quickStudentsMatch(currentName, name)),
          );
          return (
            findQuickStudent(
              name,
              sourceRecord ? String(sourceRecord.companyDisplayOrder) : undefined,
            ) || findQuickStudent(name)
          );
        })
        .filter((student): student is QuickDispatchStudent => student !== null);
      if (selectedStudents.length !== selectedNames.length) {
        throw new Error("ไม่พบข้อมูลรายชื่อบางรายการ กรุณาเปิดรายละเอียดใหม่แล้วลองอีกครั้ง");
      }

      const selectedByCompany = new Map<string, QuickDispatchStudent[]>();
      selectedStudents.forEach((student) => {
        const company = companies.find(
          (candidate) => String(candidate.display_order) === student.squad,
        );
        if (!company) return;
        const current = selectedByCompany.get(company.id) || [];
        current.push(student);
        selectedByCompany.set(company.id, current);
      });

      const selectedTime = normalizeReportTime(group.reportTime || reportTime);
      const [medicalHour = "", medicalMinute = ""] = selectedTime.split(".");
      const medicalStart: DispatchDateTimeParts = {
        date: group.reportDate || reportDate,
        hour: medicalHour,
        minute: medicalMinute,
      };
      const usesPeriod =
        hasDispatchPeriod(group.category) ||
        (group.category === "sick" && medicalAdmission) ||
        (group.category === "other" && dutyAssignment);
      const batchId = group.batchId || crypto.randomUUID();
      const savedAt = new Date().toISOString();
      const companyIds = Array.from(
        new Set([...group.records.map((record) => record.companyId), ...selectedByCompany.keys()]),
      );
      for (const companyId of companyIds) {
        const company = companies.find((candidate) => candidate.id === companyId);
        if (!company) continue;

        const sourceReportDate = group.reportDate || reportDate;
        const latestReport = await fetchLatestHomeReport(companyId, sourceReportDate);
        const latestRows = decodeReportRows(latestReport);
        const targetRowIndex = latestRows.findIndex(
          (row) => normalizeReportTime(row.reportTime) === selectedTime,
        );
        const targetRow = targetRowIndex >= 0 ? latestRows[targetRowIndex] : null;

        const companyRecords = group.records.filter((record) => record.companyId === companyId);
        const matchingEntries =
          targetRow?.entries.filter((entry) =>
            companyRecords.some((record) => homeEntryMatchesTarget(entry, record)),
          ) || [];
        if (
          companyRecords.length > 0 &&
          (!latestReport || !targetRow || matchingEntries.length === 0)
        ) {
          throw new Error("รายการนี้ถูกแก้ไขจากหน้าต่างอื่นแล้ว กรุณาเปิดรายละเอียดใหม่");
        }

        const companyStudents = selectedByCompany.get(companyId) || [];
        if (!targetRow) {
          // A newly selected squad may not have had a report row for this
          // time yet, so create that row while preserving the same batch ID.
          if (companyStudents.length === 0) continue;

          const newEntry: StoredDispatchEntry = {
            category: group.category,
            cadet_name: companyStudents.map((student) => student.display_name).join(", "),
            reason: reason.trim(),
            location: location.trim(),
            subcategory: usesPeriod
              ? serializeDispatchPeriod({
                  ...createDispatchPeriod(batchId),
                  batchId,
                  batchCategory: group.category,
                  updatedAt: savedAt,
                  start: medicalAdmission || dutyAssignment ? medicalStart : start,
                  end:
                    medicalAdmission || dutyAssignment ? { date: "", hour: "", minute: "" } : end,
                  endIndefinite: false,
                  medicalAdmission,
                  dutyAssignment,
                })
              : serializeDispatchBatch({
                  id: batchId,
                  category: group.category,
                  value: group.category === "other" ? reason.trim() : "",
                  updatedAt: savedAt,
                }),
            count: companyStudents.length,
          };
          const nextRows = [
            ...latestRows,
            {
              reportTime: selectedTime,
              reporterName: latestRows[0]?.reporterName || latestReport?.reporter_name || "",
              reporterPosition:
                latestRows[0]?.reporterPosition || latestReport?.reporter_position || "",
              entries: cleanReportEntries([newEntry]),
            },
          ].sort((first, second) =>
            normalizeReportTime(first.reportTime).localeCompare(
              normalizeReportTime(second.reportTime),
            ),
          );
          await writeHomeReportRows({
            companyId,
            reportDate: sourceReportDate,
            report: latestReport,
            rows: nextRows,
          });
          continue;
        }

        const sourceEntry = matchingEntries[0] || group.records[0]?.entry;
        if (!sourceEntry && companyStudents.length > 0) {
          throw new Error("รายการนี้ถูกแก้ไขจากหน้าต่างอื่นแล้ว กรุณาเปิดรายละเอียดใหม่");
        }

        const replacement =
          sourceEntry && companyStudents.length > 0
            ? (() => {
                const sourcePeriod = parseDispatchPeriod(sourceEntry.subcategory);
                const nextSubcategory = usesPeriod
                  ? serializeDispatchPeriod({
                      ...sourcePeriod,
                      id: sourcePeriod.id || batchId,
                      batchId,
                      batchCategory: group.category,
                      updatedAt: savedAt,
                      start:
                        (medicalAdmission || dutyAssignment) &&
                        !isMedicalAdmissionEntry(sourceEntry) &&
                        !isDutyAssignmentEntry(sourceEntry)
                          ? medicalStart
                          : medicalAdmission || dutyAssignment
                            ? sourcePeriod.start
                            : start,
                      end:
                        medicalAdmission || dutyAssignment
                          ? { date: "", hour: "", minute: "" }
                          : end,
                      endIndefinite: false,
                      medicalAdmission,
                      dutyAssignment,
                    })
                  : serializeDispatchBatch({
                      id: batchId,
                      category: group.category,
                      value: group.category === "other" ? reason.trim() : "",
                      updatedAt: savedAt,
                    });

                return {
                  ...sourceEntry,
                  category: group.category,
                  cadet_name: companyStudents.map((student) => student.display_name).join(", "),
                  reason: reason.trim(),
                  location: location.trim(),
                  subcategory: nextSubcategory,
                  count: companyStudents.length,
                } satisfies StoredDispatchEntry;
              })()
            : null;
        const firstMatchingIndex = targetRow.entries.findIndex((entry) =>
          companyRecords.some((record) => homeEntryMatchesTarget(entry, record)),
        );
        const rebuiltEntries: StoredDispatchEntry[] = [];
        targetRow.entries.forEach((entry, entryIndex) => {
          const isMatching = companyRecords.some((record) => homeEntryMatchesTarget(entry, record));
          if (entryIndex === firstMatchingIndex && replacement) {
            rebuiltEntries.push(replacement);
          }
          if (isMatching) return;

          const [entryWithoutSelectedStudents] = removeStudentsFromEntries(
            [entry],
            companyStudents,
            String(company.display_order),
            savedAt,
          );
          rebuiltEntries.push(entryWithoutSelectedStudents);
        });
        if (firstMatchingIndex < 0 && replacement) {
          rebuiltEntries.push(replacement);
        }

        const nextRows = latestRows.map((row) =>
          normalizeReportTime(row.reportTime) === selectedTime
            ? {
                ...row,
                entries: cleanReportEntries(rebuiltEntries).map((entry) =>
                  companyStudents.some((student) =>
                    splitCadetNames(entry.cadet_name).some((name) =>
                      studentMatchesTarget(name, student, String(company.display_order)),
                    ),
                  )
                    ? stampDispatchEntryUpdatedAt(entry, savedAt)
                    : entry,
                ) as StoredDispatchEntry[],
              }
            : row,
        );
        await writeHomeReportRows({
          companyId,
          reportDate: sourceReportDate,
          report: latestReport,
          rows: nextRows,
        });
      }
    },
    onSuccess: () => {
      toast.success("แก้ไขรายชื่อการจำหน่ายแล้ว");
      queryClient.invalidateQueries({ queryKey: ["home-summary", reportDate] });
      queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
      queryClient.invalidateQueries({ queryKey: ["report"] });
      onClose();
    },
    onError: (error: Error) => toast.error(error.message || "แก้ไขรายการไม่สำเร็จ"),
  });

  const categoryLabel = group ? CATEGORY_LABELS[group.category] : "";

  return (
    <Dialog open={group !== null} onOpenChange={(open) => !open && onClose()}>
      {group && (
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8">
              <Pencil className="h-5 w-5 text-primary" />
              แก้ไขการ{categoryLabel}
            </DialogTitle>
            <DialogDescription>
              เพิ่มหรือนำรายชื่อออกจากรายการ “{group.reason || "ไม่ระบุสาเหตุ"}”
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
              <div className="font-medium text-primary">{group.reason || "ไม่ระบุสาเหตุ"}</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {group.location || "ไม่ระบุสถานที่"}
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3">
              <label
                htmlFor="dispatch-edit-search"
                className="text-xs font-medium text-muted-foreground"
              >
                รายชื่อ ({selectedNames.length} คน)
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="dispatch-edit-search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="ค้นหาชื่อหรือลำดับเลขที่..."
                  className="pl-9"
                />
              </div>

              {selectedNames.length > 0 && (
                <div className="flex flex-wrap gap-1.5" aria-label="รายชื่อที่เลือกแก้ไข">
                  {selectedNames.map((name) => (
                    <span
                      key={name}
                      className="inline-flex max-w-full items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs text-foreground"
                    >
                      <span className="truncate">{name}</span>
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-primary/15 hover:text-foreground"
                        aria-label={`นำ ${name} ออกจากรายการ`}
                        onClick={() =>
                          setSelectedNames((current) =>
                            current.filter((currentName) => currentName !== name),
                          )
                        }
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="grid max-h-56 gap-1.5 overflow-y-auto rounded-md border border-border/60 bg-background/60 p-2 sm:grid-cols-2">
                {searchQuery.trim() && filteredStudents.length > 0 ? (
                  filteredStudents.map((student) => {
                    const studentId = quickStudentIdentity(student);
                    const selected = selectedNames.some((name) => {
                      const selectedStudent = findQuickStudent(name, student.squad);
                      return selectedStudent
                        ? quickStudentIdentity(selectedStudent) === studentId
                        : quickStudentsMatch(name, student.display_name);
                    });
                    const existingCategory = studentDispatchCategories.get(studentId);
                    const isInOtherCategory = Boolean(existingCategory);
                    const existingCategoryLabel = existingCategory
                      ? CATEGORY_LABELS[existingCategory]
                      : "";

                    return (
                      <Button
                        key={`${student.squad}-${student.number}`}
                        type="button"
                        size="sm"
                        variant={selected ? "default" : isInOtherCategory ? "secondary" : "outline"}
                        aria-pressed={selected}
                        className="h-auto min-h-9 w-full justify-between gap-2 whitespace-normal px-2.5 py-2 text-left text-xs"
                        title={
                          isInOtherCategory
                            ? `${student.display_name} จำหน่าย: ${existingCategoryLabel} (กดเพื่อย้ายมายัง${CATEGORY_LABELS[group.category]})`
                            : student.display_name
                        }
                        onClick={() => toggleStudent(student)}
                      >
                        <span className="min-w-0 flex-1 whitespace-normal break-words">
                          <span>{student.display_name}</span>
                          {isInOtherCategory && (
                            <span className="ml-1 text-[10px] opacity-75">
                              จำหน่าย: {existingCategoryLabel}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-[10px] opacity-75">
                          หมวด {thaiToArabicNumerals(student.squad)}
                        </span>
                      </Button>
                    );
                  })
                ) : searchQuery.trim() ? (
                  <div className="col-span-full px-2 py-5 text-center text-xs text-muted-foreground">
                    ไม่พบรายชื่อที่ค้นหา
                  </div>
                ) : (
                  <div className="col-span-full px-2 py-5 text-center text-xs text-muted-foreground">
                    พิมพ์พยัญชนะหรือชื่อเพื่อค้นหา
                  </div>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                ค้นหาและเพิ่มรายชื่อได้จากทุกหมวด รายชื่อที่อยู่หมวดอื่นจะแสดง “จำหน่าย: ...”
                และจะย้ายมายังหมวดนี้เมื่อบันทึก
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="dispatch-edit-reason"
                  className="text-xs font-medium text-muted-foreground"
                >
                  สาเหตุ
                </label>
                <Input
                  id="dispatch-edit-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="dispatch-edit-location"
                  className="text-xs font-medium text-muted-foreground"
                >
                  สถานที่
                </label>
                <Input
                  id="dispatch-edit-location"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                />
              </div>
            </div>

            {group.category === "sick" && (
              <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3 text-sm">
                <Checkbox
                  checked={medicalAdmission}
                  onCheckedChange={(checked) => setMedicalAdmission(checked === true)}
                  aria-label="แอดมิตกองแพทย์"
                />
                <span>
                  <span className="block font-medium">แอดมิตกองแพทย์</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    จำหน่ายต่อเนื่องทุกแถวรายงานจนกว่าจะลบยอดนี้ออก
                  </span>
                </span>
              </label>
            )}

            {group.category === "other" && (
              <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3 text-sm">
                <Checkbox
                  checked={dutyAssignment}
                  onCheckedChange={(checked) => setDutyAssignment(checked === true)}
                  aria-label="ปฏิบัติหน้าที่"
                />
                <span>
                  <span className="block font-medium">ปฏิบัติหน้าที่</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    จำหน่ายต่อเนื่องทุกรอบจนถึงแถว 07.30 น. ของวันถัดไป
                    และหยุดอัตโนมัติในแถวถัดจากนั้น
                  </span>
                </span>
              </label>
            )}

            {hasDispatchPeriod(group.category) && (
              <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
                <div className="text-xs font-medium text-muted-foreground">
                  ช่วงเวลาการลา/ราชการ
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <QuickDispatchDateTimeInput
                    label="วันและเวลาเริ่ม"
                    value={start}
                    onChange={setStart}
                  />
                  <QuickDispatchDateTimeInput
                    label="วันและเวลาสิ้นสุด"
                    value={end}
                    onChange={setEnd}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
              ยกเลิก
            </Button>
            <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
              <Pencil className="h-4 w-4" />
              {save.isPending ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

function QuickDispatchDialog({
  category,
  companies,
  reports,
  reportDate,
  reportTime,
  onClose,
}: {
  category: HomeSummaryCategory | null;
  companies: HomeCompany[];
  reports: HomeReport[];
  reportDate: string;
  reportTime: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [selectedStudents, setSelectedStudents] = useState<QuickDispatchStudent[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [reason, setReason] = useState("");
  const [location, setLocation] = useState("");
  const [start, setStart] = useState<DispatchDateTimeParts>({
    date: "",
    hour: "",
    minute: "",
  });
  const [end, setEnd] = useState<DispatchDateTimeParts>({
    date: "",
    hour: "",
    minute: "",
  });
  const [medicalAdmission, setMedicalAdmission] = useState(false);
  const [dutyAssignment, setDutyAssignment] = useState(false);

  useEffect(() => {
    if (!category) return;

    const [defaultHour = "", defaultMinute = ""] = reportTime.split(/[.:]/);
    setSelectedStudents([]);
    setSearchQuery("");
    setReason("");
    setLocation("");
    setStart({
      date: reportDate,
      hour: defaultHour.padStart(2, "0"),
      minute: defaultMinute.padStart(2, "0"),
    });
    setEnd({ date: "", hour: "", minute: "" });
    setMedicalAdmission(false);
    setDutyAssignment(false);
  }, [category, reportDate, reportTime]);

  const studentDispatchCategories = useMemo(
    () => buildStudentDispatchCategoryMap(companies, reports, reportTime),
    [companies, reports, reportTime],
  );

  const selectedStudentIds = useMemo(
    () => new Set(selectedStudents.map((student) => quickStudentIdentity(student))),
    [selectedStudents],
  );

  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) return [];

    return studentsData
      .filter((student) => quickStudentMatchesSearch(student, query))
      .sort(
        (first, second) =>
          quickStudentSearchScore(first, query) - quickStudentSearchScore(second, query) ||
          Number(first.squad) - Number(second.squad) ||
          Number(first.number) - Number(second.number),
      );
  }, [searchQuery]);

  const toggleStudent = (student: QuickDispatchStudent) => {
    const studentId = quickStudentIdentity(student);

    setSelectedStudents((current) => {
      const selected = current.some(
        (currentStudent) => quickStudentIdentity(currentStudent) === studentId,
      );
      return selected
        ? current.filter((currentStudent) => quickStudentIdentity(currentStudent) !== studentId)
        : [...current, student];
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!category) throw new Error("กรุณาเลือกประเภทการจำหน่าย");
      if (selectedStudents.length === 0) throw new Error("กรุณาเลือกรายชื่ออย่างน้อย 1 คน");
      if (!reason.trim() || !location.trim()) {
        throw new Error("กรุณากรอกสาเหตุและสถานที่ให้ครบ");
      }

      const dispatchCategory = category as DispatchCategory;
      const periodIssue = hasDispatchPeriod(dispatchCategory)
        ? validateDispatchPeriod({
            id: crypto.randomUUID(),
            start,
            end,
            endIndefinite: false,
          })
        : null;

      if (periodIssue === "incomplete") {
        throw new Error("กรุณากรอกวันและเวลาเริ่มต้นและสิ้นสุดให้ครบ");
      }
      if (periodIssue === "order") {
        throw new Error("วันและเวลาสิ้นสุดต้องอยู่หลังวันและเวลาเริ่มต้น");
      }

      const selectedByCompany = new Map<
        string,
        { company: HomeCompany; students: QuickDispatchStudent[] }
      >();
      selectedStudents.forEach((student) => {
        const company = companies.find(
          (candidate) => String(candidate.display_order) === student.squad,
        );
        if (!company) {
          throw new Error(
            `ไม่พบข้อมูลหมวด ${thaiToArabicNumerals(student.squad)} ของ ${student.display_name}`,
          );
        }

        const existing = selectedByCompany.get(company.id);
        if (existing) {
          existing.students.push(student);
        } else {
          selectedByCompany.set(company.id, { company, students: [student] });
        }
      });

      const targetTime = normalizeReportTime(reportTime);
      const [reportHour = "", reportMinute = ""] = targetTime.split(".");
      const usesPeriod =
        hasDispatchPeriod(dispatchCategory) ||
        (dispatchCategory === "sick" && medicalAdmission) ||
        (dispatchCategory === "other" && dutyAssignment);
      const batchId = crypto.randomUUID();
      const savedAt = new Date().toISOString();

      // Read each platoon's latest data before writing so a move always starts
      // from the newest row and cannot reintroduce a duplicate name.
      const preparedWrites = await Promise.all(
        Array.from(selectedByCompany.values()).map(async ({ company, students }) => {
          const latestReport = await fetchLatestHomeReport(company.id, reportDate);
          const existingRows = decodeReportRows(latestReport);
          const targetRow = existingRows.find(
            (row) => normalizeReportTime(row.reportTime) === targetTime,
          );

          const newEntry: StoredDispatchEntry = {
            category: dispatchCategory,
            cadet_name: students.map((student) => student.display_name).join(", "),
            reason: reason.trim(),
            location: location.trim(),
            subcategory: usesPeriod
              ? serializeDispatchPeriod({
                  ...createDispatchPeriod(batchId),
                  batchId,
                  batchCategory: dispatchCategory,
                  batchValue: dispatchCategory === "other" ? reason.trim() : undefined,
                  updatedAt: savedAt,
                  start:
                    medicalAdmission || dutyAssignment
                      ? { date: reportDate, hour: reportHour, minute: reportMinute }
                      : start,
                  end:
                    medicalAdmission || dutyAssignment ? { date: "", hour: "", minute: "" } : end,
                  endIndefinite: false,
                  medicalAdmission,
                  dutyAssignment,
                })
              : dispatchCategory === "other"
                ? serializeDispatchBatch({
                    id: batchId,
                    category: dispatchCategory,
                    value: reason.trim(),
                    updatedAt: savedAt,
                  })
                : serializeDispatchBatch({
                    id: batchId,
                    category: dispatchCategory,
                    updatedAt: savedAt,
                  }),
            count: students.length,
          };
          const nextRows = existingRows.map((row) =>
            normalizeReportTime(row.reportTime) === targetTime
              ? {
                  ...row,
                  // A student belongs to one dispatch category only. Remove
                  // selected names from every old entry before appending the
                  // newly selected category entry.
                  entries: cleanReportEntries([
                    ...removeStudentsFromEntries(
                      row.entries,
                      students,
                      String(company.display_order),
                      savedAt,
                    ),
                    newEntry,
                  ]) as StoredDispatchEntry[],
                }
              : row,
          );

          if (!targetRow) {
            nextRows.push({
              reportTime: targetTime,
              reporterName: existingRows[0]?.reporterName || latestReport?.reporter_name || "",
              reporterPosition:
                existingRows[0]?.reporterPosition || latestReport?.reporter_position || "",
              entries: cleanReportEntries([newEntry]),
            });
          }

          nextRows.sort((first, second) =>
            normalizeReportTime(first.reportTime).localeCompare(
              normalizeReportTime(second.reportTime),
            ),
          );

          return { companyId: company.id, latestReport, rows: nextRows };
        }),
      );

      for (const prepared of preparedWrites) {
        await writeHomeReportRows({
          companyId: prepared.companyId,
          reportDate,
          report: prepared.latestReport,
          rows: prepared.rows,
        });
      }
    },
    onSuccess: () => {
      toast.success(
        `เพิ่มจำหน่าย${category ? CATEGORY_LABELS[category] : ""} ${selectedStudents.length} นายแล้ว`,
      );
      queryClient.invalidateQueries({ queryKey: ["home-summary", reportDate] });
      queryClient.invalidateQueries({ queryKey: ["report"] });
      queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
      onClose();
    },
    onError: (error: Error) => toast.error(error.message || "เพิ่มรายการไม่สำเร็จ"),
  });

  const handleSubmit = () => save.mutate();
  const categoryLabel = category ? CATEGORY_LABELS[category] : "";

  return (
    <Dialog open={category !== null} onOpenChange={(open) => !open && onClose()}>
      {category && (
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8">
              <Plus className="h-5 w-5 text-primary" />
              เพิ่มจำหน่าย: {categoryLabel}
            </DialogTitle>
            <DialogDescription>
              พิมพ์ค้นหารายชื่อจากทุกหมวด แล้วกดเลือกชื่อที่ต้องการจำหน่ายสำหรับรอบเวลา {reportTime}{" "}
              น.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">ประเภทการจำหน่าย</label>
              <div className="flex h-10 items-center rounded-md border border-primary/30 bg-primary/5 px-3 text-sm font-medium">
                {categoryLabel}
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3">
              <label
                htmlFor="quick-dispatch-search"
                className="text-xs font-medium text-muted-foreground"
              >
                รายชื่อที่เลือก ({selectedStudents.length} คน)
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="quick-dispatch-search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="พิมพ์พยัญชนะ ชื่อ หรือลำดับเลขที่..."
                  className="pl-9"
                  autoComplete="off"
                />
              </div>

              {selectedStudents.length > 0 && (
                <div className="flex flex-wrap gap-1.5" aria-label="รายชื่อที่เลือก">
                  {selectedStudents.map((student) => (
                    <span
                      key={quickStudentIdentity(student)}
                      className="inline-flex max-w-full items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs text-foreground"
                    >
                      <span className="truncate">{student.display_name}</span>
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-primary/15 hover:text-foreground"
                        aria-label={`นำ ${student.display_name} ออกจากรายชื่อที่เลือก`}
                        onClick={() =>
                          setSelectedStudents((current) =>
                            current.filter(
                              (currentStudent) =>
                                quickStudentIdentity(currentStudent) !==
                                quickStudentIdentity(student),
                            ),
                          )
                        }
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="grid max-h-56 gap-1.5 overflow-y-auto rounded-md border border-border/60 bg-background/60 p-2 sm:grid-cols-2">
                {searchQuery.trim() && filteredStudents.length > 0 ? (
                  filteredStudents.map((student) => {
                    const studentId = quickStudentIdentity(student);
                    const selected = selectedStudentIds.has(studentId);
                    const existingCategory = studentDispatchCategories.get(studentId);
                    const isInOtherCategory = Boolean(
                      existingCategory && existingCategory !== category,
                    );
                    const existingCategoryLabel = existingCategory
                      ? CATEGORY_LABELS[existingCategory]
                      : "";

                    return (
                      <Button
                        key={`${student.squad}-${student.number}`}
                        type="button"
                        size="sm"
                        variant={selected ? "default" : isInOtherCategory ? "secondary" : "outline"}
                        aria-pressed={selected}
                        className="h-auto min-h-9 w-full justify-between gap-2 whitespace-normal px-2.5 py-2 text-left text-xs"
                        title={
                          isInOtherCategory
                            ? `${student.display_name} จำหน่าย: ${existingCategoryLabel} (กดเพื่อย้ายมายัง${categoryLabel})`
                            : student.display_name
                        }
                        onClick={() => toggleStudent(student)}
                      >
                        <span className="min-w-0 flex-1 whitespace-normal break-words">
                          <span>{student.display_name}</span>
                          {isInOtherCategory && (
                            <span className="ml-1 text-[10px] opacity-75">
                              จำหน่าย: {existingCategoryLabel}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-[10px] opacity-75">
                          หมวด {thaiToArabicNumerals(student.squad)}
                        </span>
                      </Button>
                    );
                  })
                ) : searchQuery.trim() ? (
                  <div className="col-span-full px-2 py-5 text-center text-xs text-muted-foreground">
                    ไม่พบรายชื่อที่ค้นหา
                  </div>
                ) : (
                  <div className="col-span-full px-2 py-5 text-center text-xs text-muted-foreground">
                    พิมพ์พยัญชนะหรือชื่อเพื่อค้นหา
                  </div>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                ระบบค้นหารายชื่อจากทุกหมวด และจะจัดเข้าหมวดให้อัตโนมัติ หากชื่ออยู่หมวดอื่น
                ระบบจะแสดง “จำหน่าย: ...” และย้ายไปยังหมวดที่เลือกเมื่อบันทึก
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="quick-dispatch-reason"
                  className="text-xs font-medium text-muted-foreground"
                >
                  สาเหตุ
                </label>
                <Input
                  id="quick-dispatch-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="เช่น มีอาการไข้"
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="quick-dispatch-location"
                  className="text-xs font-medium text-muted-foreground"
                >
                  สถานที่
                </label>
                <Input
                  id="quick-dispatch-location"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="เช่น โรงพยาบาลตำรวจ"
                />
              </div>
            </div>

            {category === "sick" && (
              <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3 text-sm">
                <Checkbox
                  checked={medicalAdmission}
                  onCheckedChange={(checked) => setMedicalAdmission(checked === true)}
                  aria-label="แอดมิตกองแพทย์"
                />
                <span>
                  <span className="block font-medium">แอดมิตกองแพทย์</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    จำหน่ายต่อเนื่องทุกแถวรายงานจนกว่าจะลบยอดนี้ออก
                  </span>
                </span>
              </label>
            )}

            {category === "other" && (
              <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3 text-sm">
                <Checkbox
                  checked={dutyAssignment}
                  onCheckedChange={(checked) => setDutyAssignment(checked === true)}
                  aria-label="ปฏิบัติหน้าที่"
                />
                <span>
                  <span className="block font-medium">ปฏิบัติหน้าที่</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    จำหน่ายต่อเนื่องทุกรอบจนถึงแถว 07.30 น. ของวันถัดไป
                    และหยุดอัตโนมัติในแถวถัดจากนั้น
                  </span>
                </span>
              </label>
            )}

            {hasDispatchPeriod(category) && (
              <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
                <div className="text-xs font-medium text-muted-foreground">
                  ช่วงเวลาการลา/ราชการ
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <QuickDispatchDateTimeInput
                    label="วันและเวลาเริ่ม"
                    value={start}
                    onChange={setStart}
                  />
                  <QuickDispatchDateTimeInput
                    label="วันและเวลาสิ้นสุด"
                    value={end}
                    onChange={setEnd}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
              ยกเลิก
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={save.isPending || selectedStudents.length === 0}
            >
              <Plus className="h-4 w-4" />
              {save.isPending ? "กำลังบันทึก..." : "เพิ่มรายการ"}
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

function Home() {
  const reportDate = todayISO();
  const [selectedReportTime, setSelectedReportTime] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [detailCategory, setDetailCategory] = useState<HomeSummaryCategory | null>(null);
  const [isDispatchSummaryOpen, setIsDispatchSummaryOpen] = useState(false);
  const [quickAddCategory, setQuickAddCategory] = useState<HomeSummaryCategory | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
    const refreshCurrentTime = () => setCurrentTime(new Date());
    refreshCurrentTime();
    const timer = window.setInterval(refreshCurrentTime, 15_000);

    return () => window.clearInterval(timer);
  }, []);

  const { data: reportTimeSettings, isLoading: isLoadingReportTimes } = useQuery({
    queryKey: REPORT_TIME_SETTINGS_QUERY_KEY,
    queryFn: () => fetchReportTimeSettings(supabase),
    ...REPORT_TIME_SETTINGS_QUERY_OPTIONS,
  });

  const { data, isLoading: isLoadingSummary } = useQuery({
    queryKey: ["home-summary", reportDate],
    queryFn: async () => {
      const [companiesResult, reportsResult] = await Promise.all([
        supabase
          .from("companies")
          .select("id,name,full_strength,display_order")
          .order("display_order"),
        supabase
          .from("daily_reports")
          .select(
            "id,company_id,report_date,reporter_name,reporter_position,report_time,dispatch_entries(id,category,cadet_name,reason,location,subcategory,count,display_order,created_at)",
          )
          .lte("report_date", reportDate)
          .order("report_date", { ascending: true }),
      ]);

      if (companiesResult.error) throw companiesResult.error;
      if (reportsResult.error) throw reportsResult.error;
      return {
        companies: companiesResult.data || [],
        reports: reportsResult.data || [],
      };
    },
  });

  // Keep the first client render identical to SSR while React hydrates.
  const isLoading = !isHydrated || isLoadingReportTimes || isLoadingSummary;
  const activeReportTime = reportTimeSettings?.activeReportTime || DEFAULT_REPORT_TIME;
  const reportTimes = buildReportTimeOptions(activeReportTime, reportTimeSettings?.reportTimes);
  const reportTime =
    selectedReportTime && reportTimes.includes(selectedReportTime)
      ? selectedReportTime
      : activeReportTime || reportTimes[0] || DEFAULT_REPORT_TIME;
  const companies = (data?.companies || []) as HomeCompany[];
  const allReports = (data?.reports || []) as HomeReport[];
  const reports = allReports.filter((report) => report.report_date === reportDate);
  const rows = companies.map((company) => {
    const companyReports = reports.filter((report) => report.company_id === company.id);
    const match = getReportRowFromReports(companyReports, reportTime);
    const currentEntries = (match?.row?.entries || []) as StoredDispatchEntry[];
    const currentContinuingKeys = new Set(
      currentEntries
        .filter((entry) => isContinuingDispatchEntry(entry))
        .map((entry) => getDispatchPeriodKey(entry)),
    );
    const carriedEntries = getActiveHomeCarriedEntries(
      allReports,
      company.id,
      reportDate,
      reportTime,
    ).filter(({ entry }) => !currentContinuingKeys.has(getDispatchPeriodKey(entry)));
    const entries = [...currentEntries, ...carriedEntries.map(({ entry }) => entry)];
    const dispatchRecords = [
      ...(match
        ? buildHomeDispatchRecords(
            company,
            match.report as HomeReport,
            match.row.reportTime,
            currentEntries,
          )
        : []),
      ...carriedEntries.flatMap(({ entry, report, reportTime: sourceReportTime }) =>
        buildHomeDispatchRecords(company, report, sourceReportTime, [entry]),
      ),
    ];
    const summary = summarizeDispatchEntries(entries, company.full_strength);
    return {
      company,
      summary,
      entries,
      dispatchRecords,
      report: match?.report || null,
      row: match?.row || null,
    };
  });

  const totalCount = rows.length;
  const dispatchDetails = rows.flatMap(({ company, entries }) =>
    buildHomeDispatchDetails(company.name, entries),
  );
  const dispatchRecords = rows.flatMap((row) => row.dispatchRecords);
  const allDispatchGroups = buildHomeDispatchGroups(dispatchRecords, null);
  const dispatchGroups = allDispatchGroups.filter(
    (group) => detailCategory === null || group.category === detailCategory,
  );
  const totalFullStrength = rows.reduce(
    (sum, { company }) => sum + (Number(company.full_strength) || 0),
    0,
  );
  const totalDispatched = dispatchDetails.reduce((sum, detail) => sum + detail.count, 0);
  const totalRemaining = Math.max(0, totalFullStrength - totalDispatched);
  const categoryTotals = HOME_SUMMARY_CATEGORIES.reduce(
    (totals, { category }) => {
      totals[category] = dispatchDetails
        .filter((detail) => detail.category === category)
        .reduce((sum, detail) => sum + detail.count, 0);
      return totals;
    },
    {} as Record<HomeSummaryCategory, number>,
  );
  const summaryDialogDetails = Object.fromEntries(
    CATEGORY_ORDER.map((category) => [
      category,
      allDispatchGroups
        .filter((group) => group.category === category)
        .map(
          (group): DispatchSummaryDetail => ({
            category,
            count: group.count,
            reason: group.reason || "ไม่ระบุสาเหตุ",
            location: group.location || "ไม่ระบุสถานที่",
            names: group.names,
            updatedAt: group.updatedAt,
            sources: Array.from(
              new Set(group.records.map((record) => thaiToArabicNumerals(record.companyName))),
            ),
          }),
        ),
    ]),
  ) as Record<DispatchCategory, DispatchSummaryDetail[]>;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Dragon backdrop */}
      <div className="pointer-events-none fixed inset-0 select-none overflow-hidden">
        <img
          src="/dragon-background.png"
          alt=""
          className="h-full w-auto min-w-full object-contain opacity-[0.15] dark:opacity-[0.12]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-background/70 to-background" />
      </div>

      <header className="sticky top-0 z-20 border-b border-primary/15 bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-1.5 px-2 py-3 sm:gap-3 sm:px-4 sm:py-4">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2.5">
            <img
              src="/dragon_logo.png"
              alt="Dragon Logo"
              className="float-soft h-8 w-8 shrink-0 rounded-full border border-primary/30 object-contain shadow-sm ring-2 ring-primary/10 sm:h-9 sm:w-9"
            />
            <h1 className="min-w-0 whitespace-nowrap text-[clamp(0.6875rem,3.15vw,1.125rem)] font-bold leading-tight tracking-[-0.02em]">
              เช็คยอดกองร้อยที่ 4
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            <ThemeToggle className="h-9 w-9 sm:h-10 sm:w-10" />
            <Link to="/admin/login">
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1 px-2 text-xs sm:px-3 sm:text-sm"
                aria-label="เข้าสู่ระบบแอดมิน"
              >
                <LogIn className="h-4 w-4" />
                <span className="hidden min-[380px]:inline">แอดมิน</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-5xl px-3 py-6 sm:px-4 sm:py-10">
        {/* Hero heading */}
        <div className="reveal mb-6 text-center sm:mb-10">
          <h2 className="text-4xl font-extrabold leading-[1.35] tracking-normal sm:text-5xl">
            <span className="gold-text inline-block py-1">สรุปยอดการจำหน่าย</span>
          </h2>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            {toThaiDate(reportDate)}
          </p>
          <div className="gold-gradient mx-auto mt-4 h-1 w-24 rounded-full opacity-80" />
        </div>

        {isLoading ? (
          <div className="space-y-8 sm:space-y-10">
            <div className="flex flex-wrap justify-center gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-24 rounded-full" />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 sm:gap-4 md:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-xl" />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6 sm:space-y-8">
            {/* Report time selector */}
            <div className="reveal flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
              {reportTimes.map((time) => {
                const selected = time === reportTime;
                const alarm = currentTime ? isReportTimeApproaching(time, currentTime) : false;

                return (
                  <Button
                    key={time}
                    type="button"
                    variant={selected ? "default" : "outline"}
                    onClick={() => setSelectedReportTime(time)}
                    aria-current={selected ? "true" : undefined}
                    aria-label={alarm ? `เวลา ${time} ใกล้ถึงเวลาส่งยอด` : `เวลา ${time}`}
                    data-report-time={time}
                    data-alarm={alarm ? "true" : "false"}
                    className={`h-10 min-w-24 shrink-0 rounded-full backdrop-blur-sm ${
                      alarm ? "report-time-alarm" : selected ? "report-time-active" : ""
                    }`}
                  >
                    เวลา {time}
                  </Button>
                );
              })}
            </div>

            {/* Company-wide dispatch summary */}
            {totalCount > 0 && (
              <section
                className="reveal mx-auto w-full max-w-5xl"
                aria-label="สรุปยอดการจำหน่ายทั้งกองร้อย"
              >
                <div className="grid grid-cols-1 gap-2 min-[430px]:grid-cols-3">
                  <div className="min-h-24 rounded-xl border border-primary/20 bg-card/90 p-3 shadow-sm">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Users className="h-4 w-4 text-primary" />
                      ยอดเต็ม
                    </div>
                    <div className="mt-2 text-2xl font-bold text-foreground">
                      {totalFullStrength}{" "}
                      <span className="text-xs font-medium text-muted-foreground">นาย</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-label={`ดูรายละเอียดจำหน่ายรวม ${totalDispatched} นาย`}
                    onClick={() => setIsDispatchSummaryOpen(true)}
                    className="min-h-24 rounded-xl border border-warning/30 bg-warning-muted/60 p-3 text-left shadow-sm outline-none transition-colors hover:border-warning/60 hover:bg-warning-muted/80 focus-visible:ring-2 focus-visible:ring-warning focus-visible:ring-offset-2"
                  >
                    <div className="flex items-center gap-2 text-xs font-medium text-warning/80">
                      <UserMinus className="h-4 w-4" />
                      ยอดจำหน่ายรวม
                      <Eye className="ml-auto h-3.5 w-3.5" aria-hidden="true" />
                    </div>
                    <div className="mt-2 text-2xl font-bold text-warning">
                      {totalDispatched}{" "}
                      <span className="text-xs font-medium text-warning/80">นาย</span>
                    </div>
                  </button>
                  <div className="min-h-24 rounded-xl border border-success/30 bg-success-muted/60 p-3 shadow-sm">
                    <div className="flex items-center gap-2 text-xs font-medium text-success/80">
                      <Users className="h-4 w-4" />
                      ยอดคงเหลือ
                    </div>
                    <div className="mt-2 text-2xl font-bold text-success">
                      {totalRemaining}{" "}
                      <span className="text-xs font-medium text-success/80">นาย</span>
                    </div>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 min-[430px]:grid-cols-3 sm:grid-cols-5">
                  {HOME_SUMMARY_CATEGORIES.map(({ category, icon: Icon }) => (
                    <div
                      key={category}
                      className="min-h-24 w-full rounded-xl border border-border/70 bg-card/85 shadow-sm transition-colors hover:border-primary/60 hover:bg-primary/5"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        aria-haspopup="dialog"
                        aria-label={`ดูรายละเอียด ${CATEGORY_LABELS[category]} ${categoryTotals[category]} นาย`}
                        onClick={() => setDetailCategory(category)}
                        className="h-full min-h-24 w-full flex-col items-start justify-between gap-2 rounded-xl border-0 bg-transparent p-3 text-left shadow-none hover:bg-transparent"
                      >
                        <span className="flex w-full items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
                          <span className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-primary" />
                            {CATEGORY_LABELS[category]}
                          </span>
                          <Eye className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        </span>
                        <span className="text-xl font-bold text-foreground">
                          {categoryTotals[category]}{" "}
                          <span className="text-[11px] font-medium text-muted-foreground">นาย</span>
                        </span>
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Company card grid */}
            <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 sm:gap-4 md:grid-cols-3">
              {rows.map(({ company, summary }, index) => {
                const dispatchPct =
                  summary.fullStrength > 0
                    ? Math.min(100, Math.round((summary.dispatched / summary.fullStrength) * 100))
                    : 0;

                return (
                  <Link
                    key={company.id}
                    to="/company/$id"
                    params={{ id: company.id }}
                    search={{ date: reportDate, time: reportTime }}
                    aria-label={`เปิด ${thaiToArabicNumerals(company.name)} เพื่อเพิ่มหรือแก้ไขรายการจำหน่าย`}
                    className="reveal-stagger block h-full"
                    style={{ "--i": index } as React.CSSProperties}
                  >
                    <Card className="card-lift group h-full cursor-pointer overflow-hidden rounded-xl border-border/70 bg-card/95 shadow-md backdrop-blur-sm transition-colors hover:border-primary/60 focus-within:border-primary/60">
                      {/* Top accent bar */}
                      <div className="gold-gradient h-1 w-full opacity-70" />

                      <CardHeader className="p-4 pb-2">
                        <CardTitle className="flex min-w-0 items-center gap-2 text-base">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary transition-transform group-hover:scale-110">
                            <Users className="h-5 w-5" />
                          </span>
                          <span className="truncate">{thaiToArabicNumerals(company.name)}</span>
                        </CardTitle>
                      </CardHeader>

                      <CardContent className="space-y-3 p-4 pt-0">
                        {/* 3-stat grid — คงยอด is deliberately larger */}
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-lg bg-muted/60 px-2 py-2">
                            <div className="text-[11px] text-muted-foreground">ยอดเต็ม</div>
                            <div className="text-sm font-semibold text-foreground">
                              {summary.fullStrength}
                            </div>
                          </div>
                          <div className="rounded-lg bg-warning-muted/70 px-2 py-2 text-warning">
                            <div className="text-[11px]">จำหน่าย</div>
                            <div className="text-sm font-semibold">{summary.dispatched}</div>
                          </div>
                          <div className="rounded-lg bg-success-muted/70 px-2 py-2 text-success">
                            <div className="text-[11px]">คงยอด</div>
                            <div className="text-lg font-bold leading-tight">
                              {summary.remaining}
                            </div>
                          </div>
                        </div>

                        {/* Dispatch progress bar */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>สัดส่วนจำหน่าย</span>
                            <span>{dispatchPct}%</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="bar-slide-in h-full rounded-full bg-warning/70"
                              style={
                                {
                                  "--bar-width": `${dispatchPct}%`,
                                  width: `${dispatchPct}%`,
                                } as React.CSSProperties
                              }
                            />
                          </div>
                        </div>

                        {/* Dispatch detail items */}
                        <div className="space-y-1 text-xs">
                          {summary.items.length > 0 ? (
                            summary.items.map((item) => (
                              <div
                                key={`${item.category}-${item.label}`}
                                className="rounded-md bg-muted/30 px-2 py-1.5"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className="min-w-0 font-medium">{item.label}</span>
                                  <span className="shrink-0 font-medium">{item.count} นาย</span>
                                </div>
                                {item.details.length > 0 && (
                                  <div className="mt-1 space-y-0.5 text-[11px] leading-4 text-muted-foreground">
                                    {item.details.map((detail, idx) => (
                                      <div
                                        key={`${item.category}-${item.label}-${idx}`}
                                        className="break-words"
                                      >
                                        {detail}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))
                          ) : (
                            <div className="text-muted-foreground">ไม่มีรายการจำหน่าย</div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </main>
      <DispatchSummaryDialog
        open={isDispatchSummaryOpen}
        onOpenChange={setIsDispatchSummaryOpen}
        dateLabel={toThaiDate(reportDate)}
        reportTime={reportTime}
        total={totalDispatched}
        counts={categoryTotals}
        details={summaryDialogDetails}
      />
      <DispatchDetailsDialog
        category={detailCategory}
        groups={dispatchGroups}
        companies={companies}
        reports={reports}
        reportDate={reportDate}
        reportTime={reportTime}
        onClose={() => setDetailCategory(null)}
        onAdd={() => {
          if (detailCategory) setQuickAddCategory(detailCategory);
          setDetailCategory(null);
        }}
      />
      <QuickDispatchDialog
        category={quickAddCategory}
        companies={companies}
        reports={reports}
        reportDate={reportDate}
        reportTime={reportTime}
        onClose={() => setQuickAddCategory(null)}
      />
    </div>
  );
}
