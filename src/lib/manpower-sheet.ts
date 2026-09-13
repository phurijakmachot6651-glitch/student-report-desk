import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFImage, type PDFPage, type PDFFont } from "pdf-lib";
import {
  MANPOWER_CATEGORY_LABELS,
  MANPOWER_COMPANY_COMMANDER_SIGNATURE_PATH,
  MANPOWER_REPORTER_SIGNATURE_PATH,
  summarizeManpowerEntries,
  getManpowerEntryPeriod,
  toThaiDigits,
  type ManpowerSheetData,
  type ManpowerSheetEntry,
  type ManpowerSignature,
} from "./manpower-sheet-config.ts";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const GREEN = rgb(0, 176 / 255, 80 / 255);
const PEACH = rgb(251 / 255, 228 / 255, 213 / 255);
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const RED = rgb(1, 0, 0);
const THAI_MONTHS = [
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
const ENTRY_WIDTHS = [35.4, 113.4, 63.7, 49.6, 85, 120.5, 63.7];
const SUMMARY_WIDTHS = [69, 54, 57.5, 52.5, 54, 54, 54.5, 58.5, 78.5];
const ENTRY_FONT_SIZE = 14;
const ENTRY_LINE_HEIGHT = 16;
const FIRST_TABLE_TOP = 526;
const CONTINUATION_TABLE_TOP = 770;
const PAGE_BOTTOM_MARGIN = 36;
const SIGNATURE_TABLE_BOTTOM = 230;
// Two Thai character spaces to the right of the original document position.
const ASSISTANT_SIGNATURE_SHIFT_X = 21;
// Keep a half-character upward offset after moving it down one character space.
const ASSISTANT_SIGNATURE_SHIFT_Y = 5.25;
const ENLARGED_OFFICER_SIGNATURE_SCALE = 1.1232 * 1.2;

function parseISODate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function thaiDateParts(value: string) {
  const date = parseISODate(value);
  return {
    weekday: new Intl.DateTimeFormat("th-TH-u-nu-latn", { weekday: "long" })
      .format(date)
      .replace(/^วัน/u, ""),
    day: toThaiDigits(date.getDate()),
    month: THAI_MONTHS[date.getMonth()],
    year: toThaiDigits(date.getFullYear() + 543),
  };
}

function drawCell(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  fill = WHITE,
) {
  page.drawRectangle({ x, y, width, height, color: fill, borderColor: BLACK, borderWidth: 0.5 });
}

function splitLongToken(token: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const parts: string[] = [];
  let current = "";
  for (const character of token) {
    const candidate = current + character;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      parts.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  (text || "-").split(/\r?\n/u).forEach((paragraph) => {
    const tokens = Array.from(
      new Intl.Segmenter("th", { granularity: "word" }).segment(paragraph.trim()),
      ({ segment }) => segment,
    );
    if (tokens.length === 0) {
      lines.push("");
      return;
    }
    let line = "";
    let pendingSpace = false;
    tokens.forEach((token) => {
      if (/^\s+$/u.test(token)) {
        pendingSpace = Boolean(line);
        return;
      }
      const parts =
        font.widthOfTextAtSize(token, size) > maxWidth
          ? splitLongToken(token, font, size, maxWidth)
          : [token];
      parts.forEach((part) => {
        const candidate = line ? `${line}${pendingSpace ? " " : ""}${part}` : part;
        if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
          lines.push(line);
          line = part;
        } else {
          line = candidate;
        }
        pendingSpace = false;
      });
    });
    if (line) lines.push(line);
  });
  return lines;
}

function drawTextInCell(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { align?: "left" | "center"; maxLines?: number; color?: ReturnType<typeof rgb> } = {},
) {
  const displayText = toThaiDigits(text);
  const maxLines = options.maxLines || Math.max(1, Math.floor((height - 4) / (size + 2)));
  const lines = wrapText(displayText, font, size, width - 6).slice(0, maxLines);
  const lineHeight = size + 2;
  const startY = y + height / 2 + ((lines.length - 1) * lineHeight) / 2 - size * 0.38;
  lines.forEach((line, index) => {
    const textWidth = font.widthOfTextAtSize(line, size);
    page.drawText(line, {
      x: options.align === "left" ? x + 3 : x + Math.max(3, (width - textWidth) / 2),
      y: startY - index * lineHeight,
      size,
      font,
      color: options.color || BLACK,
    });
  });
}

function drawCenteredRuns(
  page: PDFPage,
  runs: Array<{ text: string; color?: ReturnType<typeof rgb> }>,
  font: PDFFont,
  size: number,
  y: number,
) {
  const displayRuns = runs.map((run) => ({ ...run, text: toThaiDigits(run.text) }));
  const totalWidth = displayRuns.reduce(
    (sum, run) => sum + font.widthOfTextAtSize(run.text, size),
    0,
  );
  let x = (A4_WIDTH - totalWidth) / 2;
  displayRuns.forEach((run) => {
    page.drawText(run.text, { x, y, size, font, color: run.color || BLACK });
    x += font.widthOfTextAtSize(run.text, size);
  });
}

function drawImageContained(
  page: PDFPage,
  image: PDFImage,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
  horizontalAlign: "left" | "center" = "center",
) {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, {
    x: x + (horizontalAlign === "left" ? 0 : (maxWidth - width) / 2),
    y: y + (maxHeight - height) / 2,
    width,
    height,
  });
}

