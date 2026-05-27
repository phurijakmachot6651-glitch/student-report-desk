// Thai numeral & report formatting helpers

const TH_DIGITS = ["๐", "๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙"];
const TH_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const TH_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

export function toThaiNumerals(input: number | string): string {
  return String(input).replace(/\d/g, (d) => TH_DIGITS[Number(d)]);
}

export function formatThaiDate(date: Date): string {
  const day = TH_DAYS[date.getDay()];
  const d = toThaiNumerals(date.getDate());
  const m = TH_MONTHS[date.getMonth()];
  const y = toThaiNumerals(date.getFullYear() + 543);
  return `วัน${day}ที่ ${d} ${m} ${y}`;
}

export type DispatchCategory = "sick" | "leave" | "absent" | "official" | "suspended" | "other";

export const CATEGORY_LABELS: Record<DispatchCategory, string> = {
  sick: "ป่วย",
  leave: "ลา",
  absent: "ขาด",
  official: "ราชการ",
  suspended: "พักการศึกษา",
  other: "อื่น ๆ",
};

export const CATEGORY_ORDER: DispatchCategory[] = [
  "sick", "leave", "absent", "official", "suspended", "other",
];

export type Entry = {
  category: DispatchCategory;
  cadet_name: string;
  reason: string;
  location: string;
  subcategory: string;
  count: number;
};

export type ReportInput = {
  companyName: string;
  fullStrength: number;
  reportDate: Date;
  reporterName: string;
  reporterPosition: string;
  reportTime: string;
  entries: Entry[];
};

function countFor(cat: DispatchCategory, entries: Entry[]): number {
  if (cat === "other") {
    return entries.filter((e) => e.category === "other").reduce((s, e) => s + (e.count || 0), 0);
  }
  return entries.filter((e) => e.category === cat).length;
}

function categoryBlock(cat: DispatchCategory, entries: Entry[]): string {
  const list = entries.filter((e) => e.category === cat);
  const total = countFor(cat, entries);
  const label = CATEGORY_LABELS[cat];
  const head = total > 0
    ? `   📍 ${label} ${toThaiNumerals(total)} นาย`
    : `   📍 ${label} - นาย`;

  if (cat === "other") {
    const lines = list.map((e) => `   - ${e.subcategory || "ไม่ระบุ"}  ${toThaiNumerals(e.count || 0)} นาย`);
    return [head, ...lines].join("\n");
  }
  const lines = list.map((e) => {
    const parts = [e.cadet_name, e.reason, e.location].filter(Boolean);
    return `   - ${parts.join(", ")}`;
  });
  return [head, ...lines].join("\n");
}

export function buildReportText(input: ReportInput): string {
  const totalDispatched = CATEGORY_ORDER.reduce((s, c) => s + countFor(c, input.entries), 0);
  const remaining = Math.max(0, input.fullStrength - totalDispatched);

  const header = [
    `${input.companyName}`,
    "",
    "**************************",
    "",
    "เรียน ผู้บังคับบัญชา",
    "",
    `กระผม ${input.reporterName || "-"}`,
    `${input.reporterPosition || "-"}`,
    "",
    `ขออนุญาตรายงานยอดกำลังพล ประจำ${formatThaiDate(input.reportDate)} เวลา ${input.reportTime || "-"} น. ดังนี้`,
    "",
    `📌 ยอดเต็ม                   ${toThaiNumerals(input.fullStrength)} นาย`,
    `📌 จำหน่ายรวม                ${toThaiNumerals(totalDispatched)} นาย`,
    `📌 คงเหลือ                   ${toThaiNumerals(remaining)} นาย`,
    "",
  ].join("\n");

  const body = CATEGORY_ORDER.map((c) => categoryBlock(c, input.entries)).join("\n\n");

  return `${header}${body}\n\nจึงเรียนมาเพื่อโปรดทราบ\n`;
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
