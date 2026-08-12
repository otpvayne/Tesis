import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDatasetStats } from "@/modules/ocr/classification/training-actions";
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
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
          OCR Lab — Entrenamiento (Fase 4c)
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Sube una factura, etiqueta los caracteres segmentados y guárdalos en el dataset.
          El HOG se calcula en el navegador; el entrenamiento/evaluación de kNN corre en
          el servidor sobre lo ya guardado en Supabase.
        </p>
      </div>

      <OcrTrainClient initialStats={initialStats} />
    </div>
  );
}
