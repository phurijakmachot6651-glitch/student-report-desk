import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { todayISO } from "@/lib/thai";

export const Route = createFileRoute("/_admin/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const [date, setDate] = useState(todayISO());

  const { data } = useQuery({
    queryKey: ["admin-summary", date],
    queryFn: async () => {
      const [companiesResult, reportsResult] = await Promise.all([
        supabase.from("companies").select("id,name,full_strength,display_order").order("display_order"),
        supabase
          .from("daily_reports")
          .select("id,company_id,reporter_name,reporter_position,report_time,dispatch_entries(category,count)")
          .eq("report_date", date),
      ]);
      if (companiesResult.error) throw companiesResult.error;
      if (reportsResult.error) throw reportsResult.error;
      return { companies: companiesResult.data || [], reports: reportsResult.data || [] };
    },
  });

  const reportsByCompany = new Map((data?.reports || []).map((report) => [report.company_id, report]));

  const rows = (data?.companies || []).map((company) => {
    const report = reportsByCompany.get(company.id);
    const entries = report?.dispatch_entries || [];
    const dispatched = entries.reduce((sum: number, entry: any) => {
      return sum + (entry.category === "other" ? entry.count || 0 : 1);
    }, 0);
    return {
      company,
      report,
      dispatched,
      remaining: Math.max(0, company.full_strength - dispatched),
    };
  });

  const totalFull = rows.reduce((sum, row) => sum + row.company.full_strength, 0);
  const totalDispatched = rows.reduce((sum, row) => sum + row.dispatched, 0);
  const totalRemaining = rows.reduce((sum, row) => sum + row.remaining, 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 space-y-4">
      <div className="flex items-end gap-4">
        <div>
          <Label>วันที่</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">ยอดเต็มรวม</div>
          <div className="text-2xl font-bold">{totalFull}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">จำหน่ายรวม</div>
          <div className="text-2xl font-bold text-orange-600">{totalDispatched}</div>
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
                  {row.report?.reporter_name ? (
                    <span>
                      {row.report.reporter_name}
                      {row.report.reporter_position && <span className="text-xs text-muted-foreground ml-1">(เลขที่ {row.report.reporter_position})</span>}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>{row.report?.report_time || "-"}</TableCell>
                <TableCell className="text-right">{row.company.full_strength}</TableCell>
                <TableCell className="text-right">{row.dispatched}</TableCell>
                <TableCell className="text-right">{row.remaining}</TableCell>
                <TableCell>{row.report ? <Badge>ส่งแล้ว</Badge> : <Badge variant="secondary">ยังไม่ส่ง</Badge>}</TableCell>
                <TableCell className="text-right">
                  <Link to="/company/$id" params={{ id: row.company.id }} className="text-sm text-primary hover:underline">
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
