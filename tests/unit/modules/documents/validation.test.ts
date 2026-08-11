import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  extensionForMime,
  sniffImageMime,
  validateUploadFile,
} from "@/modules/documents/validation";

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const GIF_BYTES = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const EMPTY_BYTES = new Uint8Array(0);

describe("sniffImageMime", () => {
  it("detecta PNG por sus magic bytes", () => {
    expect(sniffImageMime(PNG_BYTES)).toBe("image/png");
  });

  it("detecta JPEG por sus magic bytes", () => {
    expect(sniffImageMime(JPEG_BYTES)).toBe("image/jpeg");
  });

  it("devuelve null para un formato no soportado (GIF)", () => {
    expect(sniffImageMime(GIF_BYTES)).toBeNull();
  });

  it("devuelve null para bytes vacíos o insuficientes", () => {
    expect(sniffImageMime(EMPTY_BYTES)).toBeNull();
    expect(sniffImageMime(Uint8Array.from([0xff, 0xd8]))).toBeNull();
  });
});

describe("extensionForMime", () => {
  it("mapea image/png a png", () => {
    expect(extensionForMime("image/png")).toBe("png");
  });

  it("mapea image/jpeg a jpg", () => {
    expect(extensionForMime("image/jpeg")).toBe("jpg");
  });
});

function makeFile(bytes: Uint8Array, type: string, name = "test"): File {
  return new File([bytes] as BlobPart[], name, { type });
}

describe("validateUploadFile", () => {
  it("acepta un PNG válido cuyo contenido coincide con el MIME declarado", async () => {
    const result = await validateUploadFile(makeFile(PNG_BYTES, "image/png"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mime).toBe("image/png");
    }
  });

  it("rechaza cuando no hay archivo", async () => {
    const result = await validateUploadFile(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FILE_MISSING");
  });

  it("rechaza un archivo mas grande que MAX_UPLOAD_BYTES", async () => {
    const bigBytes = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    bigBytes.set(PNG_BYTES);
    const result = await validateUploadFile(makeFile(bigBytes, "image/png"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FILE_TOO_LARGE");
  });

  it("rechaza un MIME declarado que no está en la lista permitida", async () => {
    const result = await validateUploadFile(makeFile(GIF_BYTES, "image/gif"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MIME_NOT_ALLOWED");
  });

  it("rechaza cuando el MIME declarado no coincide con el contenido real (spoofing)", async () => {
    // Declara ser PNG pero el contenido real es JPEG.
    const result = await validateUploadFile(makeFile(JPEG_BYTES, "image/png"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MIME_MISMATCH");
  });
});
