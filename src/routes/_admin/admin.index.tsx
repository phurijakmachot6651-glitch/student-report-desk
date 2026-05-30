import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CATEGORY_LABELS, CATEGORY_ORDER, todayISO, type DispatchCategory } from "@/lib/thai";
import {
  DEFAULT_REPORT_TIME,
  decodeReportRows,
  encodeReportRows,
  getReportRowFromReports,
  normalizeReportTime,
  type StoredDailyReport,
} from "@/lib/report-rows";

export const Route = createFileRoute("/_admin/admin/")({
  component: AdminDashboard,
});

type SummaryEntry = {
  category: DispatchCategory;
  count: number | null;
  subcategory?: string | null;
};

type CategoryCounts = Record<DispatchCategory, number>;
type ClearCompanyTarget = {
  companyId: string;
  companyName: string;
  report: StoredDailyReport | null;
};

const emptyCategoryCounts = (): CategoryCounts =>
  Object.fromEntries(CATEGORY_ORDER.map((category) => [category, 0])) as CategoryCounts;

const countEntry = (entry: SummaryEntry) =>
  entry.category === "other" ? Number(entry.count) || 0 : 1;

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

function AdminDashboard() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [reportTime, setReportTime] = useState(DEFAULT_REPORT_TIME);
  const [clearCompanyTarget, setClearCompanyTarget] = useState<ClearCompanyTarget | null>(null);
  const selectedReportTime = normalizeReportTime(reportTime);

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
      qc.invalidateQueries({ queryKey: ["other-options"] });
    },
    onError: (error: any) => toast.error(error.message || "ล้างข้อมูลหมวดไม่สำเร็จ"),
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
    <main className="mx-auto max-w-7xl px-4 py-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div>
            <Label>วันที่</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-48"
            />
          </div>
          <div>
            <Label>เวลาแถว</Label>
            <Input
              value={reportTime}
              onChange={(e) => setReportTime(e.target.value)}
              placeholder="05.45"
              className="w-48"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">ยอดเต็มรวม</div>
          <div className="text-2xl font-bold">{totalFull}</div>
        </Card>
        <Card className="p-4 space-y-3">
          <div className="text-xs text-muted-foreground">จำหน่ายรวม</div>
          <div className="text-2xl font-bold text-orange-600">{totalDispatched}</div>
          <CategoryCountList counts={totalCategoryCounts} />
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">คงเหลือรวม</div>
          <div className="text-2xl font-bold text-green-600">{totalRemaining}</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 space-y-3">
          <div>
            <div className="text-base font-semibold">หมวดยังไม่ส่ง</div>
            <div className="text-sm text-muted-foreground">
              อ้างอิงวันที่ {date} เวลา {selectedReportTime}
            </div>
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">กำลังโหลดข้อมูลรายงาน...</p>
          ) : missingRows.length > 0 ? (
            <>
              <div className="rounded-md bg-muted/50 p-3">
                <div className="text-sm text-muted-foreground">จำนวนหมวดที่ยังไม่ส่ง</div>
                <div className="flex items-baseline gap-1 text-orange-600">
                  <span className="text-2xl font-bold">{missingRows.length}</span>
                  <span className="text-sm">หมวด</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">รายชื่อหมวดที่ยังไม่ส่ง</div>
                <div className="flex flex-wrap gap-2">
                  {missingRows.map((row) => (
                    <Badge key={row.company.id} variant="secondary">
                      {row.company.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-md bg-green-50 p-3 text-green-700">
                <div className="text-sm">จำนวนหมวดที่ยังไม่ส่ง</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold">0</span>
                  <span className="text-sm">หมวด</span>
                </div>
              </div>
              <p className="text-sm text-green-700">ส่งครบทุกหมวดแล้ว</p>
            </>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <div>
            <div className="text-base font-semibold">ตรวจยอดผิดปกติ</div>
            <div className="text-sm text-muted-foreground">
              ตรวจยอดเกิน ยอดอื่น ๆ เป็น 0 และรายการอื่น ๆ ที่ไม่ใส่ภารกิจ
            </div>
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">กำลังตรวจข้อมูล...</p>
          ) : warningRows.length > 0 ? (
            <>
              <div className="rounded-md bg-red-50 p-3 text-destructive">
                <div className="text-sm">จำนวนหมวดที่พบปัญหา</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold">{warningRows.length}</span>
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
              <div className="rounded-md bg-green-50 p-3 text-green-700">
                <div className="text-sm">จำนวนหมวดที่พบปัญหา</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold">0</span>
                  <span className="text-sm">หมวด</span>
                </div>
              </div>
              <p className="text-sm text-green-700">ไม่พบยอดผิดปกติ</p>
            </>
          )}
        </Card>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>หมวด</TableHead>
              <TableHead>ผู้ควบคุมแถว</TableHead>
              <TableHead>เวลา</TableHead>
              <TableHead className="text-right">ยอดเต็ม</TableHead>
              <TableHead className="text-right">จำหน่าย</TableHead>
              <TableHead>รายละเอียดจำหน่าย</TableHead>
              <TableHead className="text-right">คงเหลือ</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                  กำลังโหลดข้อมูลรายงาน...
                </TableCell>
              </TableRow>
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
              rows.map((row) => (
                <TableRow key={row.company.id}>
                  <TableCell className="font-medium">{row.company.name}</TableCell>
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
                  <TableCell className="min-w-56">
                    {row.row ? (
                      <CategoryCountList counts={row.categoryCounts} />
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{row.remaining}</TableCell>
                  <TableCell>
                    {row.row ? (
                      <Badge>ส่งแล้ว</Badge>
                    ) : (
                      <Badge variant="secondary">ยังไม่ส่ง</Badge>
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
              คำสั่งนี้จะลบข้อมูลที่กรอกไว้ของ {clearCompanyTarget?.companyName} เฉพาะวันที่ {date} เวลา{" "}
              {selectedReportTime} และจะไม่ลบข้อมูลหมวดอื่นหรือเวลาอื่น
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
    </main>
  );
}
