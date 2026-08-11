import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDocumentById } from "@/modules/documents/queries";
import { logAuditEvent } from "@/modules/audit/log";
import { deleteDocument } from "@/modules/documents/actions";
import { DOCUMENTS_STORAGE_BUCKET } from "@/modules/documents/types";
import { formatDateTime } from "@/lib/utils/format-date";
import { getDocumentStatusLabel, getDocumentTypeLabel } from "@/lib/constants/document-display";

interface DocumentDetailPageProps {
  params: Promise<{ id: string }>;
}

const SIGNED_URL_TTL_SECONDS = 60 * 5;

export default async function DocumentDetailPage({ params }: DocumentDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS ya filtra: si el documento no es propio ni el usuario es ADMIN,
  // getDocumentById devuelve null como si no existiera.
  const doc = await getDocumentById(supabase, id);
  if (!doc) notFound();

  const { data: signed, error: signedError } = await supabase.storage
    .from(DOCUMENTS_STORAGE_BUCKET)
    .createSignedUrl(doc.original_file_path, SIGNED_URL_TTL_SECONDS);

  await logAuditEvent(supabase, {
    actorId: user.id,
    action: "DOCUMENT_VIEWED",
    documentId: doc.id,
  });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Documento</h1>

      {signedError || !signed ? (
        <p className="text-sm text-red-600 dark:text-red-400">
          No se pudo generar la vista del archivo.
        </p>
      ) : (
        // URL firmada temporal (expira en 5 min) — no aplica next/image
        // remotePatterns estático para un dominio que cambia por request.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={signed.signedUrl}
          alt="Documento original"
          className="w-full rounded-md border border-neutral-200 dark:border-neutral-800"
        />
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-neutral-500 dark:text-neutral-400">Tipo</dt>
        <dd className="text-neutral-900 dark:text-neutral-50">
          {getDocumentTypeLabel(doc.document_type)}
        </dd>
        <dt className="text-neutral-500 dark:text-neutral-400">Estado</dt>
        <dd className="text-neutral-900 dark:text-neutral-50">
          {getDocumentStatusLabel(doc.status)}
        </dd>
        <dt className="text-neutral-500 dark:text-neutral-400">Creado</dt>
        <dd className="text-neutral-900 dark:text-neutral-50">
          {formatDateTime(doc.created_at)}
        </dd>
      </dl>

      <form action={deleteDocument.bind(null, doc.id)}>
        <button
          type="submit"
          className="rounded-md border border-red-300 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900 dark:text-red-400"
        >
          Eliminar documento
        </button>
      </form>
    </div>
  );
}
