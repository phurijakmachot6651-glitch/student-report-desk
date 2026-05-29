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
  AlertDialogTrigger,
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
import { DEFAULT_REPORT_TIME, getReportRowFromReports, normalizeReportTime } from "@/lib/report-rows";

export const Route = createFileRoute("/_admin/admin/")({
  component: AdminDashboard,
});

type SummaryEntry = {
  category: DispatchCategory;
  count: number | null;
};

type CategoryCounts = Record<DispatchCategory, number>;

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
  const [isResetOpen, setIsResetOpen] = useState(false);
  const selectedReportTime = normalizeReportTime(reportTime);

  const { data } = useQuery({
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

  const resetReports = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("daily_reports").delete().not("id", "is", null);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ล้างข้อมูลที่กรอกทั้งหมดแล้ว");
      setIsResetOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-summary"] });
      qc.invalidateQueries({ queryKey: ["report-export"] });
      qc.invalidateQueries({ queryKey: ["report"] });
      qc.invalidateQueries({ queryKey: ["other-options"] });
    },
    onError: (error: any) => toast.error(error.message || "ล้างข้อมูลไม่สำเร็จ"),
  });

  const rows = (data?.companies || []).map((company) => {
    const reports = (data?.reports || []).filter((report) => report.company_id === company.id);
    const match = getReportRowFromReports(reports as any[], selectedReportTime);
    const report = match?.report || null;
    const row = match?.row || null;
    const entries = (row?.entries || []) as SummaryEntry[];
    const categoryCounts = summarizeEntries(entries);
    const dispatched = CATEGORY_ORDER.reduce((sum, category) => sum + categoryCounts[category], 0);

    return {
      company,
      report,
      row,
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

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
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
        <AlertDialog open={isResetOpen} onOpenChange={setIsResetOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={resetReports.isPending}>
              <Trash2 className="mr-2 h-4 w-4" />
              ล้างข้อมูลทั้งหมด
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>ล้างข้อมูลที่กรอกทั้งหมด?</AlertDialogTitle>
              <AlertDialogDescription>
                คำสั่งนี้จะลบข้อมูลรายงานที่ทุกหมวดกรอกไว้ทุกวันทุกเวลา
                และทำให้สถานะกลับเป็นยังไม่ส่ง โดยไม่ลบข้อมูลหมวด ยอดเต็ม รายชื่อผู้รายงาน
                หรือการตั้งค่า
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={resetReports.isPending}>ยกเลิก</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={resetReports.isPending}
                onClick={(event) => {
                  event.preventDefault();
                  resetReports.mutate();
                }}
              >
                {resetReports.isPending ? "กำลังล้าง..." : "ล้างทั้งหมด"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
            {rows.map((row) => (
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
                  <Link
                    to="/company/$id"
                    params={{ id: row.company.id }}
                    search={{ date, time: selectedReportTime }}
                    className="text-sm text-primary hover:underline"
                  >
                    ดู/แก้ไข
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </main>
  );
}
