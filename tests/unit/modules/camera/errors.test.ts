import { describe, expect, it } from "vitest";
import { classifyCameraError } from "@/modules/camera/errors";

function domException(name: string): DOMException {
  return new DOMException("test message", name);
}

describe("classifyCameraError", () => {
  it.each([
    ["NotAllowedError", "PERMISSION_DENIED"],
    ["SecurityError", "PERMISSION_DENIED"],
    ["NotFoundError", "CAMERA_UNAVAILABLE"],
    ["OverconstrainedError", "CAMERA_UNAVAILABLE"],
    ["NotReadableError", "CAMERA_UNAVAILABLE"],
    ["AbortError", "CAMERA_UNAVAILABLE"],
  ])("clasifica DOMException %s como %s", (name, expectedCode) => {
    expect(classifyCameraError(domException(name)).code).toBe(expectedCode);
  });

  it("clasifica un DOMException no reconocido como CAPTURE_ERROR genérico", () => {
    expect(classifyCameraError(domException("UnknownError")).code).toBe("CAPTURE_ERROR");
  });

  it("clasifica un valor que no es DOMException como CAPTURE_ERROR genérico", () => {
    expect(classifyCameraError(new Error("boom")).code).toBe("CAPTURE_ERROR");
    expect(classifyCameraError("string cualquiera").code).toBe("CAPTURE_ERROR");
    expect(classifyCameraError(null).code).toBe("CAPTURE_ERROR");
    expect(classifyCameraError(undefined).code).toBe("CAPTURE_ERROR");
  });

  it("nunca devuelve el mensaje crudo del navegador", () => {
    const err = domException("NotAllowedError");
    const result = classifyCameraError(err);
    expect(result.message).not.toBe(err.message);
    expect(result.message.length).toBeGreaterThan(0);
  });
});
