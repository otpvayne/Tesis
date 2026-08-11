"use client";

import { useActionState } from "react";
import { createDocument } from "@/modules/documents/actions";
import { createDocumentInitialState } from "@/modules/documents/state";

export default function NewDocumentPage() {
  const [state, formAction, pending] = useActionState(createDocument, createDocumentInitialState);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
        Nuevo documento
      </h1>

      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Tipo de documento
          <p className="rounded-md border border-neutral-200 bg-neutral-100 px-4 py-3 text-base text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
            Factura (invoice_es)
          </p>
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Imagen (JPG o PNG)
          <input
            type="file"
            name="file"
            accept="image/jpeg,image/png"
            required
            className="rounded-md border border-neutral-300 px-4 py-3 text-base text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
          />
        </label>

        {state.error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-3 text-base font-medium text-white disabled:opacity-60 dark:bg-neutral-50 dark:text-neutral-900"
        >
          {pending ? "Subiendo..." : "Subir documento"}
        </button>
      </form>
    </div>
  );
}
