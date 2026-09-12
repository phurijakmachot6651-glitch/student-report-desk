import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdminAuthErrorMessage, isAdminRegistrationConfigurationError } from "@/lib/admin-auth";

const ADMIN_SECRET_KEY = "admin_register_secret_hash";

function throwAdminConfigurationError(error: unknown): never {
  if (isAdminRegistrationConfigurationError(error)) {
    throw new Error(
      "ระบบสมัครแอดมินยังตั้งค่าไม่ครบ: กรุณาตั้งค่า SUPABASE_SECRET_KEY หรือ SUPABASE_SERVICE_ROLE_KEY ของโปรเจกต์เดียวกับ SUPABASE_URL แล้วรีสตาร์ตเซิร์ฟเวอร์",
    );
  }
  throw error instanceof Error
    ? error
    : new Error(getAdminAuthErrorMessage(error) || "สมัครไม่สำเร็จ");
}

async function hashSecret(secret: string) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(secret.trim(), "utf8").digest("hex");
}

async function constantTimeEqual(a: string, b: string) {
  const { timingSafeEqual } = await import("node:crypto");
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}

async function getConfiguredSecretHash() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", ADMIN_SECRET_KEY)
    .maybeSingle();
  if (error) throw error;
  return data?.value || (await hashSecret(process.env.ADMIN_REGISTER_SECRET || "0000"));
}

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Unauthorized");
}

export const registerAdmin = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().trim().toLowerCase().email(),
      password: z.string().min(6),
      secretCode: z.string().trim().min(1),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const configuredHash = await getConfiguredSecretHash();
      if (!configuredHash) throw new Error("Admin registration secret is not configured.");

      const submittedHash = await hashSecret(data.secretCode);
      if (!(await constantTimeEqual(submittedHash, configuredHash))) {
        throw new Error("Invalid admin registration secret.");
      }

      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
      });
      if (createError) throw createError;
      if (!created.user) throw new Error("User was not created.");

      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: created.user.id, role: "admin" }, { onConflict: "user_id,role" });
      if (roleError) {
        const { error: cleanupError } = await supabaseAdmin.auth.admin.deleteUser(created.user.id);
        if (cleanupError) {
          console.error("Failed to remove user after admin role assignment failed", cleanupError);
        }
        throw roleError;
      }

      return { ok: true };
    } catch (error) {
      throwAdminConfigurationError(error);
    }
  });

export const updateAdminRegisterSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      newSecretCode: z.string().min(4),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(context.userId);

    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert(
        { key: ADMIN_SECRET_KEY, value: await hashSecret(data.newSecretCode) },
        { onConflict: "key" },
      );
    if (error) throw error;

    return { ok: true };
  });
