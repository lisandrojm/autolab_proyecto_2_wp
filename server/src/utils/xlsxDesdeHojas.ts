/**
 * UN .XLSX A PARTIR DE HOJAS DESCRITAS COMO DATOS (20/11/2026).
 *
 * Existe porque la librería del navegador (SheetJS community) no sabe congelar la primera fila, y una
 * planilla para liquidar tiene que ser una TABLA: encabezados en la fila 1, autofiltro, primera fila
 * congelada, fechas como fecha, horas como hora y números como número (cero es 0, vacío es vacío; nunca
 * «-» en una columna numérica). El navegador arma las hojas —con su glosario— y el server sólo escribe.
 *
 * Es genérico a propósito: no sabe qué es un consolidado. Cualquier export que quiera salir como tabla
 * puede describirse así y pasar por acá.
 */
import ExcelJS from "exceljs";

export type TipoColumna = "texto" | "fecha" | "hora" | "numero" | "entero";

export interface ColumnaHoja {
  titulo: string;
  /** Por defecto, texto. */
  tipo?: TipoColumna;
  /** Ancho en caracteres. */
  ancho?: number;
}

export interface HojaXlsx {
  /** Hasta 31 caracteres (límite de Excel). */
  nombre: string;
  columnas: ColumnaHoja[];
  /** Una celda por columna; `null` o «» = celda vacía. Fechas «AAAA-MM-DD», horas «HH:mm». */
  filas: (string | number | null)[][];
  /** Hoja de datos: encabezados en la fila 1, autofiltro y primera fila congelada. Si no, texto libre. */
  tabla?: boolean;
  /** Para una tabla sin filas: lo que dice la hoja en vez de quedar en blanco. */
  vacioDice?: string;
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ES_HORA = /^\d{1,2}:\d{2}$/;

/** La celda según el tipo de la columna. Lo que no encaja en el tipo viaja como texto antes que perderse. */
function valorDeCelda(v: string | number | null | undefined, tipo: TipoColumna): ExcelJS.CellValue {
  if (v === null || v === undefined || v === "") return null;
  if (tipo === "fecha") {
    const s = String(v);
    if (!ES_FECHA.test(s)) return s;
    return new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))));
  }
  if (tipo === "hora") {
    const s = String(v);
    if (!ES_HORA.test(s)) return s;
    const [h, m] = s.split(":").map(Number);
    return h / 24 + m / 1440; // fracción del día, sin zona horaria
  }
  if (tipo === "numero" || tipo === "entero") {
    const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : String(v);
  }
  return typeof v === "number" ? v : String(v);
}

const FORMATO: Record<TipoColumna, string | undefined> = { texto: undefined, fecha: "dd/mm/yyyy", hora: "hh:mm", numero: "#,##0.00", entero: "0" };

export async function xlsxDesdeHojas(hojas: HojaXlsx[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "WeProdu";
  wb.created = new Date();
  const nombresUsados = new Set<string>();
  for (const hoja of hojas) {
    let nombre = hoja.nombre.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Hoja";
    while (nombresUsados.has(nombre)) nombre = `${nombre.slice(0, 29)} 2`;
    nombresUsados.add(nombre);
    const ws = wb.addWorksheet(nombre);
    ws.columns = hoja.columnas.map((c) => ({ width: c.ancho || Math.max(10, Math.min(60, c.titulo.length + 4)) }));
    if (hoja.tabla) {
      const encabezado = ws.addRow(hoja.columnas.map((c) => c.titulo));
      encabezado.font = { bold: true };
      encabezado.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF7" } };
      encabezado.alignment = { vertical: "middle", wrapText: true };
      ws.views = [{ state: "frozen", ySplit: 1 }];
      if (hoja.filas.length === 0) {
        const fila = ws.addRow([hoja.vacioDice || "Sin filas en este período."]);
        fila.font = { italic: true };
      } else {
        for (const f of hoja.filas) ws.addRow(hoja.columnas.map((c, i) => valorDeCelda(f[i], c.tipo || "texto")));
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: hoja.filas.length + 1, column: hoja.columnas.length } };
      }
      hoja.columnas.forEach((c, i) => {
        const fmt = FORMATO[c.tipo || "texto"];
        if (fmt) ws.getColumn(i + 1).numFmt = fmt;
        if (c.tipo === "texto") ws.getColumn(i + 1).alignment = { vertical: "top", wrapText: (c.ancho || 0) >= 40 };
      });
      ws.getRow(1).numFmt = "@"; // los encabezados son texto aunque la columna sea numérica
    } else {
      for (const f of hoja.filas) {
        const fila = ws.addRow(f.map((v) => (v === null || v === undefined ? null : v)));
        // Un renglón de una sola celda en mayúsculas es un título de sección.
        const solo = f.filter((v) => v !== null && v !== undefined && v !== "");
        if (solo.length === 1 && typeof solo[0] === "string" && solo[0] === solo[0].toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(solo[0])) fila.font = { bold: true };
      }
      hoja.columnas.forEach((c, i) => { if (c.tipo === "texto" && (c.ancho || 0) >= 40) ws.getColumn(i + 1).alignment = { vertical: "top", wrapText: true }; });
    }
  }
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
