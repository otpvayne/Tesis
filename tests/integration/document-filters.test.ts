import "./env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { listDocuments } from "@/modules/documents/queries";
import { createTestAdminClient, createTestAnonClient } from "./supabase-test-clients";

/**
 * Verifica los filtros de listDocuments (RF-005) contra el proyecto real:
 * status y fecha (con datos reales de esta fase), y proveedor/monto vía
 * join con ocr_results usando una muestra sintética — RF-002/RF-003 no
 * existen todavía, así que esto solo demuestra que el query en sí filtra
 * correctamente cuando SÍ hay datos, no que la app los produzca hoy.
 */

const admin = createTestAdminClient();
const password = "Test-Password-123!";
const runId = Date.now();
const userEmail = `filters-test-${runId}@example.com`;

let userId: string;
let client: SupabaseClient<Database>;
let docUploaded: string;
let docProcessed: string;
let docFailed: string;

beforeAll(async () => {
  const { data: user, error: userErr } = await admin.auth.admin.createUser({
    email: userEmail,
    password,
    email_confirm: true,
  });
  if (userErr || !user.user) throw userErr ?? new Error("No se pudo crear el usuario de prueba");
  userId = user.user.id;

  client = createTestAnonClient();
  const { error: signInErr } = await client.auth.signInWithPassword({
    email: userEmail,
    password,
  });
  if (signInErr) throw signInErr;

  const { data: docs, error: docsErr } = await admin
    .from("documents")
    .insert([
      {
        owner_id: userId,
        document_type: "invoice_es",
        original_file_path: `${userId}/filter-doc-1/original.png`,
        status: "uploaded",
        created_at: "2020-01-01T00:00:00Z",
      },
      {
        owner_id: userId,
        document_type: "invoice_es",
        original_file_path: `${userId}/filter-doc-2/original.png`,
        status: "processed",
        created_at: "2020-06-01T00:00:00Z",
      },
      {
        owner_id: userId,
        document_type: "invoice_es",
        original_file_path: `${userId}/filter-doc-3/original.png`,
        status: "failed",
        created_at: "2020-12-31T00:00:00Z",
      },
    ])
    .select("id, status");
  if (docsErr || !docs) throw docsErr ?? new Error("No se pudieron crear documentos de prueba");

  docUploaded = docs.find((d) => d.status === "uploaded")!.id;
  docProcessed = docs.find((d) => d.status === "processed")!.id;
  docFailed = docs.find((d) => d.status === "failed")!.id;

  const { error: ocrErr } = await admin.from("ocr_results").insert({
    document_id: docProcessed,
    raw_text: "Acme Corp factura de prueba",
    extracted_data: {
      proveedor: { value: "Acme Corp", confidence: 0.9, sourceRegion: {} },
      monto_total: { value: "150000", confidence: 0.9, sourceRegion: {} },
    },
  });
  if (ocrErr) throw ocrErr;
}, 30000);

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
}, 30000);

describe("listDocuments: filtro por status", () => {
  it("devuelve solo los documentos con el status pedido", async () => {
    const result = await listDocuments(client, {
      ownerId: userId,
      filters: { status: "processed" },
    });
    expect(result.items.map((d) => d.id)).toEqual([docProcessed]);
  });
});

describe("listDocuments: filtro por rango de fecha", () => {
  it("devuelve solo los documentos dentro del rango", async () => {
    const result = await listDocuments(client, {
      ownerId: userId,
      filters: { dateFrom: "2019-12-31", dateTo: "2020-01-02" },
    });
    expect(result.items.map((d) => d.id)).toEqual([docUploaded]);
  });
});

describe("listDocuments: filtro por proveedor (join con ocr_results)", () => {
  it("devuelve el documento cuyo ocr_results.extracted_data.proveedor matchea", async () => {
    const result = await listDocuments(client, {
      ownerId: userId,
      filters: { provider: "Acme" },
    });
    expect(result.items.map((d) => d.id)).toEqual([docProcessed]);
  });

  it("no devuelve nada si ningún ocr_results matchea el proveedor", async () => {
    const result = await listDocuments(client, {
      ownerId: userId,
      filters: { provider: "Proveedor Inexistente" },
    });
    expect(result.items).toHaveLength(0);
  });

  it("los documentos sin ocr_results nunca matchean un filtro de proveedor", async () => {
    const result = await listDocuments(client, {
      ownerId: userId,
      filters: { provider: "a" },
    });
    expect(result.items.map((d) => d.id)).not.toContain(docUploaded);
    expect(result.items.map((d) => d.id)).not.toContain(docFailed);
  });
});

describe("listDocuments: filtro por monto (join con ocr_results, cast numeric)", () => {
  it("devuelve el documento cuando el monto cae dentro del rango", async () => {
    const result = await listDocuments(client, {
      ownerId: userId,
      filters: { minAmount: 100000, maxAmount: 200000 },
    });
    expect(result.items.map((d) => d.id)).toEqual([docProcessed]);
  });

  it("no devuelve nada cuando el monto pedido está fuera de rango", async () => {
    const result = await listDocuments(client, {
      ownerId: userId,
      filters: { minAmount: 200000 },
    });
    expect(result.items).toHaveLength(0);
  });
});
