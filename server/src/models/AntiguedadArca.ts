import { Schema, model, Document, Types } from "mongoose";

/**
 * LA ANTIGÜEDAD DE CADA PERSONA SEGÚN ARCA, YA CALCULADA (materializada).
 *
 * Una fila por (tenant, cuil, empleadora) y una fila GLOBAL por (tenant, cuil, empleadoraCuit: null)
 * que junta todas las empleadoras del tenant. Se recalcula al final de cada seed y de cada sync,
 * sólo para los CUIL que se tocaron; el cálculo en sí es puro y está en
 * `utils/antiguedadArca.ts` (recibe las relaciones de un CUIL y devuelve estas métricas).
 *
 * Se guardan LAS DOS medidas, porque las dos se usan:
 *  - `antiguedadDesdePrimeraAlta`: días entre la primera alta y hoy, con huecos y todo. Es la
 *    antigüedad «desde que entró».
 *  - `diasTrabajados`: la suma de los días de cada relación (fin − inicio + 1), FUSIONANDO las que se
 *    solapan para no contar un día dos veces; una relación abierta cuenta hasta hoy. Es la
 *    antigüedad «efectiva».
 * Las dos dependen de «hoy»: `calculadoEl` dice con qué día se calcularon.
 */
export interface IAntiguedadArca extends Document {
  tenantId: Types.ObjectId;
  cuil: string;
  /** 11 dígitos, o `null` en la fila global (todas las empleadoras). */
  empleadoraCuit: string | null;
  /** El nombre de la relación más reciente. */
  apellidoNombre: string;
  primeraAlta: Date;
  /** La mayor FECHA DE FIN; si hay una relación abierta, el «hoy» del cálculo. */
  ultimaFecha: Date;
  /** Días corridos entre `primeraAlta` y el «hoy» del cálculo. */
  antiguedadDesdePrimeraAlta: { dias: number; anios: number };
  /** Días efectivamente trabajados (relaciones fusionadas), y su equivalente en años. */
  diasTrabajados: number;
  aniosTrabajados: number;
  cantidadContratos: number;
  /** ¿Hay alguna relación sin fecha de fin? */
  tieneRelacionAbierta: boolean;
  /** En la fila global: los CUIT de las empleadoras que aportan. En la fila por empleadora, sólo ella. */
  empresas: string[];
  calculadoEl: Date;
  createdAt: Date;
  updatedAt: Date;
}

const antiguedadArcaSchema = new Schema<IAntiguedadArca>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    cuil: { type: String, required: true, match: /^\d{11}$/ },
    empleadoraCuit: { type: String, default: null },
    apellidoNombre: { type: String, default: "" },
    primeraAlta: { type: Date, required: true },
    ultimaFecha: { type: Date, required: true },
    antiguedadDesdePrimeraAlta: {
      dias: { type: Number, required: true },
      anios: { type: Number, required: true },
    },
    diasTrabajados: { type: Number, required: true },
    aniosTrabajados: { type: Number, required: true },
    cantidadContratos: { type: Number, required: true },
    tieneRelacionAbierta: { type: Boolean, default: false },
    empresas: { type: [String], default: [] },
    calculadoEl: { type: Date, required: true },
  },
  { timestamps: true, collection: "antiguedad_arca" },
);

// Una fila por persona y empleadora, más la global (empleadoraCuit null). Único para que el recálculo
// sea un upsert y nunca deje dos filas distintas para la misma persona.
antiguedadArcaSchema.index({ tenantId: 1, cuil: 1, empleadoraCuit: 1 }, { unique: true });
// El listado de la pantalla filtra por empleadora y busca por nombre.
antiguedadArcaSchema.index({ tenantId: 1, empleadoraCuit: 1, apellidoNombre: 1 });

export const AntiguedadArca = model<IAntiguedadArca>("AntiguedadArca", antiguedadArcaSchema);
export default AntiguedadArca;
