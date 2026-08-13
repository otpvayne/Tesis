import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createClient } from "@/lib/supabase/server";

export interface AdminPageContext {
  supabase: SupabaseClient<Database>;
  userId: string;
}

/**
 * Defensa en profundidad para Server Components bajo `/admin/*`: RLS ya
 * restringe qué filas puede leer un USER, pero la página ni siquiera debe
 * renderizarse sin rol ADMIN (mismo criterio ya usado en
 * `/admin/documents` y `/admin/validation-dashboard` desde Fase 2/5,
 * extraído aquí porque Fase 6 agrega varias páginas admin más y
 * repetirlo un tercer/cuarto/quinto/sexto vez ya era duplicación real).
 * `src/proxy.ts` hace un chequeo optimista de sesión antes de esto (sin
 * consultar `profiles`, ver su propio comentario) — esta función es la
 * verificación real de rol.
 */
export async function requireAdminPage(): Promise<AdminPageContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "ADMIN") redirect("/");

  return { supabase, userId: user.id };
}

/**
 * Igual verificación que `requireAdminPage`, pero para Route Handlers
 * (`/api/admin/reports/*`) -- ahí no tiene sentido `redirect()` (es una
 * descarga, no una página), así que devuelve `null` en vez de lanzar/
 * redirigir; el caller responde `401`/`403` explícito.
 */
export async function requireAdminApi(): Promise<AdminPageContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "ADMIN") return null;

  return { supabase, userId: user.id };
}
