import { parseInvoiceDate } from "@/modules/documents/date-parsing";
import type { DocumentType } from "@/modules/documents/types";

/**
 * RF-008 (2026-09-15, REQUERIMIENTO AFECTADO aprobado por Diego Alejandro
 * Medina Martinez): reportería financiera para el usuario final -- no solo
 * digitalizar facturas/contratos (RF-002/RF-003), sino responder "¿cuánto
 * he gastado, y con quién?", que es el propósito de negocio real del
 * proyecto (ver `CLAUDE.md` §1, "optimizar la gestión financiera").
 *
 * Alcance por USUARIO, no consolidado para toda Mansor (decisión explícita
 * del equipo): si dos empleados suben facturas cada uno por su lado, cada
 * quien ve solo lo que subió -- deliberado como mecanismo de control
 * interno (si alguien concilia el consolidado y nota facturas faltantes de
 * un empleado, es más fácil detectar el hueco). Coincide exactamente con
 * la RLS ya existente de `documents` (`owner_id = auth.uid()`), así que
 * `getFinancialSummarySource` no necesita ninguna política nueva.
 */

/** Campo de RF-003 que representa "cuánto costó" el documento -- el monto final para facturas (no `valor`/`iva`, que son subtotal e impuesto por separado) y el valor total del contrato para contratos. */
const AMOUNT_FIELD_BY_DOCUMENT_TYPE: Record<DocumentType, "total" | "valorTotal"> = {
  invoice_es: "total",
  contract_es: "valorTotal",
};

/** Campo de RF-003 que identifica a la entidad del documento -- NIT/identificación estructurada, más confiable para agrupar que el nombre de `proveedor` en texto libre (que puede variar por cómo lo reconoció el OCR cada vez). */
const IDENTIFIER_FIELD_BY_DOCUMENT_TYPE: Record<DocumentType, "nit" | "identificacion"> = {
  invoice_es: "nit",
  contract_es: "identificacion",
};

export interface FinancialSummaryRow {
  documentId: string;
  documentType: DocumentType;
  /** `document_validations.validated_data` de la validación más reciente de este documento -- **nunca** `ocr_results.extracted_data` sin validar (ver `getFinancialSummarySource`). */
  validatedData: unknown;
}

export interface DateRange {
  /** ISO `AAAA-MM-DD`, inclusivo. Compara contra la fecha IMPRESA en el documento (`fecha`), no la de subida. */
  from?: string;
  /** ISO `AAAA-MM-DD`, inclusivo. */
  to?: string;
}

/**
 * Filtros de RF-008 (rango de fechas + NIT/identificación opcionales,
 * pedido explícito del equipo 2026-09-15: "tengo el NIT de una empresa en
 * específico y necesito saber cuánto he gastado en ella en un rango de
 * tiempo también en específico"). Ambos opcionales e independientes -- con
 * solo el rango de fechas sigue funcionando exactamente igual que antes.
 */
export interface FinancialSummaryFilters extends DateRange {
  /** NIT/identificación tal como la escribe el usuario -- se compara normalizada (ver `normalizeIdentifier`) para no exigir que coincidan puntos/guiones/mayúsculas exactos. */
  identifier?: string;
}

export interface DaySummary {
  date: string;
  total: number;
  count: number;
}

export interface IdentifierSummary {
  identifier: string;
  proveedor: string | null;
  total: number;
  count: number;
}

/**
 * Una fila por documento incluido en el resumen -- a diferencia de
 * `byDay`/`byIdentifier` (agregados), esta lista existe para que el
 * usuario pueda ir de un total a la factura/contrato concreto que lo
 * originó (pedido explícito del equipo 2026-09-15: "servirá para la
 * verificación y correcta validación"). `documentId` es lo único que
 * necesita la UI para armar el link a `/documents/{id}` (esa página ya es
 * agnóstica al perfil OCR, ver `docs/decisions/0003-perfil-ocr-contratos.md`).
 */
export interface DocumentSummaryRow {
  documentId: string;
  documentType: DocumentType;
  date: string;
  identifier: string;
  proveedor: string | null;
  amount: number;
}

export interface FinancialSummary {
  totalAmount: number;
  documentsIncluded: number;
  /** Documentos validados cuya `fecha` no se pudo interpretar (formato irreconocible o fecha imposible, ver `parseInvoiceDate`) -- excluidos del total para no corromperlo con una fecha adivinada, contados aparte para que no desaparezcan silenciosamente de la vista del usuario. Si hay filtro de NIT activo, solo cuenta los que además coinciden con ese NIT -- no tiene sentido avisar de fechas no interpretables de otras empresas. */
  documentsWithUnparseableDate: number;
  byDay: DaySummary[];
  byIdentifier: IdentifierSummary[];
  /** Detalle documento por documento, más reciente primero. */
  documents: DocumentSummaryRow[];
}

