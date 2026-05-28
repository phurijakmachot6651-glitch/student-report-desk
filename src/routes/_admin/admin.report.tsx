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
  const [selectedReporter, setSelectedReporter] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [reporterPosition, setReporterPosition] = useState("ผู้ช่วย ผบ.มว. ร้อย ๒ ปค.๑ บก.ปค.");
  const [reportTime, setReportTime] = useState("05.45");

  const { data } = useQuery({
    queryKey: ["report-export", date],
    queryFn: async () => {
      const [companiesResult, reportsResult] = await Promise.all([
        supabase.from("companies").select("id,full_strength,display_order").order("display_order"),
        supabase
          .from("daily_reports")
          .select("id,dispatch_entries(category,cadet_name,reason,location,subcategory,count)")
          .eq("report_date", date),
      ]);
      if (companiesResult.error) throw companiesResult.error;
      if (reportsResult.error) throw reportsResult.error;
      return { companies: companiesResult.data || [], reports: reportsResult.data || [] };
    },
  });

  const { data: reporters } = useQuery({
    queryKey: ["reporters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reporters")
        .select("id,name,display_order")
        .order("display_order");
      if (error) throw error;
      return data || [];
    },
  });

  const fullText = useMemo(() => {
    if (!data) return "";

    const entries: Entry[] = [];
    const fullStrength = data.companies.reduce(
      (sum, company) => sum + (company.full_strength || 0),
      0,
    );

    data.reports.forEach((report) => {
      (report.dispatch_entries || []).forEach((entry: any) => {
        entries.push({
          category: entry.category,
          cadet_name: entry.cadet_name,
          reason: entry.reason,
          location: entry.location,
          subcategory: entry.subcategory,
          count: entry.count,
        });
      });
    });

    return buildReportText({
      companyName:
        "กองร้อยที่ ๒ ฝ่ายปกครอง ๑\nกองบังคับการปกครอง\n(นักเรียนนายร้อยตำรวจชั้นปีที่ ๒)",
      fullStrength,
      reportDate: parseISODate(date),
      reporterName: reporterName || "-",
      reporterPosition: reporterPosition || "-",
      reportTime,
      entries,
    });
  }, [data, date, reporterName, reporterPosition, reportTime]);

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
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <Label>เวลารายงาน</Label>
              <Input
                value={reportTime}
                onChange={(e) => setReportTime(e.target.value)}
                placeholder="05.45"
              />
            </div>
            <div className="flex gap-3">
              <Button onClick={copy} variant="outline" className="flex-1">
                <Copy className="h-4 w-4 mr-1" /> คัดลอก
              </Button>
              <Button onClick={download} className="flex-1">
                <Download className="h-4 w-4 mr-1" /> ดาวน์โหลด
              </Button>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>เลือกผู้รายงาน</Label>
              <select
                value={selectedReporter}
                onChange={(event) => {
                  setSelectedReporter(event.target.value);
                  setReporterName(event.target.value);
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">เลือกรายชื่อ</option>
                {(reporters || []).map((reporter) => (
                  <option key={reporter.id} value={reporter.name}>
                    {reporter.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>ชื่อผู้รายงาน</Label>
              <Input
                value={reporterName}
                onChange={(e) => {
                  setReporterName(e.target.value);
                  setSelectedReporter("");
                }}
                placeholder="นรต.ชนสิษฎ์ ทองย่อน"
              />
            </div>
            <div className="sm:col-span-2">
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
