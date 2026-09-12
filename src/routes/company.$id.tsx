import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Activity,
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  UserX,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import studentsData from "@/data/students.json";
import {
  CATEGORY_LABELS,
  cleanReportEntries,
  countDispatchEntry,
  splitCadetNames,
  summarizeDispatchEntries,
  todayISO,
  type DispatchCategory,
  type Entry,
} from "@/lib/thai";
import {
  DEFAULT_REPORT_TIME,
  decodeReportRows,
  encodeReportRows,
  getReportRowFromReports,
  isValidReportTime,
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
import {
  createDispatchPeriod,
  getDispatchPeriodKey,
  hasDispatchPeriod,
  isContinuingDispatchEntry,
  isDispatchPeriodActiveAt,
  isDutyAssignmentEntry,
  isMedicalAdmissionEntry,
  parseDispatchPeriod,
  reportDateTimeToTimestamp,
  serializeDispatchPeriod,
  stampDispatchEntryUpdatedAt,
  validateDispatchPeriod,
  type DispatchDateTimeParts,
} from "@/lib/dispatch-period";

export const Route = createFileRoute("/company/$id")({
  validateSearch: (search): { date?: string; time?: string; returnTo?: "admin" } => ({
    date: typeof search.date === "string" ? search.date : undefined,
    time: typeof search.time === "string" ? search.time : undefined,
    returnTo: search.returnTo === "admin" ? "admin" : undefined,
  }),
  component: CompanyPage,
});

type EntryRow = Entry & { id?: string; _local?: string };
const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
const CATEGORY_SUMMARY_ITEMS: Array<{ category: DispatchCategory; icon: LucideIcon }> = [
  { category: "sick", icon: Activity },
  { category: "leave", icon: CalendarDays },
  { category: "official", icon: BriefcaseBusiness },
  { category: "other", icon: MoreHorizontal },
  { category: "absent", icon: UserX },
];

function normalizeCadetName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("th");
}

function cadetNamesMatch(first: string, second: string): boolean {
  return normalizeCadetName(first) === normalizeCadetName(second);
}

