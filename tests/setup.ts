import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

/**
 * `vitest.config.mts` usa `globals: false` (cada test importa
 * `describe`/`it`/`expect` de `"vitest"` explícitamente, sin globals
 * mágicos) -- por eso el auto-cleanup de `@testing-library/react` (que
 * depende de un `afterEach` global) no se activa solo, hay que
 * registrarlo aquí explícitamente. Sin esto, un componente renderizado en
 * un test queda montado en el DOM del siguiente test del mismo archivo.
 */
afterEach(() => {
  cleanup();
});
