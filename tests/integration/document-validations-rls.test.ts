import "./env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createTestAdminClient, createTestAnonClient } from "./supabase-test-clients";

/**
 * RF-007 (validación humana, Fase 5): verifica contra el proyecto Supabase
 * real que `document_validations` aísla correctamente entre usuarios y es
 * inmutable (sin UPDATE/DELETE vía API), y que `documents.status` acepta el
 * nuevo valor `rejected` agregado en esta fase
 * (`20260812120000_extend_status_and_audit_for_validation.sql`).
 */

const admin = createTestAdminClient();
const password = "Test-Password-123!";
const runId = Date.now();
const userAEmail = `validation-rls-a-${runId}@example.com`;
const userBEmail = `validation-rls-b-${runId}@example.com`;

let userAId: string;
let userBId: string;
let clientA: SupabaseClient<Database>;
let clientB: SupabaseClient<Database>;
let documentAId: string;

beforeAll(async () => {
  const { data: userA, error: userAErr } = await admin.auth.admin.createUser({
    email: userAEmail,
    password,
    email_confirm: true,
  });
  if (userAErr || !userA.user) throw userAErr ?? new Error("No se pudo crear el usuario A");
  userAId = userA.user.id;

  const { data: userB, error: userBErr } = await admin.auth.admin.createUser({
    email: userBEmail,
    password,
    email_confirm: true,
  });
  if (userBErr || !userB.user) throw userBErr ?? new Error("No se pudo crear el usuario B");
  userBId = userB.user.id;

  clientA = createTestAnonClient();
  const { error: signInAErr } = await clientA.auth.signInWithPassword({ email: userAEmail, password });
  if (signInAErr) throw signInAErr;

  clientB = createTestAnonClient();
  const { error: signInBErr } = await clientB.auth.signInWithPassword({ email: userBEmail, password });
  if (signInBErr) throw signInBErr;

  const { data: doc, error: docErr } = await clientA
    .from("documents")
    .insert({
      owner_id: userAId,
      document_type: "invoice_es",
      original_file_path: `${userAId}/validation-test-doc/original.jpg`,
    })
    .select("id")
    .single();
  if (docErr || !doc) throw docErr ?? new Error("No se pudo crear el documento de prueba");
  documentAId = doc.id;
}, 30000);

afterAll(async () => {
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
}, 30000);

describe("RLS: document_validations", () => {
  let validationId: string;

  it("el dueño del documento puede insertar una validación propia", async () => {
    const { data, error } = await clientA
      .from("document_validations")
      .insert({
        document_id: documentAId,
        original_extracted_data: { nit: { value: "123", confidence: 0.9 } },
        validated_data: { nit: { value: "123", confidence: 0.9 } },
        manually_edited: false,
        validated_by: userAId,
      })
      .select("id")
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    validationId = data!.id;
  });

  it("un usuario no puede insertar una validación a nombre de otro (validated_by falsificado)", async () => {
    const { error } = await clientB.from("document_validations").insert({
      document_id: documentAId,
      original_extracted_data: {},
      validated_data: {},
      manually_edited: false,
      validated_by: userAId,
    });
    expect(error).not.toBeNull();
  });

  it("otro usuario no puede insertar una validación para un documento ajeno (aunque validated_by sea el suyo)", async () => {
    const { error } = await clientB.from("document_validations").insert({
      document_id: documentAId,
      original_extracted_data: {},
      validated_data: {},
      manually_edited: false,
      validated_by: userBId,
    });
    expect(error).not.toBeNull();
  });

  it("el dueño puede leer su propia validación", async () => {
    const { data, error } = await clientA.from("document_validations").select("id").eq("id", validationId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("otro usuario NO puede leer la validación ajena", async () => {
    const { data, error } = await clientB.from("document_validations").select("id").eq("id", validationId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("service_role (ADMIN) puede leer la validación de cualquier usuario", async () => {
    const { data, error } = await admin.from("document_validations").select("id").eq("id", validationId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("una validación es inmutable: UPDATE no afecta ninguna fila", async () => {
    const { data, error } = await clientA
      .from("document_validations")
      .update({ manually_edited: true })
      .eq("id", validationId)
      .select();
    // Sin política UPDATE definida -> RLS deniega, 0 filas (no necesariamente un error).
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("una validación es inmutable: DELETE no afecta ninguna fila", async () => {
    const { data, error } = await clientA.from("document_validations").delete().eq("id", validationId).select();
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});

describe("documents.status acepta 'rejected' (Fase 5)", () => {
  it("el dueño puede marcar su documento como rejected", async () => {
    const { data, error } = await clientA.from("documents").update({ status: "rejected" }).eq("id", documentAId).select("status");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].status).toBe("rejected");
  });

  it("un status fuera del CHECK constraint sigue siendo rechazado", async () => {
    const { error } = await admin.from("documents").update({ status: "not-a-real-status" }).eq("id", documentAId);
    expect(error).not.toBeNull();
  });
});
