import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHero } from "@/components/common/PageHero";
import { TesseractPreviewClient } from "./tesseract-preview-client";

/**
 * Laboratorio de prueba para el motor Tesseract.js (`CLAUDE.md` §7,
 * excepción aprobada vía ADR-0002) sobre el perfil `invoice_es` -- corre
 * `runTesseractOCR` + `extractFields` directamente sobre una imagen subida,
 * sin pasar por `/documents/[id]` ni escribir nada en Supabase. Gateado a
 * ADMIN igual que el resto de `ocr-lab/` (`CLAUDE.md` §7: "OCR LAB (solo
 * admin)"), mismo patrón que `ocr-lab/preview` (pipeline propio).
 */
export default async function TesseractPreviewPage() {
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
        title="Laboratorio OCR — Prueba Tesseract"
        description="Corre el motor Tesseract.js sobre una factura de prueba y revisa el texto crudo, la confianza por línea y los campos que extrae RF-003 (invoice_es)."
        bullets={[
          "Subir una foto de factura para ver el texto reconocido por Tesseract.js",
          "Comparar la confianza reportada por línea",
          "Revisar qué campos (Proveedor, NIT, Fecha, IVA, Valor, Total) logra extraer la heurística de RF-003 sobre ese texto",
        ]}
        tip="Es una herramienta de depuración, no sube nada a Supabase ni guarda el resultado — todo corre en tu navegador sobre la imagen que elijas."
      />

      <TesseractPreviewClient />
    </div>
  );
}
