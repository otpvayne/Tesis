"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createDocument } from "@/modules/documents/actions";
import { createDocumentInitialState } from "@/modules/documents/state";
import type { DocumentType } from "@/modules/documents/types";
import { CameraCapture } from "@/modules/camera/CameraCapture";
import { checkCameraAvailability } from "@/modules/camera/availability";
import { isMobileDevice } from "@/modules/camera/device";
import { PageHero } from "@/components/common/PageHero";

/** `navigator.userAgentData` es experimental (solo Chromium) y todavía no
 * está en los tipos de TypeScript/lib.dom — se declara el mínimo necesario
 * en vez de usar `any`. */
interface NavigatorUAData {
  mobile: boolean;
}

export interface UploadDocumentFormProps {
  documentType: DocumentType;
  documentTypeLabel: string;
  title: string;
  description: string;
  bullets: string[];
  tip: string;
  submitLabel: string;
  /**
   * Permite asociar varias fotos al mismo documento (páginas 2+ van a
   * `document_pages`, ver `supabase/migrations/20260913090000_create_document_pages.sql`).
   * Solo `contract_es` lo necesita hoy -- un contrato real suele tener
   * campos obligatorios de RF-003 (Vigencia, Valor total, etc.) fuera de la
   * portada. `invoice_es` sigue siendo una sola foto, sin cambios de
   * comportamiento. Ver REQUERIMIENTO AFECTADO en el cierre de sesión
   * 2026-09-10 de `docs/decisions/0003-perfil-ocr-contratos.md`.
   */
  allowMultiplePages?: boolean;
}

/**
 * Formulario de subida (captura de cámara + fallback de archivo) genérico
 * por perfil OCR -- extraído de `documents/new/page.tsx` (que lo usaba
 * hardcodeado a `invoice_es`) para que `/contracts/new` lo reuse con
 * `contract_es` sin duplicar la lógica de cámara/permisos/fallback (Fase 3),
 * ver `docs/decisions/0003-perfil-ocr-contratos.md`.
 */
