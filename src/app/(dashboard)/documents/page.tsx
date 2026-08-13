import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listDocuments } from "@/modules/documents/queries";
import { DOCUMENT_STATUSES, type DocumentStatus } from "@/modules/documents/types";
import { getDocumentStatusLabel, getDocumentTypeLabel } from "@/lib/constants/document-display";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { PageHero } from "@/components/common/PageHero";

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

/** Mismo criterio semántico que los badges de confianza (brand=bien, caution=en curso, critical=mal) aplicado al status del documento, no un color nuevo por status. */
const STATUS_BADGE_CLASS: Record<string, string> = {
  validated: "bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-400",
  rejected: "bg-critical-100 text-critical-800 dark:bg-critical-950 dark:text-critical-400",
  failed: "bg-critical-100 text-critical-800 dark:bg-critical-950 dark:text-critical-400",
  processing: "bg-caution-100 text-caution-800 dark:bg-caution-950 dark:text-caution-400",
  uploaded: "bg-caution-100 text-caution-800 dark:bg-caution-950 dark:text-caution-400",
  processed: "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
};

export default async function DocumentsPage({ searchParams }: DocumentsPageProps) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const status = isDocumentStatus(sp.status) ? sp.status : undefined;
  // Vista actual (con filtros/página) para que el botón "Volver" del
  // detalle regrese exactamente aquí, no a /documents sin filtros.
  const currentViewHref = buildHref(sp, page);

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
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHero
        title="Documentos"
        description="Sube, procesa y valida tus facturas — todo tu historial en un solo lugar."
        bullets={[
          "Subir una factura nueva y que el sistema corra el OCR",
          "Ver el estado de cada documento (cargado, procesado, validado)",
          "Abrir un documento para revisar y corregir los campos extraídos",
        ]}
        tip="Fotos de frente, bien iluminadas y sin sombras dan mejor resultado de OCR que fotos en ángulo."
      />

      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {result.totalCount} documento{result.totalCount === 1 ? "" : "s"} en total
        </p>
        <Link href="/documents/new">
          <Button size="sm">Nuevo</Button>
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
        <Button type="submit" variant="secondary" size="sm">
          Filtrar
        </Button>
      </form>

      {result.items.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">No hay documentos todavía.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {result.items.map((doc) => (
            <Link key={doc.id} href={`/documents/${doc.id}?back=${encodeURIComponent(currentViewHref)}`}>
              <Card className="flex items-center justify-between transition-colors hover:border-brand-300 dark:hover:border-brand-700">
                <span className="font-medium text-neutral-900 dark:text-neutral-50">{getDocumentTypeLabel(doc.document_type)}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[doc.status] ?? STATUS_BADGE_CLASS.processed}`}>
                  {getDocumentStatusLabel(doc.status)}
                </span>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-neutral-600 dark:text-neutral-400">
        <span>
          Página {result.page} de {totalPages}
        </span>
        <div className="flex gap-3">
          {page > 1 ? (
            <Link href={buildHref(sp, page - 1)} className="hover:text-brand-700 dark:hover:text-brand-400">
              Anterior
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link href={buildHref(sp, page + 1)} className="hover:text-brand-700 dark:hover:text-brand-400">
              Siguiente
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
