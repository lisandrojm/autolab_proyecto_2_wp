import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * UN LOTE DE RECIBOS DE SUELDO: la sábana PDF que se subió, partida en un recibo por persona (módulo
 * Contratación › Recibos de sueldo, 20/10/2026).
 *
 * Cada recibo guarda sus páginas como PDF propio en `storage/<tenant>/recibos-sueldo/<lote>/`, lo que se
 * leyó del texto (`datos`), el texto crudo entero (para verlo y exportarlo cuando algo no cierra) y a
 * quién se asoció: la persona por su CUIL y su contrato que rige, que es lo que la nomenclatura y el
 * circuito de firma necesitan. El circuito es el de los contratos: el PDF va al Outbox de Dropbox con
 * la nomenclatura «Recibos de sueldo» y se reconoce al volver por su código («ID-000123»).
 *
 * `textoCrudo` puede pesar (unos KB por página): los listados lo excluyen con `select`.
 */
export type EstadoRecibo = "sin_persona" | "listo" | "enviando" | "enviado" | "firmado" | "error";

export interface IReciboDelLote {
  _id: Types.ObjectId;
  /** Páginas de la sábana (base 1) que forman este recibo. */
  paginas: number[];
  datos: {
    cuil: string;
    empleadorCuit: string;
    nombre: string;
    periodo: string;
    legajo: string;
    neto: string;
    cuitsEncontrados: string[];
    /** Lo que sigue sólo sale del TXT de MEMOSOFT (`utils/reciboTxtMemosoft.ts`); con OCR queda vacío. */
    empresa?: string;
    basico?: string;
    ingreso?: string;
    antiguedad?: string;
    sector?: string;
    modalidad?: string;
    categoria?: string;
    tarea?: string;
    periodoTexto?: string;
    periodoDeposito?: string;
    fechaDeposito?: string;
    bancoDeposito?: string;
    costoTotal?: string;
    contribucionesEmpleador?: string;
    sueldoBruto?: string;
    remunerativo?: string;
    noRemunerativo?: string;
    descuentos?: string;
    sueldoNeto?: string;
    otros?: string;
    formaPago?: string;
    fechaPago?: string;
    numeroRecibo?: string;
    conceptos?: Array<{ codigo: string; concepto: string; unidad: string; monto: string; seccion: string }>;
  };
  textoCrudo: string;
  /** `/storage/<tenant>/recibos-sueldo/<lote>/<n>.pdf` */
  archivoUrl: string;
  userId?: Types.ObjectId | null;
  userProjectId?: Types.ObjectId | null;
  projectId?: Types.ObjectId | null;
  contractIndex?: number | null;
  /** Para mostrar sin volver a buscar. */
  nombreUsuario?: string;
  nombreProyecto?: string;
  /** Si la persona se eligió a mano (el CUIL no se leyó o no coincidía). */
  asignadoAMano?: boolean;
  /** Si se asoció por apellido y nombre porque el OCR no leyó el CUIL: para revisar antes de enviar. */
  asociadoPorNombre?: boolean;
  estado: EstadoRecibo;
  enviadoEl?: Date | null;
  firmadoEl?: Date | null;
  /** El nombre con el que salió al Outbox, y su código. */
  nombreEnviado?: string;
  codigo?: string;
  error?: string;
}

export type EstadoLote = "leyendo" | "listo" | "error";

export interface ILoteRecibosSueldo extends Document {
  tenantId: Types.ObjectId;
  nombreArchivo: string;
  subidoPor?: Types.ObjectId | null;
  /** La sábana original, por si hay que volver a leerla: `/storage/<tenant>/recibos-sueldo/<lote>/sabana.pdf`. */
  sabanaUrl: string;
  /**
   * La lectura corre en segundo plano (OCR: ~1 s por página): el lote nace «leyendo», con el avance en
   * `progreso`, y pasa a «listo» con sus recibos, o a «error» con el motivo.
   */
  estadoLote: EstadoLote;
  progreso: { leidas: number; total: number };
  error?: string;
  paginas: number;
  paginasPorRecibo: number;
  /**
   * De dónde salen los datos: «txt» si se subió el TXT que MEMOSOFT exporta con la sábana (el bloque N
   * del TXT es la página N del PDF; sin OCR), «ocr» si sólo vino el PDF.
   */
  fuente: "ocr" | "txt";
  nombreTxt?: string;
  txtUrl?: string;
  /** El período que más se repite entre los recibos leídos ("YYYY-MM"), o "". */
  periodo: string;
  /** El último envío a firmar, que corre en segundo plano: su avance, para mostrarlo en la pantalla. */
  envio?: { estado: "enviando" | "listo" | "error"; total: number; hechos: number; fallidos: number; iniciadoEl: Date; ultimoAvance: Date; terminadoEl?: Date | null; porNombre?: string; error?: string } | null;
  recibos: Types.DocumentArray<IReciboDelLote & Types.Subdocument>;
  createdAt: Date;
  updatedAt: Date;
}

