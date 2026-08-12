import { VALIDATION_FIELD_LABELS } from "@/lib/constants/document-display";
import { formatDateTime } from "@/lib/utils/format-date";
import { VALIDATION_FIELDS, type ValidationFieldName } from "@/modules/documents/validation-types";

/** Solo lectura -- se muestra cuando `documents.status === "validated"`, en vez de la tabla editable de `ValidationSection`. */
export function ValidationSummary({
  validatedData,
  originalExtractedData,
  validatedAt,
}: {
  validatedData: Partial<Record<ValidationFieldName, unknown>>;
  originalExtractedData: Partial<Record<ValidationFieldName, unknown>>;
  validatedAt: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border-2 border-green-300 bg-green-50/50 p-3 dark:border-green-900 dark:bg-green-950/20">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">✅ Documento validado</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-500">{formatDateTime(validatedAt)}</p>
      </div>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs text-neutral-500 dark:text-neutral-500">
            <th className="pb-1 pr-2">Campo</th>
            <th className="pb-1">Valor validado</th>
          </tr>
        </thead>
        <tbody>
          {VALIDATION_FIELDS.map((f) => {
            const wasEdited = JSON.stringify(originalExtractedData[f] ?? null) !== JSON.stringify(validatedData[f] ?? null);
            const value = validatedData[f];
            return (
              <tr key={f} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="py-1 pr-2 text-neutral-500 dark:text-neutral-400">{VALIDATION_FIELD_LABELS[f]}</td>
                <td className="py-1 text-neutral-900 dark:text-neutral-50">
                  {value !== null && value !== undefined ? String(value) : "—"}
                  {wasEdited ? <span className="ml-2 text-xs text-sky-700 dark:text-sky-400">(corregido)</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
