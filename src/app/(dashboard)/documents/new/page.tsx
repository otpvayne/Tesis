import { UploadDocumentForm } from "@/modules/documents/upload-form";

export default function NewDocumentPage() {
  return (
    <UploadDocumentForm
      documentType="invoice_es"
      documentTypeLabel="Factura"
      title="Subir documento"
      description="Sube una factura para que el sistema ejecute OCR automáticamente"
      bullets={["Seleccionar archivo JPG o PNG", "Sistema procesa y extrae campos automáticamente", "Validar datos en siguiente paso"]}
      tip="Fotos claras = mejor OCR. Iluminación natural, ángulo frontal."
      submitLabel="Subir documento"
    />
  );
}