function drawHeader(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  reportDate: string,
  data: ManpowerSheetData,
  logo: PDFImage,
  pageNumber: number,
  totalPages: number,
) {
  drawImageContained(page, logo, 255, 763, 66, 58);
  drawTextInCell(page, "รายงานยอดกำลังพล", bold, 16, 190, 735, 215, 20);
  drawTextInCell(page, "กองร้อยที่ ๔ ปค.๑ บก.ปค.", bold, 16, 175, 712, 245, 20);

  const date = thaiDateParts(reportDate);
  drawCenteredRuns(
    page,
    [
      { text: "ประจำวัน " },
      { text: date.weekday, color: RED },
      { text: " ที่ " },
      { text: date.day, color: RED },
      { text: " เดือน " },
      { text: date.month, color: RED },
      { text: " พ.ศ. " },
      { text: date.year, color: RED },
      { text: " เวลา " },
      { text: toThaiDigits(data.reportTime), color: RED },
      { text: " น." },
    ],
    bold,
    16,
    687,
  );
  drawCenteredRuns(
    page,
    [
      { text: "นายตำรวจเวรตรวจระเบียบ " },
      { text: data.dutyOfficerName || "-", color: RED },
      { text: " โทร." },
      { text: toThaiDigits(data.dutyOfficerPhone || "-"), color: RED },
    ],
    bold,
    16,
    657,
  );
  drawPageNumber(page, regular, pageNumber, totalPages);
}

function drawPageNumber(page: PDFPage, regular: PDFFont, pageNumber: number, totalPages: number) {
  if (totalPages <= 1) return;
  page.drawText(`หน้า ${toThaiDigits(pageNumber)}/${toThaiDigits(totalPages)}`, {
    x: 527,
    y: 816,
    size: 8,
    font: regular,
    color: BLACK,
  });
}

