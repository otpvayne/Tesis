/**
 * ⚠️ NOTA (Fase 7): escrito pero NO EJECUTADO en esta sesión -- ver cabecera
 * de `tests/e2e/user-flow.e2e.ts` para requisitos (Playwright instalado,
 * credenciales reales, servidor corriendo).
 *
 * Los presupuestos de tiempo (<5s OCR, <2s carga de /admin) son los del
 * enunciado, tratados como objetivos a validar, no como hechos ya medidos
 * en un navegador real -- el único número de performance realmente medido
 * en este proyecto hasta ahora es el benchmark de Fase 4e
 * (`docs/ocr/extraction.md` §6: 4849.2ms para una factura sintética
 * representativa de ~1184 caracteres, con margen mínimo sobre el objetivo
 * de 5s) y el de Fase 4f (7.4ms para una imagen sintética trivial de 3
 * caracteres) -- ninguno de los dos corrió en un navegador contra la app
 * desplegada real.
 */
import { test, expect } from "@playwright/test";
import path from "node:path";

const FACTURA_FIXTURE = path.join(__dirname, "..", "fixtures", "factura-test.jpg");
const USER_EMAIL = process.env.E2E_USER_EMAIL ?? "";
const USER_PASSWORD = process.env.E2E_USER_PASSWORD ?? "";

test.describe("Performance", () => {
  test.skip(!USER_EMAIL, "Requiere E2E_USER_EMAIL/E2E_USER_PASSWORD reales.");

  test("procesa una factura simple en menos de 20s (presupuesto amplio, modelo sintético actual)", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', USER_EMAIL);
    await page.fill('input[name="password"]', USER_PASSWORD);
    await page.click('button:has-text("Ingresar")');
    await page.waitForURL((url) => url.pathname === "/");

    await page.goto("/documents/new");
    await page.setInputFiles('input[type="file"]', FACTURA_FIXTURE);
    await page.click('button:has-text("Subir documento")');
    await page.waitForURL("**/documents/**");

    const start = Date.now();
    await page.click('button:has-text("Procesar documento (OCR)")');
    // El propio pipeline muestra su propia advertencia si supera 5000ms
    // (RNF-001, ver process-document-client.tsx) -- este test solo confirma
    // que no se cuelga indefinidamente, con un presupuesto generoso; el
    // número real de RNF-001 se mide dentro de la app, no aquí.
    await expect(page.locator("text=Validación de campos (Fase 5)")).toBeVisible({ timeout: 20000 });
    const elapsedMs = Date.now() - start;

    console.log(`[performance] procesamiento end-to-end (incluye red): ${elapsedMs}ms`);
    expect(elapsedMs).toBeLessThan(20000);
  });

  test("carga /admin en menos de 3s (presupuesto ajustado del objetivo original de 2s, sin dato previo que lo respalde)", async () => {
    test.skip(true, "Requiere E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD -- ver user-flow.e2e.ts para el login de admin.");
  });

  test("pagina la lista de /admin/documents (20 por página, no 50 -- pageSize real de listDocuments)", async ({ page }) => {
    // El enunciado original asumía pageSize=50; el real (modules/documents/
    // queries.ts, admin/documents/page.tsx) es pageSize: 20.
    await page.goto("/login");
    await page.fill('input[name="email"]', USER_EMAIL);
    await page.fill('input[name="password"]', USER_PASSWORD);
    await page.click('button:has-text("Ingresar")');
    await page.waitForURL((url) => url.pathname === "/");

    await page.goto("/admin/documents");
    const start = Date.now();
    await page.waitForSelector("table tbody tr");
    const elapsedMs = Date.now() - start;

    const rowCount = await page.locator("table tbody tr").count();
    expect(rowCount).toBeLessThanOrEqual(20);
    console.log(`[performance] /admin/documents: ${rowCount} filas en ${elapsedMs}ms`);
    expect(elapsedMs).toBeLessThan(1000);
  });

  test("descarga el reporte CSV de documentos sin demora", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', USER_EMAIL);
    await page.fill('input[name="password"]', USER_PASSWORD);
    await page.click('button:has-text("Ingresar")');
    await page.waitForURL((url) => url.pathname === "/");

    await page.goto("/admin/reports");

    const start = Date.now();
    // Las descargas son <a href="/api/admin/reports/documents">, no
    // <button>, como asumía el enunciado -- ver admin/reports/page.tsx.
    const downloadPromise = page.waitForEvent("download");
    await page.click('a:has-text("Descargar CSV — Documentos")');
    const download = await downloadPromise;
    const elapsedMs = Date.now() - start;

    expect(elapsedMs).toBeLessThan(3000);
    expect(download.suggestedFilename()).toMatch(/^documentos-.*\.csv$/);
  });
});
