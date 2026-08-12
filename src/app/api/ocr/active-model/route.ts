import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sirve el modelo OCR activo (`ocr_models`, `active=true`) a **cualquier
 * usuario autenticado**, no solo ADMIN.
 *
 * `ocr_models` tiene RLS `is_admin()`-only (gestión del modelo es cosa de
 * ADMIN vía OCR LAB) — pero *usar* el modelo para reconocer texto en el
 * documento de un usuario regular es una operación legítima de cualquier
 * usuario sobre su propio documento, no una operación administrativa. El
 * pipeline OCR corre en el navegador del usuario (`decodeImage` requiere
 * Canvas real, no existe en el servidor — ver `document-processing.ts`),
 * así que el modelo tiene que llegar ahí de alguna forma. Este endpoint
 * es el puente: exige sesión autenticada (rechaza `401` sin ella) y usa
 * el cliente `service_role` (`lib/supabase/admin.ts`, "gestión de modelos
 * OCR" es exactamente su caso de uso documentado) para leer el modelo
 * activo saltando esa RLS — **de solo lectura, un recurso compartido del
 * sistema, no datos de otro usuario**. No expone ninguna otra tabla ni
 * operación de escritura.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const documentType = searchParams.get("documentType") ?? "invoice_es";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ocr_models")
    .select("id, version, model_data")
    .eq("document_type", documentType)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: `No hay un modelo activo para document_type="${documentType}" todavía.` },
      { status: 404 },
    );
  }

  return NextResponse.json({ modelId: data.id, version: data.version, modelData: data.model_data });
}