function drawSummary(page: PDFPage, regular: PDFFont, bold: PDFFont, data: ManpowerSheetData) {
  const { counts, total } = summarizeManpowerEntries(data.entries);
  const remaining = Math.max(0, data.fullStrength - total);
  const x = 35.75;
  const totalWidth = SUMMARY_WIDTHS.reduce((sum, width) => sum + width, 0);
  drawCell(page, x, 628, totalWidth, 19, GREEN);
  drawTextInCell(page, "สถานภาพกำลังพล", bold, 14, x, 628, totalWidth, 19);

  drawCell(page, x, 571, SUMMARY_WIDTHS[0], 57, GREEN);
  drawTextInCell(page, "กำลังพล", bold, 14, x, 571, SUMMARY_WIDTHS[0], 57);
  drawCell(page, x + SUMMARY_WIDTHS[0], 590, SUMMARY_WIDTHS[1], 38, GREEN);
  drawTextInCell(page, "ยอดเต็ม", bold, 14, x + SUMMARY_WIDTHS[0], 590, SUMMARY_WIDTHS[1], 38);

  const dispatchX = x + SUMMARY_WIDTHS[0] + SUMMARY_WIDTHS[1];
  const dispatchWidth = SUMMARY_WIDTHS.slice(2, 8).reduce((sum, width) => sum + width, 0);
  drawCell(page, dispatchX, 609, dispatchWidth, 19, PEACH);
  drawTextInCell(page, "รายการจำหน่าย", bold, 14, dispatchX, 609, dispatchWidth, 19);

  const remainingX = dispatchX + dispatchWidth;
  drawCell(page, remainingX, 590, SUMMARY_WIDTHS[8], 38, GREEN);
  drawTextInCell(page, "คงเหลือ", bold, 14, remainingX, 590, SUMMARY_WIDTHS[8], 38);

  let currentX = dispatchX;
  ["ราชการ", "ลา", "ป่วย", "ขาด", "อื่นๆ", "รวม"].forEach((label, index) => {
    drawCell(page, currentX, 590, SUMMARY_WIDTHS[index + 2], 19, PEACH);
    drawTextInCell(page, label, bold, 14, currentX, 590, SUMMARY_WIDTHS[index + 2], 19);
    currentX += SUMMARY_WIDTHS[index + 2];
  });

  const values = [
    toThaiDigits(data.fullStrength),
    counts.official ? toThaiDigits(counts.official) : "-",
    counts.leave ? toThaiDigits(counts.leave) : "-",
    counts.sick ? toThaiDigits(counts.sick) : "-",
    counts.absent ? toThaiDigits(counts.absent) : "-",
    counts.other ? toThaiDigits(counts.other) : "-",
    total ? toThaiDigits(total) : "-",
    toThaiDigits(remaining),
  ];
  currentX = x + SUMMARY_WIDTHS[0];
  values.forEach((value, index) => {
    const width = SUMMARY_WIDTHS[index + 1];
    drawCell(page, currentX, 571, width, 19, WHITE);
    drawTextInCell(page, value, regular, 14, currentX, 571, width, 19);
    currentX += width;
  });
}

function entryValues(entry: ManpowerSheetEntry, rowNumber: number): string[] {
  return [
    `${toThaiDigits(rowNumber)}.`,
    toThaiDigits(entry.name || "-"),
    toThaiDigits(entry.squadNumber || "-"),
    MANPOWER_CATEGORY_LABELS[entry.category],
    toThaiDigits(entry.detail || "-"),
    toThaiDigits(getManpowerEntryPeriod(entry) || "-"),
    toThaiDigits(entry.note || "-"),
  ];
}

function getEntryRowHeight(entry: ManpowerSheetEntry, regular: PDFFont): number {
  const values = entryValues(entry, 1);
  const lineCount = values.reduce(
    (maximum, value, index) =>
      Math.max(maximum, wrapText(value, regular, ENTRY_FONT_SIZE, ENTRY_WIDTHS[index] - 8).length),
    1,
  );
  return Math.max(55, lineCount * ENTRY_LINE_HEIGHT + 10);
}

type EntryPage = { entries: ManpowerSheetEntry[]; rowHeights: number[]; startIndex: number };

