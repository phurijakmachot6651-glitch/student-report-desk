import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { buildReportText, parseISODate, todayISO, type Entry } from "@/lib/thai";

export const Route = createFileRoute("/_admin/admin/report")({
  component: ReportPage,
});

function ReportPage() {
  const [date, setDate] = useState(todayISO());

  const { data } = useQuery({
    queryKey: ["report-export", date],
    queryFn: async () => {
      const { data: companies } = await supabase.from("companies").select("*").order("display_order");
      const { data: reports } = await supabase
        .from("daily_reports")
        .select("*, dispatch_entries(*)")
        .eq("report_date", date);
      return { companies: companies || [], reports: reports || [] };
    },
  });

  const fullText = useMemo(() => {
    if (!data) return "";
    return data.companies
      .map((c) => {
        const r = data.reports.find((x) => x.company_id === c.id);
        const entries: Entry[] = (r?.dispatch_entries || []).map((e: any) => ({
          category: e.category,
          cadet_name: e.cadet_name,
          reason: e.reason,
          location: e.location,
          subcategory: e.subcategory,
          count: e.count,
        }));
        return buildReportText({
          companyName: c.name,
          fullStrength: c.full_strength,
          reportDate: parseISODate(date),
          reporterName: r?.reporter_name || "-",
          reporterPosition: r?.reporter_position || "-",
          reportTime: r?.report_time || "-",
          entries,
        });
      })
      .join("\n\n══════════════════════════\n\n");
  }, [data, date]);

  const copy = async () => {
    await navigator.clipboard.writeText(fullText);
    toast.success("คัดลอกแล้ว");
  };

  const download = () => {
    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>ส่งออกคำรายงานรวม</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-3">
            <div>
              <Label>วันที่</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
            </div>
            <Button onClick={copy} variant="outline">
              <Copy className="h-4 w-4 mr-1" /> คัดลอกทั้งหมด
            </Button>
            <Button onClick={download}>
              <Download className="h-4 w-4 mr-1" /> ดาวน์โหลด .txt
            </Button>
          </div>
          <Textarea readOnly value={fullText} className="font-mono text-sm min-h-[600px]" />
        </CardContent>
      </Card>
    </main>
  );
}
