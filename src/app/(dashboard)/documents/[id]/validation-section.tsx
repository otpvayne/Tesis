"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { VALIDATION_FIELD_LABELS } from "@/lib/constants/document-display";
import { computeConfidenceLevel, parseFieldValue } from "@/modules/documents/validation-logic";
import { saveValidation, rejectDocument } from "@/modules/documents/save-validation";
import type { FieldValue, ValidationFieldInput, ValidationFieldName } from "@/modules/documents/validation-types";

export interface ValidationSectionField {
  field: ValidationFieldName;
  extractedValue: FieldValue;
  confidence: number;
}

type RowStatus = "pending" | "validated" | "corrected";

const CONFIDENCE_BADGE_CLASS: Record<ReturnType<typeof computeConfidenceLevel>, string> = {
  high: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400",
  low: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400",
};

const STATUS_DISPLAY: Record<RowStatus, string> = {
  validated: "✅ OK",
  corrected: "🔧 Editado",
  pending: "⏳ Pendiente",
};

function displayValue(value: FieldValue): string {
  return value !== null && value !== undefined ? String(value) : "—";
}

/**
 * Tabla de validación humana (RF-007, Fase 5). Un campo con confianza >90%
 * arranca "✅ OK" sin que el usuario tenga que tocarlo (reduce fricción en
 * lo que el OCR ya acertó con seguridad); el resto arranca "⏳ Pendiente"
 * hasta que el usuario lo confirme o lo corrija.
 */
export function ValidationSection({ documentId, fields }: { documentId: string; fields: ValidationSectionField[] }) {
  const router = useRouter();
  const [edits, setEdits] = useState<Partial<Record<ValidationFieldName, FieldValue>>>({});
  const [reviewed, setReviewed] = useState<Set<ValidationFieldName>>(new Set());
  const [editingField, setEditingField] = useState<ValidationFieldName | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isRejecting, startRejecting] = useTransition();

  function currentValue(f: ValidationSectionField): FieldValue {
    return f.field in edits ? edits[f.field]! : f.extractedValue;
  }

  function statusFor(f: ValidationSectionField): RowStatus {
    if (f.field in edits) return "corrected";
    if (reviewed.has(f.field)) return "validated";
    if (computeConfidenceLevel(f.confidence) === "high") return "validated";
    return "pending";
  }

  function startEdit(f: ValidationSectionField) {
    setError(null);
    setMessage(null);
    setFieldError(null);
    setEditingField(f.field);
    setEditDraft(displayValue(currentValue(f)) === "—" ? "" : displayValue(currentValue(f)));
  }

  function cancelEdit() {
    setEditingField(null);
    setFieldError(null);
  }

  function commitEdit(f: ValidationSectionField) {
    const parsed = parseFieldValue(f.field, editDraft);
    if (!parsed.ok) {
      setFieldError(parsed.error ?? "Valor inválido.");
      return;
    }

    if (parsed.value === f.extractedValue) {
      // Coincide con lo que ya tenía el OCR -- confirmado, no es una corrección.
      setEdits((prev) => {
        const next = { ...prev };
        delete next[f.field];
        return next;
      });
      setReviewed((prev) => new Set(prev).add(f.field));
    } else {
      setEdits((prev) => ({ ...prev, [f.field]: parsed.value }));
      setReviewed((prev) => {
        const next = new Set(prev);
        next.delete(f.field);
        return next;
      });
    }

    setEditingField(null);
    setFieldError(null);
  }

  function handleSave() {
    setError(null);
    setMessage(null);

    const payload: ValidationFieldInput[] = fields.map((f) => ({
      field: f.field,
      extractedValue: f.extractedValue,
      confidence: f.confidence,
      correctedValue: f.field in edits ? edits[f.field] : undefined,
    }));

    startSaving(async () => {
      try {
        const result = await saveValidation({ documentId, fields: payload });
        setMessage(
          result.manuallyEdited
            ? `Validación guardada — campos corregidos: ${result.editedFields.map((f) => VALIDATION_FIELD_LABELS[f]).join(", ")}.`
            : "Validación guardada — todos los campos confirmados sin cambios.",
        );
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar la validación.");
      }
    });
  }

  function handleReject() {
    setError(null);
    setMessage(null);
    startRejecting(async () => {
      try {
        await rejectDocument(documentId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo rechazar el documento.");
      }
    });
  }

  const isBusy = isSaving || isRejecting;
  const hasUnsavedEdit = editingField !== null;

  return (
    <div className="flex flex-col gap-3 rounded-md border-2 border-sky-300 bg-sky-50/50 p-3 dark:border-sky-800 dark:bg-sky-950/20">
      <div>
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">Validación de campos (Fase 5)</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          Revisa cada campo extraído por el OCR. Los campos con confianza alta ya aparecen como &quot;OK&quot; — corrígelos si el
          valor real es distinto.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="text-xs text-neutral-500 dark:text-neutral-500">
              <th className="pb-1 pr-2">Campo</th>
              <th className="pb-1 pr-2">Valor OCR</th>
              <th className="pb-1 pr-2">Confianza</th>
              <th className="pb-1 pr-2">Estado</th>
              <th className="pb-1">Acción</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => {
              const level = computeConfidenceLevel(f.confidence);
              const status = statusFor(f);
              const isEditingThis = editingField === f.field;

              return (
                <tr key={f.field} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="py-2 pr-2 font-medium text-neutral-700 dark:text-neutral-300">{VALIDATION_FIELD_LABELS[f.field]}</td>
                  <td className="py-2 pr-2">
                    {isEditingThis ? (
                      <div className="flex flex-col gap-1">
                        <input
                          autoFocus
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit(f);
                            if (e.key === "Escape") cancelEdit();
                          }}
                          className="w-full rounded-md border border-sky-400 px-2 py-1 text-sm outline-none dark:border-sky-600 dark:bg-neutral-950"
                        />
                        {fieldError ? <span className="text-xs text-red-600 dark:text-red-400">{fieldError}</span> : null}
                      </div>
                    ) : (
                      <span className="text-neutral-900 dark:text-neutral-50">{displayValue(currentValue(f))}</span>
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CONFIDENCE_BADGE_CLASS[level]}`}>
                      {(f.confidence * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-neutral-700 dark:text-neutral-300">{STATUS_DISPLAY[status]}</td>
                  <td className="py-2">
                    {isEditingThis ? (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => commitEdit(f)}
                          className="rounded-md bg-sky-600 px-2 py-1 text-xs font-medium text-white hover:bg-sky-700"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(f)}
                        disabled={isBusy}
                        className="rounded-md bg-sky-600 px-3 py-1 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 hover:bg-sky-700"
                      >
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasUnsavedEdit ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">Confirma o cancela la edición en curso antes de guardar.</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {message ? <p className="text-sm text-green-700 dark:text-green-400">{message}</p> : null}

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={handleReject}
          disabled={isBusy || hasUnsavedEdit}
          className="rounded-md border border-red-500 px-4 py-2 text-sm font-medium text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-800 dark:text-red-400"
        >
          {isRejecting ? "Rechazando..." : "Rechazar documento"}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isBusy || hasUnsavedEdit}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 hover:bg-green-700"
        >
          {isSaving ? "Guardando..." : "Guardar validación"}
        </button>
      </div>
    </div>
  );
}