function paginateEntries(entries: ManpowerSheetEntry[], regular: PDFFont): EntryPage[] {
  if (entries.length === 0) return [{ entries: [], rowHeights: [], startIndex: 0 }];

  const rowHeights = entries.map((entry) => getEntryRowHeight(entry, regular));
  const firstPageFinalCapacity = FIRST_TABLE_TOP - SIGNATURE_TABLE_BOTTOM;
  const firstPageOpenCapacity = FIRST_TABLE_TOP - PAGE_BOTTOM_MARGIN;
  const continuationFinalCapacity = CONTINUATION_TABLE_TOP - SIGNATURE_TABLE_BOTTOM;
  const continuationOpenCapacity = CONTINUATION_TABLE_TOP - PAGE_BOTTOM_MARGIN;
  const pages: EntryPage[] = [];
  let startIndex = 0;
  let pageIndex = 0;
  while (startIndex < entries.length) {
    const tableCapacity = pageIndex === 0 ? firstPageOpenCapacity : continuationOpenCapacity;
    const finalCapacity = pageIndex === 0 ? firstPageFinalCapacity : continuationFinalCapacity;
    const remainingHeight = rowHeights.slice(startIndex).reduce((sum, height) => sum + height, 0);
    const isFinalPage = remainingHeight <= finalCapacity;
    const capacity = isFinalPage ? finalCapacity : tableCapacity;
    let endIndex = startIndex;
    let currentHeight = 0;
    while (
      endIndex < entries.length &&
      (currentHeight + rowHeights[endIndex] <= capacity || endIndex === startIndex)
    ) {
      // Leave at least one row for a dedicated final page when signatures need space.
      if (!isFinalPage && endIndex + 1 === entries.length && endIndex > startIndex) break;
      currentHeight += rowHeights[endIndex];
      endIndex += 1;
    }
    pages.push({
      entries: entries.slice(startIndex, endIndex),
      rowHeights: rowHeights.slice(startIndex, endIndex),
      startIndex,
    });
    startIndex = endIndex;
    pageIndex += 1;
  }
  const lastPage = pages[pages.length - 1];
  const lastPageCapacity = pages.length === 1 ? firstPageFinalCapacity : continuationFinalCapacity;
  if (lastPage && lastPage.rowHeights.reduce((sum, height) => sum + height, 0) > lastPageCapacity) {
    pages.push({ entries: [], rowHeights: [], startIndex: entries.length });
  }
  return pages;
}

function drawEntriesTable(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  entries: ManpowerSheetEntry[],
  rowHeights: number[],
  startIndex: number,
  tableTop = FIRST_TABLE_TOP,
) {
  const x = 35.75;
  const totalWidth = ENTRY_WIDTHS.reduce((sum, width) => sum + width, 0);
  drawCell(page, x, tableTop + 22, totalWidth, 19, GREEN);
  drawTextInCell(page, "รายการจำหน่าย", bold, 14, x, tableTop + 22, totalWidth, 19);

  let currentX = x;
  [
    "ลำดับ",
    "ชื่อ  นามสกุล",
    "หมวด/เลขที่",
    "จำหน่าย",
    "รายละเอียด",
    "วัน เวลา",
    "หมายเหตุ",
  ].forEach((header, index) => {
    drawCell(page, currentX, tableTop, ENTRY_WIDTHS[index], 22, GREEN);
    drawTextInCell(page, header, bold, 14, currentX, tableTop, ENTRY_WIDTHS[index], 22);
    currentX += ENTRY_WIDTHS[index];
  });

  let rowTop = tableTop;
  entries.forEach((entry, rowIndex) => {
    const rowHeight = rowHeights[rowIndex];
    const rowY = rowTop - rowHeight;
    const values = entryValues(entry, startIndex + rowIndex + 1);
    let cellX = x;
    values.forEach((value, index) => {
      drawCell(page, cellX, rowY, ENTRY_WIDTHS[index], rowHeight);
      drawTextInCell(
        page,
        value,
        regular,
        ENTRY_FONT_SIZE,
        cellX,
        rowY,
        ENTRY_WIDTHS[index],
        rowHeight,
        {
          align: "center",
        },
      );
      cellX += ENTRY_WIDTHS[index];
    });
    rowTop = rowY;
  });
  return rowTop;
}

