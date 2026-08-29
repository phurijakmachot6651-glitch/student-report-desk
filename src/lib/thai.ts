import studentsData from "@/data/students.json";

// Thai numeral & report formatting helpers

const TH_DIGITS = ["๐", "๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙"];
const TH_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
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

function formatThaiDateWithoutWeekday(date: Date): string {
  const d = toThaiNumerals(date.getDate());
  const m = TH_MONTHS[date.getMonth()];
  const y = toThaiNumerals(date.getFullYear() + 543);
  return `วันที่ ${d} ${m} ${y}`;
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
  "sick",
  "leave",
  "absent",
  "official",
  "other",
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

export type StretchExerciseReportInput = {
  companyName: string;
  reportDate: Date;
  reporterName: string;
  reporterPosition: string;
};

export type CategoryCounts = Record<DispatchCategory, number>;

export type DispatchSummaryItem = {
  category: DispatchCategory;
  label: string;
  count: number;
  details: string[];
};

export type StrengthSummary = {
  fullStrength: number;
  dispatched: number;
  remaining: number;
  categoryCounts: CategoryCounts;
  items: DispatchSummaryItem[];
};

/**
 * subcategory ที่ใช้เก็บ meta ของแถวรายงาน (ไม่ใช่รายการจำหน่ายจริง)
 * ดู encodeReportRows/decodeReportRows ใน report-rows.ts
 */
export const REPORT_ROW_META_SUBCATEGORY = "__report_row_meta__";

export function isReportRowMeta(entry: Pick<Entry, "category" | "subcategory">): boolean {
  return entry.category === "other" && entry.subcategory === REPORT_ROW_META_SUBCATEGORY;
}

export function normalizeOtherSubcategory(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** แยกรายชื่อที่คั่นด้วย comma ออกเป็นรายชื่อเดี่ยว */
export function splitCadetNames(value: string | null | undefined): string[] {
  return (value || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

function formatDispatchEntryDetail(entry: Entry): string {
  const cadetNames = splitCadetNames(entry.cadet_name).map(formatCadetForSummary).join(", ");

  return [cadetNames, entry.reason.trim(), entry.location.trim()].filter(Boolean).join(", ");
}

export function cleanReportEntries(entries: Entry[]): Entry[] {
  return entries
    .map((entry) => {
      const cadetName = entry.cadet_name.trim();
      const names = splitCadetNames(cadetName);

      return {
        ...entry,
        cadet_name: cadetName,
        reason: entry.reason.trim(),
        location: entry.location.trim(),
        subcategory:
          entry.category === "other"
            ? normalizeOtherSubcategory(entry.subcategory)
            : entry.subcategory.trim(),
        // ถ้าระบุรายชื่อไว้ จำนวนต้องตรงกับจำนวนรายชื่อเสมอ
        count: names.length > 0 ? names.length : Number(entry.count) || 0,
      };
    })
    .filter((entry) => {
      // meta ของแถวรายงาน ไม่นับเป็นรายการจำหน่าย
      if (isReportRowMeta(entry)) return false;

      if (entry.category === "other") {
        // จำหน่ายแบบระบุรายชื่อ (นับหัวจากรายชื่อ) หรือแบบระบุหัวข้อ + จำนวน
        if (entry.cadet_name.length > 0) return true;
        return entry.subcategory.length > 0 && entry.count > 0;
      }
      // กรองเฉพาะรายการที่มีชื่อนักเรียน และต้องมีสาเหตุ + สถานที่ด้วย
      const hasName = entry.cadet_name.length > 0;
      if (!hasName) return false;

      const hasReason = entry.reason.length > 0;
      const hasLocation = entry.location.length > 0;

      return hasReason && hasLocation;
    });
}

export function emptyCategoryCounts(): CategoryCounts {
  return Object.fromEntries(CATEGORY_ORDER.map((category) => [category, 0])) as CategoryCounts;
}

export function countDispatchEntry(entry: Pick<Entry, "category" | "count" | "cadet_name">): number {
  // นับจำนวนนักเรียนจากรายชื่อที่คั่นด้วย comma
  const names = splitCadetNames(entry.cadet_name);
  if (names.length > 0) return names.length;

  // ไม่ได้ระบุรายชื่อ: "อื่น ๆ" ใช้จำนวนที่กรอกไว้ได้
  return entry.category === "other" ? Number(entry.count) || 0 : 0;
}

export function summarizeDispatchEntries(entries: Entry[], fullStrength: number): StrengthSummary {
  const cleanedEntries = cleanReportEntries(entries);
  const categoryCounts = emptyCategoryCounts();
  const itemsByKey = new Map<string, DispatchSummaryItem>();

  cleanedEntries.forEach((entry) => {
    const count = countDispatchEntry(entry);
    const label =
      entry.category === "other"
        ? normalizeOtherSubcategory(entry.subcategory) || CATEGORY_LABELS.other
        : CATEGORY_LABELS[entry.category];
    const key = entry.category === "other" ? `${entry.category}:${label}` : entry.category;
    const item = itemsByKey.get(key) || {
      category: entry.category,
      label,
      count: 0,
      details: [],
    };

    categoryCounts[entry.category] += count;
    item.count += count;

    // แสดงรายละเอียดรายชื่อที่จำหน่ายทุกหมวด รวม "อื่น ๆ"
    const detail = formatDispatchEntryDetail(entry);
    if (detail) {
      item.details.push(detail);
    } else if (entry.cadet_name.trim()) {
      // ถ้าไม่มี detail แต่มีชื่อ ให้แสดงชื่อนักเรียนอย่างน้อย
      item.details.push(entry.cadet_name.trim());
    }

    itemsByKey.set(key, item);
  });

  const normalizedFullStrength = Number(fullStrength) || 0;
  const dispatched = CATEGORY_ORDER.reduce((sum, category) => sum + categoryCounts[category], 0);
  const items = Array.from(itemsByKey.values()).sort((a, b) => {
    const categoryOrder = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    return categoryOrder || a.label.localeCompare(b.label, "th");
  });

  return {
    fullStrength: normalizedFullStrength,
    dispatched,
    remaining: Math.max(0, normalizedFullStrength - dispatched),
    categoryCounts,
    items,
  };
}

type OtherGroup = { label: string; count: number };

/** รวมรายการ "อื่น ๆ" แบบหัวข้อ + จำนวน (ข้อมูลเก่าที่ไม่ได้ระบุรายชื่อ) ตามหัวข้อ */
function groupOtherEntries(list: Entry[]): OtherGroup[] {
  const grouped = new Map<string, OtherGroup>();

  list.forEach((entry) => {
    const label = normalizeOtherSubcategory(entry.subcategory) || CATEGORY_LABELS.other;
    const group = grouped.get(label) || { label, count: 0 };

    group.count += countDispatchEntry(entry);
    grouped.set(label, group);
  });

  return Array.from(grouped.values());
}

function countFor(cat: DispatchCategory, entries: Entry[]): number {
  return entries
    .filter((e) => e.category === cat)
    .reduce((sum, entry) => sum + countDispatchEntry(entry), 0);
}

const studentsByDisplayName = new Map(
  studentsData.map((student) => [normalizeCadetLookupValue(student.display_name), student]),
);
const studentsByFullName = new Map(
  studentsData.map((student) => [
    normalizeCadetLookupValue([student.name, student.surname].filter(Boolean).join(" ")),
    student,
  ]),
);

function normalizeCadetLookupValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function removeCadetNameMetadata(value: string): string {
  return normalizeCadetLookupValue(value)
    .replace(/^นรต\.\s*/u, "")
    .replace(/\s+เลขที่\s+[๐-๙\d]+\s*$/u, "")
    .trim();
}

function firstSurnameConsonant(surname: string): string {
  return surname.match(/[ก-ฮ]/u)?.[0] || surname.match(/[A-Za-z]/u)?.[0] || "";
}

function formatCadetForSummary(value: string): string {
  const normalizedValue = normalizeCadetLookupValue(value);
  const plainName = removeCadetNameMetadata(normalizedValue);
  const student =
    studentsByDisplayName.get(normalizedValue) || studentsByFullName.get(plainName);

  if (student) {
    const surnameInitial = firstSurnameConsonant(student.surname);
    const abbreviatedName = `${student.name}${surnameInitial ? ` ${surnameInitial}.` : ""}`;
    return `${abbreviatedName} เลขที่ ${student.number}`;
  }

  const number = normalizedValue.match(/\s+เลขที่\s+([๐-๙\d]+)\s*$/u)?.[1] || "-";
  const nameParts = plainName.split(/\s+/).filter(Boolean);
  const surname = nameParts.length > 1 ? nameParts.pop() || "" : "";
  const givenName = nameParts.join(" ") || plainName;
  const surnameInitial = firstSurnameConsonant(surname);
  const abbreviatedName = `${givenName}${surnameInitial ? ` ${surnameInitial}.` : ""}`;

  return `${abbreviatedName} เลขที่ ${number}`;
}

function formatCadetForReport(value: string): string {
  const normalizedValue = normalizeCadetLookupValue(value);
  const plainName = removeCadetNameMetadata(normalizedValue);
  const student =
    studentsByDisplayName.get(normalizedValue) || studentsByFullName.get(plainName);

  if (student) {
    const surnameInitial = firstSurnameConsonant(student.surname);
    const abbreviatedName = `${student.name}${surnameInitial ? ` ${surnameInitial}.` : ""}`;
    return `${abbreviatedName} มว.${toThaiNumerals(student.squad)}`;
  }

  const nameParts = plainName.split(/\s+/).filter(Boolean);
  const surname = nameParts.length > 1 ? nameParts.pop() || "" : "";
  const givenName = nameParts.join(" ") || plainName;
  const surnameInitial = firstSurnameConsonant(surname);
  const abbreviatedName = `${givenName}${surnameInitial ? ` ${surnameInitial}.` : ""}`;

  return `${abbreviatedName} มว.-`;
}

const REPORT_DETAIL_INDENT = "\t";

function detailedCategoryLines(list: Entry[], includeCadetNames = true): string[] {
  const groups = new Map<
    string,
    { reason: string; location: string; cadetNames: string[] }
  >();

  list.forEach((entry) => {
    const reason = entry.reason.trim();
    const location = entry.location.trim();
    const key = `${reason}\u0000${location}`;
    const group = groups.get(key) || { reason, location, cadetNames: [] };

    group.cadetNames.push(...splitCadetNames(entry.cadet_name));
    groups.set(key, group);
  });

  return Array.from(groups.values()).flatMap((group, index) => [
    ...(index > 0 ? [""] : []),
    `${REPORT_DETAIL_INDENT}> ${group.reason}, ${toThaiNumerals(group.cadetNames.length)} นาย [${group.location}]`,
    ...(includeCadetNames
      ? group.cadetNames.map(
          (cadetName) => `${REPORT_DETAIL_INDENT}  - ${formatCadetForReport(cadetName)}`,
        )
      : []),
  ]);
}

function categoryBlock(cat: DispatchCategory, entries: Entry[]): string {
  const list = entries.filter((e) => e.category === cat);
  const total = countFor(cat, entries);
  const label = CATEGORY_LABELS[cat];
  const head = total > 0 ? ` 📍 ${label} ${toThaiNumerals(total)} นาย` : ` 📍 ${label} - นาย`;

  if (cat === "sick" || cat === "leave" || cat === "official") {
    const detailLines = detailedCategoryLines(list);
    return [head, ...detailLines, ...(detailLines.length > 0 ? [""] : [])].join("\n");
  }

  if (cat === "other") {
    // รายการที่มีรายชื่อ สรุปตามสาเหตุและสถานที่โดยไม่แสดงรายชื่อย่อย
    const named = list.filter((e) => splitCadetNames(e.cadet_name).length > 0);
    const namedLines = detailedCategoryLines(named, false);

    // ข้อมูลเก่าที่บันทึกแบบหัวข้อ + จำนวน ยังรวมตามหัวข้อ
    const legacyLines = groupOtherEntries(
      list.filter((e) => splitCadetNames(e.cadet_name).length === 0),
    ).map(
      ({ label, count }) =>
        `${REPORT_DETAIL_INDENT}- ${label}                  ${toThaiNumerals(count)} นาย`,
    );

    return [
      head,
      ...namedLines,
      ...(namedLines.length > 0 && legacyLines.length > 0 ? [""] : []),
      ...legacyLines,
    ].join("\n");
  }
  const lines = list.map((e) => {
    const parts = [e.cadet_name, e.reason, e.location].filter(Boolean);
    return `${REPORT_DETAIL_INDENT}- ${parts.join(" ,")}`;
  });
  return [head, ...lines].join("\n");
}

export function buildReportText(input: ReportInput): string {
  const entries = cleanReportEntries(input.entries);
  const totalDispatched = CATEGORY_ORDER.reduce((s, c) => s + countFor(c, entries), 0);
  const remaining = Math.max(0, input.fullStrength - totalDispatched);

  const header = [
    `${input.companyName}`,
    "",
    "************************",
    "",
    "เรียน ผู้บังคับบัญชา",
    "",
    `กระผม ${input.reporterName || "-"}`,
    `${input.reporterPosition || "-"}`,
    `ขออนุญาตรายงานยอดกำลังพลของกองร้อยที่ ๔ รุ่นที่ ๘๐ ประจำ${formatThaiDate(input.reportDate)} เวลา ${toThaiNumerals(input.reportTime || "-")} น. ดังนี้`,
    "",
    `📌 ยอดเต็ม                   ${toThaiNumerals(input.fullStrength)}  นาย`,
    `📌 จำหน่ายรวม                   ${totalDispatched > 0 ? toThaiNumerals(totalDispatched) : "-"}  นาย`,
    `📌 คงเหลือ                    ${toThaiNumerals(remaining)}  นาย`,
    "",
  ].join("\n");

  const body = CATEGORY_ORDER.map((c) => categoryBlock(c, entries)).join("\n");

  return toThaiNumerals(`${header}\n${body}\n`);
}

export function buildStretchExerciseReportText(input: StretchExerciseReportInput): string {
  return toThaiNumerals([
    `${input.companyName}`,
    "",
    "**************************",
    "",
    "เรียน ผู้บังคับบัญชา",
    "",
    `กระผม ${input.reporterName || "-"}`,
    `${input.reporterPosition || "-"} ขออนุญาตรายงานภาพการยืดเหยียดและกายบริหารของกองร้อยที่ ๔ รุ่นที่ ๘๐ ของ${formatThaiDateWithoutWeekday(input.reportDate)}`,
    "",
    "-การปฎิบัติเป็นไปด้วยความเรียบร้อย",
    "",
    "จึงเรียนมาเพื่อโปรดทราบ",
    "",
  ].join("\n"));
}

function markdownCategoryBlock(cat: DispatchCategory, entries: Entry[]): string {
  const list = entries.filter((e) => e.category === cat);
  const total = countFor(cat, entries);
  const label = CATEGORY_LABELS[cat];
  const lines = [`### ${label} ${total > 0 ? toThaiNumerals(total) : "-"} นาย`];

  if (cat === "other") {
    list
      .filter((entry) => splitCadetNames(entry.cadet_name).length > 0)
      .forEach((entry) => {
        const parts = [entry.cadet_name, entry.reason, entry.location].filter(Boolean);
        lines.push(`- ${parts.join(", ")}`);
      });

    groupOtherEntries(
      list.filter((entry) => splitCadetNames(entry.cadet_name).length === 0),
    ).forEach(({ label, count }) => lines.push(`- ${label}: ${toThaiNumerals(count)} นาย`));

    return lines.join("\n");
  }

  list.forEach((entry) => {
    const parts = [entry.cadet_name, entry.reason, entry.location].filter(Boolean);
    lines.push(`- ${parts.join(", ")}`);
  });
  return lines.join("\n");
}

export function buildReportMarkdown(input: ReportInput): string {
  const entries = cleanReportEntries(input.entries);
  const totalDispatched = CATEGORY_ORDER.reduce((s, c) => s + countFor(c, entries), 0);
  const remaining = Math.max(0, input.fullStrength - totalDispatched);
  const body = CATEGORY_ORDER.map((c) => markdownCategoryBlock(c, entries)).join("\n\n");

  return [
    `# ${input.companyName}`,
    "",
    "**เรียน:** ผู้บังคับบัญชา",
    "",
    `**ผู้รายงาน:** ${input.reporterName || "-"}`,
    `**ตำแหน่ง:** ${input.reporterPosition || "-"}`,
    "",
    `ขออนุญาตรายงานยอดกำลังพลของกองร้อยที่ ๔ รุ่นที่ ๘๐ ประจำ${formatThaiDate(input.reportDate)} เวลา ${toThaiNumerals(input.reportTime || "-")} น. ดังนี้`,
    "",
    `- **ยอดเต็ม:** ${toThaiNumerals(input.fullStrength)} นาย`,
    `- **จำหน่ายรวม:** ${toThaiNumerals(totalDispatched)} นาย`,
    `- **คงเหลือ:** ${toThaiNumerals(remaining)} นาย`,
    "",
    body,
    "",
    "จึงเรียนมาเพื่อโปรดทราบ",
    "",
  ].join("\n");
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
