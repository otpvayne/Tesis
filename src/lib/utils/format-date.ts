/**
 * Zona horaria de visualización para toda fecha proveniente de la base de
 * datos (timestamptz, siempre UTC en Postgres). Fijar esto explícitamente
 * es lo que evita el bug de "5 horas de más": sin `timeZone`,
 * `toLocaleString`/`Intl.DateTimeFormat` usan la zona del entorno donde
 * corre el código (el navegador del usuario, o el servidor en Vercel — que
 * no necesariamente es Colombia), así que un valor UTC se interpreta con
 * el offset local y el offset de Colombia se aplica dos veces en la
 * práctica si el usuario ya está en UTC-5.
 */
const DISPLAY_TIME_ZONE = "America/Bogota";
const DISPLAY_LOCALE = "es-CO";

const DATE_TIME_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  timeZone: DISPLAY_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

/**
 * Formatea una fecha/hora de base de datos (string ISO en UTC, o `Date`)
 * a hora de Colombia. Único punto de formateo de fechas de la app — no usar
 * `toLocaleString()` suelto en componentes; importar esto en su lugar.
 */
export function formatDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, DATE_TIME_FORMAT_OPTIONS).format(date);
}
