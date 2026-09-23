import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * El capítulo de PEQUEÑAS EMPRESAS del acta: cuatro valores por grupo y por período.
 *
 * El acuerdo de 634/11 no tiene una sola escala: además de la mensual por grupo, publica un capítulo
 * aparte para las pequeñas productoras, donde el sueldo no se expresa por mes sino por SEMANA DE LABOR
 * de 9 horas de lunes a viernes, más el valor de la jornada adicional y de las dos horas extra.
 *
 * Es una tabla propia y no un adicional ni una escala más porque responde otra pregunta: no "cuánto
 * cobra por mes esta categoría" sino "cuánto se le paga esta semana a este grupo". Modelarlo como un
 * período de `EscalaPeriodo` obligaría a que `basico` signifique una cosa distinta según el capítulo, y
 * eso vuelve inseguro cualquier cálculo que lea el campo.
 *
 * Validación del acta que conviene chequear pero no imponer: la jornada adicional es la semana ÷ 5. Si no
 * da, se guarda igual y se avisa — el importe que se paga es el que dice el acta, no el que cierra.
 */
export interface IEscalaPequenasEmpresas extends Document {
  convenio: string;
  grupo: number;
  desde: Date;
  /** INCLUSIVE. Vacío = vigente. */
  hasta?: Date | null;

  /** Semana de labor de 9 h diarias, lunes a viernes. */
  semana9hsLunVie: number;
  /** Jornada diaria adicional de 9 h. */
  jornadaAdicional9hs: number;
  horaExtra50: number;
  horaExtra100: number;

  acuerdoId?: mongoose.Types.ObjectId | null;
  tramo?: string;
  origen: "acta" | "excel" | "manual" | "derivado";
  migracion?: string;
  nota?: string;
  createdBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const escalaPequenasEmpresasSchema = new Schema<IEscalaPequenasEmpresas>(
  {
    convenio: { type: String, required: true, trim: true },
    grupo: { type: Number, required: true },
    desde: { type: Date, required: true },
    hasta: { type: Date, default: null },

    semana9hsLunVie: { type: Number, default: 0 },
    jornadaAdicional9hs: { type: Number, default: 0 },
    horaExtra50: { type: Number, default: 0 },
    horaExtra100: { type: Number, default: 0 },

    acuerdoId: { type: Schema.Types.ObjectId, ref: "AcuerdoParitario", default: null },
    tramo: { type: String, default: "" },
    origen: { type: String, enum: ["acta", "excel", "manual", "derivado"], default: "manual" },
    migracion: { type: String, default: "" },
    nota: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, collection: "convenio-pequenas-empresas" }
);

escalaPequenasEmpresasSchema.index({ convenio: 1, grupo: 1, desde: 1 }, { unique: true });

export const EscalaPequenasEmpresas: Model<IEscalaPequenasEmpresas> = mongoose.model<IEscalaPequenasEmpresas>("EscalaPequenasEmpresas", escalaPequenasEmpresasSchema);
