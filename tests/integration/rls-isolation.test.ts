import "./env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createTestAdminClient, createTestAnonClient } from "./supabase-test-clients";

/**
 * Prueba de integración contra el proyecto Supabase real (sin stack local
 * Docker disponible en esta máquina). Verifica RF-004/RNF-003: un USER no
 * puede leer, modificar ni borrar documentos de otro USER, y nadie puede
 * autoasignarse el rol ADMIN — ambas cosas garantizadas por RLS en Postgres,
 * no por la aplicación.
 *
 * Requiere .env.local con NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY del proyecto de
 * desarrollo. Crea y borra usuarios de prueba reales en cada corrida.
 */

const admin = createTestAdminClient();
const password = "Test-Password-123!";
const runId = Date.now();
const userAEmail = `rls-test-a-${runId}@example.com`;
const userBEmail = `rls-test-b-${runId}@example.com`;

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
  const { error: signInAErr } = await clientA.auth.signInWithPassword({
    email: userAEmail,
    password,
  });
  if (signInAErr) throw signInAErr;

  clientB = createTestAnonClient();
  const { error: signInBErr } = await clientB.auth.signInWithPassword({
    email: userBEmail,
    password,
  });
  if (signInBErr) throw signInBErr;

  const { data: doc, error: docErr } = await clientA
    .from("documents")
    .insert({
      owner_id: userAId,
      document_type: "invoice_es",
      original_file_path: `${userAId}/test-doc/original.jpg`,
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

describe("RLS: aislamiento de documents entre usuarios", () => {
  it("el dueño puede leer su propio documento", async () => {
    const { data, error } = await clientA.from("documents").select("id").eq("id", documentAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("otro usuario NO puede leer el documento ajeno", async () => {
    const { data, error } = await clientB.from("documents").select("id").eq("id", documentAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("otro usuario NO puede actualizar el documento ajeno", async () => {
    const { data, error } = await clientB
      .from("documents")
      .update({ status: "failed" })
      .eq("id", documentAId)
      .select();
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("otro usuario NO puede borrar el documento ajeno", async () => {
    const { data, error } = await clientB
      .from("documents")
      .delete()
      .eq("id", documentAId)
      .select();
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("un usuario no puede crear un documento a nombre de otro (owner_id falsificado)", async () => {
    const { error } = await clientB.from("documents").insert({
      owner_id: userAId,
      document_type: "invoice_es",
      original_file_path: "spoof.jpg",
    });
    expect(error).not.toBeNull();
  });

  it("service_role (equivalente a ADMIN) puede leer el documento de cualquier usuario", async () => {
    const { data, error } = await admin.from("documents").select("id").eq("id", documentAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});

describe("RLS: profiles.role es inmutable para el propio usuario (correccion Fase 1)", () => {
  it("un usuario no puede autoasignarse ADMIN", async () => {
    await clientA.from("profiles").update({ role: "ADMIN" }).eq("id", userAId);

    const { data } = await admin.from("profiles").select("role").eq("id", userAId).single();
    expect(data?.role).toBe("USER");
  });
});
