import "./env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createTestAdminClient, createTestAnonClient } from "./supabase-test-clients";

/**
 * Extiende el patrón de rls-isolation.test.ts a Storage: un usuario no debe
 * poder generar una URL firmada, subir bajo el prefijo, ni borrar el
 * archivo de otro usuario; un usuario con rol ADMIN sí debe poder, tanto
 * con service_role (bypass de RLS) como con una sesión real de un usuario
 * ADMIN (que sí ejercita la rama is_admin() de las políticas). Corre
 * contra el bucket real 'documents' del proyecto Supabase de desarrollo.
 */

const BUCKET = "documents";
const admin = createTestAdminClient();
const password = "Test-Password-123!";
const runId = Date.now();
const userAEmail = `storage-test-a-${runId}@example.com`;
const userBEmail = `storage-test-b-${runId}@example.com`;
const userCEmail = `storage-test-c-admin-${runId}@example.com`;

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);

let userAId: string;
let userBId: string;
let userCId: string;
let clientA: SupabaseClient<Database>;
let clientB: SupabaseClient<Database>;
/** Usuario C: rol ADMIN real (no service_role), sesión anon normal. */
let clientC: SupabaseClient<Database>;
let objectPath: string;
let objectFolder: string;

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

  const { data: userC, error: userCErr } = await admin.auth.admin.createUser({
    email: userCEmail,
    password,
    email_confirm: true,
  });
  if (userCErr || !userC.user) throw userCErr ?? new Error("No se pudo crear el usuario C");
  userCId = userC.user.id;

  // Mismo mecanismo que en producción: solo una sesión service_role puede
  // cambiar profiles.role (ver profiles_prevent_role_change en
  // 20260811200926_create_profiles.sql). El cliente admin de este archivo
  // ya usa la service_role key.
  const { error: promoteErr } = await admin
    .from("profiles")
    .update({ role: "ADMIN" })
    .eq("id", userCId);
  if (promoteErr) throw promoteErr;

  clientC = createTestAnonClient();
  const { error: signInCErr } = await clientC.auth.signInWithPassword({
    email: userCEmail,
    password,
  });
  if (signInCErr) throw signInCErr;

  objectFolder = `${userAId}/storage-test-doc`;
  objectPath = `${objectFolder}/original.png`;

  const { error: uploadErr } = await clientA.storage
    .from(BUCKET)
    .upload(objectPath, PNG_BYTES, { contentType: "image/png" });
  if (uploadErr) throw uploadErr;
}, 30000);

afterAll(async () => {
  await admin.storage.from(BUCKET).remove([objectPath]);
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
  if (userCId) await admin.auth.admin.deleteUser(userCId);
}, 30000);

describe("RLS: aislamiento de Storage entre usuarios", () => {
  it("el dueño puede generar una URL firmada de su propio archivo", async () => {
    const { data, error } = await clientA.storage.from(BUCKET).createSignedUrl(objectPath, 60);
    expect(error).toBeNull();
    expect(data?.signedUrl).toBeTruthy();
  });

  it("otro usuario NO puede generar una URL firmada del archivo ajeno", async () => {
    const { data, error } = await clientB.storage.from(BUCKET).createSignedUrl(objectPath, 60);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("otro usuario NO puede subir un archivo bajo el prefijo ajeno", async () => {
    const spoofPath = `${userAId}/spoof-doc/original.png`;
    const { error } = await clientB.storage
      .from(BUCKET)
      .upload(spoofPath, PNG_BYTES, { contentType: "image/png" });
    expect(error).not.toBeNull();
  });

  it("otro usuario NO puede borrar el archivo ajeno", async () => {
    await clientB.storage.from(BUCKET).remove([objectPath]);

    const { data: stillThere } = await admin.storage.from(BUCKET).list(objectFolder);
    expect(stillThere?.some((f) => f.name === "original.png")).toBe(true);
  });

  it("service_role puede generar una URL firmada de cualquier archivo (bypassa RLS, no ejercita is_admin())", async () => {
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(objectPath, 60);
    expect(error).toBeNull();
    expect(data?.signedUrl).toBeTruthy();
  });

  // A diferencia del caso anterior, estos dos usan una sesión anon real de
  // un usuario con profiles.role = 'ADMIN' — el mismo camino de código que
  // recorre admin/documents/page.tsx en la app real, que sí depende de que
  // la rama is_admin() de las políticas de storage.objects funcione.
  it("un usuario con rol ADMIN (sesión real) puede generar una URL firmada del archivo de otro usuario", async () => {
    const { data, error } = await clientC.storage.from(BUCKET).createSignedUrl(objectPath, 60);
    expect(error).toBeNull();
    expect(data?.signedUrl).toBeTruthy();
  });

  it("un usuario con rol ADMIN (sesión real) puede borrar el archivo de otro usuario", async () => {
    await clientC.storage.from(BUCKET).remove([objectPath]);

    const { data: stillThere } = await admin.storage.from(BUCKET).list(objectFolder);
    expect(stillThere?.some((f) => f.name === "original.png")).toBe(false);
  });
});