function drawSignatureBlock(
  page: PDFPage,
  bold: PDFFont,
  {
    centerX,
    imageY,
    label,
    name,
    position,
    image,
    imageWidth,
    imageScale = 1,
    imageAlign = "center",
    labelOffsetX = 0,
    imageOffsetX = 0,
    imageOffsetY = 0,
    detailsOffsetX = 0,
    alignNameWithLabelEnd = false,
  }: {
    centerX: number;
    imageY: number;
    label: string;
    name: string;
    position: string;
    image: PDFImage | null;
    imageWidth: number;
    imageScale?: number;
    imageAlign?: "left" | "center";
    labelOffsetX?: number;
    imageOffsetX?: number;
    imageOffsetY?: number;
    detailsOffsetX?: number;
    alignNameWithLabelEnd?: boolean;
  },
) {
  const fontSize = 14;
  const labelWidth = bold.widthOfTextAtSize(label, fontSize);
  const gap = 4;
  const groupWidth = labelWidth + gap + imageWidth;
  const groupX = centerX - groupWidth / 2;
  page.drawText(toThaiDigits(label), {
    x: groupX + labelOffsetX,
    y: imageY + 6,
    size: fontSize,
    font: bold,
    color: BLACK,
  });
  if (image) {
    const scaledWidth = imageWidth * imageScale;
    const scaledHeight = 43 * imageScale;
    const imageX =
      groupX + labelWidth + gap + (imageAlign === "center" ? (imageWidth - scaledWidth) / 2 : 0);
    drawImageContained(
      page,
      image,
      imageX + imageOffsetX,
      imageY + imageOffsetY,
      scaledWidth,
      scaledHeight,
      imageAlign,
    );
  }
  if (alignNameWithLabelEnd) {
    const detailsX = groupX + labelOffsetX + labelWidth;
    page.drawText(toThaiDigits(`(${name || "-"})`), {
      x: detailsX,
      y: imageY - 15,
      size: fontSize,
      font: bold,
      color: BLACK,
    });
  } else {
    drawTextInCell(
      page,
      `(${name || "-"})`,
      bold,
      fontSize,
      centerX - 110 + detailsOffsetX,
      imageY - 21,
      220,
      18,
    );
  }
  drawTextInCell(
    page,
    position,
    bold,
    fontSize,
    centerX - 120 + detailsOffsetX,
    imageY - 40,
    240,
    18,
  );
}

function drawSignatures(
  page: PDFPage,
  bold: PDFFont,
  data: ManpowerSheetData,
  tableBottom: number,
  signature: ManpowerSignature | null,
  signatureImage: PDFImage | null,
  reporterSignature: PDFImage,
  commanderSignature: PDFImage,
) {
  const reporterImageY = tableBottom - 76;
  drawSignatureBlock(page, bold, {
    centerX: A4_WIDTH / 2,
    imageY: reporterImageY,
    label: "ลงชื่อ นรต.",
    name: data.reporterName,
    position: data.reporterPosition || "-",
    image: reporterSignature,
    imageWidth: 120,
    imageScale: 1.1,
    labelOffsetX: 5,
    imageOffsetX: -15 + ASSISTANT_SIGNATURE_SHIFT_X,
    imageOffsetY: -14 + ASSISTANT_SIGNATURE_SHIFT_Y,
    alignNameWithLabelEnd: true,
  });

  const lowerImageY = reporterImageY - 83;
  const officerSignatureLayout =
    signature?.id === "panithan"
      ? { scale: ENLARGED_OFFICER_SIGNATURE_SCALE, offsetX: 17 }
      : signature?.id === "weerapat"
        ? { scale: 0.936, offsetX: 11 }
        : signature?.id === "apinat"
          ? { scale: ENLARGED_OFFICER_SIGNATURE_SCALE, offsetX: 11.5 }
          : { scale: 0.72, offsetX: 2 };
  drawSignatureBlock(page, bold, {
    centerX: 166,
    imageY: lowerImageY,
    label: `ลงชื่อ ${signature?.rank || "ร.ต.อ."}`,
    name: signature?.officerName || "-",
    position: "ผบ.มว.ร้อย ๔ ปค.๑ บก.ปค.",
    image: signatureImage,
    imageWidth: 135,
    imageScale: officerSignatureLayout.scale,
    imageAlign: "left",
    imageOffsetX: officerSignatureLayout.offsetX,
  });
  drawSignatureBlock(page, bold, {
    centerX: 429,
    imageY: lowerImageY,
    label: "ลงชื่อ พ.ต.ท.",
    name: "วรันธร พรดอนก่อ",
    position: "ผบ.ร้อย ๔ ปค.๑ บก.ปค.",
    image: commanderSignature,
    imageWidth: 135,
    imageScale: 1.4641,
    imageAlign: "left",
    imageOffsetX: 3,
  });
}

