import "./env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { cleanupTestUsers, createTestAdminClient, createTestAnonClient } from "./supabase-test-clients";

/**
 * RF-001 (contratos multi-página, ver
 * `supabase/migrations/20260913090000_create_document_pages.sql` y
 * `docs/decisions/0003-perfil-ocr-contratos.md`): verifica contra el
 * proyecto Supabase real que `document_pages` se aísla igual que
 * `document_validations`/`ocr_results` -- vía el `owner_id` del documento
 * dueño, no una columna propia.
 */

const admin = createTestAdminClient();
const password = "Test-Password-123!";
const runId = Date.now();
const userAEmail = `document-pages-rls-a-${runId}@example.com`;
const userBEmail = `document-pages-rls-b-${runId}@example.com`;

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
      document_type: "contract_es",
      original_file_path: `${userAId}/document-pages-test-doc/original.jpg`,
    })
    .select("id")
    .single();
  if (docErr || !doc) throw docErr ?? new Error("No se pudo crear el documento de prueba");
  documentAId = doc.id;
}, 30000);

afterAll(async () => {
  await cleanupTestUsers(admin, [userAId, userBId]);
}, 30000);

describe("RLS: document_pages", () => {
  let pageId: string;

  it("el dueño del documento puede insertar una página propia", async () => {
    const { data, error } = await clientA
      .from("document_pages")
      .insert({
        document_id: documentAId,
        page_number: 2,
        file_path: `${userAId}/document-pages-test-doc/page-2.jpg`,
      })
      .select("id")
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    pageId = data!.id;
  });

  it("otro usuario no puede insertar una página para un documento ajeno", async () => {
    const { error } = await clientB.from("document_pages").insert({
      document_id: documentAId,
      page_number: 3,
      file_path: `${userBId}/document-pages-test-doc/page-3.jpg`,
    });
    expect(error).not.toBeNull();
  });

  it("el dueño puede leer su propia página", async () => {
    const { data, error } = await clientA.from("document_pages").select("id").eq("id", pageId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("otro usuario NO puede leer la página ajena", async () => {
    const { data, error } = await clientB.from("document_pages").select("id").eq("id", pageId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("service_role (ADMIN) puede leer la página de cualquier usuario", async () => {
    const { data, error } = await admin.from("document_pages").select("id").eq("id", pageId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("no se puede repetir page_number para el mismo documento (unique constraint)", async () => {
    const { error } = await clientA.from("document_pages").insert({
      document_id: documentAId,
      page_number: 2,
      file_path: `${userAId}/document-pages-test-doc/page-2-duplicado.jpg`,
    });
    expect(error).not.toBeNull();
  });

  it("page_number menor a 2 se rechaza (la portada vive en documents.original_file_path)", async () => {
    const { error } = await clientA.from("document_pages").insert({
      document_id: documentAId,
      page_number: 1,
      file_path: `${userAId}/document-pages-test-doc/page-1-invalida.jpg`,
    });
    expect(error).not.toBeNull();
  });

  it("otro usuario no puede leer las páginas ajenas ni borrarlas", async () => {
    const { data, error } = await clientB.from("document_pages").delete().eq("id", pageId).select();
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("el dueño puede borrar su propia página", async () => {
    const { data, error } = await clientA.from("document_pages").delete().eq("id", pageId).select();
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("document_pages cae en cascada al borrar el documento dueño", async () => {
    const { data: page } = await clientA
      .from("document_pages")
      .insert({
        document_id: documentAId,
        page_number: 2,
        file_path: `${userAId}/document-pages-test-doc/page-2-cascade.jpg`,
      })
      .select("id")
      .single();
    expect(page).not.toBeNull();

    await admin.from("documents").delete().eq("id", documentAId);

    const { data: afterDelete, error } = await admin.from("document_pages").select("id").eq("id", page!.id);
    expect(error).toBeNull();
    expect(afterDelete).toHaveLength(0);
  });
});
