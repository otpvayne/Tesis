import { describe, expect, it } from "vitest";
import { checkCameraAvailability } from "@/modules/camera/availability";

describe("checkCameraAvailability", () => {
  it("devuelve null cuando hay contexto seguro y mediaDevices", () => {
    expect(checkCameraAvailability({ hasMediaDevices: true, isSecureContext: true })).toBeNull();
  });

  it("devuelve INSECURE_CONTEXT cuando no hay contexto seguro, sin importar mediaDevices", () => {
    expect(
      checkCameraAvailability({ hasMediaDevices: true, isSecureContext: false })?.code,
    ).toBe("INSECURE_CONTEXT");
    expect(
      checkCameraAvailability({ hasMediaDevices: false, isSecureContext: false })?.code,
    ).toBe("INSECURE_CONTEXT");
  });

  it("devuelve BROWSER_UNSUPPORTED cuando el contexto es seguro pero no hay mediaDevices", () => {
    expect(
      checkCameraAvailability({ hasMediaDevices: false, isSecureContext: true })?.code,
    ).toBe("BROWSER_UNSUPPORTED");
  });
});
