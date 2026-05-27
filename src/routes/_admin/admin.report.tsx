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
  const [reporterName, setReporterName] = useState("");
  const [reporterPosition, setReporterPosition] = useState("ผู้ช่วย ผบ.มว. ร้อย ๒ ปค.๑ บก.ปค.");

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
    
    let fullStrength = 0;
    const entries: Entry[] = [];
    
    data.companies.forEach((c) => {
      fullStrength += c.full_strength || 0;
    });

    let reportTime = "05.45";

    data.reports.forEach((r) => {
      if (r.report_time && reportTime === "05.45") reportTime = r.report_time;

      (r.dispatch_entries || []).forEach((e: any) => {
        entries.push({
          category: e.category,
          cadet_name: e.cadet_name,
          reason: e.reason,
          location: e.location,
          subcategory: e.subcategory,
          count: e.count,
        });
      });
    });

    return buildReportText({
      companyName: "กองร้อยที่ ๒ ฝ่ายปกครอง ๑\nกองบังคับการปกครอง\n(นักเรียนนายร้อยตำรวจชั้นปีที่ ๒)",
      fullStrength,
      reportDate: parseISODate(date),
      reporterName: reporterName || "-",
      reporterPosition: reporterPosition || "-",
      reportTime,
      entries,
    });
  }, [data, date, reporterName, reporterPosition]);

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
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3 items-end">
            <div>
              <Label>วันที่</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full" />
            </div>
            <div className="sm:col-span-2 flex gap-3">
              <Button onClick={copy} variant="outline" className="flex-1">
                <Copy className="h-4 w-4 mr-1" /> คัดลอกทั้งหมด
              </Button>
              <Button onClick={download} className="flex-1">
                <Download className="h-4 w-4 mr-1" /> ดาวน์โหลด .txt
              </Button>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>ชื่อผู้รายงาน</Label>
              <Input
                value={reporterName}
                onChange={(e) => setReporterName(e.target.value)}
                placeholder="นรต.ชนสิษฎ์ ทองย่อน"
              />
            </div>
            <div>
              <Label>ตำแหน่ง</Label>
              <Input
                value={reporterPosition}
                onChange={(e) => setReporterPosition(e.target.value)}
                placeholder="ผู้ช่วย ผบ.มว. ร้อย ๒ ปค.๑ บก.ปค."
              />
            </div>
          </div>

          <Textarea readOnly value={fullText} className="font-mono text-sm min-h-[600px]" />
        </CardContent>
      </Card>
    </main>
  );
}
