import JSZip from "jszip";
import {
  MANPOWER_CATEGORY_LABELS,
  getManpowerEntryPeriod,
  summarizeManpowerEntries,
  toThaiDigits,
  type ManpowerSheetData,
  type ManpowerSignature,
} from "./manpower-sheet-config.ts";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
// Two character spaces in the 14 pt TH SarabunPSK signature row.
const WORD_ASSISTANT_SIGNATURE_SHIFT_EMU = 266700;
// Half of a 14 pt character space (5.25 pt) upward after moving down one space.
const WORD_ASSISTANT_SIGNATURE_RAISE_EMU = 66675;
// Align the full stop in "ลงชื่อ นรต." with the opening parenthesis below.
const WORD_REPORTER_LABEL_LEADING_SPACES = "  ";
const OFFICER_SIGNATURE_SCALE = 1.2;
const XML_NS = "http://www.w3.org/XML/1998/namespace";
const RED = "FF0000";
const BLACK = "000000";

type WordRun = { text: string; color?: string };

function formatThaiDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return {
    weekday: new Intl.DateTimeFormat("th-TH", { weekday: "long" })
      .format(date)
      .replace(/^วัน/u, ""),
    day: toThaiDigits(date.getDate()),
    month: new Intl.DateTimeFormat("th-TH", { month: "long" }).format(date),
    year: toThaiDigits(date.getFullYear() + 543),
  };
}

async function fetchBytes(path: string): Promise<Uint8Array> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`โหลดไฟล์ ${path} ไม่สำเร็จ`);
  return new Uint8Array(await response.arrayBuffer());
}

function directChildren(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter((child) => child.localName === localName);
}

function textNodes(element: Element): Element[] {
  return Array.from(element.getElementsByTagNameNS(WORD_NS, "t"));
}

function elementText(element: Element): string {
  return textNodes(element)
    .map((node) => node.textContent || "")
    .join("");
}

function setXmlAttribute(element: Element, localName: string, value: string) {
  element.setAttributeNS(WORD_NS, `w:${localName}`, value);
}

function createRun(
  document: XMLDocument,
  baseRunProperties: Element | null,
  text: string,
  color: string,
): Element {
  const run = document.createElementNS(WORD_NS, "w:r");
  if (baseRunProperties) {
    const runProperties = baseRunProperties.cloneNode(true) as Element;
    Array.from(runProperties.getElementsByTagNameNS(WORD_NS, "color")).forEach((colorNode) =>
      colorNode.parentNode?.removeChild(colorNode),
    );
    const colorNode = document.createElementNS(WORD_NS, "w:color");
    setXmlAttribute(colorNode, "val", color);
    runProperties.appendChild(colorNode);
    run.appendChild(runProperties);
  }
  const textNode = document.createElementNS(WORD_NS, "w:t");
  textNode.textContent = text;
  if (/^\s|\s$/u.test(text)) textNode.setAttributeNS(XML_NS, "xml:space", "preserve");
  run.appendChild(textNode);
  return run;
}

function baseRunProperties(paragraph: Element): Element | null {
  const run = paragraph.getElementsByTagNameNS(WORD_NS, "r")[0];
  return run?.getElementsByTagNameNS(WORD_NS, "rPr")[0]?.cloneNode(true) as Element | null;
}

function setParagraphRuns(
  document: XMLDocument,
  paragraph: Element,
  runs: WordRun[],
  preserveTabs = false,
) {
  const properties = baseRunProperties(paragraph);
  const leadingTabs = preserveTabs
    ? directChildren(paragraph, "r")
        .filter((run) => run.getElementsByTagNameNS(WORD_NS, "tab").length > 0)
        .map((run) => run.cloneNode(true))
    : [];
  directChildren(paragraph, "r").forEach((run) => run.parentNode?.removeChild(run));
  leadingTabs.forEach((run) => paragraph.appendChild(run));
  runs.forEach(({ text, color }) => {
    paragraph.appendChild(createRun(document, properties, text, color || BLACK));
  });
}

function setTextNode(node: Element, value: string) {
  node.textContent = value;
  if (/^\s|\s$/u.test(value)) node.setAttributeNS(XML_NS, "xml:space", "preserve");
  else node.removeAttributeNS(XML_NS, "space");
}

