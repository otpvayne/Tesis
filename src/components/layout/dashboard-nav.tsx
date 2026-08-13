import Link from "next/link";
import { signOut } from "@/modules/auth/actions";
import { Button } from "@/components/common/Button";

interface DashboardNavProps {
  email: string;
  role: string;
}

export function DashboardNav({ email, role }: DashboardNavProps) {
  const isAdmin = role === "ADMIN";

  return (
    <header className="flex flex-col gap-2 border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="truncate font-display text-base font-bold text-brand-700 dark:text-brand-400">
          Mansor
        </Link>

        <div className="flex items-center gap-3">
          <div className="hidden text-right text-sm sm:block">
            <p className="truncate text-neutral-900 dark:text-neutral-50">{email}</p>
            <p className={`text-xs ${isAdmin ? "text-brand-600 dark:text-brand-400" : "text-neutral-500 dark:text-neutral-400"}`}>{role}</p>
          </div>

          <form action={signOut}>
            <Button type="submit" variant="secondary" size="sm">
              Salir
            </Button>
          </form>
        </div>
      </div>

      <nav className="flex gap-4 text-sm font-medium text-neutral-600 dark:text-neutral-400">
        <Link href="/documents" className="transition-colors hover:text-brand-700 dark:hover:text-brand-400">
          Mis documentos
        </Link>
        <Link href="/documents/new" className="transition-colors hover:text-brand-700 dark:hover:text-brand-400">
          Nuevo documento
        </Link>
        {isAdmin ? (
          <Link href="/admin" className="transition-colors hover:text-brand-700 dark:hover:text-brand-400">
            Admin: dashboard
          </Link>
        ) : null}
        {isAdmin ? (
          <Link href="/admin/documents" className="transition-colors hover:text-brand-700 dark:hover:text-brand-400">
            Admin: documentos
          </Link>
        ) : null}
        {isAdmin ? (
          <Link href="/admin/validations" className="transition-colors hover:text-brand-700 dark:hover:text-brand-400">
            Admin: validaciones
          </Link>
        ) : null}
        {isAdmin ? (
          <Link href="/admin/models" className="transition-colors hover:text-brand-700 dark:hover:text-brand-400">
            Admin: modelos
          </Link>
        ) : null}
        {isAdmin ? (
          <Link href="/admin/reports" className="transition-colors hover:text-brand-700 dark:hover:text-brand-400">
            Admin: reportes
          </Link>
        ) : null}
      </nav>
    </header>
  );
}
