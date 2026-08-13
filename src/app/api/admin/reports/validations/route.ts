import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin-page";
import { toCsv } from "@/modules/admin/csv";
import { VALIDATION_FIELD_LABELS } from "@/lib/constants/document-display";
import { VALIDATION_FIELDS, type ValidationFieldName } from "@/modules/documents/validation-types";

interface ReportRow {
  document_id: string;
  original_extracted_data: unknown;
  validated_data: unknown;
  validated_at: string;
  validator: { email: string } | null;
}

function fieldValue(data: unknown, field: ValidationFieldName): unknown {
  return (data as Partial<Record<ValidationFieldName, unknown>> | null)?.[field] ?? null;
}

/** CSV descargable: una fila por campo por validación (RF-007, trazabilidad original vs. validado, vista admin Fase 6) -- los 6 campos de cada validación, no solo los editados, para que el CSV sea una auditoría completa. */
export async function GET() {
  const admin = await requireAdminApi();
  if (!admin) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { data, error } = await admin.supabase
    .from("document_validations")
    .select("document_id, original_extracted_data, validated_data, validated_at, validator:profiles(email)")
    .order("validated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as ReportRow[];

  const csvRows = rows.flatMap((row) =>
    VALIDATION_FIELDS.map((field) => {
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
    }),
  );

  const csv = toCsv(["DocumentoID", "Campo", "ValorOCR", "ValorValidado", "EditadoPor", "FechaValidación"], csvRows);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="validaciones-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
