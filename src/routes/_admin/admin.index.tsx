import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { thaiToArabicNumerals } from "@/lib/thai-numerals";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Users, UserMinus, UserCheck, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  countDispatchEntry,
  splitCadetNames,
  todayISO,
  type DispatchCategory,
} from "@/lib/thai";
import {
  DEFAULT_REPORT_TIME,
  decodeReportRows,
  encodeReportRows,
  getReportRowFromReports,
  normalizeReportTime,
  type StoredDailyReport,
} from "@/lib/report-rows";
import { fetchActiveReportTime, fetchReportTimes } from "@/lib/report-settings";

export const Route = createFileRoute("/_admin/admin/")({
  component: AdminDashboard,
});

type SummaryEntry = {
  category: DispatchCategory;
  count: number | null;
  subcategory?: string | null;
  cadet_name?: string | null;
};

type CategoryCounts = Record<DispatchCategory, number>;
type ClearCompanyTarget = {
  companyId: string;
  companyName: string;
  report: StoredDailyReport | null;
};
type AdminSummaryRow = {
  company: { id: string; name: string; full_strength: number };
  report: StoredDailyReport | null;
  row: {
    reporterName?: string | null;
    reporterPosition?: string | null;
    reportTime?: string | null;
  } | null;
  warnings: string[];
  categoryCounts: CategoryCounts;
  dispatched: number;
  remaining: number;
};

const emptyCategoryCounts = (): CategoryCounts =>
  Object.fromEntries(CATEGORY_ORDER.map((category) => [category, 0])) as CategoryCounts;

const countEntry = (entry: SummaryEntry) =>
  countDispatchEntry({
    category: entry.category,
    count: Number(entry.count) || 0,
    cadet_name: entry.cadet_name || "",
  });

const summarizeEntries = (entries: SummaryEntry[]): CategoryCounts => {
  const counts = emptyCategoryCounts();

  entries.forEach((entry) => {
    counts[entry.category] += countEntry(entry);
  });

  return counts;
};

const findEntryWarnings = (entries: SummaryEntry[]) => {
  const warnings: string[] = [];

  entries.forEach((entry) => {
    if (entry.category !== "other") return;

    // จำหน่ายตามรายชื่อ ไม่ต้องมีหัวข้อ/จำนวนกำกับ
    if (splitCadetNames(entry.cadet_name).length > 0) return;

    if (!entry.subcategory?.trim()) {
      warnings.push("อื่น ๆ ไม่ใส่ชื่อภารกิจ");
    }

    if ((Number(entry.count) || 0) <= 0) {
      warnings.push("อื่น ๆ จำนวนเป็น 0");
    }
  });

  return [...new Set(warnings)];
};

