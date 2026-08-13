import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDatasetStats } from "@/modules/ocr/classification/training-actions";
import { PageHero } from "@/components/common/PageHero";
import { OcrTrainClient } from "./ocr-train-client";

/**
 * OCR Lab Training (Fase 4c) — gateada a ADMIN igual que `/ocr-lab/preview`
 * (`CLAUDE.md` §7: "OCR LAB (solo admin)"). Etiquetado manual de
 * caracteres segmentados (Fase 4b) para construir el dataset de
 * `ocr_training_samples`, y entrenar/evaluar un `KNNClassifier` sobre lo
 * ya etiquetado. Sin dataset real todavía (llega en Fase 4d) — ninguna
 * cifra de accuracy que produzca esta página es representativa del
 * modelo final.
 */
export default async function OcrLabTrainPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "ADMIN") {
    redirect("/");
  }

  const initialStats = await getDatasetStats();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHero
        title="Entrenar modelo OCR"
        description="Etiqueta caracteres reales de facturas para mejorar el modelo — el activo hoy es 100% sintético."
        bullets={[
          "Subir una factura y etiquetar cada carácter segmentado con la letra/número correcto",
          "Guardar las muestras en el dataset (partición train/validation/test)",
          "Entrenar un modelo nuevo sobre lo etiquetado y activarlo cuando esté listo",
        ]}
        tip="Objetivo: 100+ muestras por carácter (0-9, A-Z, a-z) antes del primer reentrenamiento con datos reales."
      />

      <OcrTrainClient initialStats={initialStats} />
    </div>
  );
}
