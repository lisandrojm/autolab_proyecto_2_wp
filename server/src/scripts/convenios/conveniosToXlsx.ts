import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';

/**
 * Convierte el JSON que baja `scrapeConsola.js` en el XLSX del nomenclador de Convenios.
 *
 *   npx tsx src/scripts/convenios/conveniosToXlsx.ts ~/Downloads/convenios.json [salida.xlsx]
 *
 * Opciones:
 *   --sin-centinelas   deja afuera 9999/99 (EXCLUIDO DE CONVENIO) y 999999 (SIN INFORMAR)
 *   --csv              además del XLSX, escribe un CSV UTF-8 con BOM
 *
 * Todo se escribe como TEXTO: un código como "0000/73" lo interpretaría Excel como fecha, y
 * "999999" como número, perdiendo los ceros a la izquierda de otros códigos.
 */

interface Convenio {
  codigo: string;
  actividad: string;
  signatario: string;
}

/** Códigos que no son convenios reales sino marcadores del propio nomenclador de AFIP. */
const CENTINELAS = new Set(['9999/99', '999999']);

/** Mismo arreglo que el snippet: por si el JSON se generó sin él o se editó a mano. */
const fixEncoding = (s: string): string =>
  String(s ?? '')
    .replace(/Â/g, 'Á')
    .replace(/Ê/g, 'É')
    .replace(/Î/g, 'Í')
    .replace(/Ô/g, 'Ó')
    .replace(/Û/g, 'Ú');

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const [entrada, salidaArg] = args.filter((a) => !a.startsWith('--'));

if (!entrada) {
  console.error('Falta el JSON de entrada.\n  npx tsx src/scripts/convenios/conveniosToXlsx.ts ~/Downloads/convenios.json [salida.xlsx] [--sin-centinelas] [--csv]');
  process.exit(1);
}
if (!fs.existsSync(entrada)) {
  console.error(`No existe el archivo: ${entrada}`);
  process.exit(1);
}

let crudo: unknown;
try {
  crudo = JSON.parse(fs.readFileSync(entrada, 'utf8'));
} catch (e: any) {
  console.error(`El archivo no es JSON válido: ${e?.message || e}`);
  process.exit(1);
}
if (!Array.isArray(crudo)) {
  console.error('El JSON debe ser un array de { codigo, actividad, signatario }.');
  process.exit(1);
}

const filas: Convenio[] = (crudo as any[])
  .map((r) => ({
    codigo: String(r?.codigo ?? '').trim(),
    actividad: fixEncoding(r?.actividad).trim(),
    signatario: fixEncoding(r?.signatario).trim(),
  }))
  .filter((r) => r.codigo || r.actividad || r.signatario);

const centinelas = filas.filter((r) => CENTINELAS.has(r.codigo));
const excluirCentinelas = flags.has('--sin-centinelas');
const finales = excluirCentinelas ? filas.filter((r) => !CENTINELAS.has(r.codigo)) : filas;

// Duplicados de código: el nomenclador no debería traerlos, y si aparecen suele ser señal de que la
// tabla se copió dos veces (por ejemplo, si se corrió el paso 2 sobre una página ya duplicada).
const vistos = new Map<string, number>();
for (const f of finales) vistos.set(f.codigo, (vistos.get(f.codigo) || 0) + 1);
const duplicados = [...vistos.entries()].filter(([, n]) => n > 1);

const ENCABEZADOS = ['Código', 'Actividad', 'Signatario'];
const aoa = [ENCABEZADOS, ...finales.map((r) => [r.codigo, r.actividad, r.signatario])];
const ws = xlsx.utils.aoa_to_sheet(aoa);

// Cada celda como string con formato "@" (texto): sin esto Excel reinterpreta "0000/73" al abrirlo.
const rango = xlsx.utils.decode_range(ws['!ref'] as string);
for (let R = rango.s.r; R <= rango.e.r; R++) {
  for (let C = rango.s.c; C <= rango.e.c; C++) {
    const dir = xlsx.utils.encode_cell({ r: R, c: C });
    const celda = ws[dir];
    if (!celda) continue;
    celda.t = 's';
    celda.v = String(celda.v ?? '');
    celda.z = '@';
  }
}
ws['!cols'] = [{ wch: 12 }, { wch: 60 }, { wch: 60 }];
ws['!freeze'] = { xSplit: '0', ySplit: '1', topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

const wb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wb, ws, 'Convenios');

const salida = salidaArg || path.join(path.dirname(entrada), 'convenios.xlsx');
// `cellStyles` es lo que hace que el formato "@" llegue al archivo: sin esa opción el writer
// descarta la `z` de cada celda. El valor ya va como string, así que aun sin formato Excel no
// convertiría "0000/73" a fecha, pero con "@" también queda explícito al editarlo a mano.
xlsx.writeFile(wb, salida, { cellStyles: true });

if (flags.has('--csv')) {
  const csv = xlsx.utils.sheet_to_csv(ws);
  const rutaCsv = salida.replace(/\.xlsx$/i, '') + '.csv';
  // BOM para que Excel abra el CSV en UTF-8 y no rompa los acentos.
  fs.writeFileSync(rutaCsv, '﻿' + csv, 'utf8');
  console.log(`CSV:  ${rutaCsv}`);
}

console.log(`XLSX: ${salida}`);
console.log(`Filas escritas: ${finales.length}${excluirCentinelas ? ` (se excluyeron ${centinelas.length} centinela/s)` : ''}`);
if (!excluirCentinelas && centinelas.length) console.log(`Centinelas incluidos: ${centinelas.map((c) => c.codigo).join(', ')} — usá --sin-centinelas para dejarlos afuera.`);
if (duplicados.length)
  console.warn(
    `OJO: ${duplicados.length} código/s duplicado/s, p. ej. ${duplicados
      .slice(0, 5)
      .map(([c, n]) => `${c} (x${n})`)
      .join(', ')}`,
  );
const sinDatos = finales.filter((r) => !r.codigo || !r.actividad).length;
if (sinDatos) console.warn(`OJO: ${sinDatos} fila/s sin código o sin actividad.`);
