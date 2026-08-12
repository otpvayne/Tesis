import { describe, expect, it } from "vitest";
import { isMobileDevice } from "@/modules/camera/device";

describe("isMobileDevice", () => {
  it("confía en userAgentData.mobile=true sin importar maxTouchPoints", () => {
    expect(isMobileDevice({ userAgentDataMobile: true, maxTouchPoints: 0 })).toBe(true);
  });

  it("confía en userAgentData.mobile=false sin importar maxTouchPoints", () => {
    expect(isMobileDevice({ userAgentDataMobile: false, maxTouchPoints: 10 })).toBe(false);
  });

  it("usa maxTouchPoints > 2 como fallback cuando userAgentData no existe", () => {
    expect(isMobileDevice({ userAgentDataMobile: undefined, maxTouchPoints: 5 })).toBe(true);
  });

  it("no considera móvil un maxTouchPoints bajo (trackpad/laptop) sin userAgentData", () => {
    expect(isMobileDevice({ userAgentDataMobile: undefined, maxTouchPoints: 1 })).toBe(false);
    expect(isMobileDevice({ userAgentDataMobile: undefined, maxTouchPoints: 2 })).toBe(false);
  });

  it("trata maxTouchPoints ausente como 0 (no móvil)", () => {
    expect(isMobileDevice({ userAgentDataMobile: undefined, maxTouchPoints: undefined })).toBe(
      false,
    );
  });
});
