/**
 * ⚠️ NOTA (Fase 7): escrito pero NO EJECUTADO en esta sesión -- ver cabecera
 * de `tests/e2e/user-flow.e2e.ts` para requisitos.
 */
import { test, expect } from "@playwright/test";
import path from "node:path";

const FACTURA_FIXTURE = path.join(__dirname, "..", "fixtures", "factura-test.jpg");
const USER_EMAIL = process.env.E2E_USER_EMAIL ?? "";
const USER_PASSWORD = process.env.E2E_USER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
/** Debe apuntar a un documento real ya procesado y validado en el proyecto de prueba -- no hay forma honesta de "asumir" un id fijo como hacía el enunciado (`doc-test-123` no existe). */
const KNOWN_DOCUMENT_ID = process.env.E2E_KNOWN_DOCUMENT_ID ?? "";

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button:has-text("Ingresar")');
  await page.waitForURL((url) => url.pathname === "/");
}

test.describe("Regresión", () => {
  test.skip(!USER_EMAIL, "Requiere E2E_USER_EMAIL/E2E_USER_PASSWORD reales.");

  test("upload de documento sigue funcionando", async ({ page }) => {
    await login(page, USER_EMAIL, USER_PASSWORD);
    await page.goto("/documents/new");

    await page.setInputFiles('input[type="file"]', FACTURA_FIXTURE);
    // Botón real: "Subir documento" (el enunciado asumía "Subir").
    await page.click('button:has-text("Subir documento")');

    await page.waitForURL("**/documents/**");
    expect(page.url()).toMatch(/\/documents\/[0-9a-f-]+/);
  });

  test("la tabla de validación sigue mostrando los 6 campos de RF-003", async ({ page }) => {
    test.skip(!KNOWN_DOCUMENT_ID, "Requiere E2E_KNOWN_DOCUMENT_ID -- un documento ya procesado real, no un id inventado.");
    await login(page, USER_EMAIL, USER_PASSWORD);
    await page.goto(`/documents/${KNOWN_DOCUMENT_ID}`);

    // "Proveedor" es la primera fila real de la tabla, no un <table
    // has-text> genérico como armaba el enunciado.
    await expect(page.locator("text=Proveedor")).toBeVisible();
    await expect(page.locator('button:has-text("Guardar validación")')).toBeVisible();
    await expect(page.locator('button:has-text("Rechazar documento")')).toBeVisible();
  });

  test("el dashboard admin sigue mostrando sus componentes principales", async ({ page }) => {
    test.skip(!ADMIN_EMAIL, "Requiere E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD reales.");
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin");

    await expect(page.locator('h1:has-text("Dashboard Admin")')).toBeVisible();
    await expect(page.locator("text=Documentos").first()).toBeVisible();
    await expect(page.locator("text=Validados").first()).toBeVisible();
    // "Confidence OCR promedio", no "Accuracy OCR" -- renombrado a
    // propósito en Fase 6 (confidence del pipeline ≠ accuracy medida
    // contra ground truth, ver docs/ocr/evaluation.md).
    await expect(page.locator("text=Confidence OCR promedio")).toBeVisible();
  });

  test("las 4 sub-vistas de /admin siguen accesibles para un ADMIN", async ({ page }) => {
    test.skip(!ADMIN_EMAIL, "Requiere E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD reales.");
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    for (const routePath of ["/admin/documents", "/admin/validations", "/admin/models", "/admin/reports"]) {
      const response = await page.goto(routePath);
      expect(response?.status()).toBeLessThan(400);
    }
  });
});
