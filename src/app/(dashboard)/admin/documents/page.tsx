import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listDocuments, type DocumentWithOwnerEmail } from "@/modules/documents/queries";
import { DOCUMENT_STATUSES, type DocumentStatus } from "@/modules/documents/types";

interface AdminDocumentsSearchParams {
  page?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface AdminDocumentsPageProps {
  searchParams: Promise<AdminDocumentsSearchParams>;
}

function isDocumentStatus(value: string | undefined): value is DocumentStatus {
  return !!value && (DOCUMENT_STATUSES as readonly string[]).includes(value);
}

export default async function AdminDocumentsPage({ searchParams }: AdminDocumentsPageProps) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  // Defensa en profundidad: RLS ya restringe los datos que puede ver un
  // USER, pero esta ruta ni siquiera debe renderizarse para alguien sin
  // rol ADMIN.
  if (profile?.role !== "ADMIN") {
    redirect("/");
  }

  const result = await listDocuments(supabase, {
    filters: {
      status: isDocumentStatus(sp.status) ? sp.status : undefined,
      dateFrom: sp.dateFrom,
      dateTo: sp.dateTo,
    },
    pagination: { page, pageSize: 20 },
    includeOwnerEmail: true,
  });

  const items = result.items as DocumentWithOwnerEmail[];
  const totalPages = Math.max(1, Math.ceil(result.totalCount / result.pageSize));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
        Documentos — todos los usuarios
      </h1>

      {items.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          No hay documentos todavía.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-200 rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {items.map((doc) => (
            <li key={doc.id}>
              <Link
                href={`/documents/${doc.id}`}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span className="text-neutral-900 dark:text-neutral-50">
                  {doc.owner?.email ?? doc.owner_id}
                </span>
                <span className="text-neutral-500 dark:text-neutral-400">{doc.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Página {result.page} de {totalPages}
      </p>
    </div>
  );
}