function fieldValue(data: unknown, field: string): unknown {
  return (data as Record<string, unknown> | null)?.[field] ?? null;
}

function inRange(date: string, range: DateRange): boolean {
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

/** Compara NIT/identificación ignorando mayúsculas y cualquier caracter que no sea letra/dígito -- así "900.123.456-7" y "9001234567" matchean, sin exigirle al usuario el formato exacto que quedó guardado. */
function normalizeIdentifier(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Núcleo puro de RF-008 -- agrega el gasto de un usuario a partir de sus
 * documentos YA VALIDADOS, testeable con filas sintéticas (mismo patrón
 * que `modules/admin/stats.ts`). Nunca usa `documents.created_at` (fecha
 * de subida) para agrupar/filtrar: decisión explícita del equipo
 * (2026-09-15) porque responder "¿cuánto gasté en estos 3 días del mes?"
 * no funciona si 15 facturas de fechas distintas se suben todas el mismo
 * día -- hay que usar la fecha real de la factura (`fecha`, ver
 * `date-parsing.ts`), aceptando que solo está disponible una vez el
 * documento pasó por validación humana (RF-007).
 */
export function buildFinancialSummary(rows: FinancialSummaryRow[], filters: FinancialSummaryFilters = {}): FinancialSummary {
  const dayTotals = new Map<string, { total: number; count: number }>();
  const identifierTotals = new Map<string, { proveedor: string | null; total: number; count: number }>();
  const documents: DocumentSummaryRow[] = [];

  let totalAmount = 0;
  let documentsIncluded = 0;
  let documentsWithUnparseableDate = 0;

  const wantedIdentifier = filters.identifier?.trim() ? normalizeIdentifier(filters.identifier) : null;

  for (const row of rows) {
    const amountField = AMOUNT_FIELD_BY_DOCUMENT_TYPE[row.documentType];
    const identifierField = IDENTIFIER_FIELD_BY_DOCUMENT_TYPE[row.documentType];

    const rawIdentifier = fieldValue(row.validatedData, identifierField);
    const identifier = typeof rawIdentifier === "string" && rawIdentifier.length > 0 ? rawIdentifier : "(sin identificar)";

    // Filtro de NIT opcional (2026-09-15): si está activo, un documento de
    // otro NIT no cuenta para nada de este resumen -- ni el total, ni el
    // aviso de "fecha no interpretable", ni el detalle. Se compara antes de
    // tocar la fecha porque es independiente de si la fecha es válida.
    if (wantedIdentifier && normalizeIdentifier(identifier) !== wantedIdentifier) continue;

    const rawFecha = fieldValue(row.validatedData, "fecha");
    const parsedDate = typeof rawFecha === "string" ? parseInvoiceDate(rawFecha) : null;
    if (!parsedDate) {
      documentsWithUnparseableDate += 1;
      continue;
    }
    if (!inRange(parsedDate, filters)) continue;

    const rawAmount = fieldValue(row.validatedData, amountField);
    const amount = typeof rawAmount === "number" ? rawAmount : 0;

    const rawProveedor = fieldValue(row.validatedData, "proveedor");
    const proveedor = typeof rawProveedor === "string" && rawProveedor.length > 0 ? rawProveedor : null;

    totalAmount += amount;
    documentsIncluded += 1;

    const day = dayTotals.get(parsedDate) ?? { total: 0, count: 0 };
    day.total += amount;
    day.count += 1;
    dayTotals.set(parsedDate, day);

    const idBucket = identifierTotals.get(identifier) ?? { proveedor, total: 0, count: 0 };
    idBucket.total += amount;
    idBucket.count += 1;
    if (!idBucket.proveedor && proveedor) idBucket.proveedor = proveedor;
    identifierTotals.set(identifier, idBucket);

    documents.push({ documentId: row.documentId, documentType: row.documentType, date: parsedDate, identifier, proveedor, amount });
  }

  const byDay = Array.from(dayTotals.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const byIdentifier = Array.from(identifierTotals.entries())
    .map(([identifier, v]) => ({ identifier, ...v }))
    .sort((a, b) => b.total - a.total);

  documents.sort((a, b) => b.date.localeCompare(a.date));

  return { totalAmount, documentsIncluded, documentsWithUnparseableDate, byDay, byIdentifier, documents };
}
