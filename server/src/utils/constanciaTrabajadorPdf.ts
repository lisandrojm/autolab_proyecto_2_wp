import { extraerTextoPdf, normalizarCuit } from "./constanciaPdf.js";

/**
 * LA «CONSTANCIA DEL TRABAJADOR» DE ARCA (Simplificación Registral): el PDF que sale de Relaciones
 * Laborales → Consultas → impresora. Es el comprobante del alta temprana.
 *
 * Se lee para VALIDAR antes de mandarlo a firmar o archivarlo: un PDF que no es de esta persona, de
 * esta empleadora o de este período —o que es la constancia de BAJA, que ARCA entrega por la misma
 * impresora cuando la relación ya terminó— no puede salir a firma con el nombre de otro contrato.
 *
 * El formato está tomado de una constancia real (2030 S.R.L., 4/10/2026): dos páginas iguales
 * (talón del empleador y del empleado), con el TIPO —«Alta» o «Baja»— en la línea que sigue al
 * título. Si ARCA cambia el formato y algo no se encuentra, el campo queda vacío y la validación lo
 * dice: acá no se adivina.
 */
export interface ConstanciaTrabajador {
  /** La línea que sigue al título: «Alta», «Baja»… en minúsculas. "" si no se encontró el título. */
  tipo: string;
  /** 11 dígitos, o "". */
  empleadorCuit: string;
  cuil: string;
  apellidoNombre: string;
  /** YYYY-MM-DD, o "". */
  fechaInicio: string;
  fechaCese: string;
  /** La clave de alta que da ARCA («Clave: CA 2639…»), sin espacios. */
  clave: string;
  /** «Número de registro de trámite», solo en el talón del empleado. */
  nroTramite: string;
}

const aIso = (ddmmaaaa: string | undefined): string => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(ddmmaaaa || "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};

/** Lee los datos de la constancia desde su texto. Puro. */
export function leerConstanciaTrabajador(textoCrudo: string): ConstanciaTrabajador {
  const texto = String(textoCrudo || "").replace(/\r/g, "");
  const lineas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
  const iTitulo = lineas.findIndex((l) => /^CONSTANCIA DEL TRABAJADOR$/i.test(l));
  const uno = (re: RegExp): string => (re.exec(texto)?.[1] || "").trim();
  return {
    tipo: iTitulo >= 0 ? (lineas[iTitulo + 1] || "").toLowerCase() : "",
    // El CUIT del empleador es el que va en la línea «Empleador:»; el CUIL, el de «CUIL:».
    empleadorCuit: normalizarCuit(uno(/Empleador:\s*CUIT:\s*([\d-]{11,13})/i)),
    cuil: normalizarCuit(uno(/(?:^|\n)\s*CUIL:\s*([\d-]{11,13})/i)),
    apellidoNombre: uno(/Apellido y nombre:\s*([^\n]+)/i),
    fechaInicio: aIso(uno(/Fecha Inicio:\s*(\d{2}\/\d{2}\/\d{4})/i)),
    fechaCese: aIso(uno(/Fecha Cese:\s*(\d{2}\/\d{2}\/\d{4})/i)),
    clave: uno(/Clave:\s*([A-Z]{0,3}\s*\d{6,})/i).replace(/\s+/g, ""),
    nroTramite: uno(/N[úu]mero de registro de tr[áa]mite\s*(\d{6,})/i),
  };
}

export const leerConstanciaTrabajadorPdf = async (buffer: Buffer): Promise<ConstanciaTrabajador> => leerConstanciaTrabajador(await extraerTextoPdf(buffer));

/**
 * Por qué esta constancia NO es el alta de ese contrato. Vacío = coincide en todo.
 *
 * Las cuatro cosas que se piden: que diga Alta, y que el CUIL, el CUIT de la empleadora y la fecha
 * de inicio sean los del contrato. Un dato que no se pudo leer cuenta como que no coincide: sin
 * poder comprobarlo, el PDF queda para revisar y no se envía ni se archiva.
 */
export function problemasDeConstancia(c: ConstanciaTrabajador, esperado: { cuil: unknown; empleadorCuit: unknown; fechaInicio: unknown }): string[] {
  const out: string[] = [];
  const cuil = normalizarCuit(String(esperado.cuil ?? ""));
  const cuit = normalizarCuit(String(esperado.empleadorCuit ?? ""));
  const inicio = String(esperado.fechaInicio ?? "").slice(0, 10);
  if (!c.tipo) out.push("No es una «Constancia del trabajador» de ARCA (no se encontró el título).");
  else if (c.tipo !== "alta") out.push(`Es una constancia de «${c.tipo}», no de Alta.`);
  if (!c.cuil) out.push("No se pudo leer el CUIL de la constancia.");
  else if (c.cuil !== cuil) out.push(`El CUIL de la constancia (${c.cuil}) no es el de la persona del contrato (${cuil || "sin CUIL"}).`);
  if (!c.empleadorCuit) out.push("No se pudo leer el CUIT del empleador de la constancia.");
  else if (c.empleadorCuit !== cuit) out.push(`El CUIT del empleador de la constancia (${c.empleadorCuit}) no es el de la Empresa Contrato (${cuit || "sin CUIT"}).`);
  if (!c.fechaInicio) out.push("No se pudo leer la fecha de inicio de la constancia.");
  else if (c.fechaInicio !== inicio) out.push(`La fecha de inicio de la constancia (${c.fechaInicio}) no es la del contrato (${inicio || "sin fecha"}).`);
  return out;
}
