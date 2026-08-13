import { requireAdminPage } from "@/lib/auth/require-admin-page";
import { PageHero } from "@/components/common/PageHero";

const DOWNLOAD_LINK_CLASS =
  "rounded-lg border border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-700 transition-colors hover:border-brand-400 hover:bg-brand-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:border-brand-700 dark:hover:bg-brand-950/30";

/** Descargas directas via `<a href>` -- el Route Handler responde con `Content-Disposition: attachment`, el navegador dispara la descarga nativa, sin JS de cliente ni Blob/createObjectURL. */
export default async function AdminReportsPage() {
  await requireAdminPage();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHero
        title="Reportes"
        description="Descarga los datos del sistema en CSV o JSON para análisis externo — todo se genera al momento, sin caché."
        bullets={[
          "CSV de documentos: ID, tipo, status, accuracy y validación de cada uno",
          "CSV de validaciones: los 6 campos, valor OCR vs. valor validado",
          "JSON de estadísticas: el mismo resumen que ves en el dashboard admin",
        ]}
        tip="Cada descarga refleja la base de datos en el momento exacto en que la pides — si algo cambia después, hay que descargar de nuevo."
      />

      <div className="flex flex-col gap-2">
        <a href="/api/admin/reports/documents" className={DOWNLOAD_LINK_CLASS}>
          Descargar CSV — Documentos (ID, tipo, status, accuracy, validación)
        </a>
        <a href="/api/admin/reports/validations" className={DOWNLOAD_LINK_CLASS}>
          Descargar CSV — Validaciones (los 6 campos por documento validado)
        </a>
        <a href="/api/admin/reports/stats" className={DOWNLOAD_LINK_CLASS}>
          Descargar JSON — Estadísticas
        </a>
      </div>
    </div>
  );
}
