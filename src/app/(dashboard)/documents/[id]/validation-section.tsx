"use client";

import { useState, useTransition, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/common/Button";
import { ConfidenceBar } from "@/components/validation/ConfidenceBar";
import { CheckIcon } from "@/components/icons/CheckIcon";
import { EditIcon } from "@/components/icons/EditIcon";
import { PendingIcon } from "@/components/icons/PendingIcon";
import type { IconProps } from "@/components/icons/CheckIcon";
import { VALIDATION_FIELD_LABELS } from "@/lib/constants/document-display";
import { computeConfidenceLevel, parseFieldValue } from "@/modules/documents/validation-logic";
import { saveValidation, rejectDocument } from "@/modules/documents/save-validation";
import { NUMERIC_VALIDATION_FIELDS, type FieldValue, type ValidationFieldInput, type ValidationFieldName } from "@/modules/documents/validation-types";

export interface ValidationSectionField {
  field: ValidationFieldName;
  extractedValue: FieldValue;
  confidence: number;
}

type RowStatus = "pending" | "validated" | "corrected";

const STATUS_DISPLAY: Record<RowStatus, { icon: ComponentType<IconProps>; label: string; className: string }> = {
  validated: { icon: CheckIcon, label: "OK", className: "text-brand-700 dark:text-brand-400" },
  corrected: { icon: EditIcon, label: "Editado", className: "text-caution-700 dark:text-caution-400" },
  pending: { icon: PendingIcon, label: "Pendiente", className: "text-neutral-600 dark:text-neutral-400" },
};

function displayValue(value: FieldValue): string {
  return value !== null && value !== undefined ? String(value) : "—";
}

/**
 * Tabla de validación humana (RF-007, Fase 5). Un campo con confianza >90%
 * arranca como "OK" sin que el usuario tenga que tocarlo (reduce fricción en
 * lo que el OCR ya acertó con seguridad); el resto arranca como "Pendiente"
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
    <div className="animate-fade-in flex flex-col gap-4 rounded-lg border-2 border-brand-200 bg-brand-50/40 p-6 dark:border-brand-800 dark:bg-brand-950/20">
      <div>
        <h2 className="font-display text-base font-semibold text-neutral-900 dark:text-neutral-50">Validación de campos (Fase 5)</h2>
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          Revisa cada campo extraído por el OCR. Los campos con confianza alta ya aparecen como &quot;OK&quot; — corrígelos si el
          valor real es distinto.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="text-xs text-neutral-600 dark:text-neutral-400">
              <th className="pb-1 pr-2">Campo</th>
              <th className="pb-1 pr-2">Valor OCR</th>
              <th className="pb-1 pr-2">Confianza</th>
              <th className="pb-1 pr-2">Estado</th>
              <th className="pb-1">Acción</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f, index) => {
              const status = statusFor(f);
              const statusDisplay = STATUS_DISPLAY[status];
              const StatusIcon = statusDisplay.icon;
              const isEditingThis = editingField === f.field;
              const isNumeric = (NUMERIC_VALIDATION_FIELDS as readonly ValidationFieldName[]).includes(f.field);

              return (
                <tr
                  key={f.field}
                  className="border-t border-neutral-200 transition-colors hover:bg-white/60 dark:border-neutral-800 dark:hover:bg-neutral-950/30"
                >
                  <td className="py-2 pr-2 font-semibold text-neutral-700 dark:text-neutral-300">{VALIDATION_FIELD_LABELS[f.field]}</td>
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
                          className={`w-full rounded-md border border-brand-400 px-2 py-1 text-sm outline-none dark:border-brand-600 dark:bg-neutral-950 ${isNumeric ? "font-data" : ""}`}
                        />
                        {fieldError ? <span className="text-xs text-critical-600 dark:text-critical-400">{fieldError}</span> : null}
                      </div>
                    ) : (
                      <span className={`text-neutral-900 dark:text-neutral-50 ${isNumeric ? "font-data" : ""}`}>{displayValue(currentValue(f))}</span>
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    <div className="w-24">
                      <ConfidenceBar confidence={f.confidence} size="sm" showLabel={false} delayMs={index * 80} />
                    </div>
                  </td>
                  <td className={`py-2 pr-2 ${statusDisplay.className}`}>
                    <span className="inline-flex items-center gap-1">
                      <StatusIcon className="h-4 w-4" />
                      {statusDisplay.label}
                    </span>
                  </td>
                  <td className="py-2">
                    {isEditingThis ? (
                      <div className="flex gap-1">
                        <Button type="button" size="sm" onClick={() => commitEdit(f)}>
                          Guardar
                        </Button>
                        <Button type="button" variant="secondary" size="sm" onClick={cancelEdit}>
                          ✕
                        </Button>
                      </div>
                    ) : (
                      <Button type="button" variant="secondary" size="sm" onClick={() => startEdit(f)} disabled={isBusy}>
                        Editar
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasUnsavedEdit ? (
        <p className="text-xs text-caution-700 dark:text-caution-400">Confirma o cancela la edición en curso antes de guardar.</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-critical-600 dark:text-critical-400">
          {error}
        </p>
      ) : null}
      {message ? <p className="text-sm text-brand-700 dark:text-brand-400">{message}</p> : null}

      <div className="flex flex-wrap justify-between gap-2">
        <Button type="button" variant="danger" onClick={handleReject} disabled={isBusy || hasUnsavedEdit}>
          {isRejecting ? "Rechazando..." : "Rechazar documento"}
        </Button>
        <Button type="button" variant="primary" onClick={handleSave} disabled={isBusy || hasUnsavedEdit}>
          {isSaving ? "Guardando..." : "Guardar validación"}
        </Button>
      </div>
    </div>
  );
}
