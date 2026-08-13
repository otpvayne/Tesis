import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/require-admin-page";
import { listAllModels } from "@/modules/ocr/classification/training-actions";
import { ModelsListClient } from "./models-list-client";

/**
 * `requireAdminPage()` ya valida sesión + rol, pero `listAllModels` (Server
 * Action) también corre su propio `requireAdmin()` -- llamada aquí solo
 * para forzar el gate de página antes de renderizar nada; el resultado de
 * `listAllModels` es lo que realmente se usa.
 */
export default async function AdminModelsPage() {
  await requireAdminPage();
  const models = await listAllModels();

  return (
    <div className="animate-fade-in mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="font-display text-xl font-semibold text-neutral-900 dark:text-neutral-50">Modelos OCR</h1>

      <ModelsListClient models={models} />

      <div className="rounded-lg border border-dashed border-neutral-300 p-3 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
        Entrenar un modelo nuevo (dataset sintético o etiquetado real, evaluación contra <code>test</code>) se hace en{" "}
        <Link href="/ocr-lab/train" className="text-brand-700 underline dark:text-brand-400">
          /ocr-lab/train
        </Link>
        . Los modelos que entrenes ahí aparecen en esta lista.
      </div>
    </div>
  );
}
