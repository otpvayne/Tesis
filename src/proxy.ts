import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { requireEnv } from "@/lib/utils/env";

/**
 * Next.js 16 renombró `middleware.ts` a `proxy.ts` (mismo mecanismo,
 * `export function proxy` en vez de `export function middleware`) — ver
 * `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`.
 *
 * Chequeo **optimista** únicamente: ¿hay una sesión de Supabase válida?
 * Redirige a `/login` si no la hay para cualquier ruta bajo `/admin`. NO
 * verifica el rol ADMIN aquí — la guía oficial de autenticación de Next
 * (`02-guides/authentication.md`, sección "Optimistic checks with Proxy")
 * advierte explícitamente evitar consultas a la base de datos en Proxy,
 * porque corre en cada request, incluyendo rutas prefetched. La
 * verificación real de `profiles.role === 'ADMIN'` sigue en cada página
 * bajo `/admin` (ya así en `/admin/documents` y `/admin/validation-dashboard`
 * desde Fase 2/5) + RLS en Postgres (`is_admin()`) — nunca solo aquí
 * (`CLAUDE.md` §6: la seguridad no depende del frontend).
 *
 * De paso, refresca el token de sesión en cada request (mismo propósito
 * que ya documentaba `src/app/(dashboard)/layout.tsx` sobre "el
 * middleware ya se encarga de refrescar la sesión" — ese archivo nunca
 * había existido hasta ahora; se crea en esta fase).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (request.nextUrl.pathname.startsWith("/admin") && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
