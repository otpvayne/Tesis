import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Vitest no carga .env.local automáticamente como Next.js. Los tests de
 * integración corren contra el proyecto Supabase real (sin stack local
 * Docker disponible), así que necesitan las mismas variables que la app.
 */
const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (existsSync(envLocalPath)) {
  process.loadEnvFile(envLocalPath);
}
