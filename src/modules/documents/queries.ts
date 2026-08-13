import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { DocumentStatus } from "@/modules/documents/types";
import { normalizePagination, type PaginationParams } from "@/modules/documents/pagination";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
export type DocumentWithOwnerEmail = DocumentRow & {
  owner?: { email: string } | null;
  /** Presente solo si `includeOcrConfidence: true` -- puede haber varias filas por reintentos, sin orden garantizado; el llamador toma la más reciente por `created_at`. */
  ocr_results?: { confidence: number | null; created_at: string }[];
};

export interface DocumentFilters {
  status?: DocumentStatus;
  /** Fecha ISO (yyyy-mm-dd), límite inferior inclusivo sobre created_at. */
  dateFrom?: string;
  /** Fecha ISO (yyyy-mm-dd), límite superior inclusivo sobre created_at. */
  dateTo?: string;
  /**
   * Filtra por el campo `proveedor` extraído por OCR
   * (ocr_results.extracted_data->proveedor->>value). Implementado a nivel
   * de query desde Fase 2 (join contra ocr_results), pero sin datos reales
   * que filtrar hasta que exista ocr_results (Fase 4/5) — no es un bug, es
   * orden de fases. Ver docs/requirements/traceability.md.
   */
  provider?: string;
  /**
   * Igual que `provider`, sobre `extracted_data->total->>value` — el campo
   * `total` de RF-003 (Fase 4e, "Total con IVA"). Se llamaba `monto_total`
   * en la definición de RF-003 de Fase 0; renombrado junto con el resto
   * del campo cuando RF-003 se actualizó con datos reales de Mansor (ver
   * `docs/requirements/traceability.md`).
   */
  minAmount?: number;
  maxAmount?: number;
  /**
   * Búsqueda por `id` — vista admin, Fase 6. Solo coincidencia exacta:
   * `id` es `uuid` nativo en Postgres, y este proyecto Supabase no honra
   * el cast `column::text` en filtros de PostgREST (verificado con tres
   * intentos distintos — `.filter()`, fetch crudo sin encoding, y alias
   * de `select` — los tres devuelven `operator does not exist: uuid ~~*
   * unknown`, sin aplicar el cast). Buscar por subcadena habría requerido
   * una vista/función en la base solo para esto; se prefiere no ampliar
   * el esquema por una función de búsqueda admin de bajo impacto. Un
   * valor con formato de UUID inválido nunca lanza (se ignora el
   * filtro), en vez de que Postgres rechace la query.
   */
  search?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface ListDocumentsParams {
  /** Si se da, restringe a los documentos de ese owner (además de lo que ya filtre RLS). */
  ownerId?: string;
  filters?: DocumentFilters;
  pagination?: Partial<PaginationParams>;
  /** Vista admin: incluye el email del dueño de cada documento. */
  includeOwnerEmail?: boolean;
  /**
   * Vista admin (Fase 6): incluye el `confidence` de cada `ocr_results`
   * asociado (embebido como arreglo por PostgREST — un documento puede
   * tener varios por reintentos; el llamador toma el más reciente por
   * `created_at`, mismo criterio que `documents/[id]/page.tsx`).
   */
  includeOcrConfidence?: boolean;
}

/**
 * Lista documentos paginados (RNF-008) con filtros. RLS ya garantiza el
 * aislamiento por usuario/rol — `ownerId` aquí es solo para que la UI pueda
 * pedir explícitamente "mis documentos" incluso si quien consulta es ADMIN.
 *
 * `provider`/`minAmount`/`maxAmount` hacen join contra `ocr_results`
 * (`!inner`), así que un documento sin resultados OCR nunca matchea esos
 * filtros — correcto hoy (no existe RF-002/RF-003 todavía) y también en
 * Fase 4/5. Nota: si un documento llega a tener más de un `ocr_results`
 * (reintentos), un join `!inner` puede repetirlo una vez por cada fila que
 * matchee; no ocurre aún porque no hay datos, se revisita si hace falta
 * cuando el pipeline OCR exista.
 */
export async function listDocuments(
  supabase: SupabaseClient<Database>,
  params: ListDocumentsParams = {},
): Promise<PaginatedResult<DocumentRow | DocumentWithOwnerEmail>> {
  const { page, pageSize } = normalizePagination(params.pagination ?? {});
  const filters = params.filters ?? {};
  const needsOcrJoin =
    filters.provider !== undefined ||
    filters.minAmount !== undefined ||
    filters.maxAmount !== undefined;

  const selectParts = ["*"];
  if (needsOcrJoin) {
    // `!inner` porque provider/minAmount/maxAmount filtran sobre esta
    // relación (un documento sin ocr_results nunca debe matchear). Se
    // incluyen `confidence`/`created_at` también aquí cuando hacen falta
    // para no pedir el mismo embed dos veces con specs distintos
    // (PostgREST no lo permite).
    selectParts.push(params.includeOcrConfidence ? "ocr_results!inner(extracted_data, confidence, created_at)" : "ocr_results!inner(extracted_data)");
  } else if (params.includeOcrConfidence) {
    selectParts.push("ocr_results(confidence, created_at)");
  }
  if (params.includeOwnerEmail) selectParts.push("owner:profiles(email)");
  const selectClause = selectParts.join(", ");

  // `any` deliberado: seleccionar con un join dinámico a ocr_results rompe
  // la inferencia de columnas de PostgREST (el tipo generado no modela
  // proyecciones condicionales), y los filtros de proveedor/monto usan
  // rutas JSONB (`.filter()` con una ruta de texto) que tampoco son
  // columnas tipadas. El resultado final se valida contra DocumentRow al
  // devolverlo, y el comportamiento real está cubierto por
  // tests/integration/document-filters.test.ts contra la base real.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase.from("documents").select(selectClause, { count: "exact" });

  if (params.ownerId) {
    query = query.eq("owner_id", params.ownerId);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.dateFrom) {
    query = query.gte("created_at", filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte("created_at", filters.dateTo);
  }
  if (filters.search && UUID_PATTERN.test(filters.search.trim())) {
    query = query.eq("id", filters.search.trim());
  }
  if (filters.provider) {
    query = query.filter(
      "ocr_results.extracted_data->proveedor->>value",
      "ilike",
      `%${filters.provider}%`,
    );
  }
  if (filters.minAmount !== undefined) {
    query = query.filter(
      "ocr_results.extracted_data->total->>value::numeric",
      "gte",
      String(filters.minAmount),
    );
  }
  if (filters.maxAmount !== undefined) {
    query = query.filter(
      "ocr_results.extracted_data->total->>value::numeric",
      "lte",
      String(filters.maxAmount),
    );
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(`No se pudieron listar los documentos: ${error.message}`);
  }

  return {
    items: (data ?? []) as unknown as DocumentRow[] | DocumentWithOwnerEmail[],
    page,
    pageSize,
    totalCount: count ?? 0,
  };
}

export async function getDocumentById(
  supabase: SupabaseClient<Database>,
  documentId: string,
): Promise<DocumentRow | null> {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo obtener el documento: ${error.message}`);
  }

  return data;
}
