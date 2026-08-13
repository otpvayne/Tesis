"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/modules/auth/actions";
import { Button } from "@/components/common/Button";

interface SidebarProps {
  email: string;
  role: string;
}

interface NavItem {
  href: string;
  label: string;
}

const MAIN_NAV: NavItem[] = [
  { href: "/documents", label: "Documentos" },
  { href: "/documents/new", label: "Nuevo documento" },
];

/**
 * `/ocr-lab/preview` y `/ocr-lab/train` son admin-only (`CLAUDE.md` §7:
 * "OCR LAB (solo admin)") -- van en la sección admin, no en la principal.
 * Nunca habían estado en ningún nav (solo alcanzables tecleando la URL);
 * se agregan aquí por primera vez.
 */
const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/documents", label: "Documentos" },
  { href: "/admin/validations", label: "Validaciones" },
  { href: "/admin/models", label: "Modelos OCR" },
  { href: "/admin/reports", label: "Reportes" },
  { href: "/ocr-lab/preview", label: "OCR Lab: Preview" },
  { href: "/ocr-lab/train", label: "OCR Lab: Entrenar" },
];

/** Coincidencia exacta primero; si no hay, el prefijo más específico (`/documents/abc123` resalta "Documentos", no confunde con "Nuevo documento"). */
function findActiveHref(pathname: string, items: NavItem[]): string | null {
  const exact = items.find((item) => item.href === pathname);
  if (exact) return exact.href;

  const prefixMatches = items.filter((item) => pathname.startsWith(`${item.href}/`));
  if (prefixMatches.length === 0) return null;
  return prefixMatches.reduce((longest, item) => (item.href.length > longest.href.length ? item : longest)).href;
}

function NavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`block rounded-md px-4 py-3 text-sm font-medium transition-colors ${
        active ? "bg-brand-600 text-white" : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
      }`}
    >
      {item.label}
    </Link>
  );
}

/**
 * Nav vertical permanente (Fase 1 del rediseño UX/UI) -- reemplaza
 * `DashboardNav` (nav horizontal superior) por completo, misma
 * información (logo, links, perfil, logout), estructura nueva. Sin
 * iconos todavía a propósito: el rediseño los trata como una fase
 * aparte (Fase 3), agregarlos ahora sería adelantar trabajo que se pidió
 * separado.
 *
 * Mobile (`<768px`): colapsa a una barra superior delgada con botón de
 * menú; el panel se vuelve un drawer que se desliza desde la izquierda
 * con un overlay detrás. Desktop (`md:` y arriba): panel fijo de 240px,
 * siempre visible, sin botón de menú.
 */
export function Sidebar({ email, role }: SidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isAdmin = role === "ADMIN";

  const activeMain = findActiveHref(pathname, MAIN_NAV);
  const activeAdmin = findActiveHref(pathname, ADMIN_NAV);

  function closeDrawer() {
    setOpen(false);
  }

  return (
    <>
      {/* Barra superior -- solo mobile */}
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 md:hidden dark:border-neutral-800 dark:bg-neutral-900">
        <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 font-display text-base font-bold text-white">
          M
        </Link>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {/* Overlay -- solo mobile, mientras el drawer está abierto */}
      {open ? <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={closeDrawer} aria-hidden="true" /> : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 -translate-x-full transform flex-col border-r border-neutral-200 bg-neutral-50 transition-transform duration-200 ease-signature md:sticky md:top-0 md:h-screen md:w-60 md:translate-x-0 dark:border-neutral-800 dark:bg-neutral-950 ${
          open ? "translate-x-0" : ""
        }`}
      >
        <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-4 dark:border-neutral-800">
          <Link href="/" onClick={closeDrawer} className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 font-display text-base font-bold text-white">
            M
          </Link>
          <span className="font-display text-base font-bold text-brand-700 dark:text-brand-400">Mansor</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
          {MAIN_NAV.map((item) => (
            <NavLink key={item.href} item={item} active={item.href === activeMain} onNavigate={closeDrawer} />
          ))}

          {isAdmin ? (
            <>
              <p className="mt-4 px-4 pb-1 text-xs font-semibold tracking-wide text-neutral-400 uppercase dark:text-neutral-600">Admin</p>
              {ADMIN_NAV.map((item) => (
                <NavLink key={item.href} item={item} active={item.href === activeAdmin} onNavigate={closeDrawer} />
              ))}
            </>
          ) : null}
        </nav>

        <div className="border-t border-neutral-200 px-4 py-4 dark:border-neutral-800">
          <p className="truncate text-sm text-neutral-900 dark:text-neutral-50">{email}</p>
          <p className={`mb-3 text-xs ${isAdmin ? "text-brand-600 dark:text-brand-400" : "text-neutral-500 dark:text-neutral-400"}`}>{role}</p>
          <form action={signOut}>
            <Button type="submit" variant="secondary" size="sm" className="w-full">
              Salir
            </Button>
          </form>
        </div>
      </aside>
    </>
  );
}