function setParagraphPhrase(paragraph: Element, phrase: string, replacement: string): boolean {
  const nodes = textNodes(paragraph);
  const current = nodes.map((node) => node.textContent || "").join("");
  const index = current.indexOf(phrase);
  if (index < 0 || nodes.length === 0) return false;

  // Keep paragraph properties, tabs, and anchored pictures while replacing a
  // phrase that Word split across several runs in the source document.
  let offset = 0;
  let first = 0;
  for (; first < nodes.length; first += 1) {
    const end = offset + (nodes[first].textContent || "").length;
    if (index < end) break;
    offset = end;
  }
  const beforeInFirst = current.slice(offset, index);
  const next = beforeInFirst + replacement + current.slice(index + phrase.length);
  setTextNode(nodes[first], next);
  nodes.slice(first + 1).forEach((node) => setTextNode(node, ""));
  return true;
}

function replaceTextInDocument(document: XMLDocument, phrase: string, replacement: string) {
  Array.from(document.getElementsByTagNameNS(WORD_NS, "p")).forEach((paragraph) => {
    const nodes = textNodes(paragraph);
    let replaced = false;
    nodes.forEach((node) => {
      const current = node.textContent || "";
      if (!current.includes(phrase)) return;
      setTextNode(node, current.split(phrase).join(replacement));
      replaced = true;
    });
    if (!replaced && elementText(paragraph).includes(phrase)) {
      setParagraphPhrase(paragraph, phrase, replacement);
    }
  });
}

function setCellText(document: XMLDocument, cell: Element, value: string) {
  const lines = String(value).split(/\r?\n/u);
  let paragraphs = directChildren(cell, "p");
  if (paragraphs.length === 0) {
    const paragraph = document.createElementNS(WORD_NS, "w:p");
    cell.appendChild(paragraph);
    paragraphs = [paragraph];
  }

  while (paragraphs.length < lines.length) {
    const clone = paragraphs[0].cloneNode(true) as Element;
    cell.appendChild(clone);
    paragraphs.push(clone);
  }
  paragraphs
    .slice(lines.length)
    .forEach((paragraph) => paragraph.parentNode?.removeChild(paragraph));

  paragraphs.slice(0, lines.length).forEach((paragraph, index) => {
    const properties = baseRunProperties(paragraph);
    directChildren(paragraph, "r").forEach((run) => run.parentNode?.removeChild(run));
    paragraph.appendChild(createRun(document, properties, lines[index], BLACK));
  });
}

function convertDocumentTextToThaiDigits(document: XMLDocument) {
  textNodes(document.documentElement).forEach((node) => {
    node.textContent = toThaiDigits(node.textContent || "");
  });
}

function setEntryRow(document: XMLDocument, row: Element, values: string[]) {
  directChildren(row, "tc").forEach((cell, index) =>
    setCellText(document, cell, values[index] || ""),
  );
}

function findParagraph(document: XMLDocument, phrase: string): Element | null {
  return (
    Array.from(document.getElementsByTagNameNS(WORD_NS, "p")).find((paragraph) =>
      elementText(paragraph).includes(phrase),
    ) || null
  );
}

function removeImageByRelationship(document: XMLDocument, relationshipId: string) {
  Array.from(document.getElementsByTagNameNS(DRAWING_NS, "blip")).forEach((blip) => {
    if (blip.getAttributeNS(REL_NS, "embed") !== relationshipId) return;
    let drawing = blip.parentElement;
    while (drawing && drawing.localName !== "drawing") drawing = drawing.parentElement;
    drawing?.parentNode?.removeChild(drawing);
  });
}

function findDrawingByRelationship(document: XMLDocument, relationshipId: string): Element | null {
  const blip = Array.from(document.getElementsByTagNameNS(DRAWING_NS, "blip")).find(
    (candidate) => candidate.getAttributeNS(REL_NS, "embed") === relationshipId,
  );
  if (!blip) return null;
  let drawing = blip.parentElement;
  while (drawing && drawing.localName !== "anchor" && drawing.localName !== "inline") {
    drawing = drawing.parentElement;
  }
  return drawing;
}

function shiftAnchoredImage(
  document: XMLDocument,
  relationshipId: string,
  horizontalShiftEmu: number,
  verticalShiftEmu = 0,
) {
  const drawing = findDrawingByRelationship(document, relationshipId);
  if (!drawing || drawing.localName !== "anchor") return;
  const shiftPosition = (positionName: "positionH" | "positionV", shiftEmu: number) => {
    const position = Array.from(drawing.children).find((child) => child.localName === positionName);
    const offset = position
      ? Array.from(position.children).find((child) => child.localName === "posOffset")
      : null;
    if (!offset) return;
    const current = Number.parseInt(offset.textContent || "0", 10);
    offset.textContent = String((Number.isFinite(current) ? current : 0) + shiftEmu);
  };
  shiftPosition("positionH", horizontalShiftEmu);
  shiftPosition("positionV", verticalShiftEmu);
}

