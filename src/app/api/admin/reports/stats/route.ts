import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin-page";
import { computeFieldEditStats, computeValidatorStats, getAdminDashboardStats } from "@/modules/admin/stats";

/** JSON descargable con el resumen de actividad (vista admin Fase 6) -- mismos datos reales que `/admin`, en un solo archivo para archivar/compartir. */
export async function GET() {
  const admin = await requireAdminApi();
  if (!admin) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const stats = await getAdminDashboardStats(admin.supabase);

  const { data: validationRows, error } = await admin.supabase
    .from("document_validations")
    .select("original_extracted_data, validated_data, manually_edited, validated_by, validator:profiles(email)");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (validationRows ?? []) as unknown as {
    original_extracted_data: unknown;
    validated_data: unknown;
    manually_edited: boolean;
    validated_by: string;
    validator: { email: string } | null;
  }[];

  const { editedFieldsCount } = computeFieldEditStats(rows);
  const validators = computeValidatorStats(rows);

  const report = {
    generatedAt: new Date().toISOString(),
    totalDocuments: stats.totalDocuments,
    validatedDocuments: stats.validatedDocuments,
    validatedPercentage: Number(stats.validationPercentage.toFixed(1)),
    /** Confidence promedio real del pipeline OCR -- NO es accuracy medida (esa requiere partición `test` real, ver `docs/ocr/evaluation.md`). */
    averageConfidence: stats.averageConfidence,
    activeUsers: stats.activeUsers,
    activeModels: stats.activeModels,
    fieldEditStats: editedFieldsCount,
    userActivity: validators.map((v) => ({ email: v.email, totalValidations: v.totalValidations, editedValidations: v.editedValidations })),
  };

  return new NextResponse(JSON.stringify(report, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="estadisticas-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
