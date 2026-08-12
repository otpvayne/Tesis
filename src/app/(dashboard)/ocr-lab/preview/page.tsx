import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
          OCR Lab — Preview de preprocesamiento (Fase 4a)
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Herramienta temporal de desarrollo. No sube nada a Supabase — todo el
          procesamiento ocurre en el navegador sobre la imagen seleccionada.
        </p>
      </div>

      <OcrPreviewClient />
    </div>
  );
}
