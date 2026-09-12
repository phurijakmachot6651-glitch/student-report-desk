export type DownloadPreparation = {
  isEmbeddedBrowser: boolean;
  isMobile: boolean;
};

function browserUserAgent(): string {
  return typeof navigator === "undefined" ? "" : navigator.userAgent;
}

function isEmbeddedBrowser(): boolean {
  return /FBAN|FBAV|Instagram|Line|LINE|; wv\)|WebView|MicroMessenger|GSA\//iu.test(
    browserUserAgent(),
  );
}

function isMobileDevice(): boolean {
  const isDesktopModeIpad =
    typeof navigator !== "undefined" &&
    /Macintosh|MacIntel/iu.test(`${navigator.userAgent} ${navigator.platform}`) &&
    navigator.maxTouchPoints > 1;
  return /Android|iPhone|iPad|iPod|Mobile/iu.test(browserUserAgent()) || isDesktopModeIpad;
}

/** Capture device capabilities while the export button still has user activation. */
export function prepareBlobDownload(): DownloadPreparation {
  return { isEmbeddedBrowser: isEmbeddedBrowser(), isMobile: isMobileDevice() };
}

function createDownloadAnchor(url: string, filename: string): HTMLAnchorElement {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  return anchor;
}

function canShareFile(file: File | null): file is File {
  if (
    !file ||
    typeof navigator === "undefined" ||
    typeof navigator.share !== "function" ||
    typeof navigator.canShare !== "function"
  ) {
    return false;
  }
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

function removeExistingMobileHandoff() {
  document.querySelector("[data-file-handoff]")?.remove();
}

/**
 * Submit the generated file as a regular same-origin form. The server echoes
 * it with Content-Disposition: attachment, which works in Android WebViews
 * that reject blob: URL downloads.
 */
function submitHttpAttachment(file: File | null, filename: string): boolean {
  if (!file || typeof DataTransfer !== "function") return false;

  try {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/download-file";
    form.enctype = "multipart/form-data";
    form.target = "_blank";
    form.style.display = "none";

    const filenameInput = document.createElement("input");
    filenameInput.type = "hidden";
    filenameInput.name = "filename";
    filenameInput.value = filename;

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.name = "file";
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInput.files = transfer.files;
    if (!fileInput.files?.length) return false;

    form.append(filenameInput, fileInput);
    document.body.appendChild(form);
    form.requestSubmit();
    window.setTimeout(() => form.remove(), 60_000);
    return true;
  } catch {
    return false;
  }
}

function openInChrome(): void {
  const { host, pathname, search, protocol } = window.location;
  if (/Android/iu.test(browserUserAgent())) {
    const scheme = protocol.replace(":", "");
    window.location.href =
      `intent://${host}${pathname}${search}` +
      `#Intent;scheme=${scheme};package=com.android.chrome;action=android.intent.action.VIEW;end`;
    return;
  }

  window.open(window.location.href, "_blank", "noopener,noreferrer");
}

/**
 * Show a second, real user gesture after async generation. Mobile browsers
 * often reject share/download calls once the original click activation has
 * expired; this handoff keeps saving reliable without navigating to a blob URL.
 */
function showMobileFileHandoff(
  file: File | null,
  filename: string,
  url: string,
  preparation: DownloadPreparation,
) {
  removeExistingMobileHandoff();
  const panel = document.createElement("section");
  panel.dataset.fileHandoff = "true";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "ไฟล์พร้อมดาวน์โหลด");
  Object.assign(panel.style, {
    position: "fixed",
    inset: "auto 12px 12px 12px",
    zIndex: "2147483647",
    maxWidth: "520px",
    margin: "0 auto",
    padding: "14px",
    border: "1px solid #cbd5e1",
    borderRadius: "14px",
    background: "#ffffff",
    color: "#0f172a",
    boxShadow: "0 18px 50px rgba(15, 23, 42, .28)",
    fontFamily: "system-ui, sans-serif",
  });

  const title = document.createElement("strong");
  title.textContent = "สร้างไฟล์เรียบร้อยแล้ว";
  title.style.display = "block";
  title.style.fontSize = "16px";
  const detail = document.createElement("div");
  detail.textContent = filename;
  Object.assign(detail.style, { marginTop: "3px", fontSize: "13px", overflowWrap: "anywhere" });
  const hint = document.createElement("div");
  hint.textContent = "แตะปุ่มด้านล่างเพื่อบันทึกลงโทรศัพท์";
  Object.assign(hint.style, { marginTop: "4px", fontSize: "12px", color: "#475569" });
  const actions = document.createElement("div");
  Object.assign(actions.style, {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    marginTop: "12px",
  });

  const primary = document.createElement("button");
  primary.type = "button";
  primary.textContent = canShareFile(file) ? "บันทึก / แชร์ไฟล์" : "ดาวน์โหลดไฟล์";
  Object.assign(primary.style, {
    flex: "1",
    minHeight: "44px",
    border: "0",
    borderRadius: "10px",
    background: "#0f766e",
    color: "#ffffff",
    fontWeight: "700",
  });
  primary.addEventListener("click", async () => {
    if (canShareFile(file)) {
      try {
        await navigator.share({ title: filename, files: [file] });
        panel.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    if (submitHttpAttachment(file, filename)) {
      hint.textContent = "กำลังส่งไฟล์ไปยังระบบดาวน์โหลดของโทรศัพท์...";
      return;
    }
    const anchor = createDownloadAnchor(url, filename);
    panel.appendChild(anchor);
    anchor.click();
    anchor.remove();
  });

  const openChrome = document.createElement("button");
  openChrome.type = "button";
  openChrome.textContent = /Android/iu.test(browserUserAgent())
    ? "เปิดใน Chrome"
    : "เปิดในเบราว์เซอร์";
  Object.assign(openChrome.style, {
    flexBasis: "100%",
    minHeight: "44px",
    border: "1px solid #0f766e",
    borderRadius: "10px",
    background: "#f0fdfa",
    color: "#0f766e",
    fontWeight: "700",
  });
  openChrome.addEventListener("click", openInChrome);

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "ปิด";
  Object.assign(close.style, {
    minWidth: "72px",
    minHeight: "44px",
    border: "1px solid #cbd5e1",
    borderRadius: "10px",
    background: "#ffffff",
    color: "#0f172a",
  });
  close.addEventListener("click", () => {
    panel.remove();
    URL.revokeObjectURL(url);
  });

  actions.append(primary, close);
  if (preparation.isEmbeddedBrowser) actions.append(openChrome);
  panel.append(title, detail, hint, actions);
  document.body.appendChild(panel);
}

export type DownloadOutcome = "downloaded" | "ready";

/** Save a generated Blob with a mobile-safe, user-activated handoff. */
export async function downloadBlob(
  blob: Blob,
  filename: string,
  preparation: DownloadPreparation = { isEmbeddedBrowser: false, isMobile: false },
): Promise<DownloadOutcome> {
  const file =
    typeof File === "function"
      ? new File([blob], filename, { type: blob.type || "application/octet-stream" })
      : null;
  const url = URL.createObjectURL(blob);

  if (preparation.isMobile || preparation.isEmbeddedBrowser) {
    showMobileFileHandoff(file, filename, url, preparation);
    return "ready";
  }

  const anchor = createDownloadAnchor(url, filename);
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "downloaded";
}
