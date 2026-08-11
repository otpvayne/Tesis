import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listDocuments } from "@/modules/documents/queries";
import { DOCUMENT_STATUSES, type DocumentStatus } from "@/modules/documents/types";
import { getDocumentStatusLabel, getDocumentTypeLabel } from "@/lib/constants/document-display";

interface DocumentsSearchParams {
  page?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface DocumentsPageProps {
  searchParams: Promise<DocumentsSearchParams>;
}

function isDocumentStatus(value: string | undefined): value is DocumentStatus {
  return !!value && (DOCUMENT_STATUSES as readonly string[]).includes(value);
}

function buildHref(sp: DocumentsSearchParams, page: number): string {
  const params = new URLSearchParams();
  if (sp.status) params.set("status", sp.status);
  if (sp.dateFrom) params.set("dateFrom", sp.dateFrom);
  if (sp.dateTo) params.set("dateTo", sp.dateTo);
  params.set("page", String(page));
  return `/documents?${params.toString()}`;
}

export default async function DocumentsPage({ searchParams }: DocumentsPageProps) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const status = isDocumentStatus(sp.status) ? sp.status : undefined;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const result = await listDocuments(supabase, {
    ownerId: user.id,
    filters: { status, dateFrom: sp.dateFrom, dateTo: sp.dateTo },
    pagination: { page, pageSize: 20 },
  });

  const totalPages = Math.max(1, Math.ceil(result.totalCount / result.pageSize));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
          Mis documentos
        </h1>
        <Link
          href="/documents/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-50 dark:text-neutral-900"
        >
          Nuevo
        </Link>
      </div>

      <form method="get" className="flex flex-wrap gap-2">
        <select
          name="status"
          defaultValue={status ?? ""}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
        >
          <option value="">Todos los estados</option>
          {DOCUMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {getDocumentStatusLabel(s)}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="dateFrom"
          defaultValue={sp.dateFrom ?? ""}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
        />
        <input
          type="date"
          name="dateTo"
          defaultValue={sp.dateTo ?? ""}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
        />
        <button
          type="submit"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
        >
          Filtrar
        </button>
      </form>

      {result.items.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          No hay documentos todavía.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-200 rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {result.items.map((doc) => (
            <li key={doc.id}>
              <Link
                href={`/documents/${doc.id}`}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span className="text-neutral-900 dark:text-neutral-50">
                  {getDocumentTypeLabel(doc.document_type)}
                </span>
                <span className="text-neutral-500 dark:text-neutral-400">
                  {getDocumentStatusLabel(doc.status)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between text-sm text-neutral-600 dark:text-neutral-400">
        <span>
          Página {result.page} de {totalPages}
        </span>
        <div className="flex gap-3">
          {page > 1 ? <Link href={buildHref(sp, page - 1)}>Anterior</Link> : null}
          {page < totalPages ? <Link href={buildHref(sp, page + 1)}>Siguiente</Link> : null}
        </div>
      </div>
    </div>
  );
}
