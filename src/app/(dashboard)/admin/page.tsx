import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/require-admin-page";
import { getAdminDashboardStats } from "@/modules/admin/stats";
import { Card, StatCard } from "@/components/common/Card";
import { PageHero } from "@/components/common/PageHero";
import { ConfidenceBar } from "@/components/validation/ConfidenceBar";

const QUICK_ACTION_CLASS = "rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900";

export default async function AdminDashboardPage() {
  const { supabase } = await requireAdminPage();
  const stats = await getAdminDashboardStats(supabase);

  const maxPerDay = Math.max(1, ...stats.documentsPerDay.map((d) => d.count));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHero
        title="Dashboard Admin"
        description="Métricas del sistema completo: cuántos documentos hay, qué tan bien está funcionando el OCR, y qué necesita atención."
        bullets={[
          "Ver el volumen de documentos y cuántos ya están validados",
          "Monitorear la confidence promedio del pipeline OCR",
          "Saltar directo a documentos, validaciones, modelos o reportes desde los accesos rápidos",
        ]}
        tip="Monitorea la tendencia de documentos por día — una caída brusca puede indicar un problema con el modelo activo o con el upload."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Documentos" value={String(stats.totalDocuments)} />
        <StatCard label="Validados" value={`${stats.validatedDocuments} (${stats.validationPercentage.toFixed(0)}%)`} tone="brand" />

        <Card>
          <p className="text-xs text-neutral-500 dark:text-neutral-500">Confidence OCR promedio</p>
          <p className="font-data mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            {stats.averageConfidence === null ? "—" : `${(stats.averageConfidence * 100).toFixed(0)}%`}
          </p>
          {stats.averageConfidence !== null ? (
            <div className="mt-2">
              <ConfidenceBar confidence={stats.averageConfidence} showLabel={false} size="sm" />
            </div>
          ) : null}
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">confidence del pipeline, no accuracy medida — ver /admin/models</p>
        </Card>

        <StatCard label="Usuarios activos" value={String(stats.activeUsers)} hint="con al menos 1 documento" />
        <StatCard label="Modelos OCR activos" value={String(stats.activeModels)} />
        <StatCard label="Campos editados" value={String(stats.totalFieldsEdited)} hint="total, todas las validaciones" />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm font-medium text-neutral-700 dark:text-neutral-300">Documentos por día (últimos 7 días)</h2>
        <Card className="flex items-end gap-2">
          {stats.documentsPerDay.map((day) => (
            <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-brand-500 dark:bg-brand-600"
                style={{ height: `${Math.max(4, (day.count / maxPerDay) * 80)}px` }}
                title={`${day.count} documentos`}
              />
              <span className="text-[10px] text-neutral-500 dark:text-neutral-500">{day.date.slice(5)}</span>
              <span className="font-data text-[10px] text-neutral-700 dark:text-neutral-300">{day.count}</span>
            </div>
          ))}
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm font-medium text-neutral-700 dark:text-neutral-300">Accesos rápidos</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/documents" className={QUICK_ACTION_CLASS}>
            Ver documentos
          </Link>
          <Link href="/admin/validations" className={QUICK_ACTION_CLASS}>
            Ver validaciones
          </Link>
          <Link href="/admin/models" className={QUICK_ACTION_CLASS}>
            Ver modelos OCR
          </Link>
          <Link href="/admin/reports" className={QUICK_ACTION_CLASS}>
            Descargar reportes
          </Link>
          <Link href="/ocr-lab/train" className={QUICK_ACTION_CLASS}>
            Entrenar modelo
          </Link>
        </div>
      </section>
    </div>
  );
}
