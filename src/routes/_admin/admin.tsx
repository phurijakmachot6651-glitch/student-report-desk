import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { todayISO, CATEGORY_ORDER } from "@/lib/thai";

export const Route = createFileRoute("/_admin/admin")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const [date, setDate] = useState(todayISO());

  const { data } = useQuery({
    queryKey: ["admin-summary", date],
    queryFn: async () => {
      const { data: companies } = await supabase
        .from("companies")
        .select("*")
        .order("display_order");
      const { data: reports } = await supabase
        .from("daily_reports")
        .select("*, dispatch_entries(*)")
        .eq("report_date", date);
      return { companies: companies || [], reports: reports || [] };
    },
  });

  const rows = (data?.companies || []).map((c) => {
    const r = data?.reports.find((rep) => rep.company_id === c.id);
    const entries = r?.dispatch_entries || [];
    const dispatched = CATEGORY_ORDER.reduce((s, cat) => {
      if (cat === "other") return s + entries.filter((e: any) => e.category === "other").reduce((a: number, e: any) => a + (e.count || 0), 0);
      return s + entries.filter((e: any) => e.category === cat).length;
    }, 0);
    return {
      company: c,
      report: r,
      dispatched,
      remaining: Math.max(0, c.full_strength - dispatched),
    };
  });

  const totalFull = rows.reduce((s, r) => s + r.company.full_strength, 0);
  const totalDispatched = rows.reduce((s, r) => s + r.dispatched, 0);
  const totalRemaining = rows.reduce((s, r) => s + r.remaining, 0);

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
              <TableHead className="text-right">ยอดเต็ม</TableHead>
              <TableHead className="text-right">จำหน่าย</TableHead>
              <TableHead className="text-right">คงเหลือ</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.company.id}>
                <TableCell className="font-medium">{r.company.name}</TableCell>
                <TableCell className="text-right">{r.company.full_strength}</TableCell>
                <TableCell className="text-right">{r.dispatched}</TableCell>
                <TableCell className="text-right">{r.remaining}</TableCell>
                <TableCell>
                  {r.report ? <Badge>ส่งแล้ว</Badge> : <Badge variant="secondary">ยังไม่ส่ง</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <Link to="/company/$id" params={{ id: r.company.id }} className="text-sm text-primary hover:underline">
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
