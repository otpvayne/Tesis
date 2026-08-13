export type CsvValue = string | number | boolean | null | undefined;

/**
 * Escribe CSV a mano (RFC 4180: comillas dobles cuando el campo contiene
 * coma, comilla o salto de línea; comilla interna se duplica) -- no se
 * agrega una dependencia (PapaParse u otra) para algo de esta escala,
 * consistente con `CLAUDE.md` §9 (DRY sin abstracciones prematuras).
 */
function escapeCsvField(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers.map(escapeCsvField).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(","));
  }
  return lines.join("\r\n");
}
