import { signOut } from "@/modules/auth/actions";

interface DashboardNavProps {
  email: string;
  role: string;
}

export function DashboardNav({ email, role }: DashboardNavProps) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-50">
        Mansor
      </p>

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
    </header>
  );
}
