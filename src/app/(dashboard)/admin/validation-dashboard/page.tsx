import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VALIDATION_FIELD_LABELS } from "@/lib/constants/document-display";
import { VALIDATION_FIELDS, type ValidationFieldName } from "@/modules/documents/validation-types";

interface ValidationStatsRow {
  original_extracted_data: unknown;
  validated_data: unknown;
  manually_edited: boolean;
}

/**
 * Estadísticas de validación humana (RF-007, Fase 5, prioridad 3 del
 * enunciado). Se calculan en la app a partir de todas las filas de
 * `document_validations` (histórico inmutable) en vez de mantener
 * contadores separados en la base -- con el volumen de esta fase no hay
 * necesidad de agregación en SQL.
 */
export default async function ValidationDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  // Defensa en profundidad: RLS ya restringe qué filas de
  // document_validations puede leer un USER, pero esta ruta ni siquiera
  // debe renderizarse para alguien sin rol ADMIN (mismo criterio que
  // /admin/documents).
  if (profile?.role !== "ADMIN") redirect("/");

  const { data: rows, error } = await supabase.from("document_validations").select("original_extracted_data, validated_data, manually_edited");

  const validations = (rows ?? []) as ValidationStatsRow[];
  const totalValidated = validations.length;
  const editedCount = validations.filter((v) => v.manually_edited).length;
  const pctEdited = totalValidated > 0 ? (editedCount / totalValidated) * 100 : 0;

  const editedFieldsCount: Record<ValidationFieldName, number> = {
    proveedor: 0,
    nit: 0,
    fecha: 0,
    iva: 0,
    valor: 0,
    total: 0,
  };
  for (const v of validations) {
    const original = (v.original_extracted_data ?? {}) as Partial<Record<ValidationFieldName, unknown>>;
    const validated = (v.validated_data ?? {}) as Partial<Record<ValidationFieldName, unknown>>;
    for (const field of VALIDATION_FIELDS) {
      if (JSON.stringify(original[field] ?? null) !== JSON.stringify(validated[field] ?? null)) {
        editedFieldsCount[field] += 1;
      }
    }
  }

  const sortedFields = [...VALIDATION_FIELDS].sort((a, b) => editedFieldsCount[b] - editedFieldsCount[a]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Dashboard de validación (RF-007)</h1>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">No se pudieron cargar las validaciones: {error.message}</p>
      ) : totalValidated === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">Todavía no hay documentos validados.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
            <dt className="text-neutral-500 dark:text-neutral-400">Documentos validados</dt>
            <dd className="text-neutral-900 dark:text-neutral-50">{totalValidated}</dd>
            <dt className="text-neutral-500 dark:text-neutral-400">Con al menos un campo corregido</dt>
            <dd className="text-neutral-900 dark:text-neutral-50">
              {editedCount} ({pctEdited.toFixed(1)}%)
            </dd>
          </dl>

          <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
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
          </div>
        </>
      )}
    </div>
  );
}
