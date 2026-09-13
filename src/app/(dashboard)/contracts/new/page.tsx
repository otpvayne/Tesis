import { UploadDocumentForm } from "@/modules/documents/upload-form";

/** Sección separada de "Documentos" (facturas) -- perfil OCR `contract_es`, ver `docs/decisions/0003-perfil-ocr-contratos.md`. Usa Tesseract.js (no el pipeline propio), ver `ocrEngineForDocumentType`. */
export default function NewContractPage() {
  return (
    <UploadDocumentForm
      documentType="contract_es"
      documentTypeLabel="Contrato"
      title="Subir contrato"
      description="Sube un contrato para que el sistema ejecute OCR automáticamente"
      bullets={["Puedes subir varias fotos si el contrato tiene más de una página", "Sistema procesa y extrae campos automáticamente", "Validar datos en siguiente paso"]}
      tip="Fotos claras = mejor OCR. Iluminación natural, ángulo frontal. Incluye las páginas donde estén el valor, la vigencia y la firma."
      submitLabel="Subir contrato"
      allowMultiplePages
    />
  );
}
