import { Schema, model, Document, Types } from "mongoose";

/**
 * QUÉ LE HACE UN TIPO DE NOVEDAD A UNA CUENTA DE DÍAS.
 *
 * Es el puente entre el hecho y el banco: «Compensatorios» consume de la cuenta COMPENSATORIO,
 * «Horas extras y feriados» la acredita. Un tipo puede no tener ninguno —«Cambios de turno» no
 * mueve nada— o tener varios.
 *
 * `condition` deja que el mismo tipo haga o no haga según el día: acreditar sólo si fue feriado,
 * por ejemplo. Vacía, el efecto se aplica siempre.
 */
export interface ILeaveEffect {
  accountId: Types.ObjectId;
  /** `debit` consume días de la cuenta; `credit` los acredita. */
  direction: "debit" | "credit";
  /** Sobre qué se calcula: el día entero, las horas cargadas, o una cantidad fija. */
  basis: "dia" | "hora" | "fijo";
  /** Multiplicador. 1 es «uno por uno»; 1.5 o 2 sirven para feriados o nocturnidad. */
  factor: number;
  cantidadFija?: number;
  rounding: "none" | "up" | "down" | "half";
  condition?: {
    esFeriado?: boolean;
    esDiaNoLaborable?: boolean;
  };
}


/**
 * QUÉ CONCEPTO DE MEMOSOFT GENERA UN MOTIVO DE NOVEDAD.
 *
 * OJO CON LA VECINDAD: `effects` (abajo) mueve el BANCO DE DÍAS —saldos internos de vacaciones y
 * compensatorios—, y esto mueve el RECIBO DE SUELDO. Son dos cosas distintas y un motivo puede
 * tener las dos: "Compensatorios" le consume un día del banco al titular Y le genera un jornal al
 * reemplazante. Por eso son dos listas y no una.
 *
 * EL EFECTO CUELGA DEL `_id` DEL MOTIVO, NUNCA DE SU NOMBRE. El nombre se edita desde el ABM, y si
 * el mapeo se apoyara en él, renombrar "Enfermedad" dejaría de generar licencias sin que nadie se
 * entere hasta que salga el recibo.
 */
export interface IMemosoftEffect {
  /** El código de cuatro dígitos, texto. Ver `models/MemosoftConcepto.ts`. */
  conceptoCodigo: string;
  /** En cuál de las dos columnas de parámetros va el número. */
  param: "par1" | "par2";
  /** Qué ES ese número. Tiene que coincidir con lo que el catálogo dice del concepto. */
  unidad: "cantidad" | "importe";
  /**
   * De dónde sale el número.
   *
   *   · `jornadas` — los días que abarca la novedad.
   *   · `horas50` / `horas100` — las horas extra cargadas en el parte.
   *   · `fijo`     — siempre `valorFijo`.
   *   · `manual`   — el motor NO lo calcula: lo carga una persona. Va al anexo hasta que lo hagan.
   */
  fuente: "jornadas" | "horas50" | "horas100" | "fijo" | "manual";
  valorFijo?: number;
  /** A quién se le liquida: al que faltó o al que lo cubrió. */
  aplicaA: "titular" | "reemplazante";
  /** Sólo para este régimen. Vacío = los dos. */
  soloRegimen?: "mensual" | "jornalero" | null;
  /** Sólo para esta empresa. Vacío = todas. Los códigos NO son universales entre empresas. */
  empresaId?: Types.ObjectId | null;
  /** Desde qué día rige, "AAAA-MM-DD". */
  vigenteDesde: string;
  /**
   * Hasta qué día rigió. Vacío = sigue rigiendo.
   *
   * NO ESTABA EN EL PEDIDO Y HACE FALTA. Sin fecha de cierre, cambiar un mapeo obliga a borrar el
   * efecto viejo, y borrarlo hace que una liquidación de un mes anterior se recalcule con reglas
   * que entonces no existían. Cerrando en vez de borrar, cada período se puede volver a armar con
   * lo que regía cuando se liquidó.
   */
  vigenteHasta?: string | null;
  /** Nota de quien lo configuró: por qué este motivo va a este concepto. */
  nota?: string;
}

