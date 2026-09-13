export type ManpowerSignature = {
  id: string;
  label: string;
  rank: string;
  officerName: string;
  dutyOfficerName: string;
  dutyOfficerPhone: string;
  imagePath: string;
};

export type ManpowerCategory = "official" | "leave" | "sick" | "absent" | "other";
/** รูปแบบช่วงเวลาที่แสดงในแบบฟอร์มกำลังพล */
export type ManpowerPeriodMode = "same-day" | "cross-day" | "medical-admission";

/** ค่าเริ่มต้นตัวอย่างที่ใช้เติมแถวใหม่ของแบบฟอร์มใบกำลังพล */
export const MANPOWER_DEFAULT_PERIOD_MODE: ManpowerPeriodMode = "medical-admission";
export const MANPOWER_DEFAULT_PERIOD_START_TIME = "13:00";
export const MANPOWER_DEFAULT_PERIOD_START_DATE = "2026-09-04";

export type ManpowerSheetEntry = {
  id: string;
  studentId: string;
  name: string;
  squadNumber: string;
  category: ManpowerCategory;
  detail: string;
  period: string;
  periodMode?: ManpowerPeriodMode;
  periodStartTime?: string;
  periodEndTime?: string;
  periodStartDate?: string;
  periodEndDate?: string;
  note: string;
};

export type ManpowerSheetData = {
  reportTime: string;
  dutyOfficerName: string;
  dutyOfficerPhone: string;
  fullStrength: number;
  reporterName: string;
  reporterPosition: string;
  entries: ManpowerSheetEntry[];
};

const THAI_DIGITS = ["๐", "๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙"];
const ARABIC_DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const THAI_SHORT_MONTHS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

/** Convert Arabic numerals in document values to Thai numerals. */
export function toThaiDigits(value: string | number): string {
  return String(value).replace(/\d/g, (digit) => THAI_DIGITS[Number(digit)]);
}

/** Convert Thai numerals back to Arabic numerals for numeric form parsing. */
export function toArabicDigits(value: string | number): string {
  return String(value).replace(/[๐-๙]/gu, (digit) => ARABIC_DIGITS[THAI_DIGITS.indexOf(digit)]);
}

function formatPeriodTime(value: string): string {
  const [hour, minute] = value.split(":");
  if (!hour || !minute) return "";
  return toThaiDigits(`${hour.padStart(2, "0")}.${minute.padStart(2, "0")}`);
}

function formatPeriodDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    !year ||
    !month ||
    !day ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return "";
  }
  const weekday = new Intl.DateTimeFormat("th-TH", { weekday: "long" }).format(date);
  const buddhistYear = String(year + 543).slice(-2);
  return `${weekday}ที่ ${toThaiDigits(day)} ${THAI_SHORT_MONTHS[month - 1]}${toThaiDigits(buddhistYear)}`;
}

/** Build the exact Thai leave-period sentence used in Word, PDF and JPG exports. */
export function formatManpowerPeriod(entry: ManpowerSheetEntry): string {
  const startTime = formatPeriodTime(entry.periodStartTime || "");
  const startDate = formatPeriodDate(entry.periodStartDate || "");
  if (!startTime || !startDate) return "";

  // ผู้ป่วยแอดมิทใช้เฉพาะเวลาเริ่มต้นและมีผลต่อเนื่องจนกว่าจะลบยอดจำหน่าย
  // จึงไม่ควรบังคับให้กรอกเวลา/วันที่สิ้นสุดเหมือนการลาภายในวันเดียวกัน
  if (entry.periodMode === "medical-admission") {
    return `ตั้งแต่เวลา ${startTime} น.\nของ${startDate}`;
  }

  const endTime = formatPeriodTime(entry.periodEndTime || "");
  if (!endTime) return "";

  if ((entry.periodMode || "same-day") === "same-day") {
    return `ตั้งแต่เวลา ${startTime} น.\nถึงเวลา ${endTime} น.\nของ${startDate}`;
  }

  const endDate = formatPeriodDate(entry.periodEndDate || "");
  if (!endDate) return "";
  return `ตั้งแต่เวลา ${startTime} น.\nของ${startDate}\nถึงเวลา ${endTime} น.\nของ${endDate}`;
}

/**
 * Return the period that should be shown/exported for an entry.
 *
 * Structured date/time fields are the source of truth whenever they exist.
 * This keeps the preview in sync with the selectors and prevents an old
 * free-form `period` string from remaining visible after a selector changes.
 * Entries created by older drafts that have no structured fields still retain
 * their legacy text until the user edits one of the selectors.
 */
