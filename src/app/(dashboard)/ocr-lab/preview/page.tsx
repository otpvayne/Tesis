import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHero } from "@/components/common/PageHero";
import { OcrPreviewClient } from "./ocr-preview-client";

/**
 * Ruta temporal de desarrollo para Fase 4a — NO es la UI final de OCR LAB
 * (esa se construye en Fase 4d). Permite ver el pipeline de
 * preprocesamiento funcionando sobre una imagen real, paso a paso.
 * Gateada a ADMIN igual que el resto del namespace `ocr-lab/`, que en
 * Fase 4d se convierte en la herramienta real de entrenamiento
 * (`CLAUDE.md` §7: "OCR LAB (solo admin)").
 */
export default async function OcrLabPreviewPage() {
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHero
        title="Laboratorio OCR — Preview"
        description="Inspecciona paso a paso el preprocesamiento de una imagen: escala de grises, binarización, segmentación."
        bullets={[
          "Subir una imagen para ver cada etapa del preprocesamiento por separado",
          "Comparar el resultado antes/después de cada paso",
          "Diagnosticar por qué una factura específica no segmenta bien",
        ]}
        tip="Es una herramienta de depuración, no sube nada a Supabase — todo corre en tu navegador sobre la imagen que elijas."
      />

      <OcrPreviewClient />
    </div>
  );
}
