import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Plus, Trash2, ArrowLeft, Users, MinusCircle, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import studentsData from "@/data/students.json";
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
  isDispatchPeriodActiveAt,
  parseDispatchPeriod,
  reportDateTimeToTimestamp,
  serializeDispatchPeriod,
  validateDispatchPeriod,
  type DispatchDateTimeParts,
} from "@/lib/dispatch-period";

export const Route = createFileRoute("/company/$id")({
  validateSearch: (search): { date?: string; time?: string } => ({
    date: typeof search.date === "string" ? search.date : undefined,
    time: typeof search.time === "string" ? search.time : undefined,
  }),
  component: CompanyPage,
});

type EntryRow = Entry & { id?: string; _local?: string };

const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

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
  if (!hasDispatchPeriod(entry.category)) return false;

  const period = parseDispatchPeriod(entry.subcategory);
  return [period.start, period.end].some((parts) =>
    Boolean(parts.date || parts.hour || parts.minute),
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

  const latestEntries = new Map<
    string,
    { timestamp: string; entry: StoredDispatchEntry }
  >();

  reports.forEach((storedReport) => {
    if (!storedReport.report_date) return;

    decodeReportRows(storedReport).forEach((row) => {
      const rowTimestamp = reportDateTimeToTimestamp(storedReport.report_date || "", row.reportTime);
      if (!rowTimestamp || rowTimestamp >= targetTimestamp) return;

      row.entries.forEach((entry) => {
        if (!hasDispatchPeriod(entry.category)) return;

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
  const [reporterName, setReporterName] = useState("");
  const [reporterPosition, setReporterPosition] = useState("");
  const [reportTime, setReportTime] = useState(() =>
    isValidReportTime(search.time) ? normalizeReportTime(search.time) : DEFAULT_REPORT_TIME,
  );
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [showReporterStudentList, setShowReporterStudentList] = useState(false);
  const [reporterSearchQuery, setReporterSearchQuery] = useState("");
  const [showStudentList, setShowStudentList] = useState<Record<number, boolean>>({});
  const [searchQuery, setSearchQuery] = useState<Record<number, string>>({});
  const selectedReportTime = normalizeReportTime(reportTime);

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
    return studentsData.filter(student => student.squad === String(company.display_order));
  }, [company?.display_order]);

  const strengthSummary = summarizeDispatchEntries(entries, company?.full_strength || 0);

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
        .filter((entry) => hasDispatchPeriod(entry.category))
        .map((entry) => getDispatchPeriodKey(entry)),
    );
    const activeEntries = carriedEntries
      .filter((entry) => !currentPeriodKeys.has(getDispatchPeriodKey(entry)))
      .map(toEntryRow);

    if (row) {
      setReporterName(row.reporterName || "");
      setReporterPosition(row.reporterPosition || "");
      setEntries([...rowEntries, ...activeEntries]);
    } else {
      setReporterName("");
      setReporterPosition("");
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

  const removeEntry = (idx: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== idx));
  };

  const selectReporter = (student: (typeof studentsData)[number]) => {
    const fullName = [student.name, student.surname].filter(Boolean).join(" ");
    setReporterName(`นรต.${fullName}`);
    setReporterPosition(student.number);
    setShowReporterStudentList(false);
    setReporterSearchQuery("");
  };

  const validateReportRequiredFields = () => {
    const missingFields: string[] = [];

    if (!reporterName.trim()) missingFields.push("ชื่อผู้ควบคุมแถว");
    if (!reportTime.trim()) missingFields.push("เวลารายงาน");

    // กรอง entry ที่มีข้อมูลอยู่จริงๆ (ไม่ใช่ว่างเปล่า)
    const nonEmptyEntries = entries.filter(entry => {
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
    const invalidEntries = nonEmptyEntries.filter(entry => {
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
      const incompleteOther = invalidEntries.filter(e => e.category === "other");
      const incompleteNormal = invalidEntries.filter(e => e.category !== "other");

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
      toast.error("กรุณากรอกวันและเวลาเริ่มต้นถึงสิ้นสุดของรายการลาและราชการให้ครบ");
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
      const entriesWithPeriodIds = entries.map((entry) => {
        if (!hasDispatchPeriod(entry.category)) return entry;

        const period = parseDispatchPeriod(entry.subcategory);
        return {
          ...entry,
          subcategory: serializeDispatchPeriod({
            ...period,
            id: period.id || crypto.randomUUID(),
          }),
        };
      });
      const row: ReportRowData = {
        reportTime: selectedReportTime,
        reporterName: reporterName.trim(),
        reporterPosition: reporterPosition.trim(),
        entries: cleanReportEntries(entriesWithPeriodIds),
      };
      const existingRows = decodeReportRows(report);
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
          <Link
            to="/"
            className="flex h-10 shrink-0 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> กลับ
          </Link>
          <h1 className="min-w-0 truncate text-base font-bold">{company?.name || "กรอกยอด"}</h1>
          <ThemeToggle className="shrink-0" />
        </div>
      </header>

      <main className="relative mx-auto max-w-3xl space-y-4 px-3 py-4 pb-28 sm:px-4 sm:py-6">
        <Card className="reveal-stagger overflow-hidden rounded-xl" style={{ "--i": 0 } as React.CSSProperties}>
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
            <div className="sm:col-span-2">
              <Label>ชื่อผู้ควบคุมแถว</Label>
              <Input
                value={reporterName}
                onChange={(e) => setReporterName(e.target.value)}
                placeholder="นรต.เกียรติศักดิ์"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>เลขที่ในหมวด</Label>
              <Input
                value={reporterPosition}
                onChange={(e) => setReporterPosition(e.target.value)}
                placeholder="๐"
              />
            </div>
            {filteredStudents.length > 0 && (
              <div className="space-y-2 sm:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  aria-expanded={showReporterStudentList}
                  onClick={() => setShowReporterStudentList((current) => !current)}
                >
                  {showReporterStudentList ? (
                    <>
                      <ChevronUp className="mr-1 h-4 w-4" />
                      ซ่อนรายชื่อ
                    </>
                  ) : (
                    <>
                      <ChevronDown className="mr-1 h-4 w-4" />
                      แสดงรายชื่อ ({filteredStudents.length} คน)
                    </>
                  )}
                </Button>

                {showReporterStudentList && (
                  <div className="space-y-2">
                    <Input
                      value={reporterSearchQuery}
                      onChange={(event) => setReporterSearchQuery(event.target.value)}
                      placeholder="ค้นหารายชื่อ..."
                      aria-label="ค้นหารายชื่อผู้ควบคุมแถว"
                    />
                    <div className="grid max-h-52 gap-1.5 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
                      {filteredStudents
                        .filter((student) => {
                          const query = reporterSearchQuery.trim().toLocaleLowerCase("th");
                          if (!query) return true;

                          return (
                            student.display_name.toLocaleLowerCase("th").includes(query) ||
                            student.name.toLocaleLowerCase("th").includes(query) ||
                            student.surname.toLocaleLowerCase("th").includes(query) ||
                            student.number.includes(query)
                          );
                        })
                        .map((student) => {
                          const fullName = [student.name, student.surname]
                            .filter(Boolean)
                            .join(" ");
                          const selected =
                            reporterName.trim() === `นรต.${fullName}` &&
                            reporterPosition.trim() === student.number;

                          return (
                            <Button
                              key={`${student.squad}-${student.number}`}
                              type="button"
                              size="sm"
                              variant={selected ? "default" : "outline"}
                              className="h-auto min-h-9 w-full justify-start whitespace-normal px-3 py-2 text-left text-xs"
                              onClick={() => selectReporter(student)}
                            >
                              {student.display_name}
                            </Button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card
          className="reveal-stagger rounded-xl"
          style={{ "--i": 1 } as React.CSSProperties}
        >
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

            <div className="space-y-1 text-sm">
              <div className="font-medium text-muted-foreground">รายการจำหน่าย</div>
              {strengthSummary.items.length > 0 ? (
                strengthSummary.items.map((item) => (
                  <div
                    key={`${item.category}-${item.label}`}
                    className="rounded-md bg-muted/30 px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 font-medium">{item.label}</span>
                      <span className="shrink-0 font-medium">{item.count} นาย</span>
                    </div>
                    {item.details.length > 0 && (
                      <div className="mt-1 space-y-1 text-xs leading-5 text-muted-foreground">
                        {item.details.map((detail, index) => (
                          <div
                            key={`${item.category}-${item.label}-${index}`}
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
                <div className="rounded-md bg-muted/30 px-3 py-2 text-muted-foreground">
                  ไม่มีจำหน่าย
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {CATEGORY_ORDER.map((category, categoryIndex) => {
          const list = entries
            .map((entry, i) => ({ entry, i }))
            .filter((item) => item.entry.category === category);
          const hasDateRange = category === "leave" || category === "official";
          const dateRangeLabel = category === "official" ? "ปฏิบัติราชการ" : "ลา";

          // นับยอดจำหน่ายในหมวดนี้ (รายชื่อ หรือจำนวนที่กรอกไว้สำหรับ "อื่น ๆ")
          const totalStudents = list.reduce(
            (sum, { entry }) => sum + countDispatchEntry(entry),
            0,
          );

          return (
            <Card
              key={category}
              className={`reveal-stagger card-lift overflow-hidden rounded-xl border-l-4 ${
                list.length === 0 ? "border-l-border bg-muted/20" : "border-l-primary/50"
              }`}
              style={{ "--i": categoryIndex } as React.CSSProperties}
            >
              <CardHeader className="flex flex-row items-center justify-between gap-3 p-4 pb-3">
                <div>
                  <CardTitle className="text-base leading-tight">
                    {CATEGORY_LABELS[category]}
                  </CardTitle>
                  {totalStudents > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">{totalStudents} คน</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addEntry(category)}
                  className="h-10 shrink-0"
                >
                  <Plus className="h-4 w-4 mr-1" /> เพิ่ม
                </Button>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-0">
                {list.length === 0 && (
                  <div className="rounded-md border border-dashed bg-background/60 px-3 py-2 text-sm text-muted-foreground">
                    ยังไม่มีรายการในหมวดนี้
                  </div>
                )}
                {list.map(({ entry, i }) => (
                  <div
                    key={entry.id ?? entry._local}
                    className="space-y-2 rounded-lg border bg-muted/30 p-3"
                  >
                    <>
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                        <textarea
                          ref={(el) => {
                            if (el) {
                              el.style.height = 'auto';
                              el.style.height = el.scrollHeight + 'px';
                            }
                          }}
                          placeholder="ชื่อ เช่น วิจัย ก."
                          value={entry.cadet_name}
                          onChange={(event) => {
                            updateEntry(i, { cadet_name: event.target.value });
                            const target = event.target as HTMLTextAreaElement;
                            target.style.height = 'auto';
                            target.style.height = target.scrollHeight + 'px';
                          }}
                          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-none overflow-hidden"
                          rows={1}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeEntry(i)}
                          aria-label="ลบรายการ"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>

                      {filteredStudents.length > 0 && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowStudentList(prev => ({ ...prev, [i]: !prev[i] }))}
                            className="w-full"
                          >
                            {showStudentList[i] ? (
                              <>
                                <ChevronUp className="h-4 w-4 mr-1" />
                                ซ่อนรายชื่อ
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-4 w-4 mr-1" />
                                แสดงรายชื่อ ({filteredStudents.length} คน)
                              </>
                            )}
                          </Button>

                          {showStudentList[i] && (
                            <>
                              <Input
                                placeholder="ค้นหารายชื่อ..."
                                value={searchQuery[i] || ''}
                                onChange={(e) => setSearchQuery(prev => ({ ...prev, [i]: e.target.value }))}
                                className="text-sm"
                              />
                              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto border rounded-md p-2">
                                {filteredStudents
                                  .filter(student => {
                                    const query = (searchQuery[i] || '').toLowerCase();
                                    if (!query) return true;
                                    return student.display_name.toLowerCase().includes(query) ||
                                           student.name.toLowerCase().includes(query) ||
                                           student.surname.toLowerCase().includes(query) ||
                                           student.number.includes(query);
                                  })
                                  .map((student) => {
                                    // ตรวจสอบว่านักเรียนคนนี้ถูกจำหน่ายในหมวดอื่นหรือไม่
                                    const currentEntry = entries[i];
                                    const otherEntry = entries.find((e, idx) => {
                                      if (idx === i) return false; // ไม่เช็คตัวเอง
                                      const names = e.cadet_name.split(',').map(n => n.trim()).filter(Boolean);
                                      return names.includes(student.display_name);
                                    });

                                    const currentNames = entry.cadet_name.split(',').map(n => n.trim()).filter(Boolean);
                                    const selected = currentNames.includes(student.display_name);
                                    const isInOtherCategory = !!otherEntry;
                                    const otherCategoryLabel = otherEntry ? CATEGORY_LABELS[otherEntry.category] : '';

                                    return (
                                      <Button
                                        key={`${student.squad}-${student.number}`}
                                        type="button"
                                        size="sm"
                                        variant={selected ? "default" : isInOtherCategory ? "secondary" : "outline"}
                                        onClick={() => {
                                          const current = entry.cadet_name.trim();

                                          if (selected) {
                                            // ลบรายชื่อออกจากหมวดนี้
                                            const filtered = currentNames.filter(n => n !== student.display_name);
                                            updateEntry(i, { cadet_name: filtered.join(', ') });
                                          } else if (isInOtherCategory && otherEntry) {
                                            // ลบออกจากหมวดเดิมและเพิ่มเข้าหมวดใหม่
                                            const otherIndex = entries.findIndex(e => e === otherEntry);
                                            const otherNames = otherEntry.cadet_name.split(',').map(n => n.trim()).filter(Boolean);
                                            const filteredOtherNames = otherNames.filter(n => n !== student.display_name);
                                            updateEntry(otherIndex, { cadet_name: filteredOtherNames.join(', ') });

                                            // เพิ่มเข้าหมวดใหม่
                                            const newValue = current ? `${current}, ${student.display_name}` : student.display_name;
                                            updateEntry(i, { cadet_name: newValue });
                                          } else {
                                            // เพิ่มรายชื่อปกติ
                                            const newValue = current ? `${current}, ${student.display_name}` : student.display_name;
                                            updateEntry(i, { cadet_name: newValue });
                                          }
                                        }}
                                        className="text-xs h-auto px-2 py-1 whitespace-normal text-left"
                                        title={student.display_name}
                                      >
                                        {student.display_name}
                                        {isInOtherCategory && !selected && (
                                          <span className="ml-1 text-[10px] opacity-70">
                                            (ขณะนี้: จำหน่าย{otherCategoryLabel})
                                          </span>
                                        )}
                                      </Button>
                                    );
                                  })}
                              </div>
                            </>
                          )}
                        </>
                      )}

                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          placeholder="สาเหตุ"
                          value={entry.reason}
                          onChange={(event) => updateEntry(i, { reason: event.target.value })}
                        />
                        <Input
                          placeholder="สถานที่"
                          value={entry.location}
                          onChange={(event) => updateEntry(i, { location: event.target.value })}
                        />
                      </div>

                      {category === "other" && splitCadetNames(entry.cadet_name).length > 0 && (
                        <div className="rounded-md bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                          จำหน่าย {splitCadetNames(entry.cadet_name).length} นาย ตามรายชื่อที่เลือก
                        </div>
                      )}

                      {hasDateRange && (
                        <div className="grid gap-3 sm:grid-cols-2">
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
                    </>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}

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
    </div>
  );
}
