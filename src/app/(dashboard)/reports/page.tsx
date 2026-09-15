import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getFinancialSummarySource } from "@/modules/documents/financial-summary-query";
import { buildFinancialSummary } from "@/modules/documents/financial-summary";
import { Card, StatCard } from "@/components/common/Card";
import { PageHero } from "@/components/common/PageHero";

interface ReportsSearchParams {
  from?: string;
  to?: string;
  nit?: string;
}

interface ReportsPageProps {
  searchParams: Promise<ReportsSearchParams>;
}

/** Formato de peso colombiano para mostrar (punto de miles, sin centavos) -- mismo criterio de formato que el resto de RF-003/RF-008, ver `field-extraction-helpers.ts`. */
function formatCOP(amount: number): string {
  return `$${Math.round(amount).toLocaleString("es-CO")}`;
}

const INPUT_CLASS = "rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";

/**
 * RF-008 (reportería financiera, 2026-09-15) -- a diferencia de `/admin`
 * (salud operativa del pipeline OCR), esta página responde la pregunta de
 * negocio real: cuánto ha gastado ESTE usuario, y con qué NIT/proveedor.
 * Alcance por usuario (no consolidado para toda Mansor) y solo sobre
 * documentos ya validados -- ver el razonamiento completo en
 * `modules/documents/financial-summary.ts`.
 */
export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const sp = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const source = await getFinancialSummarySource(supabase, user.id);
  const summary = buildFinancialSummary(source.rows, { from: sp.from, to: sp.to, identifier: sp.nit });

  const hasFilter = Boolean(sp.from || sp.to || sp.nit);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHero
        title="Reportes financieros"
        description="Cuánto has gastado, y con quién — solo sobre tus documentos ya validados."
        bullets={[
          "Filtra por rango de fechas (la fecha impresa en la factura/contrato, no el día que la subiste)",
          "Filtra además por NIT/identificación para ver cuánto has gastado con una empresa puntual",
          "Ve el total gastado agrupado por día y por NIT/identificación",
          "Revisa el detalle documento por documento, con acceso directo a la factura/contrato original para verificar",
        ]}
        tip="Solo se suman documentos que ya pasaron por validación humana — uno sin validar todavía no entra en ningún total de aquí."
      />

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-neutral-700 dark:text-neutral-300">
          Desde
          <input type="date" name="from" defaultValue={sp.from ?? ""} className={INPUT_CLASS} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700 dark:text-neutral-300">
          Hasta
          <input type="date" name="to" defaultValue={sp.to ?? ""} className={INPUT_CLASS} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700 dark:text-neutral-300">
          NIT / identificación
          <input type="text" name="nit" placeholder="Ej. 900123456" defaultValue={sp.nit ?? ""} className={INPUT_CLASS} />
        </label>
        <button type="submit" className="rounded-md border border-brand-500 px-4 py-2 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 dark:border-brand-400 dark:text-brand-300 dark:hover:bg-brand-950/30">
          Filtrar
        </button>
        {hasFilter ? (
          <Link href="/reports" className="text-sm text-neutral-500 underline dark:text-neutral-400">
            Limpiar
          </Link>
        ) : null}
      </form>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Total gastado" value={formatCOP(summary.totalAmount)} tone="brand" />
        <StatCard label="Documentos incluidos" value={String(summary.documentsIncluded)} />
        <StatCard
          label="Pendientes de validar"
          value={String(source.pendingCount)}
          hint="no incluidos en ningún total"
          tone={source.pendingCount > 0 ? "caution" : "neutral"}
        />
      </div>

      {summary.documentsWithUnparseableDate > 0 ? (
        <p className="text-sm text-caution-700 dark:text-caution-400">
          {summary.documentsWithUnparseableDate} documento{summary.documentsWithUnparseableDate === 1 ? "" : "s"} validado
          {summary.documentsWithUnparseableDate === 1 ? "" : "s"} con una fecha que no se pudo interpretar — excluido
          {summary.documentsWithUnparseableDate === 1 ? "" : "s"} del total para no falsear la cifra. Corrígela desde el detalle del documento.
        </p>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm font-medium text-neutral-700 dark:text-neutral-300">Gasto por día</h2>
        {summary.byDay.length === 0 ? (
          <Card>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Sin documentos validados en este rango.</p>
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500 dark:text-neutral-400">
                  <th className="pb-2">Fecha</th>
                  <th className="pb-2">Documentos</th>
                  <th className="pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {summary.byDay.map((day) => (
                  <tr key={day.date} className="border-t border-neutral-200 dark:border-neutral-800">
                    <td className="font-data py-2">{day.date}</td>
                    <td className="py-2">{day.count}</td>
                    <td className="font-data py-2 text-right">{formatCOP(day.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm font-medium text-neutral-700 dark:text-neutral-300">Gasto por NIT / identificación</h2>
        {summary.byIdentifier.length === 0 ? (
          <Card>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Sin documentos validados en este rango.</p>
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500 dark:text-neutral-400">
                  <th className="pb-2">NIT / identificación</th>
                  <th className="pb-2">Proveedor</th>
                  <th className="pb-2">Documentos</th>
                  <th className="pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {summary.byIdentifier.map((row) => (
                  <tr key={row.identifier} className="border-t border-neutral-200 dark:border-neutral-800">
                    <td className="font-data py-2">{row.identifier}</td>
                    <td className="py-2">{row.proveedor ?? "—"}</td>
                    <td className="py-2">{row.count}</td>
                    <td className="font-data py-2 text-right">{formatCOP(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm font-medium text-neutral-700 dark:text-neutral-300">Detalle de documentos</h2>
        {summary.documents.length === 0 ? (
          <Card>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Sin documentos validados en este rango.</p>
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500 dark:text-neutral-400">
                  <th className="pb-2">Fecha</th>
                  <th className="pb-2">NIT / identificación</th>
                  <th className="pb-2">Proveedor</th>
                  <th className="pb-2 text-right">Monto</th>
                  <th className="pb-2 text-right">Documento</th>
                </tr>
              </thead>
              <tbody>
                {summary.documents.map((doc) => (
                  <tr key={doc.documentId} className="border-t border-neutral-200 dark:border-neutral-800">
                    <td className="font-data py-2">{doc.date}</td>
                    <td className="font-data py-2">{doc.identifier}</td>
                    <td className="py-2">{doc.proveedor ?? "—"}</td>
                    <td className="font-data py-2 text-right">{formatCOP(doc.amount)}</td>
                    <td className="py-2 text-right">
                      <Link
                        href={`/documents/${doc.documentId}`}
                        className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900"
                      >
                        Ver documento
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}
