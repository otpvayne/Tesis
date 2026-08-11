import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { requireEnv } from "@/lib/utils/env";

/**
 * Cliente con la clave `service_role`: bypassa RLS por completo. Uso
 * restringido a operaciones administrativas explícitas del lado servidor
 * (gestión de modelos OCR, tareas de mantenimiento) — nunca para servir
 * datos a un usuario regular. El import de "server-only" hace que el build
 * falle si este módulo termina en un bundle de cliente.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
