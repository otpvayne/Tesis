import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="mx-auto flex max-w-2xl animate-fade-in flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-3xl font-bold text-neutral-900 sm:text-4xl dark:text-neutral-50">
          Bienvenido a Mansor
        </h1>
        <p className="max-w-xl text-base text-neutral-600 dark:text-neutral-400">
          Sube una factura y consulta tus documentos. La captura por cámara y el
          reconocimiento OCR propio procesan cada documento automáticamente.
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        <Link
          href="/documents/new"
          className="rounded-md bg-brand-600 px-4 py-3 text-base font-medium text-white transition-colors duration-200 hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600"
        >
          Nuevo documento
        </Link>
        <Link
          href="/documents"
          className="rounded-md border border-neutral-300 px-4 py-3 text-base font-medium text-neutral-700 transition-colors duration-200 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900"
        >
          Mis documentos
        </Link>
      </div>
    </div>
  );
}