export function getManpowerEntryPeriod(entry: ManpowerSheetEntry): string {
  const hasStructuredPeriod = Boolean(
    entry.periodStartTime || entry.periodEndTime || entry.periodStartDate || entry.periodEndDate,
  );
  const formattedPeriod = hasStructuredPeriod ? formatManpowerPeriod(entry) : "";
  if (formattedPeriod) return formattedPeriod;

  // Keep periods from older drafts that were stored as free-form text. Once a
  // user starts editing a structured time, `updatePeriod` clears the stale
  // text, so a cleared selector never resurrects the old value.
  if (!entry.periodStartTime && !entry.periodEndTime && entry.period.trim()) {
    return entry.period.trim();
  }
  return "";
}

export const MANPOWER_REPORTER_SIGNATURE_PATH = "/manpower/reporter-signature.png";
export const MANPOWER_COMPANY_COMMANDER_SIGNATURE_PATH =
  "/manpower/company-commander-signature.png";

export const MANPOWER_CATEGORY_LABELS: Record<ManpowerCategory, string> = {
  official: "ราชการ",
  leave: "ลา",
  sick: "ป่วย",
  absent: "ขาด",
  other: "อื่นๆ",
};

export const MANPOWER_CATEGORIES = Object.keys(MANPOWER_CATEGORY_LABELS) as ManpowerCategory[];

export const MANPOWER_SIGNATURES: ManpowerSignature[] = [
  {
    id: "panithan",
    label: "พี่กราฟ (ปณิธาน ห่วงถึง)",
    rank: "ร.ต.อ.",
    officerName: "ปณิธาน ห่วงถึง",
    dutyOfficerName: "ร.ต.อ.ปณิธาน ห่วงถึง",
    dutyOfficerPhone: "06 4259 2915",
    imagePath: "/manpower/signatures/panithan.png",
  },
  {
    id: "weerapat",
    label: "พี่มีน (วีรภัทร ขวัญศรีเพชร)",
    rank: "ร.ต.อ.",
    officerName: "วีรภัทร ขวัญศรีเพชร",
    dutyOfficerName: "ร.ต.อ.วีรภัทร ขวัญศรีเพชร",
    dutyOfficerPhone: "09 8346 1325",
    imagePath: "/manpower/signatures/weerapat.png",
  },
  {
    id: "apinat",
    label: "พี่โดนัท (อภิณัฐ ชมภูนุช)",
    rank: "ร.ต.อ.",
    officerName: "อภิณัฐ ชมภูนุช",
    dutyOfficerName: "ร.ต.อ.อภิณัฐ ชมภูนุช",
    dutyOfficerPhone: "08 9666 8683",
    imagePath: "/manpower/signatures/apinat.png",
  },
  {
    id: "pannaphong",
    label: "พี่เต้ย (พรรณพงศ์ จีนโน)",
    rank: "ร.ต.อ.",
    officerName: "พรรณพงศ์ จีนโน",
    dutyOfficerName: "ร.ต.อ.พรรณพงศ์ จีนโน",
    dutyOfficerPhone: "09 4691 5380",
    imagePath: "/manpower/signatures/pannaphong.png",
  },
];

export function isManpowerEntryFilled(entry: ManpowerSheetEntry): boolean {
  // A row is meaningful when it has a person or any manually entered detail.
  // Structured date/time defaults are not enough on their own; otherwise the
  // sample period shown in a new row would inflate the dispatched total.
  const hasPersonOrDetails = Boolean(
    entry.name.trim() || entry.squadNumber.trim() || entry.detail.trim() || entry.note.trim(),
  );
  if (hasPersonOrDetails) return true;

  // Older drafts may contain only a free-form period and no structured fields.
  // Keep those rows compatible while ignoring generated/placeholder periods.
  const hasStructuredPeriod = Boolean(
    entry.periodStartTime || entry.periodEndTime || entry.periodStartDate || entry.periodEndDate,
  );
  return !hasStructuredPeriod && Boolean(entry.period.trim());
}

export function summarizeManpowerEntries(entries: ManpowerSheetEntry[]) {
  const filledEntries = entries.filter(isManpowerEntryFilled);
  const counts = Object.fromEntries(
    MANPOWER_CATEGORIES.map((category) => [
      category,
      filledEntries.filter((entry) => entry.category === category).length,
    ]),
  ) as Record<ManpowerCategory, number>;

  return {
    counts,
    total: filledEntries.length,
    filledEntries,
  };
}

export function manpowerSheetFilename(reportDate: string, extension = "pdf"): string {
  const [year, month, day] = reportDate.split("-").map(Number);
  const buddhistYear = String(year + 543).slice(-2);
  return `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${buddhistYear}.${extension}`;
}
