/**
 * ⚠️ NOTA (Fase 7): escrito pero NO EJECUTADO en esta sesión. `CLAUDE.md`
 * §11 prohíbe correr un servidor o usar herramientas de navegador en esta
 * sesión de Claude Code -- Playwright es exactamente eso. Requiere que el
 * equipo:
 *   1. `npx playwright install chromium` (descarga el navegador).
 *   2. Cree dos cuentas reales de prueba en el proyecto Supabase real
 *      (una USER, una ADMIN vía `update profiles set role='ADMIN'`) y las
 *      exponga como `E2E_USER_EMAIL`/`E2E_USER_PASSWORD`/`E2E_ADMIN_EMAIL`/
 *      `E2E_ADMIN_PASSWORD` -- nunca credenciales hardcodeadas ni reales de
 *      Mansor en el repo.
 *   3. Active un modelo OCR en `/ocr-lab/train` o `npm run generate:model`
 *      (si no, "Procesar documento" da 404 -- ver `CLAUDE.md` §13).
 *   4. Corra `npm run dev` (u otro servidor) y `E2E_BASE_URL=... npx
 *      playwright test tests/e2e` (ver `playwright.config.ts`).
 *
 * Todas las rutas/textos de abajo están verificados contra el código real
 * de Fases 2-6 (no contra el enunciado del prompt) -- diferencias notadas
 * inline donde el enunciado original asumía algo distinto.
 */
import { test, expect } from "@playwright/test";
import path from "node:path";

const FACTURA_FIXTURE = path.join(__dirname, "..", "fixtures", "factura-test.jpg");
const INVALID_FIXTURE = path.join(__dirname, "..", "fixtures", "invalid.txt");

const USER_EMAIL = process.env.E2E_USER_EMAIL ?? "";
const USER_PASSWORD = process.env.E2E_USER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  // Texto real del botón es "Ingresar", no "Iniciar sesión" (ese es el <h1>).
  await page.click('button:has-text("Ingresar")');
  // signIn() redirige a "/" (página de bienvenida), no a "/documents".
  await page.waitForURL((url) => url.pathname === "/");
}

test.describe("E2E — Flujo de usuario completo", () => {
  test.skip(!USER_EMAIL, "Requiere E2E_USER_EMAIL/E2E_USER_PASSWORD reales -- ver nota de cabecera.");

  test("procesa una factura de principio a fin: subir → OCR → validar → guardar", async ({ page }) => {
    await login(page, USER_EMAIL, USER_PASSWORD);

    // "/" tiene un <Link> "Nuevo documento" (<a>, no <button>).
    await page.click('a:has-text("Nuevo documento")');
    await page.waitForURL("**/documents/new");

    // Sin preview de imagen (no existe img[alt="Preview"] en el código real) --
    // solo se muestra el nombre del archivo en texto.
    await page.setInputFiles('input[type="file"]', FACTURA_FIXTURE);
    await expect(page.locator("text=factura-test.jpg")).toBeVisible();

    // Botón real: "Subir documento", no "Subir".
    await page.click('button:has-text("Subir documento")');
    await page.waitForURL("**/documents/**");

    // Botón real: "Procesar documento (OCR)".
    await page.click('button:has-text("Procesar documento (OCR)")');

    // "Procesando (puede tardar varios segundos)..." mientras corre.
    await expect(page.locator("text=Procesando (puede tardar varios segundos)")).toBeVisible();

    // Benchmark real medido (Fase 4e): ~4.85s para una factura representativa
    // de ~1184 caracteres -- este fixture es mucho más simple/corto, pero se
    // deja margen amplio (20s) porque el modelo activo (sintético, Fase 5,
    // 16.1% accuracy) puede segmentar de forma menos predecible que un
    // modelo bien entrenado.
    await expect(page.locator("text=Validación de campos (Fase 5)")).toBeVisible({ timeout: 20000 });

    const table = page.locator("table");
    await expect(table).toBeVisible();
    const rows = table.locator("tbody tr");
    await expect(rows).toHaveCount(6); // Proveedor, NIT, Fecha, IVA, Valor, Total (RF-003)

    // Editar el primer campo (fila de "Proveedor").
    const firstRow = rows.first();
    await firstRow.locator('button:has-text("Editar")').click();
    // El <input> de edición no tiene atributo type="text" explícito en el
    // código real (asi que un selector input[type="text"] no lo encontraría) --
    // se ubica por posición dentro de la fila en edición.
    const editInput = firstRow.locator("input");
    await expect(editInput).toBeVisible();
    await editInput.fill("Valor editado a mano");
    await editInput.press("Enter");

    await expect(firstRow.locator("text=🔧 Editado")).toBeVisible();

    await page.click('button:has-text("Guardar validación")');
    await expect(page.locator("text=Validación guardada")).toBeVisible();

    // Tras guardar, la página se refresca y muestra el resumen de solo lectura.
    await expect(page.locator("text=✅ Documento validado")).toBeVisible();

    // El documento sigue apareciendo en "Mis documentos" -- solo cambia su
    // estado a "Validado", no desaparece (a diferencia de lo que asumía el
    // enunciado original).
    await page.goto("/documents");
    await expect(page.locator("text=Validado").first()).toBeVisible();
  });

  test("maneja un archivo con formato inválido", async ({ page }) => {
    await login(page, USER_EMAIL, USER_PASSWORD);
    await page.goto("/documents/new");

    await page.setInputFiles('input[type="file"]', INVALID_FIXTURE);
    await page.click('button:has-text("Subir documento")');

    // Mensaje real de modules/documents/validation.ts (MIME_NOT_ALLOWED),
    // no "Formato no válido" como asumía el enunciado.
    await expect(page.locator('[role="alert"]')).toContainText("Solo se aceptan imágenes JPG o PNG");
  });
});

test.describe("E2E — Autorización de /admin", () => {
  test.skip(!ADMIN_EMAIL || !USER_EMAIL, "Requiere E2E_ADMIN_EMAIL/E2E_USER_EMAIL reales -- ver nota de cabecera.");

  test("un ADMIN ve el dashboard con datos reales", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin");

    await expect(page.locator("h1:has-text(\"Dashboard Admin\")")).toBeVisible();
    await expect(page.locator("text=Documentos").first()).toBeVisible();
    await expect(page.locator("text=Validados").first()).toBeVisible();
  });

  test("un usuario normal es redirigido fuera de /admin", async ({ page }) => {
    await login(page, USER_EMAIL, USER_PASSWORD);
    await page.goto("/admin");

    // requireAdminPage() redirige a "/" (bienvenida), no a "/documents"
    // como asumía el enunciado -- src/lib/auth/require-admin-page.ts.
    await page.waitForURL((url) => url.pathname === "/");
    expect(page.url()).not.toContain("/admin");
  });
});
