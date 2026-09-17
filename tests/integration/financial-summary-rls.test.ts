import "./env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { cleanupTestUsers, createTestAdminClient, createTestAnonClient } from "./supabase-test-clients";
import { getFinancialSummarySource } from "@/modules/documents/financial-summary-query";

/**
 * RF-008 (reportería financiera, 2026-09-15): verifica contra el proyecto
 * Supabase real que `getFinancialSummarySource` respeta el alcance "por
 * usuario" que pidió el equipo -- cada quien ve solo el resumen de lo que
 * ELLA/ÉL subió, nunca lo de otro usuario, aunque comparta NIT. No hay
 * política RLS nueva que probar (reusa la de `documents`/
 * `document_validations`) -- lo que se verifica aquí es que la función de
 * la app arma la consulta correctamente sobre esa RLS, mismo criterio que
 * `document-validations-rls.test.ts`.
 */

const admin = createTestAdminClient();
const password = "Test-Password-123!";
const runId = Date.now();
const userAEmail = `financial-summary-a-${runId}@example.com`;
const userBEmail = `financial-summary-b-${runId}@example.com`;

let userAId: string;
let userBId: string;
let clientA: SupabaseClient<Database>;
let clientB: SupabaseClient<Database>;

async function createValidatedInvoice(client: SupabaseClient<Database>, ownerId: string, opts: { fecha: string; nit: string; total: number }) {
  const { data: doc, error: docErr } = await client
    .from("documents")
    .insert({
      owner_id: ownerId,
      document_type: "invoice_es",
      original_file_path: `${ownerId}/financial-summary-test/original.jpg`,
      status: "validated",
    })
    .select("id")
    .single();
  if (docErr || !doc) throw docErr ?? new Error("No se pudo crear el documento de prueba");

  const validatedData = {
    fecha: opts.fecha,
    nit: opts.nit,
    proveedor: "Proveedor de prueba",
    iva: 0,
    valor: opts.total,
    total: opts.total,
  };

  const { error: valErr } = await client.from("document_validations").insert({
    document_id: doc.id,
    original_extracted_data: validatedData,
    validated_data: validatedData,
    manually_edited: false,
    validated_by: ownerId,
  });
  if (valErr) throw valErr;

  return doc.id;
}

beforeAll(async () => {
  const { data: userA, error: userAErr } = await admin.auth.admin.createUser({ email: userAEmail, password, email_confirm: true });
  if (userAErr || !userA.user) throw userAErr ?? new Error("No se pudo crear el usuario A");
  userAId = userA.user.id;

  const { data: userB, error: userBErr } = await admin.auth.admin.createUser({ email: userBEmail, password, email_confirm: true });
  if (userBErr || !userB.user) throw userBErr ?? new Error("No se pudo crear el usuario B");
  userBId = userB.user.id;

  clientA = createTestAnonClient();
  const { error: signInAErr } = await clientA.auth.signInWithPassword({ email: userAEmail, password });
  if (signInAErr) throw signInAErr;

  clientB = createTestAnonClient();
  const { error: signInBErr } = await clientB.auth.signInWithPassword({ email: userBEmail, password });
  if (signInBErr) throw signInBErr;

  // Mismo NIT para ambos usuarios a propósito: confirma que el aislamiento
  // es por dueño del documento, no por coincidencia/ausencia de NIT.
  await createValidatedInvoice(clientA, userAId, { fecha: "2025-08-12", nit: "900123456", total: 100000 });
  await createValidatedInvoice(clientB, userBId, { fecha: "2025-08-12", nit: "900123456", total: 999999 });

  // Documento sin validar de A -- no debe contarse en `rows`, sí en `pendingCount`.
  await clientA.from("documents").insert({
    owner_id: userAId,
    document_type: "invoice_es",
    original_file_path: `${userAId}/financial-summary-test-pending/original.jpg`,
    status: "processed",
  });
}, 30000);

afterAll(async () => {
  await cleanupTestUsers(admin, [userAId, userBId]);
}, 30000);

describe("RF-008: getFinancialSummarySource aísla por usuario", () => {
  it("el usuario A solo ve su propio documento validado, no el de B (aunque compartan NIT)", async () => {
    const source = await getFinancialSummarySource(clientA, userAId);

    expect(source.rows).toHaveLength(1);
    expect((source.rows[0].validatedData as { total: number }).total).toBe(100000);
  });

  it("el usuario B solo ve el suyo, no el de A", async () => {
    const source = await getFinancialSummarySource(clientB, userBId);

    expect(source.rows).toHaveLength(1);
    expect((source.rows[0].validatedData as { total: number }).total).toBe(999999);
  });

  it("cuenta el documento sin validar de A como pendiente, sin incluirlo en `rows`", async () => {
    const source = await getFinancialSummarySource(clientA, userAId);

    expect(source.pendingCount).toBeGreaterThanOrEqual(1);
    expect(source.rows.every((row) => row.documentId !== undefined)).toBe(true);
  });
});
