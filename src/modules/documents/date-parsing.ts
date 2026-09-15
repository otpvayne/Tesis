/**
 * Parsea el campo `fecha` de RF-003 (texto libre extraído por OCR, dos
 * formatos posibles según `FECHA_PATTERN` en `field-extraction-helpers.ts`:
 * `AAAA-MM-DD`, o `D/M/AAAA`/`D-M-AAAA` con día y mes de 1 o 2 dígitos) a
 * una fecha ISO `AAAA-MM-DD` real, para poder ordenar/agrupar/filtrar por
 * rango en `financial-summary.ts` (RF-008).
 *
 * Colombia usa formato día-mes-año, no mes-día-año de EE.UU. -- "05/03/2025"
 * es 5 de marzo, no 3 de mayo. Valida que día/mes/año formen una fecha
 * real (incluyendo febrero/bisiestos), no solo que el texto tenga la forma
 * correcta: "31/02/2025" se rechaza (`null`) en vez de normalizarse a algo
 * distinto. Mismo criterio de honestidad que el resto del proyecto --
 * mejor excluir un dato dudoso de un total financiero (ver
 * `buildFinancialSummary`) que sumarlo con una fecha inventada.
 */
export function parseInvoiceDate(fecha: string | null | undefined): string | null {
  if (!fecha) return null;
  const trimmed = fecha.trim();

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    return isValidCalendarDate(year, month, day) ? trimmed : null;
  }

  const dmyMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    if (!isValidCalendarDate(year, month, day)) return null;
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const maxDay = month === 2 && !isLeapYear ? 28 : DAYS_IN_MONTH[month - 1];
  return day <= maxDay;
}
