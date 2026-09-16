import "./env";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { requireEnv } from "@/lib/utils/env";

function supabaseUrl(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

function anonKey(): string {
  return requireEnv(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

function serviceRoleKey(): string {
  return requireEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Cliente service_role: bypassa RLS, usado solo para setup/teardown/aserciones de control. */
export function createTestAdminClient() {
  return createSupabaseJsClient<Database>(supabaseUrl(), serviceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Cliente anon sin sesión: hay que autenticarlo con signInWithPassword antes de usarlo. */
export function createTestAnonClient() {
  return createSupabaseJsClient<Database>(supabaseUrl(), anonKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Limpieza de usuarios de prueba usada por el `afterAll` de todos los tests
 * de integración. `admin.auth.admin.deleteUser` por sí solo no basta:
 * `audit_logs.actor_id` referencia `profiles(id)` sin `on delete cascade`
 * (ver `20260811200947_create_audit_logs.sql`), así que si el usuario tiene
 * una fila de auditoría la operación falla -- y como ningún test revisaba
 * el error, quedaba usuario/perfil/documentos huérfanos para siempre. Se
 * detectó así el origen real de la contaminación de `document_validations`
 * documentada en `CLAUDE.md` §13 (2026-09-15): los fixtures de
 * `document-validations-rls.test.ts` y `admin-reports.test.ts` nunca se
 * borraban cuando esto pasaba. Por eso esta función borra explícitamente
 * `audit_logs` y `documents` (que cascada a `document_validations`,
 * `document_pages` y `ocr_results`) antes de borrar el usuario, y revienta
 * si algún paso falla en vez de tragarse el error en silencio.
 */
export async function cleanupTestUsers(
  admin: ReturnType<typeof createTestAdminClient>,
  userIds: (string | undefined)[],
): Promise<void> {
  const ids = userIds.filter((id): id is string => Boolean(id));
  if (ids.length === 0) return;

  const { error: auditErr } = await admin.from("audit_logs").delete().in("actor_id", ids);
  if (auditErr) throw auditErr;

  const { error: docsErr } = await admin.from("documents").delete().in("owner_id", ids);
  if (docsErr) throw docsErr;

  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  }
}
