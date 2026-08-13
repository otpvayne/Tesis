import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin-page";
import { toCsv } from "@/modules/admin/csv";
import { buildValidationsReportRows, VALIDATIONS_REPORT_HEADERS, type ValidationsReportRow } from "@/modules/admin/reports";

/** CSV descargable: una fila por campo por validación (RF-007, vista admin Fase 6). Lógica de armado de filas en `modules/admin/reports.ts` (testeada), este handler solo hace el fetch + responde. */
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

  const csvRows = buildValidationsReportRows((data ?? []) as unknown as ValidationsReportRow[]);
  const csv = toCsv(VALIDATIONS_REPORT_HEADERS, csvRows);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="validaciones-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
