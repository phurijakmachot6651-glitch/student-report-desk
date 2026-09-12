const A4_JPG_WIDTH = 2481;
const A4_JPG_HEIGHT = 3509;
const A4_POINT_WIDTH = 595.28;
const A4_POINT_HEIGHT = 841.89;
const MAX_COMBINED_PIXELS = 24_000_000;
const MAX_CANVAS_SIDE = 32_700;

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("สร้างไฟล์ JPG ไม่สำเร็จ"))),
      "image/jpeg",
      0.97,
    );
  });
}

function deviceRenderScale(): number {
  if (typeof window === "undefined") return A4_JPG_WIDTH / A4_POINT_WIDTH;
  const isDesktopModeIpad =
    /Macintosh|MacIntel/iu.test(`${navigator.userAgent} ${navigator.platform}`) &&
    navigator.maxTouchPoints > 1;
  const isMobile =
    window.matchMedia("(max-width: 768px)").matches ||
    /Android|iPhone|iPad|iPod|Mobile/iu.test(navigator.userAgent) ||
    isDesktopModeIpad;

  // 1920 px remains print-friendly while keeping export reliable on phones.
  return (isMobile ? 1920 : A4_JPG_WIDTH) / A4_POINT_WIDTH;
}

function safeRenderScale(pageCount: number): number {
  const pageArea = A4_POINT_WIDTH * A4_POINT_HEIGHT * pageCount;
  const pixelLimitScale = Math.sqrt(MAX_COMBINED_PIXELS / pageArea);
  const sideLimitScale = MAX_CANVAS_SIDE / (A4_POINT_HEIGHT * pageCount);
  return Math.min(deviceRenderScale(), pixelLimitScale, sideLimitScale);
}

/** Render the generated PDF so JPG and PDF always share one document layout. */
export async function renderManpowerPdfAsJpg(pdfBytes: Uint8Array): Promise<Blob> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  // The generated report embeds its Thai fonts and PNG assets, so it does not
  // need PDF.js's optional CMap, standard-font, or image-codec downloads.
  const loadingTask = pdfjs.getDocument({ data: pdfBytes.slice(), useWasm: false });

  try {
    const pdf = await loadingTask.promise;
    if (pdf.numPages < 1) throw new Error("ไม่พบหน้าเอกสารสำหรับสร้างไฟล์ JPG");
    const scale = safeRenderScale(pdf.numPages);
    const firstPage = await pdf.getPage(1);
    const firstViewport = firstPage.getViewport({ scale });
    const pageWidth = Math.round(firstViewport.width);
    const pageHeight = Math.round(firstViewport.height);
    const combined = document.createElement("canvas");
    combined.width = pageWidth;
    combined.height = pageHeight * pdf.numPages;
    const combinedContext = combined.getContext("2d", { alpha: false });
    if (!combinedContext) throw new Error("อุปกรณ์นี้ไม่รองรับการสร้างไฟล์ JPG");
    combinedContext.fillStyle = "#ffffff";
    combinedContext.fillRect(0, 0, combined.width, combined.height);

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = pageNumber === 1 ? firstPage : await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("อุปกรณ์นี้ไม่รองรับการสร้างไฟล์ JPG");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport, background: "#ffffff" })
        .promise;
      combinedContext.drawImage(canvas, 0, (pageNumber - 1) * pageHeight);
      canvas.width = 1;
      canvas.height = 1;
      page.cleanup();
    }

    if (
      pdf.numPages === 1 &&
      combined.width === A4_JPG_WIDTH &&
      combined.height !== A4_JPG_HEIGHT
    ) {
      throw new Error("ขนาดไฟล์ JPG ไม่ตรงกับกระดาษ A4");
    }
    return await canvasToJpeg(combined);
  } finally {
    await loadingTask.destroy();
  }
}
