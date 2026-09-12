import JSZip from "jszip";

const normalizeExtractedText = (value: string) =>
  value
    .replace(/\r\n?/gu, "\n")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();

async function extractDocxText(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error("ไม่พบเนื้อหาในไฟล์ Word");
  const xml = await documentFile.async("string");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const paragraphs = Array.from(
    document.getElementsByTagNameNS(
      "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
      "p",
    ),
  );
  return normalizeExtractedText(
    paragraphs
      .map((paragraph) =>
        Array.from(
          paragraph.getElementsByTagNameNS(
            "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
            "t",
          ),
        )
          .map((node) => node.textContent || "")
          .join(""),
      )
      .filter(Boolean)
      .join("\n"),
  );
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    useWasm: false,
  });
  try {
    const pdf = await loadingTask.promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .filter(Boolean)
          .join(" "),
      );
      page.cleanup();
    }
    return normalizeExtractedText(pages.join("\n"));
  } finally {
    await loadingTask.destroy();
  }
}

async function extractImageText(file: File): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("tha+eng");
  try {
    const result = await worker.recognize(file);
    return normalizeExtractedText(result.data.text);
  } finally {
    await worker.terminate();
  }
}

/** Extract editable text from every format accepted by the unified import field. */
export async function extractManpowerImportText(file: File): Promise<string> {
  const extension = file.name.split(".").pop()?.toLocaleLowerCase() || "";
  if (extension === "docx") return extractDocxText(file);
  if (extension === "pdf" || file.type === "application/pdf") return extractPdfText(file);
  if (file.type.startsWith("image/")) return extractImageText(file);
  if (
    file.type.startsWith("text/") ||
    ["txt", "csv", "json", "md", "log", "xml", "html"].includes(extension)
  ) {
    return normalizeExtractedText(await file.text());
  }
  const fallbackText = await file.text();
  const replacementCount = Array.from(fallbackText).filter(
    (character) => character.charCodeAt(0) === 0 || character === "�",
  ).length;
  if (fallbackText.trim() && replacementCount / fallbackText.length < 0.01) {
    return normalizeExtractedText(fallbackText);
  }
  throw new Error(`ไม่สามารถอ่านข้อความจากไฟล์ ${file.name} ได้`);
}
