import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin-page";
import { toCsv } from "@/modules/admin/csv";
import { buildDocumentsReportRows, DOCUMENTS_REPORT_HEADERS, type DocumentsReportRow } from "@/modules/admin/reports";

/** CSV descargable: un documento por fila (RF-005/RF-007, vista admin Fase 6). Lógica de armado de filas en `modules/admin/reports.ts` (testeada), este handler solo hace el fetch + responde. */
export async function GET() {
  const admin = await requireAdminApi();
  if (!admin) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { data, error } = await admin.supabase
    .from("documents")
    .select("id, document_type, status, created_at, ocr_results(confidence, created_at), document_validations(validated_at, validator:profiles(email))")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const csvRows = buildDocumentsReportRows((data ?? []) as unknown as DocumentsReportRow[]);
  const csv = toCsv(DOCUMENTS_REPORT_HEADERS, csvRows);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="documentos-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
