export interface PageHeroProps {
  title: string;
  description: string;
  /** "¿Qué puedes hacer aquí?" -- lista corta, acciones concretas, no descripciones vagas. */
  bullets: string[];
  tip: string;
}

/**
 * Encabezado de orientación (Fase 2 del rediseño UX/UI) -- reemplaza el
 * `<h1>` suelto de cada página por título + descripción + "qué puedes
 * hacer aquí" + un tip, para que alguien nuevo entienda la página sin
 * tener que explorarla a ciegas.
 *
 * Animación escalonada, no un fade simple: título, descripción y el
 * bloque de info entran cada uno con `--animate-hero-in` (traslado +
 * opacidad, con leve rebote vía `--ease-bounce`) y un delay creciente
 * (`0ms`/`100ms`/`200ms`) -- se ve como una cascada, no como que todo
 * apareciera a la vez. Sin iconos todavía a propósito (Fase 3 aparte del
 * mismo rediseño).
 */
export function PageHero({ title, description, bullets, tip }: PageHeroProps) {
  return (
    <section className="mb-6 flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <h1 className="animate-hero-in font-display text-2xl font-bold text-neutral-900 dark:text-neutral-50" style={{ animationDelay: "0ms" }}>
        {title}
      </h1>
      <p className="animate-hero-in text-sm text-neutral-600 dark:text-neutral-400" style={{ animationDelay: "100ms" }}>
        {description}
      </p>

      <div className="animate-hero-in flex flex-col gap-3 sm:flex-row" style={{ animationDelay: "200ms" }}>
        <div className="flex-1 rounded-md bg-neutral-50 p-3 dark:bg-neutral-950">
          <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">¿Qué puedes hacer aquí?</p>
          <ul className="mt-1 list-inside list-disc text-xs text-neutral-600 dark:text-neutral-400">
            {bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        </div>

        <div className="flex-1 rounded-md border border-brand-200 bg-brand-50 p-3 dark:border-brand-800 dark:bg-brand-950/30">
          <p className="text-xs text-brand-800 dark:text-brand-300">
            <strong>Tip:</strong> {tip}
          </p>
        </div>
      </div>
    </section>
  );
}