const reciboSchema = new Schema<IReciboDelLote>(
  {
    paginas: { type: [Number], default: [] },
    datos: {
      cuil: { type: String, default: "" },
      empleadorCuit: { type: String, default: "" },
      nombre: { type: String, default: "" },
      periodo: { type: String, default: "" },
      legajo: { type: String, default: "" },
      neto: { type: String, default: "" },
      cuitsEncontrados: { type: [String], default: [] },
      empresa: { type: String, default: "" },
      basico: { type: String, default: "" },
      ingreso: { type: String, default: "" },
      antiguedad: { type: String, default: "" },
      sector: { type: String, default: "" },
      modalidad: { type: String, default: "" },
      categoria: { type: String, default: "" },
      tarea: { type: String, default: "" },
      periodoTexto: { type: String, default: "" },
      periodoDeposito: { type: String, default: "" },
      fechaDeposito: { type: String, default: "" },
      bancoDeposito: { type: String, default: "" },
      costoTotal: { type: String, default: "" },
      contribucionesEmpleador: { type: String, default: "" },
      sueldoBruto: { type: String, default: "" },
      remunerativo: { type: String, default: "" },
      noRemunerativo: { type: String, default: "" },
      descuentos: { type: String, default: "" },
      sueldoNeto: { type: String, default: "" },
      otros: { type: String, default: "" },
      formaPago: { type: String, default: "" },
      fechaPago: { type: String, default: "" },
      numeroRecibo: { type: String, default: "" },
      conceptos: {
        type: [new Schema({ codigo: String, concepto: String, unidad: String, monto: String, seccion: String }, { _id: false })],
        default: [],
      },
    },
    textoCrudo: { type: String, default: "" },
    archivoUrl: { type: String, default: "" },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    userProjectId: { type: Schema.Types.ObjectId, default: null },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    contractIndex: { type: Number, default: null },
    nombreUsuario: { type: String, default: "" },
    nombreProyecto: { type: String, default: "" },
    asignadoAMano: { type: Boolean, default: false },
    asociadoPorNombre: { type: Boolean, default: false },
    estado: { type: String, enum: ["sin_persona", "listo", "enviando", "enviado", "firmado", "error"], default: "sin_persona" },
    enviadoEl: { type: Date, default: null },
    firmadoEl: { type: Date, default: null },
    nombreEnviado: { type: String, default: "" },
    codigo: { type: String, default: "" },
    error: { type: String, default: "" },
  },
  { _id: true },
);

const schema = new Schema<ILoteRecibosSueldo>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    nombreArchivo: { type: String, default: "" },
    subidoPor: { type: Schema.Types.ObjectId, ref: "User", default: null },
    sabanaUrl: { type: String, default: "" },
    estadoLote: { type: String, enum: ["leyendo", "listo", "error"], default: "leyendo" },
    progreso: { leidas: { type: Number, default: 0 }, total: { type: Number, default: 0 } },
    error: { type: String, default: "" },
    paginas: { type: Number, default: 0 },
    paginasPorRecibo: { type: Number, default: 2 },
    fuente: { type: String, enum: ["ocr", "txt"], default: "ocr" },
    nombreTxt: { type: String, default: "" },
    txtUrl: { type: String, default: "" },
    periodo: { type: String, default: "" },
    envio: {
      type: new Schema(
        { estado: String, total: Number, hechos: Number, fallidos: Number, iniciadoEl: Date, ultimoAvance: Date, terminadoEl: Date, porNombre: String, error: String },
        { _id: false },
      ),
      default: null,
    },
    recibos: { type: [reciboSchema], default: [] },
  },
  { timestamps: true, collection: "recibos_sueldo_lotes" },
);

schema.index({ tenantId: 1, createdAt: -1 });
// Para marcar el recibo como firmado cuando el escaneo de Dropbox encuentra su código.
schema.index({ tenantId: 1, "recibos.codigo": 1 }, { sparse: true });

export const LoteRecibosSueldo: Model<ILoteRecibosSueldo> = mongoose.model<ILoteRecibosSueldo>("LoteRecibosSueldo", schema);
