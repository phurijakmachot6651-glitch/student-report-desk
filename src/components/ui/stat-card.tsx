import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type StatTone = "gold" | "neutral" | "success" | "warning" | "info" | "destructive";

const toneStyles: Record<
  StatTone,
  { surface: string; value: string; icon: string; label: string }
> = {
  gold: {
    surface: "border-primary/30 bg-primary/5",
    value: "gold-text",
    icon: "bg-primary/15 text-primary",
    label: "text-muted-foreground",
  },
  neutral: {
    surface: "border-border bg-muted/40",
    value: "text-foreground",
    icon: "bg-muted text-muted-foreground",
    label: "text-muted-foreground",
  },
  success: {
    surface: "border-success/30 bg-success-muted/60",
    value: "text-success",
    icon: "bg-success/15 text-success",
    label: "text-success/80",
  },
  warning: {
    surface: "border-warning/30 bg-warning-muted/60",
    value: "text-warning",
    icon: "bg-warning/15 text-warning",
    label: "text-warning/80",
  },
  info: {
    surface: "border-info/30 bg-info-muted/60",
    value: "text-info",
    icon: "bg-info/15 text-info",
    label: "text-info/80",
  },
  destructive: {
    surface: "border-destructive/30 bg-destructive/5",
    value: "text-destructive",
    icon: "bg-destructive/15 text-destructive",
    label: "text-destructive/80",
  },
};

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  unit?: string;
  tone?: StatTone;
  icon?: LucideIcon;
  compact?: boolean;
}

/**
 * Dashboard-style stat surface: label, oversized value and optional icon/unit.
 * Tones map to the semantic theme tokens so they follow light/dark mode.
 */
const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ label, value, unit, tone = "neutral", icon: Icon, compact = false, className, ...props }, ref) => {
    const styles = toneStyles[tone];

    return (
      <div
        ref={ref}
        className={cn(
          "relative overflow-hidden rounded-xl border shadow-sm",
          compact ? "p-3" : "p-4",
          styles.surface,
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className={cn("text-xs font-medium", styles.label)}>{label}</div>
            <div className="mt-1 flex items-baseline gap-1">
              <span
                className={cn(
                  "count-pop font-bold leading-none tracking-tight",
                  compact ? "text-2xl" : "text-3xl",
                  styles.value,
                )}
              >
                {value}
              </span>
              {unit ? <span className={cn("text-xs", styles.label)}>{unit}</span> : null}
            </div>
          </div>
          {Icon ? (
            <span
              className={cn(
                "flex shrink-0 items-center justify-center rounded-lg",
                compact ? "h-8 w-8" : "h-10 w-10",
                styles.icon,
              )}
            >
              <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} />
            </span>
          ) : null}
        </div>
      </div>
    );
  },
);
StatCard.displayName = "StatCard";

export { StatCard };
