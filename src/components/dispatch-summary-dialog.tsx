import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CATEGORY_LABELS, CATEGORY_ORDER, type DispatchCategory } from "@/lib/thai";
import { formatDispatchUpdatedDateTime } from "@/lib/dispatch-period";
import studentsData from "@/data/students.json";

function normalizeCadetName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("th");
}

function formatCadetNameWithSquad(value: string): string {
  const normalizedValue = normalizeCadetName(value);
  const student = studentsData.find(
    (candidate) => normalizeCadetName(candidate.display_name) === normalizedValue,
  );

  return student ? `${value} (มว.${student.squad})` : value;
}

export type DispatchSummaryDetail = {
  category: DispatchCategory;
  count: number;
  reason: string;
  location: string;
  names: string[];
  sources: string[];
  updatedAt?: string | null;
};

type DispatchSummaryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dateLabel: string;
  reportTime: string;
  total: number;
  counts: Partial<Record<DispatchCategory, number>>;
  details: Partial<Record<DispatchCategory, DispatchSummaryDetail[]>>;
};

export function DispatchSummaryDialog({
  open,
  onOpenChange,
  dateLabel,
  reportTime,
  total,
  counts,
  details,
}: DispatchSummaryDialogProps) {
  const activeCategories = CATEGORY_ORDER.filter(
    (category) => (counts[category] || 0) > 0 || (details[category]?.length || 0) > 0,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(90dvh,44rem)] w-[calc(100%_-_1rem)] max-w-xl flex-col gap-0 overflow-hidden p-0 sm:h-[min(88dvh,46rem)]">
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-3 pr-12 text-left">
          <DialogTitle className="text-base leading-tight">รายละเอียดจำหน่ายรวม</DialogTitle>
          <DialogDescription className="text-xs">
            {dateLabel} • เวลา {reportTime}
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 border-b border-warning/20 bg-warning-muted/50 px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-warning/80">ยอดจำหน่ายรวม</span>
            <span className="text-xl font-bold leading-none text-warning">
              {total} <span className="text-[11px] font-medium text-warning/80">นาย</span>
            </span>
          </div>
          {activeCategories.length > 0 && (
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
              {activeCategories.map((category) => (
                <Badge
                  key={category}
                  variant="secondary"
                  className="shrink-0 px-2 py-0.5 text-[10px] font-medium"
                >
                  {CATEGORY_LABELS[category]} {counts[category] || 0} นาย
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div
          className="min-h-0 flex-1 touch-pan-y space-y-2 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4"
          tabIndex={0}
          aria-label="รายการจำหน่ายแยกตามหัวข้อ"
        >
          {activeCategories.length > 0 ? (
            activeCategories.map((category) => {
              const categoryDetails = details[category] || [];

              return (
                <section
                  key={category}
                  className="overflow-hidden rounded-lg border border-border/70 bg-card"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-border/50 bg-muted/30 px-2.5 py-1.5">
                    <h3 className="text-xs font-semibold">{CATEGORY_LABELS[category]}</h3>
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {counts[category] || 0} นาย
                    </span>
                  </div>
                  <div className="divide-y divide-border/40">
                    {categoryDetails.map((detail, index) => (
                      <div
                        key={`${category}-${detail.reason}-${detail.location}-${index}`}
                        className="px-2.5 py-2"
                      >
                        <div className="flex items-start justify-between gap-2 text-xs">
                          <span className="min-w-0 font-medium leading-4 text-foreground">
                            {detail.reason}
                            {detail.updatedAt && (
                              <span className="ml-1 whitespace-nowrap text-[10px] font-normal text-muted-foreground">
                                (บันทึกตอน {formatDispatchUpdatedDateTime(detail.updatedAt)})
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 font-semibold text-warning">
                            {detail.count} นาย
                          </span>
                        </div>
                        <div className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
                          <span>สถานที่: {detail.location}</span>
                        </div>
                        {detail.names.length > 0 && (
                          <details className="group mt-0.5 text-[10px] leading-4 text-muted-foreground">
                            <summary className="w-fit cursor-pointer select-none font-medium text-primary hover:underline">
                              ดูรายชื่อ {detail.names.length} นาย
                            </summary>
                            <div className="mt-0.5 break-words pl-2">
                              {detail.names.map(formatCadetNameWithSquad).join(", ")}
                            </div>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              );
            })
          ) : (
            <div className="flex h-full min-h-32 items-center justify-center text-sm text-muted-foreground">
              ไม่มีรายการจำหน่าย
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
