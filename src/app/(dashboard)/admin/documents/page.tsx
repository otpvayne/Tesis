import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/require-admin-page";
import { listDocuments, type DocumentWithOwnerEmail } from "@/modules/documents/queries";
import { DOCUMENT_STATUSES, type DocumentStatus } from "@/modules/documents/types";
import { getDocumentStatusLabel } from "@/lib/constants/document-display";

interface AdminDocumentsSearchParams {
  page?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

interface AdminDocumentsPageProps {
  searchParams: Promise<AdminDocumentsSearchParams>;
}

function isDocumentStatus(value: string | undefined): value is DocumentStatus {
  return !!value && (DOCUMENT_STATUSES as readonly string[]).includes(value);
}

function buildHref(sp: AdminDocumentsSearchParams, page: number): string {
  const params = new URLSearchParams();
  if (sp.status) params.set("status", sp.status);
  if (sp.dateFrom) params.set("dateFrom", sp.dateFrom);
  if (sp.dateTo) params.set("dateTo", sp.dateTo);
  if (sp.search) params.set("search", sp.search);
  params.set("page", String(page));
  return `/admin/documents?${params.toString()}`;
}

/** Fila de `ocr_results` más reciente (por `created_at`) -- puede haber varias por reintentos, `documents/[id]/page.tsx` usa el mismo criterio. */
function latestConfidence(doc: DocumentWithOwnerEmail): number | null {
  if (!doc.ocr_results || doc.ocr_results.length === 0) return null;
  const latest = [...doc.ocr_results].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return latest.confidence;
}

const STATUS_ICON: Record<string, string> = {
  validated: "✅",
  rejected: "❌",
  failed: "⚠️",
  processing: "⏳",
  processed: "⏳",
  uploaded: "⏳",
};

export default async function AdminDocumentsPage({ searchParams }: AdminDocumentsPageProps) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const status = isDocumentStatus(sp.status) ? sp.status : undefined;
  const currentViewHref = buildHref(sp, page);

  const { supabase } = await requireAdminPage();

  const result = await listDocuments(supabase, {
    filters: { status, dateFrom: sp.dateFrom, dateTo: sp.dateTo, search: sp.search },
    pagination: { page, pageSize: 20 },
    includeOwnerEmail: true,
    includeOcrConfidence: true,
  });

  const items = result.items as DocumentWithOwnerEmail[];
  const totalPages = Math.max(1, Math.ceil(result.totalCount / result.pageSize));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Documentos — todos los usuarios</h1>

      <form method="get" className="flex flex-wrap gap-2">
        <input
          type="search"
          name="search"
          placeholder="ID exacto (UUID completo)..."
          defaultValue={sp.search ?? ""}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
        />
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
        <button type="submit" className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">
          Filtrar
        </button>
      </form>

      {items.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">No hay documentos que coincidan con estos filtros.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-500">
                <th className="px-4 py-2">Usuario</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Confianza OCR</th>
                <th className="px-4 py-2">Validado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((doc) => {
                const confidence = latestConfidence(doc);
                return (
                  <tr key={doc.id} className="border-t border-neutral-100 hover:bg-neutral-50 dark:border-neutral-900 dark:hover:bg-neutral-900">
                    <td className="px-4 py-2">
                      <Link href={`/documents/${doc.id}?back=${encodeURIComponent(currentViewHref)}`} className="text-neutral-900 hover:underline dark:text-neutral-50">
                        {doc.owner?.email ?? doc.owner_id}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{getDocumentStatusLabel(doc.status)}</td>
                    <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{confidence === null ? "—" : `${(confidence * 100).toFixed(0)}%`}</td>
                    <td className="px-4 py-2">{STATUS_ICON[doc.status] ?? "⏳"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-neutral-600 dark:text-neutral-400">
        <span>
          Página {result.page} de {totalPages} — {result.totalCount} documentos totales
        </span>
        <div className="flex gap-3">
          {page > 1 ? <Link href={buildHref(sp, page - 1)}>Anterior</Link> : null}
          {page < totalPages ? <Link href={buildHref(sp, page + 1)}>Siguiente</Link> : null}
        </div>
      </div>
    </div>
  );
}
