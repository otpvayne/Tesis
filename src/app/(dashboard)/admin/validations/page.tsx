import { requireAdminPage } from "@/lib/auth/require-admin-page";
import { PageHero } from "@/components/common/PageHero";
import { VALIDATION_FIELD_LABELS } from "@/lib/constants/document-display";
import { VALIDATION_FIELDS } from "@/modules/documents/validation-types";
import { computeEditTrend, computeFieldEditStats, computeValidatorStats } from "@/modules/admin/stats";

interface ValidationStatsRow {
  original_extracted_data: unknown;
  validated_data: unknown;
  manually_edited: boolean;
  validated_by: string;
  validated_at: string;
  validator: { email: string } | null;
}

const TREND_DAYS = 7;

/**
 * Estadísticas de validación humana (RF-007) -- movida de
 * `/admin/validation-dashboard` (Fase 5) a `/admin/validations` para
 * seguir la convención de nombres del resto de `/admin/*` en Fase 6.
 * Fase 5 ya cubría total/% editados/campos más corregidos; Fase 6 agrega
 * ediciones por usuario y tendencia diaria real (no los números de
 * ejemplo del enunciado).
 */
export default async function AdminValidationsPage() {
  const { supabase } = await requireAdminPage();

  const { data: rows, error } = await supabase
    .from("document_validations")
    .select("original_extracted_data, validated_data, manually_edited, validated_by, validated_at, validator:profiles(email)");

  const validations = (rows ?? []) as unknown as ValidationStatsRow[];
  const totalValidated = validations.length;
  const editedCount = validations.filter((v) => v.manually_edited).length;
  const pctEdited = totalValidated > 0 ? (editedCount / totalValidated) * 100 : 0;

  const { editedFieldsCount } = computeFieldEditStats(validations);
  const sortedFields = [...VALIDATION_FIELDS].sort((a, b) => editedFieldsCount[b] - editedFieldsCount[a]);

  const validators = computeValidatorStats(validations);
  const trend = computeEditTrend(validations, TREND_DAYS);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHero
        title="Validaciones"
        description="Qué campos corrige más la gente, y quién está validando — esto guía qué caracteres etiquetar primero."
        bullets={[
          "Ver qué % de documentos validados tuvo al menos una corrección",
          "Identificar qué campo (Proveedor, NIT, Fecha, IVA, Valor, Total) falla más",
          "Ver la tendencia diaria de correcciones y quién está validando",
        ]}
        tip="El campo que más se corrige es la mejor pista de qué caracteres etiquetar primero en /ocr-lab/train."
      />

      {error ? (
        <p className="text-sm text-critical-600 dark:text-critical-400">No se pudieron cargar las validaciones: {error.message}</p>
      ) : totalValidated === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">Todavía no hay documentos validados.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800">
            <dt className="text-neutral-500 dark:text-neutral-400">Documentos validados</dt>
            <dd className="text-neutral-900 dark:text-neutral-50">{totalValidated}</dd>
            <dt className="text-neutral-500 dark:text-neutral-400">Con al menos un campo corregido</dt>
            <dd className="text-neutral-900 dark:text-neutral-50">
              {editedCount} ({pctEdited.toFixed(1)}%)
            </dd>
          </dl>

          <section className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
            <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">Campos más corregidos</p>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-neutral-500 dark:text-neutral-500">
                  <th className="pb-1">Campo</th>
                  <th className="pb-1">Veces corregido</th>
                  <th className="pb-1">% de validaciones</th>
                </tr>
              </thead>
              <tbody>
                {sortedFields.map((field) => (
                  <tr key={field} className="border-t border-neutral-100 dark:border-neutral-900">
                    <td className="py-1 text-neutral-900 dark:text-neutral-50">{VALIDATION_FIELD_LABELS[field]}</td>
                    <td className="py-1 text-neutral-500 dark:text-neutral-400">{editedFieldsCount[field]}</td>
                    <td className="py-1 text-neutral-500 dark:text-neutral-400">{((editedFieldsCount[field] / totalValidated) * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
            <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">Ediciones por usuario</p>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-neutral-500 dark:text-neutral-500">
                  <th className="pb-1">Usuario</th>
                  <th className="pb-1">Documentos validados</th>
                  <th className="pb-1">Con corrección</th>
                </tr>
              </thead>
              <tbody>
                {validators.map((v) => (
                  <tr key={v.userId} className="border-t border-neutral-100 dark:border-neutral-900">
                    <td className="py-1 text-neutral-900 dark:text-neutral-50">{v.email ?? v.userId}</td>
                    <td className="py-1 text-neutral-500 dark:text-neutral-400">{v.totalValidations}</td>
                    <td className="py-1 text-neutral-500 dark:text-neutral-400">{v.editedValidations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
            <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">Tendencia — % con ediciones, últimos {TREND_DAYS} días</p>
            <div className="flex items-end gap-2">
              {trend.map((point) => (
                <div key={point.date} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-caution-500 dark:bg-caution-600"
                    style={{ height: `${Math.max(4, (point.editedPercentage / 100) * 80)}px` }}
                    title={point.total > 0 ? `${point.editedPercentage.toFixed(0)}% (${point.total} validaciones)` : "sin validaciones"}
                  />
                  <span className="text-[10px] text-neutral-500 dark:text-neutral-500">{point.date.slice(5)}</span>
                  <span className="text-[10px] text-neutral-700 dark:text-neutral-300">{point.total > 0 ? `${point.editedPercentage.toFixed(0)}%` : "—"}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-500">Barras en 0 sin dato (&quot;—&quot;) son días sin ninguna validación, no 0% de error.</p>
          </section>
        </>
      )}
    </div>
  );
}
