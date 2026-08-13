import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@/components/common/Button";

describe("Button", () => {
  it("por defecto usa variant=primary y size=md", () => {
    render(<Button>Guardar</Button>);
    const button = screen.getByRole("button", { name: "Guardar" });
    expect(button.className).toContain("bg-brand-600");
    expect(button.className).toContain("px-4 py-3");
  });

  it("variant=danger aplica los tokens de color crítico", () => {
    render(<Button variant="danger">Rechazar</Button>);
    expect(screen.getByRole("button", { name: "Rechazar" }).className).toContain("critical");
  });

  it("variant=secondary aplica borde neutro, no relleno de marca", () => {
    render(<Button variant="secondary">Cancelar</Button>);
    const className = screen.getByRole("button", { name: "Cancelar" }).className;
    expect(className).toContain("border-neutral-300");
    expect(className).not.toContain("bg-brand-600");
  });

  it("propaga disabled y no dispara onClick", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Enviar
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Enviar" });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("variant=outline aplica borde y texto de marca, sin relleno por defecto", () => {
    render(<Button variant="outline">Editar</Button>);
    const classes = screen.getByRole("button", { name: "Editar" }).className.split(/\s+/);
    expect(classes).toContain("border-brand-500");
    expect(classes).toContain("text-brand-600");
    expect(classes).not.toContain("bg-brand-600");
    expect(classes).toContain("hover:bg-brand-600");
  });

  it("acepta className extra sin perder las clases base", () => {
    render(<Button className="w-full">Full width</Button>);
    const className = screen.getByRole("button", { name: "Full width" }).className;
    expect(className).toContain("w-full");
    expect(className).toContain("bg-brand-600");
  });
});