function scaleImage(document: XMLDocument, relationshipId: string, scale: number) {
  const drawing = findDrawingByRelationship(document, relationshipId);
  if (!drawing) return;
  const extent = Array.from(drawing.children).find((child) => child.localName === "extent");
  if (extent) {
    ["cx", "cy"].forEach((attribute) => {
      const value = Number.parseInt(extent.getAttribute(attribute) || "0", 10);
      if (Number.isFinite(value) && value > 0)
        extent.setAttribute(attribute, String(Math.round(value * scale)));
    });
  }
  Array.from(drawing.getElementsByTagNameNS(DRAWING_NS, "ext")).forEach((innerExtent) => {
    ["cx", "cy"].forEach((attribute) => {
      const value = Number.parseInt(innerExtent.getAttribute(attribute) || "0", 10);
      if (Number.isFinite(value) && value > 0) {
        innerExtent.setAttribute(attribute, String(Math.round(value * scale)));
      }
    });
  });
}

function relationshipTarget(xml: string, relationshipId: string): string | null {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const relationships = Array.from(document.getElementsByTagName("Relationship"));
  const relationship = relationships.find((item) => item.getAttribute("Id") === relationshipId);
  return relationship?.getAttribute("Target") || null;
}

function mediaPath(target: string): string {
  const normalized = target.replace(/^\.\//u, "");
  return normalized.startsWith("word/") ? normalized : `word/${normalized}`;
}

export async function buildManpowerSheetDocx({
  reportDate,
  signature,
  data,
}: {
  reportDate: string;
  signature: ManpowerSignature | null;
  data: ManpowerSheetData;
}): Promise<Blob> {
  const zip = await JSZip.loadAsync(await fetchBytes("/manpower/template.docx"));
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error("ไม่พบโครงสร้างเอกสาร Word ต้นแบบ");
  const documentXml = await documentFile.async("string");
  const document = new DOMParser().parseFromString(documentXml, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new Error("อ่านโครงสร้างเอกสาร Word ต้นแบบไม่สำเร็จ");
  }

  const body = document.getElementsByTagNameNS(WORD_NS, "body")[0];
  const tables = body ? directChildren(body, "tbl") : [];
  const summaryTable = tables[0];
  const entriesTable = tables[1];
  if (!body || !summaryTable || !entriesTable) {
    throw new Error("โครงสร้างตารางในเอกสาร Word ต้นแบบไม่ครบ");
  }

  const date = formatThaiDate(reportDate);
  const title = findParagraph(document, "รายงานยอดกำลังพล");
  const unit = findParagraph(document, "กองร้อยที่");
  const dateParagraph = findParagraph(document, "ประจำวัน");
  const dutyParagraph = findParagraph(document, "นายตำรวจเวรตรวจระเบียบ");
  if (title) setParagraphRuns(document, title, [{ text: "รายงานยอดกำลังพล" }]);
  if (unit) setParagraphRuns(document, unit, [{ text: "กองร้อยที่ ๔ ปค.๑ บก.ปค." }], true);
  if (dateParagraph) {
    setParagraphRuns(document, dateParagraph, [
      { text: "ประจำวัน" },
      { text: " " },
      { text: date.weekday, color: RED },
      { text: " " },
      { text: "ที่" },
      { text: " " },
      { text: date.day, color: RED },
      { text: " " },
      { text: "เดือน" },
      { text: " " },
      { text: date.month, color: RED },
      { text: " พ.ศ. " },
      { text: date.year, color: RED },
      { text: " เวลา " },
      { text: toThaiDigits(data.reportTime), color: RED },
      { text: " น." },
    ]);
  }
  if (dutyParagraph) {
    setParagraphRuns(document, dutyParagraph, [
      { text: "นายตำรวจเวรตรวจระเบียบ" },
      { text: " " },
      { text: data.dutyOfficerName || "-", color: RED },
      { text: " โทร." },
      { text: toThaiDigits(data.dutyOfficerPhone || "-"), color: RED },
    ]);
  }

  const { counts, total, filledEntries } = summarizeManpowerEntries(data.entries);
  const remaining = Math.max(0, data.fullStrength - total);
  const summaryRows = directChildren(summaryTable, "tr");
  if (summaryRows.length >= 4) {
    const titleCell = directChildren(summaryRows[0], "tc")[0];
    if (titleCell) setCellText(document, titleCell, "สถานภาพกำลังพล");
    ["กำลังพล", "ยอดเต็ม", "รายการจำหน่าย", "คงเหลือ"].forEach((value, index) => {
      const cell = directChildren(summaryRows[1], "tc")[index];
      if (cell) setCellText(document, cell, value);
    });
    ["ราชการ", "ลา", "ป่วย", "ขาด", "อื่นๆ", "รวม"].forEach((value, index) => {
      const cell = directChildren(summaryRows[2], "tc")[index + 2];
      if (cell) setCellText(document, cell, value);
    });
    [
      data.fullStrength,
      counts.official || "-",
      counts.leave || "-",
      counts.sick || "-",
      counts.absent || "-",
      counts.other || "-",
      total || "-",
      remaining,
    ].forEach((value, index) => {
      const cell = directChildren(summaryRows[3], "tc")[index + 1];
      if (cell) setCellText(document, cell, toThaiDigits(value));
    });
  }

  const entryRows = directChildren(entriesTable, "tr");
  const templateEntryRow = entryRows[2];
  if (!templateEntryRow) throw new Error("ไม่พบแถวรายการในเอกสาร Word ต้นแบบ");
  entryRows.slice(2).forEach((row) => row.parentNode?.removeChild(row));
  const rowsToWrite = filledEntries.length > 0 ? filledEntries : [null];
  rowsToWrite.forEach((entry, index) => {
    const row = templateEntryRow.cloneNode(true) as Element;
    const values = entry
      ? [
          `${toThaiDigits(index + 1)}.`,
          toThaiDigits(entry.name || "-"),
          toThaiDigits(entry.squadNumber || "-"),
          MANPOWER_CATEGORY_LABELS[entry.category],
          toThaiDigits(entry.detail || "-"),
          toThaiDigits(getManpowerEntryPeriod(entry) || "-"),
          toThaiDigits(entry.note || "-"),
        ]
      : ["๑.", "", "", MANPOWER_CATEGORY_LABELS.sick, "", "", ""];
    setEntryRow(document, row, values);
    entriesTable.appendChild(row);
  });

  replaceTextInDocument(document, "ภูริจักษ์ มาโชติ", toThaiDigits(data.reporterName || "-"));
  replaceTextInDocument(document, "พรรณพงศ์ จีนโน", toThaiDigits(signature?.officerName || "-"));
  const reporterLabel = findParagraph(document, "ลงชื่อ นรต.");
  if (reporterLabel) {
    setParagraphPhrase(
      reporterLabel,
      "ลงชื่อ นรต.",
      `${WORD_REPORTER_LABEL_LEADING_SPACES}ลงชื่อ นรต.`,
    );
  }
  const reporterPosition = findParagraph(document, "ผู้ช่วย ผบ.มว.ร้อย");
  if (reporterPosition) {
    setParagraphPhrase(
      reporterPosition,
      "ผู้ช่วย ผบ.มว.ร้อย ๔ ปค.๑ บก.ปค.",
      toThaiDigits(data.reporterPosition || "ผู้ช่วย ผบ.มว.ร้อย ๔ ปค.๑ บก.ปค."),
    );
  }

  shiftAnchoredImage(
    document,
    "rId9",
    WORD_ASSISTANT_SIGNATURE_SHIFT_EMU,
    -WORD_ASSISTANT_SIGNATURE_RAISE_EMU,
  );
  if (signature?.id === "apinat" || signature?.id === "panithan") {
    scaleImage(document, "rId11", OFFICER_SIGNATURE_SCALE);
  }

  const relationshipsFile = zip.file("word/_rels/document.xml.rels");
  const relationshipsXml = relationshipsFile ? await relationshipsFile.async("string") : "";
  const officerTarget = relationshipsXml
    ? relationshipTarget(relationshipsXml, "rId11")
    : "media/image4.png";
  if (signature) {
    zip.file(mediaPath(officerTarget || "media/image4.png"), await fetchBytes(signature.imagePath));
  } else {
    removeImageByRelationship(document, "rId11");
  }

  convertDocumentTextToThaiDigits(document);
  zip.file("word/document.xml", new XMLSerializer().serializeToString(document));
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
}
