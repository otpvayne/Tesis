import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/require-admin-page";
import { getAdminDashboardStats } from "@/modules/admin/stats";

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="text-xs text-neutral-500 dark:text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{value}</p>
      {hint ? <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">{hint}</p> : null}
    </div>
  );
}

export default async function AdminDashboardPage() {
  const { supabase } = await requireAdminPage();
  const stats = await getAdminDashboardStats(supabase);

  const maxPerDay = Math.max(1, ...stats.documentsPerDay.map((d) => d.count));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Dashboard Admin</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Documentos" value={String(stats.totalDocuments)} />
        <StatCard label="Validados" value={`${stats.validatedDocuments} (${stats.validationPercentage.toFixed(0)}%)`} />
        <StatCard
          label="Confidence OCR promedio"
          value={stats.averageConfidence === null ? "—" : `${(stats.averageConfidence * 100).toFixed(0)}%`}
          hint="confidence del pipeline, no accuracy medida — ver /admin/models"
        />
        <StatCard label="Usuarios activos" value={String(stats.activeUsers)} hint="con al menos 1 documento" />
        <StatCard label="Modelos OCR activos" value={String(stats.activeModels)} />
        <StatCard label="Campos editados" value={String(stats.totalFieldsEdited)} hint="total, todas las validaciones" />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Documentos por día (últimos 7 días)</h2>
        <div className="flex items-end gap-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
          {stats.documentsPerDay.map((day) => (
            <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-sky-500 dark:bg-sky-600"
                style={{ height: `${Math.max(4, (day.count / maxPerDay) * 80)}px` }}
                title={`${day.count} documentos`}
              />
              <span className="text-[10px] text-neutral-500 dark:text-neutral-500">{day.date.slice(5)}</span>
              <span className="text-[10px] text-neutral-700 dark:text-neutral-300">{day.count}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Accesos rápidos</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/documents" className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">
            Ver documentos
          </Link>
          <Link href="/admin/validations" className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">
            Ver validaciones
          </Link>
          <Link href="/admin/models" className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">
            Ver modelos OCR
          </Link>
          <Link href="/admin/reports" className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">
            Descargar reportes
          </Link>
          <Link href="/ocr-lab/train" className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">
            Entrenar modelo
          </Link>
        </div>
      </section>
    </div>
  );
}
