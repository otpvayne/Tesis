import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/database";
import { fetchAllRows } from "../src/modules/ocr/classification/fetch-all-rows";
import { KNNClassifier, type SerializedKNNClassifier } from "../src/modules/ocr/classification/knn-classifier";
import { computeCharacterMetrics } from "../src/modules/ocr/evaluation/character-metrics";

const DOCUMENT_TYPE = "invoice_es";

async function main() {
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: activeModel, error: modelError } = await supabase
    .from("ocr_models")
    .select("id, version, model_data")
    .eq("document_type", DOCUMENT_TYPE)
    .eq("active", true)
    .maybeSingle();

  if (modelError) throw new Error(modelError.message);
  if (!activeModel) throw new Error("No hay modelo activo");

  console.log(`Modelo activo: version=${activeModel.version}`);

  const validationRows = await fetchAllRows((from, to) =>
    supabase.from("ocr_training_samples").select("label, feature_data").eq("document_type", DOCUMENT_TYPE).eq("dataset_partition", "validation").range(from, to),
  );
  console.log(`Muestras en 'validation': ${validationRows.length}`);

  const knn = KNNClassifier.fromJSON(activeModel.model_data as unknown as SerializedKNNClassifier);

  for (const k of [1, 3, 5, 7, 9, 11, 15, 21]) {
    const predictions = validationRows.map((row) => {
      const parsed = row.feature_data as { descriptor?: number[] };
      const prediction = knn.predict(new Float32Array(parsed.descriptor!), k);
      return { expected: row.label, predicted: prediction.label };
    });
    const metrics = computeCharacterMetrics(predictions);
    console.log(`k=${k}: accuracy=${(metrics.accuracy * 100).toFixed(2)}% (${metrics.correctCharacters}/${metrics.totalCharactersProcessed})`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
