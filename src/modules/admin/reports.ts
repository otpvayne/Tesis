import { getDocumentStatusLabel, VALIDATION_FIELD_LABELS } from "@/lib/constants/document-display";
import { VALIDATION_FIELDS, VALIDATION_FIELDS_BY_DOCUMENT_TYPE, type ValidationFieldName } from "@/modules/documents/validation-types";
import type { DocumentType } from "@/modules/documents/types";
import type { CsvValue } from "@/modules/admin/csv";

export const DOCUMENTS_REPORT_HEADERS = ["ID", "Tipo", "Status", "Accuracy", "ValidadoEn", "UsuarioValidó", "FechaCreación"];

export interface DocumentsReportRow {
  id: string;
  document_type: string;
  status: string;
  created_at: string;
  ocr_results: { confidence: number | null; created_at: string }[];
  document_validations: { validated_at: string; validator: { email: string } | null }[];
}

/**
 * Núcleo puro de `GET /api/admin/reports/documents` -- separado del Route
 * Handler para poder probarlo en Vitest (`requireAdminApi`/`createClient`
 * dependen de `next/headers`, sin contexto de request real en tests,
 * mismo motivo por el que Server Actions no se testean directo en este
 * proyecto). "Más reciente" cuando hay varias filas de `ocr_results`/
 * `document_validations` (reintentos) es el mismo criterio ya usado en
 * `documents/[id]/page.tsx` y `admin/documents/page.tsx`.
 */
export function buildDocumentsReportRows(rows: DocumentsReportRow[]): CsvValue[][] {
  return rows.map((doc) => {
    const latestOcr = [...(doc.ocr_results ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const latestValidation = [...(doc.document_validations ?? [])].sort((a, b) => b.validated_at.localeCompare(a.validated_at))[0];

    return [
      doc.id,
      doc.document_type,
      getDocumentStatusLabel(doc.status),
      latestOcr?.confidence !== undefined && latestOcr?.confidence !== null ? `${(latestOcr.confidence * 100).toFixed(1)}%` : "",
      latestValidation?.validated_at ?? "",
      latestValidation?.validator?.email ?? "",
      doc.created_at,
    ];
  });
}

export const VALIDATIONS_REPORT_HEADERS = ["DocumentoID", "Campo", "ValorOCR", "ValorValidado", "EditadoPor", "FechaValidación"];

export interface ValidationsReportRow {
  document_id: string;
  original_extracted_data: unknown;
  validated_data: unknown;
  validated_at: string;
  validator: { email: string } | null;
  /** Embed a `documents.document_type` -- decide qué campos de `VALIDATION_FIELDS_BY_DOCUMENT_TYPE` le corresponden a esta fila (perfiles distintos no comparten los mismos campos, ver `docs/decisions/0003-perfil-ocr-contratos.md`). */
  document: { document_type: string } | null;
}

function fieldValue(data: unknown, field: ValidationFieldName): unknown {
  return (data as Partial<Record<ValidationFieldName, unknown>> | null)?.[field] ?? null;
}

/** Núcleo puro de `GET /api/admin/reports/validations` -- una fila por campo del perfil OCR de ese documento por validación (no solo los editados, para que el CSV sea una auditoría completa de RF-003 -- perfil escalado a más de un tipo de documento en Fase 8). */
export function buildValidationsReportRows(rows: ValidationsReportRow[]): CsvValue[][] {
  return rows.flatMap((row) => {
    const fields = VALIDATION_FIELDS_BY_DOCUMENT_TYPE[row.document?.document_type as DocumentType] ?? VALIDATION_FIELDS;
    return fields.map((field) => {
      const original = fieldValue(row.original_extracted_data, field);
      const validated = fieldValue(row.validated_data, field);
      return [
        row.document_id,
        VALIDATION_FIELD_LABELS[field],
        original === null ? "" : String(original),
        validated === null ? "" : String(validated),
        row.validator?.email ?? "",
        row.validated_at,
      ];
    });
  });
}
