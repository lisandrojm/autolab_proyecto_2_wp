import type { FechaTango, Fila, RespuestaFiltro, RespuestaLista, RespuestaRegistro } from './tipos';

/** Zona horaria de Tango por defecto: un `Date` se interpreta en esta zona. */
export const ZONA_POR_DEFECTO = 'America/Argentina/Buenos_Aires';

/** Año, mes, día, hora, minuto y segundo de un `Date` en una zona horaria. */
function partes(fecha: Date, zonaHoraria: string): Record<'y' | 'M' | 'd' | 'h' | 'm' | 's', string> {
  if (Number.isNaN(fecha.getTime())) throw new Error('Fecha inválida');
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: zonaHoraria,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(fecha)
      .map((x) => [x.type, x.value]),
  );
  return { y: p.year, M: p.month, d: p.day, h: p.hour, m: p.minute, s: p.second };
}

/**
 * Fecha en el formato que acepta `GetApiLiveQueryData`: `dd/MM/yyyy`.
 * - Un `Date` se toma en `zonaHoraria` (por defecto, la de Argentina), no en la del proceso.
 * - `yyyy-MM-dd` se convierte (Tango no lo acepta sin hora).
 * - Cualquier otro texto va tal cual (`01/02/2026`, `2026-02-01T00:00:00`).
 */
export function fechaTango(fecha: FechaTango, zonaHoraria = ZONA_POR_DEFECTO): string {
  if (typeof fecha === 'string') {
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
    return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : fecha;
  }
  const p = partes(fecha, zonaHoraria);
  return `${p.d}/${p.M}/${p.y}`;
}

/**
 * Un valor para `filtroSql`, escapado para SQL Server: texto entre comillas simples
 * (duplicando las internas), números tal cual, booleanos como 1/0 y fechas como
 * `'yyyy-MM-ddTHH:mm:ss'` en `zonaHoraria`.
 *
 *   tango.getByFilter(3142, `WHERE N_CUIT = ${sql(cuit)}`)
 */
export function sql(valor: string | number | boolean | Date, zonaHoraria = ZONA_POR_DEFECTO): string {
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) throw new Error('Número inválido para filtroSql');
    return String(valor);
  }
  if (typeof valor === 'boolean') return valor ? '1' : '0';
  if (valor instanceof Date) {
    const p = partes(valor, zonaHoraria);
    return `'${p.y}-${p.M}-${p.d}T${p.h}:${p.m}:${p.s}'`;
  }
  return `'${valor.replace(/'/g, "''")}'`;
}

/**
 * Un patrón para `LIKE`, con `%`, `_` y `[` del texto escapados (así matchean literales).
 *
 *   tango.getByFilter(3142, `WHERE NOM_PROVEE LIKE ${sqlLike('50%', 'empieza')}`)
 */
export function sqlLike(texto: string, modo: 'contiene' | 'empieza' | 'termina' | 'igual' = 'contiene'): string {
  const escapado = texto.replace(/[[%_]/g, (c) => `[${c}]`);
  const patron =
    modo === 'contiene' ? `%${escapado}%` : modo === 'empieza' ? `${escapado}%` : modo === 'termina' ? `%${escapado}` : escapado;
  return sql(patron);
}

/**
 * Las filas de cualquier respuesta de lectura, sin importar la forma: `resultData.list`
 * (Get, LIVE), `list` en la raíz (GetByFilter) o `value` (GetById, como una sola fila).
 */
export function filas<T = Fila>(r: RespuestaLista<T> | RespuestaFiltro<T> | RespuestaRegistro<T>): T[] {
  if ('resultData' in r && r.resultData) return r.resultData.list ?? [];
  if ('list' in r && Array.isArray(r.list)) return r.list;
  if ('value' in r && r.value !== undefined && r.value !== null) return [r.value];
  return [];
}
