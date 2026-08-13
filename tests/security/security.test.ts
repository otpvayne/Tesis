/**
 * ⚠️ NOTA (Fase 7): escrito pero NO EJECUTADO en esta sesión -- ver cabecera
 * de `tests/e2e/user-flow.e2e.ts` para requisitos.
 *
 * La seguridad real de este proyecto no depende de estos tests de
 * navegador (`CLAUDE.md` §6): RLS en Postgres es la barrera real, ya
 * verificada con sesiones reales (no `service_role`) contra la base real
 * en `tests/integration/{rls-isolation,storage-isolation,
 * document-validations-rls,admin-only-tables-rls,admin-reports}.test.ts`
 * -- esos SÍ corrieron en esta sesión y están en verde. Estos tests de
 * Playwright verifican la capa de UI/UX sobre esa seguridad (mensajes de
 * error, redirecciones), no la sustituyen.
 */
import { test, expect } from "@playwright/test";
import path from "node:path";

const USER_EMAIL = process.env.E2E_USER_EMAIL ?? "";
const USER_PASSWORD = process.env.E2E_USER_PASSWORD ?? "";
const OTHER_USER_EMAIL = process.env.E2E_OTHER_USER_EMAIL ?? "";
const OTHER_USER_PASSWORD = process.env.E2E_OTHER_USER_PASSWORD ?? "";
const LARGE_FILE_FIXTURE = path.join(__dirname, "..", "fixtures", "large-file-11mb.bin");

test.describe("Seguridad", () => {
  test("rechaza login con credenciales inválidas", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "wrong@example.com");
    await page.fill('input[name="password"]', "wrong-password-xyz");
    await page.click('button:has-text("Ingresar")');

    // signIn() devuelve error.message tal cual lo da Supabase Auth (inglés
    // por defecto, ej. "Invalid login credentials") -- no un texto en
    // español custom como asumía el enunciado. Se verifica que aparece
    // *algún* error, sin asumir el texto exacto (puede cambiar con la
    // versión de Supabase).
    await expect(page.locator('[role="alert"]')).toBeVisible();
    expect(page.url()).toContain("/login");
  });

  test("todas las requests son HTTPS (salvo localhost en desarrollo)", async ({ page }) => {
    const insecureRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.startsWith("http://") && !url.includes("localhost") && !url.includes("127.0.0.1")) {
        insecureRequests.push(url);
      }
    });

    await page.goto("/login");
    expect(insecureRequests).toEqual([]);
  });

  test("no permite acceder al documento de otro usuario por URL directa", async ({ page, context }) => {
    test.skip(!USER_EMAIL || !OTHER_USER_EMAIL, "Requiere E2E_USER_EMAIL y E2E_OTHER_USER_EMAIL -- dos cuentas reales distintas.");

    await page.goto("/login");
    await page.fill('input[name="email"]', USER_EMAIL);
    await page.fill('input[name="password"]', USER_PASSWORD);
    await page.click('button:has-text("Ingresar")');
    await page.waitForURL((url) => url.pathname === "/");

    await page.goto("/documents");
    const firstDocLink = page.locator('a[href^="/documents/"]').first();
    const href = await firstDocLink.getAttribute("href");
    const documentPath = href?.split("?")[0] ?? null;
    test.skip(!documentPath, "El usuario de prueba no tiene ningún documento todavía.");

    // Nueva sesión limpia (logout real) para el segundo usuario.
    await context.clearCookies();
    await page.goto("/login");
    await page.fill('input[name="email"]', OTHER_USER_EMAIL);
    await page.fill('input[name="password"]', OTHER_USER_PASSWORD);
    await page.click('button:has-text("Ingresar")');
    await page.waitForURL((url) => url.pathname === "/");

    const response = await page.goto(documentPath!);
    // getDocumentById() devuelve null por RLS -> notFound() -> 404 real de
    // Next.js, no una redirección como asumía el enunciado.
    expect(response?.status()).toBe(404);
  });

  test("un input de búsqueda con caracteres especiales no rompe /admin/documents", async ({ page }) => {
    test.skip(!USER_EMAIL, "Requiere una sesión ADMIN real -- ver user-flow.e2e.ts.");
    await page.goto("/admin/documents");

    // Placeholder real: "ID exacto (UUID completo)...", no "Buscar..." como
    // asumía el enunciado. Nota arquitectónica: esto no es una prueba real
    // de SQL injection -- Supabase-js/PostgREST parametrizan todas las
    // queries, no hay concatenación de SQL crudo en ningún punto de este
    // proyecto (ver modules/documents/queries.ts). Es un smoke test de que
    // un input "raro" no rompe el render.
    const searchInput = page.locator('input[placeholder="ID exacto (UUID completo)..."]');
    await searchInput.fill("'; DROP TABLE documents; --");
    await searchInput.press("Enter");

    await expect(page.locator("table, text=No hay documentos")).toBeVisible();
  });

  test("rechaza un archivo más grande que MAX_UPLOAD_BYTES (10MB)", async ({ page }) => {
    test.skip(!USER_EMAIL, "Requiere E2E_USER_EMAIL real, y generar tests/fixtures/large-file-11mb.bin (>10MB) localmente -- no se comitea un binario de 11MB al repo.");

    await page.goto("/login");
    await page.fill('input[name="email"]', USER_EMAIL);
    await page.fill('input[name="password"]', USER_PASSWORD);
    await page.click('button:has-text("Ingresar")');
    await page.waitForURL((url) => url.pathname === "/");

    await page.goto("/documents/new");
    await page.setInputFiles('input[type="file"]', LARGE_FILE_FIXTURE);
    await page.click('button:has-text("Subir documento")');

    // Mensaje real (modules/documents/validation.ts, FILE_TOO_LARGE), no
    // "Archivo muy grande" como asumía el enunciado.
    await expect(page.locator('[role="alert"]')).toContainText("supera el tamaño máximo permitido");
  });
});
