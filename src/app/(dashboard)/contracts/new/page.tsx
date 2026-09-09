import { UploadDocumentForm } from "@/modules/documents/upload-form";

/** Sección separada de "Documentos" (facturas) -- perfil OCR `contract_es`, ver `docs/decisions/0003-perfil-ocr-contratos.md`. Usa Tesseract.js (no el pipeline propio), ver `ocrEngineForDocumentType`. */
export default function NewContractPage() {
  return (
    <UploadDocumentForm
      documentType="contract_es"
      documentTypeLabel="Contrato"
      title="Subir contrato"
      description="Sube un contrato para que el sistema ejecute OCR automáticamente"
      bullets={["Seleccionar archivo JPG o PNG", "Sistema procesa y extrae campos automáticamente", "Validar datos en siguiente paso"]}
      tip="Fotos claras = mejor OCR. Iluminación natural, ángulo frontal."
      submitLabel="Subir contrato"
    />
  );
}
