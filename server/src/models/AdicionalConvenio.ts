import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Un adicional del convenio: antigüedad, comidas, meriendas, exteriores, subida a torre, guardería, ropa.
 *
 * Es el apartado que faltaba. Hasta ahora el sistema guardaba de un CCT sólo la escala por grupo, y el
 * acuerdo paritario define bastante más: en el acta de 634/11 de 2026 hay siete adicionales con importe
 * propio, y sin ellos el "bruto" que muestra la pantalla no es lo que cobra la persona.
 *
 * ES UN CATÁLOGO, NO UNA LISTA EN EL CÓDIGO. Los siete de 634/11 se cargan por seed, pero cualquier CCT
 * puede tener otros y se dan de alta desde la pantalla. Hardcodear los nombres obligaría a tocar el
 * código en cada convenio nuevo, que es exactamente lo que este modelo evita.
 *
 * LOS DOS CAMPOS QUE ESTÁN "A CONFIRMAR" Y POR QUÉ NO SE ADIVINAN
 *
 * El acta publica los importes, pero **no dice cómo se calcula cada adicional ni si es remunerativo**.
 * Son las dos cosas que definen si entra en la base de aportes, o sea cuánto se le retiene a la persona
 * y cuánto aporta la empresa. Inventarlas es más caro que dejarlas vacías: `remunerativo: null` significa
 * "no se sabe" (distinto de `false`) y `confirmado: false` hace que la pantalla lo muestre con el chip
 * ámbar de "a confirmar" y que la liquidación de referencia arrastre la advertencia.
 *
 * El importe NO vive acá: vive en `AdicionalValorPeriodo`, uno por período de vigencia. Este documento es
 * la definición, que no cambia con cada paritaria.
 */
export interface IAdicionalConvenio extends Document {
  /** Código del CCT, formato ARCA ("0634/11"). */
  convenio: string;
  /** Identificador estable dentro del convenio ("antiguedad", "subida_torre"). Es la clave del seed y del cálculo. */
  codigo: string;
  nombre: string;

  /**
   * Cómo se calcula. `a_confirmar` es un valor legítimo y es el default de lo que sale del acta:
   * mejor un tipo explícitamente sin confirmar que uno inventado que después nadie revisa.
   */
  tipoCalculo: "monto_fijo" | "mensual" | "por_anio_antiguedad" | "por_evento" | "porcentaje" | "a_confirmar";
  /** `true`/`false` cuando se sabe; `null` = a confirmar. No entra en la base de aportes mientras sea `null`. */
  remunerativo?: boolean | null;
  /** `false` = el tipo de cálculo y/o el carácter todavía los tiene que confirmar una persona. */
  confirmado: boolean;

  /** Sólo para `tipoCalculo: "porcentaje"`: sobre qué se aplica. */
  base?: "basico" | "basico_mas_adicional" | "total" | null;
  /** Texto para mostrar ("por comida", "por año", "por día de exteriores"). No interviene en la cuenta. */
  unidad?: string;
  /** A quién aplica y con qué requisitos. Texto libre: el acta lo escribe en prosa (guardería, por ejemplo). */
  condicion?: string;
  /** Cómo se llama el concepto en la liquidación, si ya se sabe. */
  conceptoLiquidacion?: string;
  /** Código de ARCA del concepto, si corresponde. */
  codigoArca?: number | null;

  /** `general` o el capítulo de pequeñas empresas: el acta los separa y los importes no son los mismos. */
  capitulo: "general" | "pequenas_empresas";
  /** Orden de presentación, como en el acta. */
  orden: number;
  isActive: boolean;
  migracion?: string;
  createdBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const adicionalConvenioSchema = new Schema<IAdicionalConvenio>(
  {
    convenio: { type: String, required: true, trim: true },
    codigo: { type: String, required: true, trim: true },
    nombre: { type: String, required: true, trim: true },

    tipoCalculo: {
      type: String,
      enum: ["monto_fijo", "mensual", "por_anio_antiguedad", "por_evento", "porcentaje", "a_confirmar"],
      default: "a_confirmar",
    },
    // `null` es un valor con significado: "no se sabe". Por eso no tiene `default: false`.
    remunerativo: { type: Boolean, default: null },
    confirmado: { type: Boolean, default: false },

    base: { type: String, enum: ["basico", "basico_mas_adicional", "total", null], default: null },
    unidad: { type: String, default: "" },
    condicion: { type: String, default: "" },
    conceptoLiquidacion: { type: String, default: "" },
    codigoArca: { type: Number, default: null },

    capitulo: { type: String, enum: ["general", "pequenas_empresas"], default: "general" },
    orden: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    migracion: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, collection: "convenio-adicionales" }
);

/** El código identifica al adicional dentro de su convenio: la "antigüedad" de 634/11 no es la de otro CCT. */
adicionalConvenioSchema.index({ convenio: 1, codigo: 1 }, { unique: true });

export const AdicionalConvenio: Model<IAdicionalConvenio> = mongoose.model<IAdicionalConvenio>("AdicionalConvenio", adicionalConvenioSchema);
