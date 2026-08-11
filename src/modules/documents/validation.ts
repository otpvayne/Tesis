/**
 * Límite de tamaño de subida (RNF-003). 10 MB es holgado para una foto de
 * factura tomada con cámara de celular moderna sin permitir archivos
 * desproporcionados. Espeja el `file_size_limit` del bucket de Storage
 * (segunda barrera, ver supabase/migrations/*_create_documents_storage_bucket.sql).
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png"] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function matchesMagic(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((byte, i) => bytes[i] === byte);
}

/**
 * Detecta el tipo real de una imagen a partir de sus primeros bytes (magic
 * numbers), en vez de confiar en el `type` que reporta el navegador — ese
 * valor lo controla el cliente y no es una garantía de seguridad (RNF-003:
 * "no confiar en nombres de archivo del cliente" se extiende a su MIME
 * declarado).
 */
export function sniffImageMime(bytes: Uint8Array): AllowedMimeType | null {
  if (matchesMagic(bytes, PNG_MAGIC)) return "image/png";
  if (matchesMagic(bytes, JPEG_MAGIC)) return "image/jpeg";
  return null;
}

export function extensionForMime(mime: AllowedMimeType): "jpg" | "png" {
  return mime === "image/png" ? "png" : "jpg";
}

export type UploadValidationError =
  | { code: "FILE_MISSING"; message: string }
  | { code: "FILE_TOO_LARGE"; message: string }
  | { code: "MIME_NOT_ALLOWED"; message: string }
  | { code: "MIME_MISMATCH"; message: string };

export type UploadValidationResult =
  | { ok: true; mime: AllowedMimeType; bytes: Uint8Array }
  | { ok: false; error: UploadValidationError };

/**
 * Valida un archivo subido antes de escribirlo en Storage: tamaño, MIME
 * declarado por el cliente, y MIME real (magic bytes) — deben coincidir.
 */
export async function validateUploadFile(
  file: File | null,
): Promise<UploadValidationResult> {
  if (!file || file.size === 0) {
    return {
      ok: false,
      error: { code: "FILE_MISSING", message: "Selecciona un archivo de imagen." },
    };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: {
        code: "FILE_TOO_LARGE",
        message: `El archivo supera el tamaño máximo permitido (${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB).`,
      },
    };
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type as AllowedMimeType)) {
    return {
      ok: false,
      error: {
        code: "MIME_NOT_ALLOWED",
        message: "Solo se aceptan imágenes JPG o PNG.",
      },
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImageMime(bytes);

  if (!sniffed || sniffed !== file.type) {
    return {
      ok: false,
      error: {
        code: "MIME_MISMATCH",
        message: "El contenido del archivo no coincide con una imagen JPG o PNG válida.",
      },
    };
  }

  return { ok: true, mime: sniffed, bytes };
}
