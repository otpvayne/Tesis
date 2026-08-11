import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
        Bienvenido
      </h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Sube una factura y consulta tus documentos. La captura por cámara y el
        reconocimiento OCR se habilitan en las siguientes fases del proyecto.
      </p>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/documents/new"
          className="rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white dark:bg-neutral-50 dark:text-neutral-900"
        >
          Nuevo documento
        </Link>
        <Link
          href="/documents"
          className="rounded-md border border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
        >
          Mis documentos
        </Link>
      </div>
    </div>
  );
}
