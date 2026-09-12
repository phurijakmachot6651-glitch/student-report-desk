import { createFileRoute } from "@tanstack/react-router";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "application/octet-stream",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
]);

function plainTextResponse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isSameOriginRequest(request: Request): boolean {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin) return origin === requestOrigin;

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === requestOrigin;
    } catch {
      return false;
    }
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  return fetchSite === "same-origin" || fetchSite === "none";
}

function safeFilename(value: string): string {
  const filename = value
    .replace(/[\r\n\0]/gu, "")
    .replace(/[\\/]/gu, "_")
    .replace(/[";]/gu, "_")
    .trim();
  return filename.slice(0, 180) || "download.bin";
}

function asciiFilename(value: string): string {
  const fallback = value.replace(/[^\x20-\x7e]/gu, "_");
  return fallback || "download.bin";
}

export const Route = createFileRoute("/api/download-file")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isSameOriginRequest(request)) {
          return plainTextResponse("ไม่อนุญาตให้ดาวน์โหลดไฟล์จากเว็บไซต์อื่น", 403);
        }

        const requestLength = Number(request.headers.get("content-length") || 0);
        if (requestLength > MAX_FILE_SIZE + 1024 * 1024) {
          return plainTextResponse("ไฟล์มีขนาดใหญ่เกิน 25 MB", 413);
        }

        let formData: FormData;
        try {
          formData = await request.formData();
        } catch {
          return plainTextResponse("รูปแบบข้อมูลไฟล์ไม่ถูกต้อง", 400);
        }

        const upload = formData.get("file");
        if (!(upload instanceof File)) {
          return plainTextResponse("ไม่พบไฟล์สำหรับดาวน์โหลด", 400);
        }
        if (upload.size === 0) return plainTextResponse("ไฟล์ว่างเปล่า", 400);
        if (upload.size > MAX_FILE_SIZE) {
          return plainTextResponse("ไฟล์มีขนาดใหญ่เกิน 25 MB", 413);
        }

        const contentType = upload.type || "application/octet-stream";
        if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
          return plainTextResponse("ชนิดไฟล์นี้ไม่ได้รับอนุญาต", 415);
        }

        const requestedFilename = formData.get("filename");
        const filename = safeFilename(
          typeof requestedFilename === "string" ? requestedFilename : upload.name,
        );
        const disposition =
          `attachment; filename="${asciiFilename(filename)}"; ` +
          `filename*=UTF-8''${encodeURIComponent(filename)}`;

        return new Response(upload.stream(), {
          status: 200,
          headers: {
            "Cache-Control": "private, no-store",
            "Content-Disposition": disposition,
            "Content-Length": String(upload.size),
            "Content-Type": contentType,
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
