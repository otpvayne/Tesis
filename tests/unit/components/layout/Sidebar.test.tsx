import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockUsePathname } = vi.hoisted(() => ({ mockUsePathname: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: mockUsePathname,
}));

vi.mock("@/modules/auth/actions", () => ({
  signOut: vi.fn(),
}));

// El import dinámico va después de los mocks -- vi.mock se hoistea, pero
// mantenerlo explícito evita depender de ese comportamiento implícito.
const { Sidebar } = await import("@/components/layout/Sidebar");

describe("Sidebar", () => {
  it("no muestra la sección Admin para un usuario normal", () => {
    mockUsePathname.mockReturnValue("/documents");
    render(<Sidebar email="user@example.com" role="USER" />);
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
    expect(screen.queryByText("Modelos OCR")).not.toBeInTheDocument();
  });

  it("muestra la sección Admin (incluyendo OCR Lab, nunca antes en ningún nav) para un ADMIN", () => {
    mockUsePathname.mockReturnValue("/documents");
    render(<Sidebar email="admin@example.com" role="ADMIN" />);
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("OCR Lab: Preview")).toBeInTheDocument();
    expect(screen.getByText("OCR Lab: Entrenar")).toBeInTheDocument();
  });

  it("resalta el link con coincidencia exacta", () => {
    mockUsePathname.mockReturnValue("/documents/new");
    render(<Sidebar email="user@example.com" role="USER" />);
    expect(screen.getByRole("link", { name: "Nuevo documento" }).className).toContain("bg-brand-600");
    expect(screen.getByRole("link", { name: "Documentos" }).className).not.toContain("bg-brand-600");
  });

  it("un id de documento resalta 'Documentos' (prefijo más específico), no 'Nuevo documento'", () => {
    mockUsePathname.mockReturnValue("/documents/abc123");
    render(<Sidebar email="user@example.com" role="USER" />);
    expect(screen.getByRole("link", { name: "Documentos" }).className).toContain("bg-brand-600");
    expect(screen.getByRole("link", { name: "Nuevo documento" }).className).not.toContain("bg-brand-600");
  });

  it("una ruta admin exacta resalta el item admin correspondiente", () => {
    mockUsePathname.mockReturnValue("/admin/models");
    render(<Sidebar email="admin@example.com" role="ADMIN" />);
    expect(screen.getByRole("link", { name: "Modelos OCR" }).className).toContain("bg-brand-600");
    expect(screen.getByRole("link", { name: "Dashboard" }).className).not.toContain("bg-brand-600");
  });

  it("el botón de menú mobile alterna aria-expanded", async () => {
    mockUsePathname.mockReturnValue("/documents");
    render(<Sidebar email="user@example.com" role="USER" />);
    const menuButton = screen.getByRole("button", { name: "Abrir menú" });
    expect(menuButton).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(menuButton);
    expect(screen.getByRole("button", { name: "Cerrar menú" })).toHaveAttribute("aria-expanded", "true");
  });
});
