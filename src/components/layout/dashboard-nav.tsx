import Link from "next/link";
import { signOut } from "@/modules/auth/actions";

interface DashboardNavProps {
  email: string;
  role: string;
}

export function DashboardNav({ email, role }: DashboardNavProps) {
  const isAdmin = role === "ADMIN";

  return (
    <header className="flex flex-col gap-2 border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/"
          className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-50"
        >
          Mansor
        </Link>

        <div className="flex items-center gap-3">
          <div className="hidden text-right text-sm sm:block">
            <p className="truncate text-neutral-900 dark:text-neutral-50">{email}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{role}</p>
          </div>

          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
            >
              Salir
            </button>
          </form>
        </div>
      </div>

      <nav className="flex gap-4 text-sm text-neutral-600 dark:text-neutral-400">
        <Link href="/documents" className="hover:text-neutral-900 dark:hover:text-neutral-50">
          Mis documentos
        </Link>
        <Link
          href="/documents/new"
          className="hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          Nuevo documento
        </Link>
        {isAdmin ? (
          <Link href="/admin" className="hover:text-neutral-900 dark:hover:text-neutral-50">
            Admin: dashboard
          </Link>
        ) : null}
        {isAdmin ? (
          <Link
            href="/admin/documents"
            className="hover:text-neutral-900 dark:hover:text-neutral-50"
          >
            Admin: documentos
          </Link>
        ) : null}
        {isAdmin ? (
          <Link href="/admin/validations" className="hover:text-neutral-900 dark:hover:text-neutral-50">
            Admin: validaciones
          </Link>
        ) : null}
        {isAdmin ? (
          <Link href="/admin/models" className="hover:text-neutral-900 dark:hover:text-neutral-50">
            Admin: modelos
          </Link>
        ) : null}
        {isAdmin ? (
          <Link href="/admin/reports" className="hover:text-neutral-900 dark:hover:text-neutral-50">
            Admin: reportes
          </Link>
        ) : null}
      </nav>
    </header>
  );
}
