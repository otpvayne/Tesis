import { defineConfig, devices } from "@playwright/test";

/**
 * ⚠️ Fase 7: estos tests NO se ejecutaron en esta sesión (`CLAUDE.md` §11
 * prohíbe correr un servidor o usar herramientas de navegador/automatización
 * visual aquí). Este archivo es la configuración que el equipo necesita para
 * correrlos ellos mismos: `npx playwright install` (descarga los navegadores,
 * tampoco hecho en esta sesión) + `npx playwright test`.
 *
 * `baseURL` sale de `E2E_BASE_URL` -- por defecto apunta a un servidor local
 * (`npm run dev` en otra terminal), no a producción. Para correr contra el
 * deploy real de Vercel: `E2E_BASE_URL=https://<deploy-real>.vercel.app npx
 * playwright test`.
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: ["e2e/**/*.e2e.ts", "performance/**/*.test.ts", "security/**/*.test.ts", "regression/**/*.test.ts"],
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
