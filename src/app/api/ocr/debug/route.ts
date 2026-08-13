import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin-page";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateUploadFile } from "@/modules/documents/validation";
import { decodeImageNode } from "@/modules/ocr/preprocessing/decode-image-node";
import { buildOcrDebugReport } from "@/modules/ocr/debug/build-debug-report";
import { imageDataToPngDataUrl } from "@/modules/ocr/debug/render-image-data";
import { hogDescriptorToSvg } from "@/modules/ocr/debug/hog-visualizer";
import { CharacterClassifier } from "@/modules/ocr/classification/character-classifier";
import type { SerializedKNNClassifier } from "@/modules/ocr/classification/knn-classifier";
import { OCR_CONFIG } from "@/modules/ocr/config";

/**
 * Endpoint de diagnóstico visual del pipeline OCR (Fase de debugging
 * visual del handoff de transición del equipo, agosto 2026) — muestra,
 * para una imagen subida manualmente, la imagen original, cada paso de
 * preprocesamiento (grayscale → normalizado → blur → Otsu → foreground),
 * los bounding boxes de líneas/palabras/caracteres detectados, el
 * descriptor HOG visual de cada carácter y la predicción kNN — para ver
 * **dónde** se rompe el pipeline en una factura real, en vez de solo el
 * texto final que produce `runOCRPipeline`.
 *
 * **Solo ADMIN** (`requireAdminApi`): es una herramienta de diagnóstico
 * interna del equipo (como `/ocr-lab`), no una funcionalidad de usuario
 * final — mismo criterio que el resto de `/api/admin/*`. A diferencia de
 * `/api/ocr/active-model` (que sirve el modelo activo a cualquier usuario
 * autenticado porque procesar *su propio* documento es una operación
 * legítima de cualquiera), aquí se decodifica y expone en detalle el
 * contenido de cualquier imagen subida — no debe quedar abierto a
 * usuarios regulares.
 *
 * Corre en Node (no Edge runtime, por defecto en Route Handlers de App
 * Router) porque `decodeImageNode`/`imageDataToPngDataUrl` dependen de
 * `node-canvas`, un módulo nativo que Edge no soporta.
 *
 * **Nota de despliegue, sin verificar todavía:** `node-canvas` es un
 * addon nativo (requiere `libcairo`/`libjpeg`/etc. del sistema operativo
 * donde corre). Ya se usa en este repo desde Fase 5
 * (`bin/generate-initial-model.ts`, corrido siempre localmente por el
 * equipo) — pero ahí nunca tuvo que ejecutarse dentro de una función
 * serverless de Vercel. Nadie ha desplegado este endpoint a Vercel
 * todavía para confirmar que el entorno de build/runtime de Vercel trae
 * esas librerías del sistema; si el build o la invocación fallan ahí,
 * es la primera señal a investigar (alternativa conocida: `@napi-rs/canvas`,
 * que empaqueta binarios prebuilt sin depender de librerías del sistema —
 * cambio de dependencia, no de este endpoint, si hiciera falta).
 */
export const runtime = "nodejs";

const DEFAULT_DOCUMENT_TYPE = "invoice_es";

export async function POST(request: Request) {
  const admin = await requireAdminApi();
  if (!admin) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "El cuerpo de la petición debe ser multipart/form-data." }, { status: 400 });
  }

  const fileEntry = formData.get("image");
  const validation = await validateUploadFile(fileEntry instanceof File ? fileEntry : null);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error.message }, { status: 400 });
  }

  const documentType = formData.get("documentType")?.toString().trim() || DEFAULT_DOCUMENT_TYPE;

  const adminSupabase = createAdminClient();
  const { data: modelRow, error: modelError } = await adminSupabase
    .from("ocr_models")
    .select("id, version, model_data")
    .eq("document_type", documentType)
    .eq("active", true)
    .maybeSingle();

  if (modelError) {
    return NextResponse.json({ error: modelError.message }, { status: 500 });
  }
  if (!modelRow) {
    return NextResponse.json(
      { error: `No hay un modelo activo para document_type="${documentType}" todavía.` },
      { status: 404 },
    );
  }

  let classifier: CharacterClassifier;
  let rawImageData: ImageData;
  try {
    classifier = CharacterClassifier.fromJSON(modelRow.model_data as unknown as SerializedKNNClassifier);
    rawImageData = await decodeImageNode(Buffer.from(validation.bytes));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "No se pudo procesar la imagen o el modelo activo.";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const report = buildOcrDebugReport(rawImageData, classifier);

  const hogConfig = {
    gridCols: OCR_CONFIG.HOG_GRID_COLS,
    gridRows: OCR_CONFIG.HOG_GRID_ROWS,
    orientationBins: OCR_CONFIG.HOG_ORIENTATION_BINS,
  };

  return NextResponse.json({
    modelId: modelRow.id,
    modelVersion: modelRow.version,
    timingMs: report.timingMs,
    originalImage: imageDataToPngDataUrl(report.originalImageData),
    stages: report.stages.map((stage) => ({
      name: stage.name,
      image: imageDataToPngDataUrl(stage.imageData),
    })),
    lines: report.lines.map((line) => ({
      bbox: line.bbox,
      text: line.text,
      words: line.words.map((word) => ({
        bbox: word.bbox,
        characters: word.characters.map((character) => ({
          bbox: character.bbox,
          isolatedImage: imageDataToPngDataUrl(character.isolatedImageData),
          normalizedImage: imageDataToPngDataUrl(character.normalizedImageData),
          hogSvg: hogDescriptorToSvg(character.hogDescriptor, hogConfig),
          prediction: character.prediction,
        })),
      })),
    })),
  });
}
