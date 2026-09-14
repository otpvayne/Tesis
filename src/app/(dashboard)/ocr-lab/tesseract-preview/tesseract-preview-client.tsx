"use client";

import { useState } from "react";
import { runTesseractOCR } from "@/modules/ocr/engines/tesseract-engine";
import { extractFields, type ExtractedFields } from "@/modules/ocr/classification/field-extraction";
import type { OCRResult } from "@/modules/ocr/pipeline/ocr-pipeline";

const FIELD_LABELS: Record<keyof Omit<ExtractedFields, "rawOCR" | "extractionMethod">, string> = {
  proveedor: "Proveedor",
  nit: "NIT",
  fecha: "Fecha",
  iva: "IVA",
  valor: "Valor",
  total: "Total",
};

const MONEY_FIELDS = new Set<keyof ExtractedFields>(["iva", "valor", "total"]);

function formatFieldValue(key: keyof ExtractedFields, value: string | number | null): string {
  if (value === null) return "—";
  if (MONEY_FIELDS.has(key) && typeof value === "number") {
    return value.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
  }
  return String(value);
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return "text-emerald-600 dark:text-emerald-400";
  if (confidence >= 0.5) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

/**
 * Cliente del laboratorio de prueba de Tesseract.js -- solo corre
 * `runTesseractOCR` (motor) + `extractFields` (RF-003, perfil `invoice_es`)
 * sobre el `File` elegido, sin decodificar a `ImageData` (a diferencia de
 * `ocr-preview-client.tsx`, que sí lo necesita para el pipeline propio):
 * Tesseract.js recibe el `File`/`Blob` directamente.
 */
export function TesseractPreviewClient() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [fields, setFields] = useState<ExtractedFields | null>(null);
  const [extractionMs, setExtractionMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setOcrResult(null);
    setFields(null);
    setExtractionMs(null);
    setImageUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(file);
    });
    setLoading(true);

    try {
      const result = await runTesseractOCR(file);
      setOcrResult(result);

      const extractionStart = performance.now();
      const extracted = extractFields(result);
      setExtractionMs(performance.now() - extractionStart);
      setFields(extracted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo correr Tesseract.js sobre esta imagen.");
    } finally {
      setLoading(false);
    }
  }

  const fieldKeys = fields ? (Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[]) : [];

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Imagen de factura (JPG o PNG)
        <input
          type="file"
          accept="image/jpeg,image/png"
          onChange={handleFileChange}
          className="rounded-md border border-neutral-300 px-4 py-3 text-base text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
        />
      </label>

      {loading ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Corriendo Tesseract.js (puede tardar varios segundos, descarga el modelo de idioma la primera vez)...
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagen local (object URL), no un asset optimizable por next/image
        <img src={imageUrl} alt="Factura de prueba" className="max-h-96 w-full rounded-md border border-neutral-200 object-contain dark:border-neutral-800" />
      ) : null}

      {ocrResult ? (
        <>
          <div className="grid grid-cols-2 gap-2 rounded-md border border-neutral-200 p-3 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400 sm:grid-cols-4">
            <div>
              <p className="font-medium text-neutral-500 dark:text-neutral-500">Confianza promedio (Tesseract)</p>
              <p className={confidenceColor(ocrResult.confidence)}>{(ocrResult.confidence * 100).toFixed(1)}%</p>
            </div>
            <div>
              <p className="font-medium text-neutral-500 dark:text-neutral-500">Líneas reconocidas</p>
              <p>{ocrResult.lines.length}</p>
            </div>
            <div>
              <p className="font-medium text-neutral-500 dark:text-neutral-500">Reconocimiento (RNF-001)</p>
              <p>{ocrResult.timingMs.recognition.toFixed(0)}ms</p>
            </div>
            <div>
              <p className="font-medium text-neutral-500 dark:text-neutral-500">Total (OCR + extracción RF-003)</p>
              <p>{(ocrResult.timingMs.total + (extractionMs ?? 0)).toFixed(0)}ms</p>
            </div>
          </div>

          {fields ? (
            <div className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Campos extraídos (RF-003, perfil invoice_es)
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                {fieldKeys.map((key) => {
                  const field = fields[key];
                  return (
                    <div key={key}>
                      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-500">{FIELD_LABELS[key]}</p>
                      <p className="text-neutral-900 dark:text-neutral-50">{formatFieldValue(key, field.value)}</p>
                      <p className={`text-xs ${confidenceColor(field.confidence)}`}>{(field.confidence * 100).toFixed(0)}%</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Líneas reconocidas (texto + confianza)</p>
            <ul className="flex flex-col gap-1 text-sm">
              {ocrResult.lines.length === 0 ? (
                <li className="text-neutral-500 dark:text-neutral-400">Tesseract.js no reconoció ninguna línea en esta imagen.</li>
              ) : (
                ocrResult.lines.map((line, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 border-b border-neutral-100 pb-1 last:border-0 dark:border-neutral-900">
                    <span className="text-neutral-900 dark:text-neutral-50">{line.text}</span>
                    <span className={`shrink-0 text-xs ${confidenceColor(line.confidence)}`}>{(line.confidence * 100).toFixed(0)}%</span>
                  </li>
                ))
              )}
            </ul>
          </div>

          <details className="rounded-md border border-neutral-200 p-3 text-xs dark:border-neutral-800">
            <summary className="cursor-pointer font-medium text-neutral-500 dark:text-neutral-400">Texto crudo (rawText)</summary>
            <pre className="mt-2 whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">{ocrResult.rawText || "(vacío)"}</pre>
          </details>
        </>
      ) : null}
    </div>
  );
}
