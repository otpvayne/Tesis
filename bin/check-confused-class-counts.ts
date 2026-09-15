import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/database";

const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const labels = ["l", "I", "i", "0", "D", "P", "p", "8", "B", "a", "s", "S", "o", "O", "5"];
const partitions = ["train", "validation", "test"] as const;

async function main() {
  for (const label of labels) {
    const row: Record<string, number | string> = { label };
    for (const partition of partitions) {
      const { count, error } = await supabase
        .from("ocr_training_samples")
        .select("*", { count: "exact", head: true })
        .eq("document_type", "invoice_es")
        .eq("dataset_partition", partition)
        .eq("label", label);
      if (error) throw new Error(error.message);
      row[partition] = count ?? 0;
    }
    console.log(JSON.stringify(row));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
