"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createDocument } from "@/modules/documents/actions";
import { createDocumentInitialState } from "@/modules/documents/state";
import { DOCUMENT_TYPES } from "@/modules/documents/types";
import { getDocumentTypeLabel } from "@/lib/constants/document-display";
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

export default function NewDocumentPage() {
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const cameraAvailable = cameraSupported && !cameraFailed;

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
    // El input de abajo (name="file") sigue siendo la única fuente que lee
    // createDocument — la cámara solo le asigna su captura, sin duplicar
    // lógica de subida/validación ya existente desde Fase 2.
    if (fileInputRef.current) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInputRef.current.files = dataTransfer.files;
    }
    setSelectedFile(file);
    setShowCamera(false);
  }

  function handleCameraUnavailable() {
    setCameraFailed(true);
    setShowCamera(false);
  }

  function handleRetake() {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setShowCamera(true);
  }

  function handleManualFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
    setShowCamera(false);
  }

  function handleUseCamera() {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setShowCamera(true);
  }

  function handlePickDifferentFile() {
    fileInputRef.current?.click();
  }

  // El <input> real (name="file") SIEMPRE está montado en la misma
  // posición del árbol — solo cambia su className entre visible/oculto.
  // Nunca se desmonta condicionalmente: si se hiciera, fileInputRef.current
  // sería null justo cuando handleCameraConfirm necesita asignarle el
  // archivo capturado.
  const showFallbackInputVisible = !showCamera && !selectedFile && !cameraAvailable;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <PageHero
        title="Subir documento"
        description="Sube una factura para que el sistema ejecute OCR automáticamente"
        bullets={["Seleccionar archivo JPG o PNG", "Sistema procesa y extrae campos automáticamente", "Validar datos en siguiente paso"]}
        tip="Fotos claras = mejor OCR. Iluminación natural, ángulo frontal."
      />

      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Tipo de documento
          <p className="rounded-md border border-neutral-200 bg-neutral-100 px-4 py-3 text-base text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
            {getDocumentTypeLabel(DOCUMENT_TYPES[0])}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Imagen (JPG o PNG)
          </span>

          {showCamera ? (
            <CameraCapture onConfirm={handleCameraConfirm} onCancel={handleCameraUnavailable} />
          ) : selectedFile ? (
            <div className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
              <p className="truncate text-sm text-neutral-600 dark:text-neutral-400">
                {selectedFile.name}
              </p>
              <div className="flex gap-2">
                {cameraAvailable ? (
                  <button
                    type="button"
                    onClick={handleRetake}
                    className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
                  >
                    Repetir foto
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handlePickDifferentFile}
                  className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
                >
                  Elegir otra imagen
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
              capture="environment"
              required={!selectedFile}
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
          disabled={pending || !selectedFile}
          className="rounded-md bg-neutral-900 px-4 py-3 text-base font-medium text-white disabled:opacity-60 dark:bg-neutral-50 dark:text-neutral-900"
        >
          {pending ? "Subiendo..." : "Subir documento"}
        </button>
      </form>
    </div>
  );
}
