import { Schema, model, Document, Types, Model } from "mongoose";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UN CONCEPTO DE MEMOSOFT: la columna del recibo donde termina cada novedad
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Memosoft es el sistema de sueldos, corre en escritorio y NO TIENE API. La única forma de meterle
 * novedades es un XLSX con seis columnas —`d8lega`, `d1nape`, `d8conc`, `d8desc`, `d8par1`,
 * `d8par2`—, y cada fila dice: a este legajo, este concepto, con estos dos parámetros.
 *
 * Este catálogo es el que sabe, para cada código, CUÁL de los dos parámetros se usa y si lo que va
 * ahí es una cantidad de días o un importe en pesos. Sin eso, un 0012 con 3 en `par2` en vez de
 * `par1` entra en Memosoft como tres pesos de licencia por enfermedad en lugar de tres días.
 *
 * ES DATO, NO CONSTANTES EN EL CÓDIGO, por dos razones: los 29 códigos son los de 2030 y FZERO y no
 * un estándar —otra empresa tendría los suyos—, y cuando el estudio de sueldos agregue un concepto
 * nadie debería tener que desplegar para poder usarlo.
 *
 * EL PARÁMETRO QUE NO SE USA VA EN CERO, NUNCA VACÍO: es requisito del importador de Memosoft, y
 * está acá como comentario porque es el tipo de detalle que se pierde y se paga caro.
 */

export type UnidadParametro = "cantidad" | "importe";

export interface IMemosoftConcepto extends Document {
  tenantId: Types.ObjectId;
  /** De qué empresa es este catálogo. Los códigos NO son universales. */
  empresaId: Types.ObjectId;
  /**
   * El código tal cual lo espera Memosoft: CUATRO DÍGITOS, TEXTO. "0012", no 12.
   *
   * Es string y no número porque los ceros de la izquierda son parte del código, y un Excel que los
   * pierda genera un archivo que Memosoft rechaza sin decir por qué.
   */
  codigo: string;
  /** La descripción que va en la columna `d8desc`, tal cual la muestra Memosoft. */
  descripcion: string;
  usaPar1: boolean;
  usaPar2: boolean;
  /** Qué significa el número de `d8par1`. Sólo tiene sentido con `usaPar1`. */
  unidadPar1?: UnidadParametro | null;
  unidadPar2?: UnidadParametro | null;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const memosoftConceptoSchema = new Schema<IMemosoftConcepto>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    empresaId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    codigo: { type: String, required: true, trim: true },
    descripcion: { type: String, required: true, trim: true },
    usaPar1: { type: Boolean, default: false },
    usaPar2: { type: Boolean, default: false },
    unidadPar1: { type: String, enum: ["cantidad", "importe", null], default: null },
    unidadPar2: { type: String, enum: ["cantidad", "importe", null], default: null },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "memosoft_conceptos" },
);

// Un código por empresa: es la identidad del concepto, y dos filas iguales serían dos verdades.
memosoftConceptoSchema.index({ tenantId: 1, empresaId: 1, codigo: 1 }, { unique: true });

export const MemosoftConcepto: Model<IMemosoftConcepto> = model<IMemosoftConcepto>("MemosoftConcepto", memosoftConceptoSchema);

/**
 * LOS 29 CÓDIGOS DE 2030 Y FZERO, como los pasó el estudio de sueldos.
 *
 * Semilla, no verdad inmutable: el script de la fase 0 los carga una vez por empresa y de ahí en
 * más se editan desde la pantalla. Está acá y no en el script para que se pueda leer el catálogo
 * sin abrir una migración.
 *
 * DOS DE ESTOS ESTÁN EN DUDA y hay que confirmarlos con el estudio antes de emitirlos:
 *   · 0090 Licencia Sin Goce — la leyenda marca `par2` como importe, pero lo natural sería la
 *     cantidad de días. Queda como vino.
 *   · 0040 Ropa — idem.
 * Se cargan tal cual los mandaron: cambiar la semilla "porque tiene más sentido" es justo la clase
 * de arreglo silencioso que después nadie puede rastrear.
 */
export const CONCEPTOS_SEMILLA: { codigo: string; descripcion: string; par1?: UnidadParametro; par2?: UnidadParametro }[] = [
  { codigo: "0000", descripcion: "Jornal", par2: "cantidad" },
  { codigo: "0001", descripcion: "Sueldo Básico", par2: "cantidad" },
  { codigo: "0008", descripcion: "Adicional H" },
  { codigo: "0009", descripcion: "Suspensiones", par1: "cantidad" },
  { codigo: "0010", descripcion: "Inasistencia", par1: "importe" },
  { codigo: "0011", descripcion: "Inasistencia Injustificada", par1: "cantidad", par2: "importe" },
  { codigo: "0012", descripcion: "Licencia por Enfermedad", par1: "cantidad" },
  { codigo: "0013", descripcion: "Suspención Disciplinaria", par1: "cantidad", par2: "importe" },
  { codigo: "0015", descripcion: "Horas Extras al 50%", par1: "cantidad" },
  { codigo: "0016", descripcion: "Horas Extras al 100%", par1: "cantidad" },
  { codigo: "0017", descripcion: "Feriado", par1: "cantidad" },
  { codigo: "0018", descripcion: "Dia del gremio", par1: "cantidad" },
  { codigo: "0019", descripcion: "Adicional F", par1: "cantidad" },
  { codigo: "0020", descripcion: "BONO", par1: "importe" },
  { codigo: "0029", descripcion: "Adicional Especial", par1: "importe" },
  { codigo: "0030", descripcion: "Adicional Especial LN+", par1: "importe" },
  { codigo: "0040", descripcion: "Ropa", par2: "importe" },
  { codigo: "0041", descripcion: "Guarderia", par1: "importe" },
  { codigo: "0042", descripcion: "Exteriores", par1: "cantidad" },
  { codigo: "0043", descripcion: "Reintegro Comida", par1: "cantidad" },
  { codigo: "0080", descripcion: "Prest.Dineraria L.24577 (Empl)", par2: "importe" },
  { codigo: "0081", descripcion: "Prest.Dineraria L.24577 (ART)", par2: "importe" },
  { codigo: "0090", descripcion: "Licencia Sin Goce de Sueldo", par2: "importe" },
  { codigo: "0099", descripcion: "Adelanto de Sueldos", par1: "importe" },
  { codigo: "0500", descripcion: "S.A.C.", par1: "cantidad", par2: "importe" },
  { codigo: "0501", descripcion: "S.A.C. Proporcional", par1: "cantidad", par2: "importe" },
  { codigo: "0601", descripcion: "Plus Vacacional", par1: "cantidad" },
  { codigo: "0604", descripcion: "Licencia por Matrimonio", par1: "cantidad" },
  { codigo: "0701", descripcion: "Vacaciones No Gozadas", par1: "cantidad" },
];
