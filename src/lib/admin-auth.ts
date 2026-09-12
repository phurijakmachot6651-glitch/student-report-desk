export const PUBLIC_APP_URL =
  (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.replace(/\/$/, "") ||
  "https://student-report-desk-neon.vercel.app";

export function getPasswordRecoveryRedirectUrl() {
  return `${PUBLIC_APP_URL}/admin/login`;
}

export function hasPasswordRecoveryParams(location: Pick<Location, "hash" | "search">) {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(location.search);

  return (
    hash.get("type") === "recovery" ||
    search.get("type") === "recovery" ||
    hash.has("access_token") ||
    search.has("code")
  );
}

export function getAdminAuthErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause ? getAdminAuthErrorMessage(error.cause) : "";
    return `${error.message} ${cause}`.trim();
  }

  if (typeof error === "string") return error;

  if (error && typeof error === "object") {
    if ("message" in error) {
      const message = getAdminAuthErrorMessage(error.message);
      if (message) return message;
    }

    if ("error" in error) {
      const nested = getAdminAuthErrorMessage(error.error);
      if (nested) return nested;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return "";
    }
  }

  return "";
}

export function isAdminRegistrationConfigurationError(error: unknown) {
  return /SUPABASE_(SECRET_KEY|SERVICE_ROLE_KEY|URL)|Invalid API key|invalid api key/i.test(
    getAdminAuthErrorMessage(error),
  );
}
