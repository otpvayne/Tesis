import "./env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createTestAdminClient, createTestAnonClient } from "./supabase-test-clients";

/**
 * Fase 7 (testing): gap real encontrado -- `ocr_models` y
 * `ocr_training_samples` (RLS `is_admin()`-only desde Fase 1) nunca se
 * habían probado contra una sesión real, ni admin ni no-admin. Son
 * exactamente las tablas detrás de `/admin/models` (Fase 6) y
 * `/ocr-lab/train` (Fase 4c/4d) -- "proteger rutas /admin" en la
 * práctica depende de que esta RLS funcione, no solo de que la página
 * redirija. Se agrega también `audit_logs`: un usuario no debe poder leer
 * los logs de otro.
 */

const admin = createTestAdminClient();
const password = "Test-Password-123!";
const runId = Date.now();
const userEmail = `admin-only-user-${runId}@example.com`;
const adminEmail = `admin-only-admin-${runId}@example.com`;

let userId: string;
let adminId: string;
let userClient: SupabaseClient<Database>;
let adminClient: SupabaseClient<Database>;
let modelId: string;
let sampleId: string;

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

  const { data: model, error: modelErr } = await admin
    .from("ocr_models")
    .insert({ document_type: "invoice_es", version: `rls-test-${runId}`, model_data: {}, metrics: {}, active: false })
    .select("id")
    .single();
  if (modelErr || !model) throw modelErr ?? new Error("No se pudo crear el modelo de prueba");
  modelId = model.id;

  const { data: sample, error: sampleErr } = await admin
    .from("ocr_training_samples")
    .insert({ document_type: "invoice_es", label: "A", feature_data: {}, dataset_partition: "train" })
    .select("id")
    .single();
  if (sampleErr || !sample) throw sampleErr ?? new Error("No se pudo crear la muestra de prueba");
  sampleId = sample.id;
}, 30000);

afterAll(async () => {
  if (modelId) await admin.from("ocr_models").delete().eq("id", modelId);
  if (sampleId) await admin.from("ocr_training_samples").delete().eq("id", sampleId);
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (adminId) await admin.auth.admin.deleteUser(adminId);
}, 30000);

describe("RLS: ocr_models es is_admin()-only", () => {
  it("un usuario normal NO puede leer ocr_models", async () => {
    const { data, error } = await userClient.from("ocr_models").select("id").eq("id", modelId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("un usuario normal NO puede activar un modelo (update)", async () => {
    const { data, error } = await userClient.from("ocr_models").update({ active: true }).eq("id", modelId).select();
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("un usuario normal NO puede insertar un modelo", async () => {
    const { error } = await userClient.from("ocr_models").insert({ document_type: "invoice_es", version: "spoof", model_data: {}, metrics: {} });
    expect(error).not.toBeNull();
  });

  it("un ADMIN (sesión real) SÍ puede leer y activar ocr_models", async () => {
    const { data: readData, error: readError } = await adminClient.from("ocr_models").select("id").eq("id", modelId);
    expect(readError).toBeNull();
    expect(readData).toHaveLength(1);

    const { data: updateData, error: updateError } = await adminClient.from("ocr_models").update({ active: false }).eq("id", modelId).select();
    expect(updateError).toBeNull();
    expect(updateData).toHaveLength(1);
  });
});

describe("RLS: ocr_training_samples es is_admin()-only", () => {
  it("un usuario normal NO puede leer ocr_training_samples", async () => {
    const { data, error } = await userClient.from("ocr_training_samples").select("id").eq("id", sampleId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("un usuario normal NO puede insertar una muestra de entrenamiento", async () => {
    const { error } = await userClient.from("ocr_training_samples").insert({ document_type: "invoice_es", label: "Z", feature_data: {}, dataset_partition: "train" });
    expect(error).not.toBeNull();
  });

  it("un ADMIN (sesión real) SÍ puede leer ocr_training_samples", async () => {
    const { data, error } = await adminClient.from("ocr_training_samples").select("id").eq("id", sampleId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});

describe("RLS: audit_logs -- un usuario solo lee lo propio, ADMIN lee todo", () => {
  it("un usuario puede leer su propio log de LOGIN", async () => {
    await admin.from("audit_logs").insert({ actor_id: userId, action: "LOGIN", metadata: {} });

    const { data, error } = await userClient.from("audit_logs").select("id, action").eq("actor_id", userId);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it("un usuario NO puede leer el log de otro usuario", async () => {
    await admin.from("audit_logs").insert({ actor_id: adminId, action: "LOGIN", metadata: {} });

    const { data, error } = await userClient.from("audit_logs").select("id").eq("actor_id", adminId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("un usuario no puede insertar un log a nombre de otro (actor_id falsificado)", async () => {
    const { error } = await userClient.from("audit_logs").insert({ actor_id: adminId, action: "LOGIN", metadata: {} });
    expect(error).not.toBeNull();
  });

  it("un ADMIN (sesión real) puede leer el log de cualquier usuario", async () => {
    const { data, error } = await adminClient.from("audit_logs").select("id").eq("actor_id", userId);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });
});