export function UploadDocumentForm({ documentType, documentTypeLabel, title, description, bullets, tip, submitLabel, allowMultiplePages = false }: UploadDocumentFormProps) {
  const [state, formAction, pending] = useActionState(createDocument, createDocumentInitialState);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Soporte técnico (getUserMedia + contexto seguro) Y dispositivo móvil
  // (RNF-002/mobile first: en desktop no se ofrece cámara, solo el
  // selector de archivo — pedido explícito del equipo tras testing real).
  const [cameraSupported, setCameraSupported] = useState(false);
  // Distinto de cameraSupported: ese es solo el chequeo previo (contexto
  // seguro + API presente); esto marca que getUserMedia falló en la
  // práctica (permiso denegado, cámara en uso, etc.) — una vez ocurre, no
  // tiene sentido seguir ofreciendo "Usar cámara" en esta sesión.
  const [cameraFailed, setCameraFailed] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const cameraAvailable = cameraSupported && !cameraFailed;

  // El input real (name="file") es la única fuente que lee `createDocument`
  // (formData.getAll("file")) -- para fotos que llegan por cámara (no por
  // el <input> nativo) hay que reflejarlas ahí a mano vía DataTransfer.
  // Centralizado en un efecto (en vez de repetirlo en cada handler) para
  // que cámara y selección manual con `allowMultiplePages` (que acumula en
  // vez de reemplazar) queden siempre sincronizadas con `selectedFiles`.
  useEffect(() => {
    if (!fileInputRef.current) return;
    const dataTransfer = new DataTransfer();
    selectedFiles.forEach((file) => dataTransfer.items.add(file));
    fileInputRef.current.files = dataTransfer.files;
  }, [selectedFiles]);

  // Chequeo de soporte solo en el cliente: getUserMedia/isSecureContext/
  // userAgentData no existen durante el render en servidor, así que no se
  // puede derivar este estado durante el render (rompería la hidratación)
  // — tiene que vivir en un efecto que solo corre tras montar en el
  // navegador.
  useEffect(() => {
    const availabilityError = checkCameraAvailability({
      hasMediaDevices: typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
      isSecureContext: typeof window !== "undefined" && window.isSecureContext,
    });
    const uaData = (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
    const mobile = isMobileDevice({
      userAgentDataMobile: uaData?.mobile,
      maxTouchPoints: navigator.maxTouchPoints,
    });
    const supported = availabilityError === null && mobile;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver comentario arriba del efecto
    setCameraSupported(supported);
    setShowCamera(supported);
  }, []);

  function handleCameraConfirm(file: File) {
    setSelectedFiles((prev) => (allowMultiplePages ? [...prev, file] : [file]));
    setShowCamera(false);
  }

  function handleCameraUnavailable() {
    setCameraFailed(true);
    setShowCamera(false);
  }

  function handleRetake() {
    setSelectedFiles([]);
    setShowCamera(true);
  }

  // Solo para `allowMultiplePages`: reabre la cámara SIN limpiar las
  // páginas ya confirmadas -- a diferencia de `handleRetake` (invoice_es),
  // que reemplaza la única foto existente.
  function handleAddAnotherPage() {
    setShowCamera(true);
  }

  function handleManualFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    setSelectedFiles((prev) => (allowMultiplePages ? [...prev, ...picked] : picked.slice(0, 1)));
    setShowCamera(false);
  }

  function handleUseCamera() {
    setSelectedFiles([]);
    setShowCamera(true);
  }

  function handlePickDifferentFile() {
    fileInputRef.current?.click();
  }

  function handleRemoveFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  // El <input> real (name="file") SIEMPRE está montado en la misma
  // posición del árbol — solo cambia su className entre visible/oculto.
  // Nunca se desmonta condicionalmente: si se hiciera, fileInputRef.current
  // sería null justo cuando handleCameraConfirm necesita asignarle el
  // archivo capturado.
  const showFallbackInputVisible = !showCamera && selectedFiles.length === 0 && !cameraAvailable;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <PageHero title={title} description={description} bullets={bullets} tip={tip} />

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="documentType" value={documentType} />

        <div className="flex flex-col gap-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Tipo de documento
          <p className="rounded-md border border-neutral-200 bg-neutral-100 px-4 py-3 text-base text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
            {documentTypeLabel}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Imagen (JPG o PNG)
          </span>

          {showCamera ? (
            <CameraCapture onConfirm={handleCameraConfirm} onCancel={handleCameraUnavailable} />
          ) : selectedFiles.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
              {selectedFiles.map((file, index) => (
                <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm text-neutral-600 dark:text-neutral-400">
                    {allowMultiplePages ? `Página ${index + 1}: ${file.name}` : file.name}
                  </p>
                  {allowMultiplePages && selectedFiles.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(index)}
                      className="shrink-0 text-xs font-medium text-red-600 dark:text-red-400"
                    >
                      Quitar
                    </button>
                  ) : null}
                </div>
              ))}
              <div className="flex gap-2">
                {cameraAvailable ? (
                  <button
                    type="button"
                    onClick={allowMultiplePages ? handleAddAnotherPage : handleRetake}
                    className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
                  >
                    {allowMultiplePages ? "Agregar otra página" : "Repetir foto"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handlePickDifferentFile}
                  className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
                >
                  {allowMultiplePages ? "Agregar desde archivo" : "Elegir otra imagen"}
                </button>
              </div>
            </div>
          ) : cameraAvailable ? (
            <button
              type="button"
              onClick={handleUseCamera}
              className="rounded-md bg-neutral-900 px-4 py-3 text-base font-medium text-white dark:bg-neutral-50 dark:text-neutral-900"
            >
              Usar cámara
            </button>
          ) : null}

          <label className={showFallbackInputVisible ? "flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-400" : "hidden"}>
            Selecciona un archivo
            <input
              ref={fileInputRef}
              type="file"
              name="file"
              accept="image/jpeg,image/png"
              multiple={allowMultiplePages}
              required={selectedFiles.length === 0}
              onChange={handleManualFileChange}
              className={
                showFallbackInputVisible
                  ? "rounded-md border border-neutral-300 px-4 py-3 text-base text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
                  : "hidden"
              }
              tabIndex={showFallbackInputVisible ? undefined : -1}
              aria-hidden={showFallbackInputVisible ? undefined : true}
            />
          </label>
        </div>

        {state.error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending || selectedFiles.length === 0}
          className="rounded-md bg-neutral-900 px-4 py-3 text-base font-medium text-white disabled:opacity-60 dark:bg-neutral-50 dark:text-neutral-900"
        >
          {pending ? "Subiendo..." : submitLabel}
        </button>
      </form>
    </div>
  );
}
