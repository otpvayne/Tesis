import "./env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createTestAdminClient, createTestAnonClient } from "./supabase-test-clients";

/**
 * Verifica, contra el proyecto Supabase real, las mismas consultas
 * embebidas (`documents(ocr_results, document_validations(validator:profiles))`)
 * que usan los Route Handlers de `/api/admin/reports/*` (Fase 6) -- los
 * Route Handlers en sí no se pueden invocar directo en Vitest
 * (`createClient()` depende de `next/headers`, sin contexto de request
 * real, mismo motivo que Server Actions/otras rutas de este proyecto no
 * se testean directamente). Esto prueba que la forma de la consulta y la
 * RLS subyacente funcionan con una sesión ADMIN real (no `service_role`),
 * mismo patrón que `storage-isolation.test.ts`.
 */

const admin = createTestAdminClient();
const password = "Test-Password-123!";
const runId = Date.now();
const userEmail = `admin-reports-user-${runId}@example.com`;
const adminEmail = `admin-reports-admin-${runId}@example.com`;

let userId: string;
let adminId: string;
let userClient: SupabaseClient<Database>;
let adminClient: SupabaseClient<Database>;
let documentId: string;

beforeAll(async () => {
  const { data: user, error: userErr } = await admin.auth.admin.createUser({ email: userEmail, password, email_confirm: true });
  if (userErr || !user.user) throw userErr ?? new Error("No se pudo crear el usuario de prueba");
  userId = user.user.id;

  const { data: adminUser, error: adminErr } = await admin.auth.admin.createUser({ email: adminEmail, password, email_confirm: true });
  if (adminErr || !adminUser.user) throw adminErr ?? new Error("No se pudo crear el admin de prueba");
  adminId = adminUser.user.id;

  const { error: promoteErr } = await admin.from("profiles").update({ role: "ADMIN" }).eq("id", adminId);
  if (promoteErr) throw promoteErr;

  userClient = createTestAnonClient();
  const { error: signInUserErr } = await userClient.auth.signInWithPassword({ email: userEmail, password });
  if (signInUserErr) throw signInUserErr;

  adminClient = createTestAnonClient();
  const { error: signInAdminErr } = await adminClient.auth.signInWithPassword({ email: adminEmail, password });
  if (signInAdminErr) throw signInAdminErr;

  const { data: doc, error: docErr } = await userClient
    .from("documents")
    .insert({ owner_id: userId, document_type: "invoice_es", original_file_path: `${userId}/report-test-doc/original.jpg` })
    .select("id")
    .single();
  if (docErr || !doc) throw docErr ?? new Error("No se pudo crear el documento de prueba");
  documentId = doc.id;

  const { error: ocrErr } = await admin.from("ocr_results").insert({
    document_id: documentId,
    raw_text: "texto de prueba",
    extracted_data: {},
    confidence: 0.75,
  });
  if (ocrErr) throw ocrErr;

  const { error: validationErr } = await admin.from("document_validations").insert({
    document_id: documentId,
    original_extracted_data: { nit: "111" },
    validated_data: { nit: "222" },
    manually_edited: true,
    validated_by: userId,
  });
  if (validationErr) throw validationErr;
}, 30000);

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (adminId) await admin.auth.admin.deleteUser(adminId);
}, 30000);

describe("Reporte de documentos: embed anidado documents -> ocr_results / document_validations -> profiles", () => {
  it("un ADMIN (sesión real) ve el documento de otro usuario con su confidence y su validación embebidos", async () => {
    const { data, error } = await adminClient
      .from("documents")
      .select("id, document_type, status, created_at, ocr_results(confidence, created_at), document_validations(validated_at, validator:profiles(email))")
      .eq("id", documentId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    const doc = data![0] as unknown as {
      ocr_results: { confidence: number }[];
      document_validations: { validator: { email: string } | null }[];
    };
    expect(doc.ocr_results[0]?.confidence).toBeCloseTo(0.75);
    expect(doc.document_validations[0]?.validator?.email).toBe(userEmail);
  });

  it("un usuario normal NO ve el documento ajeno con la misma consulta", async () => {
    const otherUserClient = createTestAnonClient();
    const { data: otherUser, error: otherErr } = await admin.auth.admin.createUser({
      email: `admin-reports-other-${runId}@example.com`,
      password,
      email_confirm: true,
    });
    if (otherErr || !otherUser.user) throw otherErr ?? new Error("No se pudo crear el tercer usuario");
    await otherUserClient.auth.signInWithPassword({ email: `admin-reports-other-${runId}@example.com`, password });

    const { data, error } = await otherUserClient.from("documents").select("id").eq("id", documentId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    await admin.auth.admin.deleteUser(otherUser.user.id);
  });
});

describe("Reporte de validaciones: embed document_validations -> profiles", () => {
  it("un ADMIN (sesión real) ve la validación con el email de quien la hizo", async () => {
    const { data, error } = await adminClient
      .from("document_validations")
      .select("document_id, original_extracted_data, validated_data, validated_at, validator:profiles(email)")
      .eq("document_id", documentId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    const row = data![0] as unknown as { validator: { email: string } | null; original_extracted_data: { nit: string } };
    expect(row.validator?.email).toBe(userEmail);
    expect(row.original_extracted_data.nit).toBe("111");
  });
});
