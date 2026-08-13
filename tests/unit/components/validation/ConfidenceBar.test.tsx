import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ConfidenceBar } from "@/components/validation/ConfidenceBar";

describe("ConfidenceBar", () => {
  it("expone el valor real via aria-valuenow (accesibilidad, no solo visual)", async () => {
    render(<ConfidenceBar confidence={0.87} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    await waitFor(() => expect(bar).toHaveAttribute("aria-valuenow", "87"));
  });

  it("etiqueta el nivel correcto segun los mismos umbrales que computeConfidenceLevel", async () => {
    const { rerender } = render(<ConfidenceBar confidence={0.95} />);
    await waitFor(() => expect(screen.getByText(/95% de confianza \(alta\)/)).toBeInTheDocument());

    rerender(<ConfidenceBar confidence={0.8} />);
    await waitFor(() => expect(screen.getByText(/80% de confianza \(media\)/)).toBeInTheDocument());

    rerender(<ConfidenceBar confidence={0.5} />);
    await waitFor(() => expect(screen.getByText(/50% de confianza \(baja\)/)).toBeInTheDocument());
  });

  it("valores fuera de rango se recortan a [0, 1] sin lanzar", async () => {
    render(<ConfidenceBar confidence={1.5} />);
    const bar = screen.getByRole("progressbar");
    await waitFor(() => expect(bar).toHaveAttribute("aria-valuenow", "100"));
  });

  it("showLabel=false oculta el texto pero conserva la barra accesible", () => {
    render(<ConfidenceBar confidence={0.6} showLabel={false} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByText(/de confianza/)).not.toBeInTheDocument();
  });
});
