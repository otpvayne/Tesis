import { describe, expect, it } from "vitest";
import { requireEnv } from "@/lib/utils/env";

describe("requireEnv", () => {
  it("returns the value when it is a non-empty string", () => {
    expect(requireEnv("FOO", "bar")).toBe("bar");
  });

  it("throws when the value is undefined", () => {
    expect(() => requireEnv("FOO", undefined)).toThrow(
      "Missing required environment variable: FOO",
    );
  });

  it("throws when the value is an empty or whitespace-only string", () => {
    expect(() => requireEnv("FOO", "   ")).toThrow(
      "Missing required environment variable: FOO",
    );
  });
});
