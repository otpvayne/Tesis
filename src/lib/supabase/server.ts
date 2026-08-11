import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { requireEnv } from "@/lib/utils/env";

/**
 * Cliente de Supabase para Server Components / Server Actions / Route
 * Handlers. Usa la clave `anon` + las cookies de sesión del usuario: las
 * consultas siguen respetando RLS como el propio usuario autenticado, nunca
 * bypassean seguridad. Para operaciones que sí requieren bypass (admin),
 * usar `lib/supabase/admin.ts` explícitamente.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireEnv(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // En un Server Component (no Server Action/Route Handler) esto
          // lanza porque no se pueden escribir cookies — se ignora a
          // propósito: el middleware ya se encarga de refrescar la sesión
          // en cada request (ver src/middleware.ts).
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // no-op: ver comentario arriba
          }
        },
      },
    },
  );
}
