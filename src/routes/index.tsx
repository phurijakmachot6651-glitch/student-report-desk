import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";
import { summarizeDispatchEntries, todayISO, type Entry } from "@/lib/thai";
import {
  DEFAULT_REPORT_TIME,
  getReportRowFromReports,
  type StoredDailyReport,
} from "@/lib/report-rows";
import { fetchActiveReportTime } from "@/lib/report-settings";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ระบบจัดทำยอดกำลังพล นรต." },
      { name: "description", content: "ระบบจัดทำยอดกำลังพลนักเรียนนายร้อยตำรวจ" },
    ],
  }),
  component: Home,
});

function Home() {
  const reportDate = todayISO();
  const { data, isLoading } = useQuery({
    queryKey: ["home-summary", reportDate],
    queryFn: async () => {
      const [activeReportTime, companiesResult, reportsResult] = await Promise.all([
        fetchActiveReportTime(supabase),
        supabase
          .from("companies")
          .select("id,name,full_strength,display_order")
          .order("display_order"),
        supabase
          .from("daily_reports")
          .select(
            "id,company_id,reporter_name,reporter_position,report_time,dispatch_entries(category,cadet_name,reason,location,subcategory,count,display_order)",
          )
          .eq("report_date", reportDate),
      ]);

      if (companiesResult.error) throw companiesResult.error;
      if (reportsResult.error) throw reportsResult.error;
      return {
        activeReportTime,
        companies: companiesResult.data || [],
        reports: reportsResult.data || [],
      };
    },
  });

  const reportTime = data?.activeReportTime || DEFAULT_REPORT_TIME;
  const reports = (data?.reports || []) as (StoredDailyReport & { company_id: string })[];
  const rows = (data?.companies || []).map((company) => {
    const companyReports = reports.filter((report) => report.company_id === company.id);
    const match = getReportRowFromReports(companyReports, reportTime);
    const entries = (match?.row?.entries || []) as Entry[];
    const summary = summarizeDispatchEntries(entries, company.full_strength);

    return { company, summary };
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20">
      <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto max-w-5xl px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src="/tiger_logo.png"
              alt="Tiger Logo"
              className="h-8 w-8 shrink-0 object-contain rounded-full border border-primary/20"
            />
            <h1 className="font-bold text-sm sm:text-lg leading-tight truncate">
              ยอดกำลังพล นรต. กองร้อยที่ ๒
            </h1>
          </div>
          <Link to="/admin/login" className="shrink-0">
            <Button variant="outline" size="sm">
              Login
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-3 sm:px-4 py-6 sm:py-10">
        <div className="text-center mb-6 sm:mb-10">
          <h2 className="text-xl sm:text-3xl font-bold tracking-tight">เลือกหมวดเพื่อจำหน่ายยอด</h2>
          <p className="text-sm sm:text-base text-muted-foreground mt-1.5 sm:mt-2">
            เลือกหมวดของท่านเพื่อกรอกยอดกำลังพลประจำวัน
          </p>
        </div>

        {isLoading ? (
          <p className="text-center text-muted-foreground">กำลังโหลด...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {rows.map(({ company, summary }) => (
              <Link
                key={company.id}
                to="/company/$id"
                params={{ id: company.id }}
                search={{ date: reportDate, time: reportTime }}
              >
                <Card className="hover:shadow-lg active:shadow-md transition-shadow cursor-pointer hover:border-primary h-full">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Users className="h-5 w-5 text-primary shrink-0" />
                      {company.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center text-xs sm:text-sm">
                      <div className="rounded-md bg-muted/60 p-2">
                        <div className="text-[11px] sm:text-xs text-muted-foreground">ยอดเต็ม</div>
                        <div className="text-base sm:text-lg font-semibold text-foreground">
                          {summary.fullStrength}
                        </div>
                      </div>
                      <div className="rounded-md bg-orange-50 p-2 text-orange-700">
                        <div className="text-[11px] sm:text-xs">จำหน่าย</div>
                        <div className="text-base sm:text-lg font-semibold">
                          {summary.dispatched}
                        </div>
                      </div>
                      <div className="rounded-md bg-green-50 p-2 text-green-700">
                        <div className="text-[11px] sm:text-xs">คงยอด</div>
                        <div className="text-base sm:text-lg font-semibold">{summary.remaining}</div>
                      </div>
                    </div>

                    <div className="space-y-1 text-xs sm:text-sm">
                      {summary.items.length > 0 ? (
                        summary.items.map((item) => (
                          <div
                            key={`${item.category}-${item.label}`}
                            className="flex items-start justify-between gap-2"
                          >
                            <span className="min-w-0 break-words">
                              <span>{item.label}</span>
                              {item.names.length > 0 && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  ({item.names.join(", ")})
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 font-medium">{item.count} นาย</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-muted-foreground">ไม่มีรายการจำหน่าย</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
