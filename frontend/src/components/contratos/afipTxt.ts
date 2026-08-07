import { ContractOverviewRow } from "../../api/users";
import { AfipCatalogs, resolveAfipValues } from "./afipCompleteness";

/**
 * Generación del archivo TXT de "Alta masiva sin límite de registros" de AFIP/ARCA.
 * Registro de ancho fijo de 130 caracteres, sin separadores. Los campos obligatorios numéricos van
 * con ceros a la izquierda; los opcionales, en blanco (espacios), tal como pide la interfaz de AFIP.
 */

/** Solo dígitos, justificado a la derecha con ceros a la izquierda, a lo sumo `len` caracteres. */
const num = (v: string | number | null | undefined, len: number): string =>
  String(v ?? "")
    .replace(/\D/g, "")
    .slice(-len)
    .padStart(len, "0");

/** Texto justificado a la izquierda, relleno con espacios a la derecha, cortado a `len`. */
const txt = (v: string, len: number): string => (v || "").slice(0, len).padEnd(len, " ");

/** Campo opcional: se completa con espacios en blanco. */
const blank = (len: number): string => " ".repeat(len);

/** Fecha en formato AAAA/MM/DD que pide AFIP. Acepta "YYYY-MM-DD" o "DD/MM/YYYY". */
const fechaAfip = (s: string): string => {
  if (!s) return "";
  let m = /^(\d{4})[-/](\d{2})[-/](\d{2})/.exec(s);
  if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  m = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return "";
};

/**
 * Arma el registro de 130 caracteres de un contrato. Devuelve null si le faltan datos obligatorios
 * (no se puede generar una línea válida sin ellos).
 */
export function buildAltaRecord(row: ContractOverviewRow, cat: AfipCatalogs): string | null {
  const v = resolveAfipValues(row, cat);
  const faltaObligatorio =
    v.cuil.length !== 11 ||
    !v.fechaInicio ||
    v.retribucion <= 0 ||
    !v.categoriaProf ||
    !v.modalidadContrato ||
    !v.tipoServicio ||
    !v.actividad ||
    !v.modalidadLiq ||
    !v.rnos ||
    !v.sucursal ||
    // No es un campo del registro en sí (ver resolveAfip): un mismo TXT es para una sola empresa.
    !row.empresaContratoId;
  if (faltaObligatorio) return null;

  const fechaFin = fechaAfip(v.fechaFin);

  const record =
    "01" + // 1-2   Tipo de registro
    "AT" + // 3-4   Código de movimiento (alta)
    num(v.cuil, 11) + // 5-15  CUIL
    "N" + // 16     Marca trabajador agropecuario
    num(v.modalidadContrato, 3) + // 17-19 Modalidad de contrato
    txt(fechaAfip(v.fechaInicio), 10) + // 20-29 Fecha inicio relación laboral
    (fechaFin ? txt(fechaFin, 10) : blank(10)) + // 30-39 Fecha fin (blanco si indeterminado)
    num(v.rnos, 6) + // 40-45 Código de obra social (RNOS)
    blank(2) + // 46-47 Código situación de baja (opcional)
    blank(10) + // 48-57 Fecha telegrama renuncia (opcional)
    num(Math.round(v.retribucion), 15) + // 58-72 Retribución pactada
    num(v.modalidadLiq, 1) + // 73    Modalidad de liquidación
    num(v.sucursal, 5) + // 74-78 Sucursal (domicilio de desempeño)
    num(v.actividad, 6) + // 79-84 Actividad del domicilio
    blank(4) + // 85-88 Puesto desempeñado (opcional)
    "00" + // 89-90 Rectificación (normal)
    blank(10) + // 91-100 Código Convenio Colectivo (opcional)
    num(v.categoriaProf, 6) + // 101-106 Categoría profesional
    num(v.tipoServicio, 3) + // 107-109 Tipo de servicio
    blank(10) + // 110-119 Fecha suspensión (opcional)
    blank(10) + // 120-129 N° Formulario Agropecuario (opcional)
    blank(1); // 130    Marca COVID / contrato CCG (opcional)

  return record;
}

/** Une varios registros con CRLF (formato que espera AFIP). */
export function buildAltaTxt(records: string[]): string {
  return records.join("\r\n");
}

/** Dispara la descarga de un archivo .txt en el navegador. */
export function downloadTxt(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