async function embedPng(pdf: PDFDocument, response: Response): Promise<PDFImage> {
  return pdf.embedPng(await response.arrayBuffer());
}

export async function buildManpowerSheetPdf({
  reportDate,
  signature,
  data,
}: {
  reportDate: string;
  signature: ManpowerSignature | null;
  data: ManpowerSheetData;
}): Promise<Uint8Array> {
  const requests = [
    fetch("/manpower/THSarabunPSK-Regular.ttf"),
    fetch("/manpower/THSarabunPSK-Bold.ttf"),
    fetch("/manpower/police-logo.png"),
    fetch(MANPOWER_REPORTER_SIGNATURE_PATH),
    fetch(MANPOWER_COMPANY_COMMANDER_SIGNATURE_PATH),
    ...(signature ? [fetch(signature.imagePath)] : []),
  ];
  const responses = await Promise.all(requests);
  if (responses.some((response) => !response.ok)) {
    throw new Error("โหลดทรัพยากรใบกำลังพลไม่สำเร็จ");
  }

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(await responses[0].arrayBuffer(), { subset: true });
  const bold = await pdf.embedFont(await responses[1].arrayBuffer(), { subset: true });
  const logo = await embedPng(pdf, responses[2]);
  const reporterSignature = await embedPng(pdf, responses[3]);
  const commanderSignature = await embedPng(pdf, responses[4]);
  const signatureImage = signature ? await embedPng(pdf, responses[5]) : null;
  const { filledEntries } = summarizeManpowerEntries(data.entries);
  const chunks = paginateEntries(filledEntries, regular);

  chunks.forEach(({ entries, rowHeights, startIndex }, pageIndex) => {
    const page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
    const isFirstPage = pageIndex === 0;
    if (isFirstPage) {
      drawHeader(page, regular, bold, reportDate, data, logo, pageIndex + 1, chunks.length);
      drawSummary(page, regular, bold, data);
    } else {
      drawPageNumber(page, regular, pageIndex + 1, chunks.length);
    }
    const tableBottom = drawEntriesTable(
      page,
      regular,
      bold,
      entries,
      rowHeights,
      startIndex,
      isFirstPage ? FIRST_TABLE_TOP : CONTINUATION_TABLE_TOP,
    );
    if (pageIndex === chunks.length - 1) {
      drawSignatures(
        page,
        bold,
        data,
        tableBottom,
        signature,
        signatureImage,
        reporterSignature,
        commanderSignature,
      );
    }
  });

  pdf.setTitle(`ใบกำลังพล ${reportDate}`);
  pdf.setSubject("รายงานยอดกำลังพล กองร้อยที่ 4");
  pdf.setCreator("student-report-desk");
  return pdf.save();
}