export interface IRequestConfig extends Document {
  tenantId: Types.ObjectId;
  name: string;
  order: number;
  requiresReplacement: boolean;
  isActive: boolean;
  visibility: "all" | "specific";
  allowedProjectIds: Types.ObjectId[];
  /** Qué cuentas de DÍAS mueve este tipo. Vacío = no mueve ninguna (ver `ILeaveEffect`). */
  effects: ILeaveEffect[];
  /** Qué conceptos del RECIBO genera este tipo. Vacío = ninguno (ver `IMemosoftEffect`). */
  memosoftEffects: IMemosoftEffect[];
  /**
   * "ESTE MOTIVO NO LIQUIDA NADA, Y ESTÁ DECIDIDO."
   *
   * Sin esto no hay forma de distinguir un motivo que nadie configuró todavía de uno que se revisó
   * y no corresponde que genere nada. "Cambios de Turno" es el segundo caso: la persona trabajó,
   * sólo que en otro turno. Sin la marca, cada corrida levantaba 61 avisos de algo que está bien, y
   * entre esos avisos se perdían los que sí hay que mirar.
   */
  memosoftNoLiquida?: boolean;
  /**
   * TOPE SIN BANCO: para lo que tiene un máximo pero no acumula saldo, como Enfermedad.
   *
   * Con `accion: 'avisar'` se deja cargar y se avisa; con `'bloquear'`, no se deja. Avisar es lo
   * razonable por defecto: quien carga la novedad rara vez es quien decide la excepción.
   */
  limit?: {
    enabled: boolean;
    maxPorPeriodo?: number;
    periodo?: "calendario" | "aniversario_ingreso";
    accion?: "avisar" | "bloquear";
  };
  createdAt: Date;
  updatedAt: Date;
}

const requestConfigSchema = new Schema<IRequestConfig>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    name: { type: String, required: true },
    order: { type: Number, default: 0 },
    requiresReplacement: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    visibility: {
      type: String,
      enum: ["all", "specific"],
      default: "all",
    },
    allowedProjectIds: [{ type: Schema.Types.ObjectId, ref: "Project", default: [] }],
    effects: {
      type: [
        {
          _id: false,
          accountId: { type: Schema.Types.ObjectId, ref: "LeaveAccount", required: true },
          direction: { type: String, enum: ["debit", "credit"], required: true },
          basis: { type: String, enum: ["dia", "hora", "fijo"], default: "dia" },
          factor: { type: Number, default: 1 },
          cantidadFija: { type: Number },
          rounding: { type: String, enum: ["none", "up", "down", "half"], default: "none" },
          condition: {
            esFeriado: { type: Boolean },
            esDiaNoLaborable: { type: Boolean },
          },
        },
      ],
      default: [],
    },
    memosoftEffects: {
      type: [
        {
          _id: false,
          conceptoCodigo: { type: String, required: true, trim: true },
          param: { type: String, enum: ["par1", "par2"], required: true },
          unidad: { type: String, enum: ["cantidad", "importe"], required: true },
          fuente: { type: String, enum: ["jornadas", "horas50", "horas100", "fijo", "manual"], required: true },
          valorFijo: { type: Number },
          aplicaA: { type: String, enum: ["titular", "reemplazante"], required: true },
          soloRegimen: { type: String, enum: ["mensual", "jornalero", null], default: null },
          empresaId: { type: Schema.Types.ObjectId, ref: "Company", default: null },
          vigenteDesde: { type: String, required: true },
          vigenteHasta: { type: String, default: null },
          nota: { type: String },
        },
      ],
      default: [],
    },
    memosoftNoLiquida: { type: Boolean, default: false },
    limit: {
      enabled: { type: Boolean, default: false },
      maxPorPeriodo: { type: Number },
      periodo: { type: String, enum: ["calendario", "aniversario_ingreso"], default: "calendario" },
      accion: { type: String, enum: ["avisar", "bloquear"], default: "avisar" },
    },
  },
  { timestamps: true, collection: "requests_configs" },
);

// Compound index to ensure uniqueness of name per tenant
requestConfigSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const RequestConfig = model<IRequestConfig>("RequestConfig", requestConfigSchema);
