import { requireAdminPage } from "@/lib/auth/require-admin-page";

/** Descargas directas via `<a href>` -- el Route Handler responde con `Content-Disposition: attachment`, el navegador dispara la descarga nativa, sin JS de cliente ni Blob/createObjectURL. */
export default async function AdminReportsPage() {
  await requireAdminPage();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Reportes</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">Todos los reportes se generan al momento, con datos reales de la base -- no hay caché.</p>

      <div className="flex flex-col gap-2">
        <a
          href="/api/admin/reports/documents"
          className="rounded-md border border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
        >
          Descargar CSV — Documentos (ID, tipo, status, accuracy, validación)
        </a>
        <a
          href="/api/admin/reports/validations"
          className="rounded-md border border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
        >
          Descargar CSV — Validaciones (los 6 campos por documento validado)
        </a>
        <a
          href="/api/admin/reports/stats"
          className="rounded-md border border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
        >
          Descargar JSON — Estadísticas
        </a>
      </div>
    </div>
  );
}