function normalizeStudentSearch(value: string): string {
  return value
    .toLocaleLowerCase("th")
    .replace(/^นรต\.?\s*/u, "")
    .replace(/เลขที่/gu, "")
    .replace(/[^ก-๙a-z0-9]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compactStudentSearch(value: string): string {
  return normalizeStudentSearch(value).replace(/\s+/g, "");
}

function thaiConsonantSkeleton(value: string): string {
  return compactStudentSearch(value).replace(/(?:ะ|า|ำ|ิ|ี|ึ|ื|ุ|ู|เ|แ|โ|ใ|ไ|็|่|้|๊|๋|์|ํ)/gu, "");
}

function getStudentSearchScore(student: (typeof studentsData)[number], rawQuery: string): number {
  const query = normalizeStudentSearch(rawQuery);
  const compactQuery = compactStudentSearch(rawQuery);
  if (!query || !compactQuery) return Number.POSITIVE_INFINITY;

  const fullName = normalizeStudentSearch(`${student.name} ${student.surname}`);
  const compactFullName = compactStudentSearch(fullName);
  const name = normalizeStudentSearch(student.name);
  const surname = normalizeStudentSearch(student.surname);
  const initials = [student.name, student.surname]
    .filter(Boolean)
    .map((part) => compactStudentSearch(part).charAt(0))
    .join("");
  const consonants = thaiConsonantSkeleton(`${student.name}${student.surname}`);

  if (student.number === compactQuery) return 0;
  if (fullName === query || compactFullName === compactQuery) return 1;
  if (name.startsWith(query)) return 2;
  if (surname.startsWith(query)) return 3;
  if (initials.startsWith(compactQuery)) return 4;
  if (compactFullName.includes(compactQuery)) return 5;

  const queryConsonants = thaiConsonantSkeleton(rawQuery);
  if (queryConsonants.length >= 2 && consonants.includes(queryConsonants)) return 6;

  return Number.POSITIVE_INFINITY;
}

/** Keep the last occurrence of a manually entered name as its active category. */
function enforceSingleStudentCategory(entries: EntryRow[]): EntryRow[] {
  const seen = new Set<string>();

  return entries
    .slice()
    .reverse()
    .map((entry) => {
      const names = splitCadetNames(entry.cadet_name);
      if (names.length === 0) return entry;

      const remainingNames = names.filter((name) => {
        const key = normalizeCadetName(name);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return remainingNames.length === names.length
        ? entry
        : { ...entry, cadet_name: remainingNames.join(", "), count: remainingNames.length };
    })
    .reverse();
}

function DispatchDateTimeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DispatchDateTimeParts;
  onChange: (value: DispatchDateTimeParts) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="grid grid-cols-[minmax(0,1fr)_3.75rem_3.75rem_auto] gap-1.5">
        <Input
          type="date"
          aria-label={`${label} วันที่`}
          className="min-w-0"
          value={value.date}
          onChange={(event) => onChange({ ...value, date: event.target.value })}
        />
        <select
          aria-label={`${label} ชั่วโมง`}
          className="flex h-10 w-full rounded-md border border-input bg-transparent px-1 py-1 text-center text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={value.hour}
          onChange={(event) => onChange({ ...value, hour: event.target.value })}
        >
          <option value="">--</option>
          {HOURS.map((hour) => (
            <option key={hour} value={hour}>
              {hour}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label} นาที`}
          className="flex h-10 w-full rounded-md border border-input bg-transparent px-1 py-1 text-center text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={value.minute}
          onChange={(event) => onChange({ ...value, minute: event.target.value })}
        >
          <option value="">--</option>
          {MINUTES.map((minute) => (
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

function hasPeriodInput(entry: Entry): boolean {
  if (!isContinuingDispatchEntry(entry)) return false;

  const period = parseDispatchPeriod(entry.subcategory);
  return (
    [period.start, period.end].some((parts) => Boolean(parts.date || parts.hour || parts.minute)) ||
    period.endIndefinite ||
    period.medicalAdmission === true ||
    period.dutyAssignment === true
  );
}

function toEntryRow(entry: StoredDispatchEntry): EntryRow {
  return {
    id: entry.id,
    category: entry.category,
    cadet_name: entry.cadet_name,
    reason: entry.reason,
    location: entry.location,
    subcategory: entry.subcategory,
    count: entry.count,
  };
}

function getActiveCarriedEntries(
  reports: StoredDailyReport[],
  reportDate: string,
  reportTime: string,
): StoredDispatchEntry[] {
  const targetTimestamp = reportDateTimeToTimestamp(reportDate, reportTime);
  if (!targetTimestamp) return [];

  const latestEntries = new Map<string, { timestamp: string; entry: StoredDispatchEntry }>();

  reports.forEach((storedReport) => {
    if (!storedReport.report_date) return;

    decodeReportRows(storedReport).forEach((row) => {
      const rowTimestamp = reportDateTimeToTimestamp(
        storedReport.report_date || "",
        row.reportTime,
      );
      if (!rowTimestamp || rowTimestamp >= targetTimestamp) return;

      row.entries.forEach((entry) => {
        if (!isContinuingDispatchEntry(entry)) return;

        const key = getDispatchPeriodKey(entry);
        const previous = latestEntries.get(key);
        if (!previous || previous.timestamp <= rowTimestamp) {
          latestEntries.set(key, { timestamp: rowTimestamp, entry });
        }
      });
    });
  });

  return Array.from(latestEntries.values())
    .map(({ entry }) => entry)
    .filter((entry) =>
      isDispatchPeriodActiveAt(parseDispatchPeriod(entry.subcategory), targetTimestamp),
    );
}

function CompanyPage() {
  const { id } = useParams({ from: "/company/$id" });
  const search = Route.useSearch();
  const qc = useQueryClient();
  const [date, setDate] = useState(() => search.date || todayISO());
  const [reportTime, setReportTime] = useState(() =>
    isValidReportTime(search.time) ? normalizeReportTime(search.time) : DEFAULT_REPORT_TIME,
  );
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [searchQuery, setSearchQuery] = useState<Record<number, string>>({});
  const [selectedCategory, setSelectedCategory] = useState<DispatchCategory | null>(null);
  const selectedReportTime = normalizeReportTime(reportTime);
  const returnToAdmin = search.returnTo === "admin";
  const adminReturnSearch = {
    date: search.date || date,
    time: isValidReportTime(search.time) ? normalizeReportTime(search.time) : selectedReportTime,
  };

  const { data: reportTimeSettings } = useQuery({
    queryKey: REPORT_TIME_SETTINGS_QUERY_KEY,
    queryFn: () => fetchReportTimeSettings(supabase),
    ...REPORT_TIME_SETTINGS_QUERY_OPTIONS,
  });
  const configuredReportTimes = useMemo(
    () =>
      buildReportTimeOptions(reportTimeSettings?.activeReportTime, reportTimeSettings?.reportTimes),
    [reportTimeSettings?.activeReportTime, reportTimeSettings?.reportTimes],
  );

  useEffect(() => {
    const urlTime = isValidReportTime(search.time)
      ? normalizeReportTime(search.time)
      : reportTimeSettings?.activeReportTime;
    const nextTime = urlTime || configuredReportTimes[0] || DEFAULT_REPORT_TIME;

    setReportTime((currentTime) =>
      normalizeReportTime(currentTime) === nextTime ? currentTime : nextTime,
    );
  }, [configuredReportTimes, reportTimeSettings?.activeReportTime, search.time]);

  const { data: company } = useQuery({
    queryKey: ["company", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id,name,full_strength,display_order")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Filter students by squad based on company display_order
  const filteredStudents = useMemo(() => {
    if (!company?.display_order) return studentsData;
    return studentsData.filter((student) => student.squad === String(company.display_order));
  }, [company?.display_order]);

  const strengthSummary = summarizeDispatchEntries(entries, company?.full_strength || 0);
  const selectedCategoryEntries = selectedCategory
    ? entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry.category === selectedCategory)
    : [];

  const { data: reports = [] } = useQuery({
    queryKey: ["report", id, date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_reports")
        .select(
          "id,report_date,reporter_name,reporter_position,report_time,dispatch_entries(id,category,cadet_name,reason,location,subcategory,count,display_order)",
        )
        .eq("company_id", id)
        .lte("report_date", date)
        .order("report_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
  const companyReports = reports as StoredDailyReport[];
  const currentDateReports = useMemo(
    () => companyReports.filter((storedReport) => storedReport.report_date === date),
    [companyReports, date],
  );
  const currentReportMatch = useMemo(
    () => getReportRowFromReports(currentDateReports, selectedReportTime),
    [currentDateReports, selectedReportTime],
  );
  const carriedEntries = useMemo(
    () => getActiveCarriedEntries(companyReports, date, selectedReportTime),
    [companyReports, date, selectedReportTime],
  );
  const report = currentReportMatch?.report || currentDateReports[0] || null;

  useEffect(() => {
    const row = currentReportMatch?.row || null;
    const rowEntries = (row?.entries || []).map(toEntryRow);
    const currentPeriodKeys = new Set(
      rowEntries
        .filter((entry) => isContinuingDispatchEntry(entry))
        .map((entry) => getDispatchPeriodKey(entry)),
    );
    const activeEntries = carriedEntries
      .filter((entry) => !currentPeriodKeys.has(getDispatchPeriodKey(entry)))
      .map(toEntryRow);

    if (row) {
      setEntries([...rowEntries, ...activeEntries]);
    } else {
      setEntries(activeEntries);
    }
  }, [date, currentReportMatch, carriedEntries, selectedReportTime]);

  const addEntry = (category: DispatchCategory) => {
    setEntries((prev) => [
      ...prev,
      {
        _local: crypto.randomUUID(),
        category,
        cadet_name: "",
        reason: "",
        location: "",
        subcategory: hasDispatchPeriod(category)
          ? serializeDispatchPeriod(createDispatchPeriod(crypto.randomUUID()))
          : "",
        count: 1,
      },
    ]);
  };

  const updateEntry = (idx: number, patch: Partial<EntryRow>) => {
    setEntries((prev) => prev.map((entry, i) => (i === idx ? { ...entry, ...patch } : entry)));
  };

  const toggleStudentInEntry = (idx: number, studentName: string) => {
    setEntries((prev) => {
      const currentEntry = prev[idx];
      if (!currentEntry) return prev;

      const currentNames = splitCadetNames(currentEntry.cadet_name);
      const selected = currentNames.some((name) => cadetNamesMatch(name, studentName));

      // Clicking an already selected name removes it from this entry. When a
      // name is added, remove it from every other entry first so one cadet can
      // never remain in two dispatch categories.
      const nextEntries = prev.map((entry, entryIndex) => {
        const names = splitCadetNames(entry.cadet_name);
        if (entryIndex === idx) {
          const nextNames = selected
            ? names.filter((name) => !cadetNamesMatch(name, studentName))
            : [...names.filter((name) => !cadetNamesMatch(name, studentName)), studentName];
          return { ...entry, cadet_name: nextNames.join(", ") };
        }

        if (selected) return entry;

        const nextNames = names.filter((name) => !cadetNamesMatch(name, studentName));
        return nextNames.length === names.length
          ? entry
          : { ...entry, cadet_name: nextNames.join(", "), count: nextNames.length };
      });

      if (selected) return nextEntries;

      // Removing the final name from an old row should remove that row too;
      // otherwise its remaining reason/location would fail form validation.
      return nextEntries.filter((entry, entryIndex) => {
        if (entryIndex === idx) return true;
        const hadName = splitCadetNames(prev[entryIndex]?.cadet_name).length > 0;
        return !hadName || splitCadetNames(entry.cadet_name).length > 0;
      });
    });
  };

  const updateEntryPeriod = (
    idx: number,
    boundary: "start" | "end",
    value: DispatchDateTimeParts,
  ) => {
    setEntries((prev) =>
      prev.map((entry, entryIndex) => {
        if (entryIndex !== idx) return entry;

        const period = parseDispatchPeriod(entry.subcategory);
        return {
          ...entry,
          subcategory: serializeDispatchPeriod({
            ...period,
            id: period.id || crypto.randomUUID(),
            [boundary]: value,
          }),
        };
      }),
    );
  };

  const updateEntryMedicalAdmission = (idx: number, admitted: boolean) => {
    setEntries((prev) =>
      prev.map((entry, entryIndex) => {
        if (entryIndex !== idx || entry.category !== "sick") return entry;

        if (!admitted) {
          return { ...entry, subcategory: "" };
        }

        const period = parseDispatchPeriod(entry.subcategory);
        const [hour = "", minute = ""] = selectedReportTime.split(".");
        return {
          ...entry,
          subcategory: serializeDispatchPeriod({
            ...period,
            id: period.id || crypto.randomUUID(),
            batchId: period.batchId || period.id || crypto.randomUUID(),
            batchCategory: "sick",
            start: { date, hour, minute },
            end: { date: "", hour: "", minute: "" },
            endIndefinite: false,
            medicalAdmission: true,
          }),
        };
      }),
    );
  };

  const updateEntryDutyAssignment = (idx: number, assigned: boolean) => {
    setEntries((prev) =>
      prev.map((entry, entryIndex) => {
        if (entryIndex !== idx || entry.category !== "other") return entry;

        if (!assigned) {
          return { ...entry, subcategory: "" };
        }

        const period = parseDispatchPeriod(entry.subcategory);
        const [hour = "", minute = ""] = selectedReportTime.split(".");
        const periodId = period.id || crypto.randomUUID();
        return {
          ...entry,
          subcategory: serializeDispatchPeriod({
            ...period,
            id: periodId,
            batchId: period.batchId || periodId,
            batchCategory: "other",
            batchValue: entry.reason.trim() || undefined,
            start: { date, hour, minute },
            end: { date: "", hour: "", minute: "" },
            endIndefinite: false,
            dutyAssignment: true,
          }),
        };
      }),
    );
  };

  const removeEntry = (idx: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== idx));
  };

  const validateReportRequiredFields = () => {
    const missingFields: string[] = [];

    if (!reportTime.trim()) missingFields.push("เวลารายงาน");

    // กรอง entry ที่มีข้อมูลอยู่จริงๆ (ไม่ใช่ว่างเปล่า)
    const nonEmptyEntries = entries.filter((entry) => {
      if (entry.category === "other") {
        // ไม่ดูจาก count เพราะรายการใหม่ตั้งต้นเป็น 1 อยู่แล้ว
        return (
          entry.cadet_name?.trim() ||
          entry.reason?.trim() ||
          entry.location?.trim() ||
          entry.subcategory?.trim()
        );
      }
      return (
        entry.cadet_name?.trim() ||
        entry.reason?.trim() ||
        entry.location?.trim() ||
        hasPeriodInput(entry)
      );
    });

    // ตรวจสอบรายการที่มีข้อมูลว่ากรอกครบหรือไม่
    const invalidEntries = nonEmptyEntries.filter((entry) => {
      if (entry.category === "other") {
        // มีรายชื่อ = ใช้ได้ (นับหัวจากรายชื่อ)
        if (splitCadetNames(entry.cadet_name).length > 0) return false;
        // ข้อมูลเก่าที่บันทึกแบบหัวข้อ + จำนวน ยังถือว่าใช้ได้
        return !(entry.subcategory?.trim() && (Number(entry.count) || 0) > 0);
      }

      const hasName = Boolean(entry.cadet_name?.trim());
      const hasReason = Boolean(entry.reason?.trim());
      const hasLocation = Boolean(entry.location?.trim());

      // รายการที่เริ่มกรอกแล้วต้องมีชื่อ สาเหตุ และสถานที่ครบ
      return !hasName || !hasReason || !hasLocation;
    });

    if (invalidEntries.length > 0) {
      const incompleteOther = invalidEntries.filter((e) => e.category === "other");
      const incompleteNormal = invalidEntries.filter((e) => e.category !== "other");

      if (incompleteOther.length > 0) {
        toast.error(`กรุณาเลือกรายชื่อในรายการอื่น ๆ`);
        return false;
      }

      if (incompleteNormal.length > 0) {
        toast.error(`กรุณากรอกชื่อ สาเหตุ และสถานที่ให้ครบทุกรายการ`);
        return false;
      }
    }

    const timedEntries = nonEmptyEntries.filter((entry) => hasDispatchPeriod(entry.category));
    const periodIssues = timedEntries.map((entry) =>
      validateDispatchPeriod(parseDispatchPeriod(entry.subcategory)),
    );

    if (periodIssues.includes("incomplete")) {
      toast.error("กรุณากรอกวันและเวลาเริ่มต้นและสิ้นสุดให้ครบ");
      return false;
    }

    if (periodIssues.includes("order")) {
      toast.error("วันและเวลาสิ้นสุดต้องอยู่หลังวันและเวลาเริ่มต้น");
      return false;
    }

    if (missingFields.length > 0) {
      toast.error(`กรุณากรอก${missingFields.join(" และ ")}ก่อนบันทึก`);
      return false;
    }

    return true;
  };

  const handleSave = () => {
    if (!validateReportRequiredFields()) return;
    save.mutate();
  };

  const save = useMutation({
    mutationFn: async () => {
      const savedAt = new Date().toISOString();
      const entriesWithUpdatedAt = enforceSingleStudentCategory(entries).map((entry) =>
        stampDispatchEntryUpdatedAt(entry, savedAt),
      );
      const existingRows = decodeReportRows(report);
      const existingSelectedRow = existingRows.find(
        (existingRow) => normalizeReportTime(existingRow.reportTime) === selectedReportTime,
      );
      const row: ReportRowData = {
        reportTime: selectedReportTime,
        // Keep legacy metadata when editing an existing report. These fields
        // are no longer collected in the form, but older reports may still
        // contain them.
        reporterName: existingSelectedRow?.reporterName || existingRows[0]?.reporterName || "",
        reporterPosition:
          existingSelectedRow?.reporterPosition || existingRows[0]?.reporterPosition || "",
        entries: cleanReportEntries(entriesWithUpdatedAt),
      };
      const nextRows = [
        ...existingRows.filter(
          (existingRow) => normalizeReportTime(existingRow.reportTime) !== selectedReportTime,
        ),
        row,
      ].sort((a, b) =>
        normalizeReportTime(a.reportTime).localeCompare(normalizeReportTime(b.reportTime)),
      );
      const reportPayload = {
        company_id: id,
        report_date: date,
        reporter_name: nextRows[0]?.reporterName || "",
        reporter_position: nextRows[0]?.reporterPosition || "",
        report_time: nextRows[0]?.reportTime || selectedReportTime,
      };

      const reportResult = report
        ? await supabase
            .from("daily_reports")
            .update(reportPayload)
            .eq("id", report.id)
            .select()
            .single()
        : await supabase.from("daily_reports").insert(reportPayload).select().single();

      const { data: savedReport, error: reportError } = reportResult;
      if (reportError) throw reportError;

      const { error: deleteError } = await supabase
        .from("dispatch_entries")
        .delete()
        .eq("report_id", savedReport.id);
      if (deleteError) throw deleteError;

      const encodedEntries = encodeReportRows(nextRows);
      if (encodedEntries.length > 0) {
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
    },
    onSuccess: () => {
      toast.success(
        strengthSummary.dispatched === 0
          ? "บันทึกเรียบร้อย ไม่มีจำหน่าย ส่งยอดแล้ว"
          : `บันทึกเรียบร้อย ยอดสุทธิหลังบันทึก ${strengthSummary.remaining} นาย`,
      );
      qc.invalidateQueries({ queryKey: ["report", id] });
      qc.invalidateQueries({ queryKey: ["home-summary"] });
      qc.invalidateQueries({ queryKey: ["admin-summary"] });
      qc.invalidateQueries({ queryKey: ["report-export"] });
    },
    onError: (error: Error) => toast.error(error.message || "บันทึกไม่สำเร็จ"),
  });

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="tiger-stripes pointer-events-none fixed inset-0 opacity-30" />
      <header className="sticky top-0 z-20 border-b border-primary/15 bg-card/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-3 py-3 sm:px-4">
          {returnToAdmin ? (
            <Link
              to="/admin"
              search={adminReturnSearch}
              className="flex h-10 shrink-0 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> กลับ
            </Link>
          ) : (
            <Link
              to="/"
              className="flex h-10 shrink-0 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> กลับ
            </Link>
          )}
          <h1 className="min-w-0 truncate text-base font-bold">{company?.name || "กรอกยอด"}</h1>
          <ThemeToggle className="shrink-0" />
        </div>
      </header>

      <main className="relative mx-auto max-w-3xl space-y-4 px-3 py-4 pb-28 sm:px-4 sm:py-6">
        <Card
          className="reveal-stagger overflow-hidden rounded-xl"
          style={{ "--i": 0 } as React.CSSProperties}
        >
          <div className="gold-gradient h-1 w-full opacity-70" />
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">ข้อมูลทั่วไป</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0 sm:grid-cols-2">
            <div>
              <Label>วันที่</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>เวลารายงาน</Label>
              <select
                value={selectedReportTime}
                onChange={(e) => setReportTime(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm"
              >
                {configuredReportTimes.map((time) => {
                  const normalizedTime = normalizeReportTime(time);

                  return (
                    <option key={normalizedTime} value={normalizedTime}>
                      {normalizedTime}
                    </option>
                  );
                })}
                {!configuredReportTimes.includes(selectedReportTime) && (
                  <option value={selectedReportTime}>{selectedReportTime}</option>
                )}
              </select>
            </div>
          </CardContent>
        </Card>

        <Card className="reveal-stagger rounded-xl" style={{ "--i": 1 } as React.CSSProperties}>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">ยอดสุทธิหลังบันทึก</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            <div className="grid grid-cols-3 gap-2">
              <StatCard
                label="ยอดเต็ม"
                value={strengthSummary.fullStrength}
                unit="นาย"
                tone="gold"
                compact
              />
              <StatCard
                label="จำหน่าย"
                value={strengthSummary.dispatched}
                unit="นาย"
                tone="warning"
                compact
              />
              <StatCard
                label="คงยอด"
                value={strengthSummary.remaining}
                unit="นาย"
                tone="success"
                compact
              />
            </div>
          </CardContent>
        </Card>

        <section
          className="reveal-stagger grid grid-cols-2 gap-2 min-[430px]:grid-cols-3 sm:grid-cols-5"
          aria-label="ยอดจำหน่ายแยกตามหัวข้อ"
        >
          {CATEGORY_SUMMARY_ITEMS.map(({ category, icon: Icon }) => (
            <button
              key={category}
              type="button"
              onClick={() => setSelectedCategory(category)}
              aria-haspopup="dialog"
              aria-label={`ดูและแก้ไขรายการ${CATEGORY_LABELS[category]} ${strengthSummary.categoryCounts[category]} นาย`}
              className="min-h-24 rounded-xl border border-border/70 bg-card/95 p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:translate-y-0"
            >
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Icon className="h-4 w-4 text-primary" />
                {CATEGORY_LABELS[category]}
              </div>
              <div className="mt-3 text-xl font-bold text-foreground">
                {strengthSummary.categoryCounts[category]}{" "}
                <span className="text-[11px] font-medium text-muted-foreground">นาย</span>
              </div>
              <div className="mt-2 text-[10px] font-medium text-primary/80">กดดูรายละเอียด</div>
            </button>
          ))}
        </section>

        <div className="sticky bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-10 flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-background/90 p-3 shadow-lg backdrop-blur-md sm:bottom-4 sm:flex-row sm:items-center">
          <div className="tiger-stripes pointer-events-none absolute inset-0 opacity-30" />
          <div className="relative min-w-0 flex-1 text-sm">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-muted-foreground">คงยอด</span>
              <span className="gold-text text-xl font-bold leading-none">
                {strengthSummary.remaining}
              </span>
              <span className="text-xs text-muted-foreground">นาย</span>
            </div>
            <div className="text-xs text-muted-foreground">
              จำหน่าย {strengthSummary.dispatched} นาย
            </div>
          </div>
          <Button
            onClick={handleSave}
            disabled={save.isPending}
            className="relative w-full sm:flex-1"
          >
            {save.isPending ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </div>
      </main>

      <Dialog
        open={selectedCategory !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedCategory(null);
        }}
      >
        {selectedCategory && (
          <DialogContent className="flex max-h-[92dvh] w-[calc(100%_-_1rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0">
            <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12 text-left sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <DialogTitle>รายละเอียด{CATEGORY_LABELS[selectedCategory]}</DialogTitle>
                  <DialogDescription className="mt-1">
                    รวม {strengthSummary.categoryCounts[selectedCategory]} นาย จาก{" "}
                    {selectedCategoryEntries.length} รายการ
                  </DialogDescription>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => addEntry(selectedCategory)}
                  className="mr-8 h-9 shrink-0 sm:mr-6"
                >
                  <Plus className="h-4 w-4" />
                  เพิ่มยอด
                </Button>
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-muted/20 p-3 sm:p-4">
              {selectedCategoryEntries.length === 0 && (
                <div className="rounded-xl border border-dashed bg-background px-4 py-8 text-center">
                  <p className="text-sm font-medium">
                    ยังไม่มีรายการ{CATEGORY_LABELS[selectedCategory]}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    กด “เพิ่มยอด” เพื่อเลือกรายชื่อและกรอกรายละเอียด
                  </p>
                </div>
              )}

              {selectedCategoryEntries.map(({ entry, index: i }, entryPosition) => {
                const category = entry.category;
                const hasDateRange = category === "leave" || category === "official";
                const dateRangeLabel = category === "official" ? "ปฏิบัติราชการ" : "ลา";
                const selectedNames = splitCadetNames(entry.cadet_name);
                const query = searchQuery[i] || "";
                const matchingStudents = query.trim()
                  ? filteredStudents
                      .map((student) => ({
                        student,
                        score: getStudentSearchScore(student, query),
                      }))
                      .filter(({ score }) => Number.isFinite(score))
                      .sort(
                        (first, second) =>
                          first.score - second.score ||
                          Number(first.student.number) - Number(second.student.number),
                      )
                      .slice(0, 10)
                  : [];

                return (
                  <section
                    key={entry.id ?? entry._local ?? `${category}-${i}`}
                    className="overflow-hidden rounded-xl border bg-card shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">รายการที่ {entryPosition + 1}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {countDispatchEntry(entry)} นาย
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (
                            window.confirm(`ยืนยันการลบยอด${CATEGORY_LABELS[category]}นี้หรือไม่`)
                          ) {
                            removeEntry(i);
                          }
                        }}
                        className="h-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`ลบยอด${CATEGORY_LABELS[category]}รายการที่ ${entryPosition + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                        ลบยอด
                      </Button>
                    </div>

                    <div className="space-y-3 p-3">
                      <div className="space-y-2">
                        <Label className="text-xs">รายชื่อที่จำหน่าย</Label>
                        {selectedNames.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5" aria-label="รายชื่อที่เลือก">
                            {selectedNames.map((name) => (
                              <button
                                key={name}
                                type="button"
                                onClick={() => toggleStudentInEntry(i, name)}
                                className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-left text-xs text-primary transition-colors hover:bg-destructive/10 hover:text-destructive"
                                aria-label={`นำ ${name} ออกจากรายการ`}
                                title="กดเพื่อนำรายชื่อออก"
                              >
                                <span>{name}</span>
                                <X className="h-3 w-3 shrink-0" />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">ยังไม่ได้เลือกรายชื่อ</p>
                        )}

                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            type="search"
                            autoComplete="off"
                            aria-label={`ค้นหารายชื่อเพื่อเพิ่มในยอด${CATEGORY_LABELS[category]}`}
                            placeholder="ค้นหาชื่อ นามสกุล เลขที่ หรืออักษรย่อ..."
                            value={query}
                            onChange={(event) =>
                              setSearchQuery((previous) => ({
                                ...previous,
                                [i]: event.target.value,
                              }))
                            }
                            className="pl-9 text-sm"
                          />
                        </div>

                        {query.trim() && (
                          <div className="max-h-48 overflow-y-auto rounded-md border bg-background p-1.5 shadow-sm">
                            {matchingStudents.map(({ student }) => {
                              const otherEntry = entries.reduce<EntryRow | null>(
                                (found, candidate, candidateIndex) => {
                                  if (candidateIndex === i) return found;
                                  return splitCadetNames(candidate.cadet_name).some((name) =>
                                    cadetNamesMatch(name, student.display_name),
                                  )
                                    ? candidate
                                    : found;
                                },
                                null,
                              );
                              const isSelected = selectedNames.some((name) =>
                                cadetNamesMatch(name, student.display_name),
                              );
                              const otherCategoryLabel = otherEntry
                                ? CATEGORY_LABELS[otherEntry.category]
                                : "";

                              return (
                                <Button
                                  key={`${student.squad}-${student.number}`}
                                  type="button"
                                  size="sm"
                                  variant={
                                    isSelected ? "default" : otherEntry ? "secondary" : "outline"
                                  }
                                  onClick={() => {
                                    toggleStudentInEntry(i, student.display_name);
                                    setSearchQuery((previous) => ({ ...previous, [i]: "" }));
                                  }}
                                  className="mb-1 h-auto w-full justify-start whitespace-normal px-2.5 py-2 text-left text-xs last:mb-0"
                                >
                                  <span>{student.display_name}</span>
                                  {otherEntry && (
                                    <span className="ml-1 text-[10px] opacity-70">
                                      จำหน่าย: {otherCategoryLabel} (กดเพื่อย้าย)
                                    </span>
                                  )}
                                </Button>
                              );
                            })}
                            {matchingStudents.length === 0 && (
                              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                                ไม่พบรายชื่อที่ใกล้เคียง
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor={`reason-${i}`} className="text-xs">
                            ไปทำอะไร / สาเหตุ
                          </Label>
                          <Input
                            id={`reason-${i}`}
                            placeholder="ระบุสาเหตุหรือภารกิจ"
                            value={entry.reason}
                            onChange={(event) => updateEntry(i, { reason: event.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`location-${i}`} className="text-xs">
                            สถานที่
                          </Label>
                          <Input
                            id={`location-${i}`}
                            placeholder="ระบุสถานที่"
                            value={entry.location}
                            onChange={(event) => updateEntry(i, { location: event.target.value })}
                          />
                        </div>
                      </div>

                      {category === "sick" && (
                        <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3 text-sm">
                          <Checkbox
                            checked={isMedicalAdmissionEntry(entry)}
                            onCheckedChange={(checked) =>
                              updateEntryMedicalAdmission(i, checked === true)
                            }
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
                            checked={isDutyAssignmentEntry(entry)}
                            onCheckedChange={(checked) =>
                              updateEntryDutyAssignment(i, checked === true)
                            }
                            aria-label="ปฏิบัติหน้าที่"
                          />
                          <span>
                            <span className="block font-medium">ปฏิบัติหน้าที่</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              จำหน่ายต่อเนื่องจนถึงแถว 07.30 น. ของวันถัดไป
                              และหยุดอัตโนมัติในแถวถัดจากนั้น
                            </span>
                          </span>
                        </label>
                      )}

                      {hasDateRange && (
                        <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
                          <DispatchDateTimeInput
                            label={`วันและเวลาเริ่ม${dateRangeLabel}`}
                            value={parseDispatchPeriod(entry.subcategory).start}
                            onChange={(value) => updateEntryPeriod(i, "start", value)}
                          />
                          <DispatchDateTimeInput
                            label={`วันและเวลาสิ้นสุด${dateRangeLabel}`}
                            value={parseDispatchPeriod(entry.subcategory).end}
                            onChange={(value) => updateEntryPeriod(i, "end", value)}
                          />
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>

            <div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-background px-4 py-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setSelectedCategory(null)}>
                ปิด
              </Button>
              <Button type="button" onClick={handleSave} disabled={save.isPending}>
                {save.isPending ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
