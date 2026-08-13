import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHero } from "@/components/common/PageHero";

describe("PageHero", () => {
  it("renderiza título, descripción, cada bullet y el tip", () => {
    render(
      <PageHero
        title="Documentos"
        description="Sube, procesa y valida facturas."
        bullets={["Subir una factura nueva", "Ver el historial"]}
        tip="Fotos claras dan mejor OCR."
      />,
    );

    expect(screen.getByRole("heading", { name: "Documentos" })).toBeInTheDocument();
    expect(screen.getByText("Sube, procesa y valida facturas.")).toBeInTheDocument();
    expect(screen.getByText("Subir una factura nueva")).toBeInTheDocument();
    expect(screen.getByText("Ver el historial")).toBeInTheDocument();
    expect(screen.getByText(/Fotos claras dan mejor OCR\./)).toBeInTheDocument();
  });

  it("las 3 secciones tienen un delay de animación distinto (efecto staggered)", () => {
    render(<PageHero title="T" description="D" bullets={["B"]} tip="Tip" />);
    const heading = screen.getByRole("heading", { name: "T" });
    const description = screen.getByText("D");
    expect(heading.style.animationDelay).toBe("0ms");
    expect(description.style.animationDelay).toBe("100ms");
  });
});
