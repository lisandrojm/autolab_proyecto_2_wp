import { ContractOverviewRow } from "../../api/users";
import { AfipCatalogs, AfipValues, resolveAfipValues, MODALIDADES_PLAZO_DETERMINADO, MODALIDADES_TIEMPO_INDETERMINADO } from "./afipCompleteness";
import { CampoRegistro, fechaAfip, finAnteriorAlInicio } from "./afipTxt";
import { LAYOUT_85, LARGO_85, fecha85, remuneracion85 } from "@compartido/layoutAltaArca";

/**
 * Registro de 85 caracteres de «Registrar Nuevas Altas → Altas Masivas» (el que se PEGA, máximo 9).
 *
 * NO es el de 130 recortado. Otro orden de campos, fechas en `ddmmyyyy`, la remuneración partida en
 * entera + decimal, y tres datos que el de 130 deja en blanco en un alta: puesto desempeñado,
 * convenio colectivo y situación de revista. Por eso no hereda `NO_INFORMABLES_EN_ALTA`: esa lista es
 * del formato de 130.
 *
 * Las posiciones salen de `LAYOUT_85` (compartido con el servidor, que parte el registro para
 * cotejarlo). Este archivo decide el CONTENIDO de cada una; el layout, no.
 *
 * Los valores salen de `resolveAfipValues`, igual que el de 130: mismo CUIL, misma obra social, misma
 * categoría. Lo único que cambia es cómo se escriben.
 */

/** Solo dígitos, ceros a la izquierda, `len` caracteres. */
const num = (v: string | number | null | undefined, len: number): string =>
  String(v ?? "")
    .replace(/\D/g, "")
    .slice(-len)
    .padStart(len, "0");

/** Texto a la izquierda con espacios a la derecha (el convenio: "0634/11   "). */
const txt = (v: string, len: number): string => (v || "").slice(0, len).padEnd(len, " ");

/** Marca de trabajador agropecuario: 1 = sí, cualquier otro = no. Una productora no lo es. */
const AGROPECUARIO_NO = "0";
/**
 * Marca Lic. COVID / tipo de contrato CCG: 0 = no asociado. Para altas desde el 01/10/2022 los
 * valores válidos son 0 y 2-9; un alta común va en 0.
 */
const CCG_NO_ASOCIADO = "0";

export function describirRegistro85(row: ContractOverviewRow, cat: AfipCatalogs): { campos: CampoRegistro[]; valores: AfipValues } {
  const v = resolveAfipValues(row, cat);

  // Misma regla de fecha de fin que el de 130 (ver `describirRegistro`): obligatoria a plazo
  // determinado, en blanco por tiempo indeterminado, y nunca anterior al inicio.
  const inicioAfip = fechaAfip(v.fechaInicio);
  const finAfip = fechaAfip(v.fechaFin);
  const fechaFinInvalida = !!v.fechaFin && !finAfip;
  const exigeFechaFin = MODALIDADES_PLAZO_DETERMINADO.includes(v.modalidadContrato);
  const prohibeFechaFin = MODALIDADES_TIEMPO_INDETERMINADO.includes(v.modalidadContrato);
  const fechaFinOk = !fechaFinInvalida && !(exigeFechaFin && !finAfip) && !(prohibeFechaFin && !!finAfip) && !finAnteriorAlInicio(inicioAfip, finAfip);
  const inicio = fecha85(v.fechaInicio);
  const fin = fecha85(v.fechaFin);

  const rem = v.retribucionOk ? remuneracion85(v.retribucion) : null;

  /** Contenido de cada clave del layout. `null` = falta / está mal: el registro no se puede armar. */
  const contenido: Record<string, { valor: string | null; checkKey?: string; clase?: CampoRegistro["clase"] }> = {
    cuil: { valor: v.cuilValido ? num(v.cuil, 11) : null, checkKey: "cuil" },
    rnos: { valor: v.rnos ? num(v.rnos, 6) : null, checkKey: "rnos" },
    sucursal: { valor: v.sucursal ? num(v.sucursal, 5) : null, checkKey: "sucursal" },
    actividad: { valor: v.actividad ? num(v.actividad, 6) : null, checkKey: "actividad" },
    puesto: { valor: v.puesto ? num(v.puesto, 4) : null, checkKey: "puesto" },
    modalidadContrato: { valor: v.modalidadContrato ? num(v.modalidadContrato, 3) : null, checkKey: "modalidadContrato" },
    modalidadLiq: { valor: v.modalidadLiq ? num(v.modalidadLiq, 1) : null, checkKey: "modalidadLiq" },
    retribucionEntera: { valor: rem ? rem.entera : null, checkKey: "retribucion" },
    retribucionDecimal: { valor: rem ? rem.decimal : null, checkKey: "retribucion" },
    agropecuario: { valor: AGROPECUARIO_NO, clase: "constante" },
    fechaInicio: { valor: inicio || null, checkKey: "fechaInicio" },
    // En blanco (8 espacios) cuando no corresponde, igual que en el de 130.
    fechaFin: { valor: fechaFinOk ? fin || " ".repeat(8) : null, checkKey: "fechaFin" },
    convenio: { valor: v.convenioCategoria ? txt(v.convenioCategoria, 10) : null, checkKey: "convenioCategoria" },
    categoriaProf: { valor: v.categoriaProf ? num(v.categoriaProf, 6) : null, checkKey: "categoriaProf" },
    tipoServicio: { valor: v.tipoServicio ? num(v.tipoServicio, 3) : null, checkKey: "tipoServicio" },
    ccg: { valor: CCG_NO_ASOCIADO, clase: "constante" },
    situacionRevista: { valor: v.situacionRevista ? num(v.situacionRevista, 2) : null, checkKey: "situacionRevista" },
  };

  const campos: CampoRegistro[] = LAYOUT_85.map((c) => {
    const largo = c.hasta - c.desde + 1;
    const x = contenido[c.clave];
    return {
      desde: c.desde,
      hasta: c.hasta,
      nombre: c.nombre,
      clase: x.clase || "dato",
      contenido: x.valor,
      placeholder: x.clase === "constante" && x.valor ? x.valor : "·".repeat(largo),
      checkKey: x.checkKey,
    };
  });

  return { campos, valores: v };
}

/** El registro de 85 de un contrato, o null si le falta algún dato. */
export function buildAltaRecord85(row: ContractOverviewRow, cat: AfipCatalogs): string | null {
  if (!row.empresaContratoId) return null;
  const { campos } = describirRegistro85(row, cat);
  if (campos.some((c) => c.contenido === null)) return null;
  const record = campos.map((c) => c.contenido).join("");
  // Todos los campos son de ancho fijo: un largo distinto es un error del armado, no de los datos.
  if (record.length !== LARGO_85) throw new Error(`Registro de Altas Masivas con largo inválido: ${record.length} caracteres (se esperaban ${LARGO_85}).`);
  return record;
}

/**
 * El texto que se pega en ARCA: un registro por línea, separados por LF y SIN salto final.
 *
 * Distinto del archivo de 130 (que cierra con LF): esto va a un textarea, y una línea vacía al final
 * puede leerse como un décimo registro vacío. Lo confirma o corrige el relevamiento de la pantalla.
 */
export const buildAltasMasivasTexto = (records: string[]): string => records.join("\n");
