import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin-page";
import { toCsv } from "@/modules/admin/csv";
import { getDocumentStatusLabel } from "@/lib/constants/document-display";

interface ReportRow {
  id: string;
  document_type: string;
  status: string;
  created_at: string;
  ocr_results: { confidence: number | null; created_at: string }[];
  document_validations: { validated_at: string; validator: { email: string } | null }[];
}

/** CSV descargable: un documento por fila (RF-005/RF-007, vista admin Fase 6). Accuracy/validación son "la más reciente" cuando hay varias filas (reintentos), mismo criterio que `documents/[id]/page.tsx`. */
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

  const rows = (data ?? []) as unknown as ReportRow[];

  const csvRows = rows.map((doc) => {
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

  const csv = toCsv(["ID", "Tipo", "Status", "Accuracy", "ValidadoEn", "UsuarioValidó", "FechaCreación"], csvRows);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="documentos-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