function CategoryCountList({
  counts,
  className = "",
}: {
  counts: CategoryCounts;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-2 gap-x-3 gap-y-1 text-xs ${className}`}>
      {CATEGORY_ORDER.map((category) => (
        <div key={category} className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">{CATEGORY_LABELS[category]}</span>
          <span className="font-medium text-foreground">{counts[category]} นาย</span>
        </div>
      ))}
    </div>
  );
}

function CategoryCountBadges({
  counts,
  className = "",
}: {
  counts: CategoryCounts;
  className?: string;
}) {
  const activeCounts = CATEGORY_ORDER.filter((category) => counts[category] > 0);

  if (activeCounts.length === 0) {
    return <span className="text-sm text-muted-foreground">ไม่มีจำหน่าย</span>;
  }

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {activeCounts.map((category) => (
        <Badge key={category} variant="secondary" className="font-normal">
          {CATEGORY_LABELS[category]} {counts[category]} นาย
        </Badge>
      ))}
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function MobileSummaryRow({
  row,
  date,
  selectedReportTime,
  onClear,
  isClearing,
  index = 0,
}: {
  row: AdminSummaryRow;
  date: string;
  selectedReportTime: string;
  onClear: (target: ClearCompanyTarget) => void;
  isClearing: boolean;
  index?: number;
}) {
  return (
    <Card
      className="reveal-stagger card-lift overflow-hidden rounded-xl border-l-4 border-l-primary/40"
      style={{ "--i": index } as React.CSSProperties}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold">{thaiToArabicNumerals(row.company.name)}</div>
            <div className="text-xs text-muted-foreground">
              {row.row?.reporterName ? (
                <span>
                  {row.row.reporterName}
                  {row.row.reporterPosition ? ` (${row.row.reporterPosition})` : ""}
                </span>
              ) : (
                <span>ยังไม่ส่งข้อมูล</span>
              )}
            </div>
          </div>
          <Badge
            variant={row.row ? "default" : "outline"}
            className={
              row.row
                ? "shrink-0 border-success/30 bg-success/15 text-success hover:bg-success/20"
                : "shrink-0 border-warning/40 text-warning"
            }
          >
            {row.row ? "ส่งยอดแล้ว" : "รอส่ง"}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-muted/60 p-2">
            <div className="text-muted-foreground">เต็ม</div>
            <div className="font-semibold">{row.company.full_strength}</div>
          </div>
          <div className="rounded-lg bg-warning-muted/70 p-2 text-warning">
            <div>จำหน่าย</div>
            <div className="font-semibold">{row.dispatched}</div>
          </div>
          <div className="rounded-lg bg-success-muted/70 p-2 text-success">
            <div>คงยอด</div>
            <div className="font-semibold">{row.remaining}</div>
          </div>
        </div>

        <div className="space-y-2 rounded-md bg-muted/30 p-3">
          <div className="text-xs font-medium text-muted-foreground">รายละเอียด</div>
          {row.row ? (
            <CategoryCountBadges counts={row.categoryCounts} />
          ) : (
            <span className="text-sm text-muted-foreground">ยังไม่ได้ส่งยอด</span>
          )}
        </div>

        {row.warnings.length > 0 && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {row.warnings.join(", ")}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="outline" className="w-full">
            <Link
              to="/company/$id"
              params={{ id: row.company.id }}
              search={{ date, time: selectedReportTime }}
            >
              ดู/แก้ไข
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
            disabled={!row.row || isClearing}
            onClick={() =>
              onClear({
                companyId: row.company.id,
                companyName: row.company.name,
                report: row.report,
              })
            }
          >
            <Trash2 className="mr-1 h-4 w-4" />
            ล้าง
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminDashboard() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [selectedReportTimeInput, setSelectedReportTimeInput] = useState<string | null>(null);
  const [clearCompanyTarget, setClearCompanyTarget] = useState<ClearCompanyTarget | null>(null);

  const { data: reportTimeSettings } = useQuery({
    queryKey: ["admin-report-times"],
    queryFn: async () => {
      const [activeReportTime, reportTimes] = await Promise.all([
        fetchActiveReportTime(supabase),
        fetchReportTimes(supabase),
      ]);

      return { activeReportTime, reportTimes };
    },
  });
  const reportTimes = Array.from(
    new Set(
      [
        reportTimeSettings?.activeReportTime || DEFAULT_REPORT_TIME,
        ...(reportTimeSettings?.reportTimes || [DEFAULT_REPORT_TIME]),
      ].map(normalizeReportTime),
    ),
  ).sort((a, b) => a.localeCompare(b));
  const selectedReportTime =
    selectedReportTimeInput && reportTimes.includes(selectedReportTimeInput)
      ? selectedReportTimeInput
      : reportTimeSettings?.activeReportTime || reportTimes[0] || DEFAULT_REPORT_TIME;

  const { data, isError, isLoading } = useQuery({
    queryKey: ["admin-summary", date, selectedReportTime],
    queryFn: async () => {
      const [companiesResult, reportsResult] = await Promise.all([
        supabase
          .from("companies")
          .select("id,name,full_strength,display_order")
          .order("display_order"),
        supabase
          .from("daily_reports")
          .select(
            "id,company_id,reporter_name,reporter_position,report_time,dispatch_entries(category,cadet_name,reason,location,subcategory,count,display_order)",
          )
          .eq("report_date", date),
      ]);
      if (companiesResult.error) throw companiesResult.error;
      if (reportsResult.error) throw reportsResult.error;
      return { companies: companiesResult.data || [], reports: reportsResult.data || [] };
    },
  });

  const clearCompanyReport = useMutation({
    mutationFn: async (target: ClearCompanyTarget) => {
      if (!target.report) return;

      const remainingRows = decodeReportRows(target.report).filter(
        (row) => normalizeReportTime(row.reportTime) !== selectedReportTime,
      );

      if (remainingRows.length === 0) {
        const { error } = await supabase.from("daily_reports").delete().eq("id", target.report.id);
        if (error) throw error;
        return;
      }

      const reportPayload = {
        reporter_name: remainingRows[0]?.reporterName || "",
        reporter_position: remainingRows[0]?.reporterPosition || "",
        report_time: remainingRows[0]?.reportTime || selectedReportTime,
      };
      const { error: reportError } = await supabase
        .from("daily_reports")
        .update(reportPayload)
        .eq("id", target.report.id);
      if (reportError) throw reportError;

      const { error: deleteError } = await supabase
        .from("dispatch_entries")
        .delete()
        .eq("report_id", target.report.id);
      if (deleteError) throw deleteError;

      const encodedEntries = encodeReportRows(remainingRows);
      if (encodedEntries.length > 0) {
        const { error: entriesError } = await supabase.from("dispatch_entries").insert(
          encodedEntries.map((entry) => ({
            report_id: target.report!.id,
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
    onSuccess: (_, target) => {
      toast.success(`ล้างข้อมูล ${target.companyName} เวลา ${selectedReportTime} แล้ว`);
      setClearCompanyTarget(null);
      qc.invalidateQueries({ queryKey: ["admin-summary"] });
      qc.invalidateQueries({ queryKey: ["report-export"] });
      qc.invalidateQueries({ queryKey: ["report"] });
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error, "ล้างข้อมูลหมวดไม่สำเร็จ")),
  });

  const rows = (data?.companies || []).map((company) => {
    const reports = (data?.reports || []).filter((report) => report.company_id === company.id);
    const match = getReportRowFromReports(reports as StoredDailyReport[], selectedReportTime);
    const report = match?.report || null;
    const row = match?.row || null;
    const entries = (row?.entries || []) as SummaryEntry[];
    const categoryCounts = summarizeEntries(entries);
    const dispatched = CATEGORY_ORDER.reduce((sum, category) => sum + categoryCounts[category], 0);

    return {
      company,
      report,
      row,
      warnings: [
        ...(dispatched > company.full_strength ? ["จำหน่ายมากกว่ายอดเต็ม"] : []),
        ...findEntryWarnings(entries),
      ],
      categoryCounts,
      dispatched,
      remaining: Math.max(0, company.full_strength - dispatched),
    };
  });

  const totalFull = rows.reduce((sum, row) => sum + row.company.full_strength, 0);
  const totalDispatched = rows.reduce((sum, row) => sum + row.dispatched, 0);
  const totalRemaining = rows.reduce((sum, row) => sum + row.remaining, 0);
  const totalCategoryCounts = rows.reduce((totals, row) => {
    CATEGORY_ORDER.forEach((category) => {
      totals[category] += row.categoryCounts[category];
    });

    return totals;
  }, emptyCategoryCounts());
  const missingRows = rows.filter((row) => !row.row);
  const warningRows = rows.filter((row) => row.warnings.length > 0);

  return (
    <main
      className="mx-auto max-w-7xl space-y-4 px-3 py-4 sm:px-4 sm:py-6 relative"
      style={{
        backgroundImage: "url(/dragon-background.png)",
        backgroundSize: "contain",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div
        className="fixed inset-0 opacity-40 pointer-events-none"
        style={{ background: "oklch(0.13 0.03 84)" }}
      />
      <div className="relative z-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div>
            <Label>วันที่</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full sm:w-48"
            />
          </div>
          <div>
            <Label>เวลาแถว</Label>
            <Select value={selectedReportTime} onValueChange={setSelectedReportTimeInput}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="เลือกเวลา" />
              </SelectTrigger>
              <SelectContent>
                {reportTimes.map((time) => (
                  <SelectItem key={time} value={time}>
                    {time}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Submission progress strip */}
        {rows.length > 0 && (
          <div className="reveal-stagger overflow-hidden rounded-xl border border-primary/20 bg-card/90 p-4 shadow-sm md:col-span-3"
            style={{ "--i": 0 } as React.CSSProperties}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {missingRows.length === 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : (
                  <Users className="h-4 w-4 text-primary" />
                )}
                <span className="text-sm font-semibold">
                  {missingRows.length === 0 ? "ส่งยอดครบทุกหมวดแล้ว" : "ความคืบหน้าการส่งยอด"}
                </span>
              </div>
              <span className="text-sm font-bold">
                <span className={missingRows.length === 0 ? "text-success" : "text-primary"}>
                  {rows.length - missingRows.length}
                </span>
                <span className="text-muted-foreground">/{rows.length} หมวด</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={`bar-slide-in h-full rounded-full transition-all ${missingRows.length === 0 ? "bg-success" : "gold-gradient"}`}
                style={{
                  "--bar-width": `${rows.length > 0 ? Math.round(((rows.length - missingRows.length) / rows.length) * 100) : 0}%`,
                  width: `${rows.length > 0 ? Math.round(((rows.length - missingRows.length) / rows.length) * 100) : 0}%`,
                } as React.CSSProperties}
              />
            </div>
          </div>
        )}

        <StatCard
          className="reveal-stagger card-lift"
          style={{ "--i": 0 } as React.CSSProperties}
          label="ยอดเต็มรวม"
          value={totalFull}
          unit="นาย"
          tone="gold"
          icon={Users}
        />
        <div
          className="reveal-stagger card-lift relative flex flex-col gap-3 overflow-hidden rounded-xl border border-warning/30 bg-warning-muted/60 p-4 shadow-sm"
          style={{ "--i": 1 } as React.CSSProperties}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-medium text-warning/80">จำหน่ายรวม</div>
              <div className="count-pop mt-1 text-3xl font-bold leading-none tracking-tight text-warning">
                {totalDispatched}
                <span className="ml-1 text-xs font-medium text-warning/80">นาย</span>
              </div>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
              <UserMinus className="h-5 w-5" />
            </span>
          </div>
          <CategoryCountBadges counts={totalCategoryCounts} />
        </div>
        <StatCard
          className="reveal-stagger card-lift"
          style={{ "--i": 2 } as React.CSSProperties}
          label="คงเหลือรวม"
          value={totalRemaining}
          unit="นาย"
          tone="success"
          icon={UserCheck}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          className="reveal-stagger space-y-3 rounded-xl p-4"
          style={{ "--i": 0 } as React.CSSProperties}
        >
          <div>
            <div className="text-base font-semibold">หมวดยังไม่ส่ง</div>
            <div className="text-sm text-muted-foreground">
              อ้างอิงวันที่ {date} เวลา {selectedReportTime}
            </div>
          </div>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 rounded-md" />
              <Skeleton className="h-8 w-40 rounded-md" />
            </div>
          ) : missingRows.length > 0 ? (
            <>
              <div className="rounded-md border border-warning/30 bg-warning-muted/60 p-3">
                <div className="text-sm text-warning/80">จำนวนหมวดที่ยังไม่ส่ง</div>
                <div className="flex items-baseline gap-1 text-warning">
                  <span className="count-pop text-2xl font-bold">{missingRows.length}</span>
                  <span className="text-sm">หมวด</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">
                  รายชื่อหมวดที่ยังไม่ส่ง
                </div>
                <div className="flex flex-wrap gap-2">
                  {missingRows.map((row) => (
                    <Badge key={row.company.id} variant="secondary">
                      {thaiToArabicNumerals(row.company.name)}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-md border border-success/30 bg-success-muted/60 p-3 text-success">
                <div className="text-sm">จำนวนหมวดที่ยังไม่ส่ง</div>
                <div className="flex items-baseline gap-1">
                  <span className="count-pop text-2xl font-bold">0</span>
                  <span className="text-sm">หมวด</span>
                </div>
              </div>
              <p className="text-sm text-success">ส่งครบทุกหมวดแล้ว</p>
            </>
          )}
        </Card>

        <Card
          className="reveal-stagger space-y-3 rounded-xl p-4"
          style={{ "--i": 1 } as React.CSSProperties}
        >
          <div>
            <div className="text-base font-semibold">ตรวจยอดผิดปกติ</div>
            <div className="text-sm text-muted-foreground">
              ตรวจยอดเกิน ยอดอื่น ๆ เป็น 0 และรายการอื่น ๆ ที่ไม่ใส่ภารกิจ
            </div>
          </div>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 rounded-md" />
              <Skeleton className="h-12 rounded-md" />
            </div>
          ) : warningRows.length > 0 ? (
            <>
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">
                <div className="text-sm">จำนวนหมวดที่พบปัญหา</div>
                <div className="flex items-baseline gap-1">
                  <span className="count-pop text-2xl font-bold">{warningRows.length}</span>
                  <span className="text-sm">หมวด</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">
                  รายชื่อหมวดที่พบปัญหา
                </div>
                <div className="space-y-2">
                  {warningRows.map((row) => (
                    <div
                      key={row.company.id}
                      className="rounded-md border border-destructive/30 p-2"
                    >
                      <div className="text-sm font-medium text-destructive">{row.company.name}</div>
                      <div className="text-sm text-muted-foreground">{row.warnings.join(", ")}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-md border border-success/30 bg-success-muted/60 p-3 text-success">
                <div className="text-sm">จำนวนหมวดที่พบปัญหา</div>
                <div className="flex items-baseline gap-1">
                  <span className="count-pop text-2xl font-bold">0</span>
                  <span className="text-sm">หมวด</span>
                </div>
              </div>
              <p className="text-sm text-success">ไม่พบยอดผิดปกติ</p>
            </>
          )}
        </Card>
      </div>

      <div className="space-y-3 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))
        ) : isError ? (
          <Card className="rounded-lg">
            <CardContent className="p-4 text-sm text-destructive">
              โหลดข้อมูลรายงานไม่สำเร็จ
            </CardContent>
          </Card>
        ) : rows.length === 0 ? (
          <Card className="rounded-lg">
            <CardContent className="p-4 text-sm text-muted-foreground">
              ยังไม่มีข้อมูลหมวดในระบบ
            </CardContent>
          </Card>
        ) : (
          rows.map((row, index) => (
            <MobileSummaryRow
              key={row.company.id}
              row={row}
              index={index}
              date={date}
              selectedReportTime={selectedReportTime}
              onClear={setClearCompanyTarget}
              isClearing={clearCompanyReport.isPending}
            />
          ))
        )}
      </div>

      <Card className="hidden rounded-lg md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>หมวด</TableHead>
              <TableHead>ผู้ควบคุมแถว</TableHead>
              <TableHead>เวลา</TableHead>
              <TableHead className="text-right">ยอดเต็ม</TableHead>
              <TableHead className="text-right">จำหน่าย</TableHead>
              <TableHead>รายละเอียด</TableHead>
              <TableHead className="text-right">คงเหลือ</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={9} className="py-3">
                    <Skeleton className="h-6 w-full rounded-md" />
                  </TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-destructive">
                  โหลดข้อมูลรายงานไม่สำเร็จ
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                  ยังไม่มีข้อมูลหมวดในระบบ
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, index) => (
                <TableRow
                  key={row.company.id}
                  className={`reveal-stagger transition-colors ${
                    row.warnings.length > 0
                      ? "bg-destructive/5 hover:bg-destructive/10"
                      : !row.row
                        ? "bg-warning-muted/30 hover:bg-warning-muted/50"
                        : "hover:bg-primary/5"
                  }`}
                  style={{ "--i": index } as React.CSSProperties}
                >
                  <TableCell className="font-medium">{thaiToArabicNumerals(row.company.name)}</TableCell>
                  <TableCell>
                    {row.row?.reporterName ? (
                      <span>
                        {row.row.reporterName}
                        {row.row.reporterPosition && (
                          <span className="text-xs text-muted-foreground ml-1">
                            (เลขที่ {row.row.reporterPosition})
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>{row.row?.reportTime || "-"}</TableCell>
                  <TableCell className="text-right">{row.company.full_strength}</TableCell>
                  <TableCell className="text-right">{row.dispatched}</TableCell>
                  <TableCell className="min-w-64">
                    {row.row ? (
                      <CategoryCountBadges counts={row.categoryCounts} />
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{row.remaining}</TableCell>
                  <TableCell>
                    {row.row ? (
                      <Badge className="border-success/30 bg-success/15 text-success hover:bg-success/20">
                        ส่งยอดแล้ว
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-warning/40 text-warning">
                        รอส่ง
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to="/company/$id"
                        params={{ id: row.company.id }}
                        search={{ date, time: selectedReportTime }}
                        className="text-sm text-primary hover:underline"
                      >
                        ดู/แก้ไข
                      </Link>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        disabled={!row.row || clearCompanyReport.isPending}
                        title="ล้างข้อมูลหมวดนี้"
                        onClick={() =>
                          setClearCompanyTarget({
                            companyId: row.company.id,
                            companyName: row.company.name,
                            report: row.report as StoredDailyReport | null,
                          })
                        }
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        ล้างข้อมูล
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <AlertDialog
        open={Boolean(clearCompanyTarget)}
        onOpenChange={(open) => {
          if (!open) setClearCompanyTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ล้างข้อมูล {clearCompanyTarget?.companyName}?</AlertDialogTitle>
            <AlertDialogDescription>
              คำสั่งนี้จะลบข้อมูลที่กรอกไว้ของ {clearCompanyTarget?.companyName} เฉพาะวันที่ {date}{" "}
              เวลา {selectedReportTime} และจะไม่ลบข้อมูลหมวดอื่นหรือเวลาอื่น
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearCompanyReport.isPending}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={clearCompanyReport.isPending || !clearCompanyTarget}
              onClick={(event) => {
                event.preventDefault();
                if (clearCompanyTarget) clearCompanyReport.mutate(clearCompanyTarget);
              }}
            >
              {clearCompanyReport.isPending ? "กำลังล้าง..." : "ล้างข้อมูลหมวดนี้"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </main>
  );
}
