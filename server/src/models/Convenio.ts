import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Convenio Colectivo de Trabajo (CCT) del nomenclador de AFIP/ARCA — Simplificación Registral.
 *
 * Sigue la forma de los catálogos simples de FRAME, con estos nombres de dominio:
 *   externalId → código CCT, con el formato "NNNN/AA" (ej. "0130/75"). NO es numérico: lleva barra
 *                y ceros a la izquierda, así que se guarda tal cual como string y `data.id` queda
 *                vacío (a diferencia de Obras Sociales, donde el RNOS sí es un número).
 *   name       → descripción de la actividad.
 *   signatario → descripción de los signatarios del convenio.
 */
export interface IConvenio extends Document {
  externalId: string;
  name: string;
  signatario?: string;
  /**
   * Obra social que le corresponde a quien trabaja bajo este convenio. Guarda el `data.id` del
   * catálogo de Obras Sociales (el RNOS numérico), igual que `osId` en el contrato.
   *
   * **Cuelga del convenio y no de la empleadora porque así funciona en la Argentina**: la obra social
   * la define el sindicato, y al sindicato lo define el CCT. Quien está bajo el convenio de
   * televisión aporta a la O.S. del Personal de Televisión, sin importar qué productora lo contrate.
   *
   * Vacío = el convenio no tiene obra social sindical. El caso real es "9999/99 — EXCLUIDO DE
   * CONVENIO", que por definición no tiene sindicato: ahí manda la default de la empleadora.
   */
  obraSocialDefaultId?: number;
  /**
   * DÓNDE PUBLICA SUS PARITARIAS ESTE CONVENIO — la parte que se declara a mano.
   *
   * El estado completo tiene cuatro valores y solo tres se guardan acá. El cuarto, `con_fuente`, es
   * DERIVADO: sale de que exista una `FuenteParitaria` que liste este código. No se guarda a
   * propósito — un booleano copiado se queda viejo apenas alguien desasigna la última fuente, y a
   * partir de ahí la pantalla afirmaría que está vigilado cuando no lo está.
   *
   *   sin_revisar          nadie buscó todavía. Es el default de los 2.669.
   *   sin_fuente_conocida  se buscó y no hay página que publique sus acuerdos.
   *   no_aplica            no tiene paritaria y no la va a tener (9999/99 «Excluido de convenio»).
   *
   * La diferencia entre los dos primeros es la que hace que esto valga la pena: «buscamos y no hay
   * nada» es conocimiento durable que le ahorra la búsqueda a la próxima persona. Una celda vacía no
   * distingue entre las dos y obliga a rehacer el trabajo.
   *
   * Es una propiedad del CONVENIO y no de quien lo usa: que el 0131/75 se publique en satsaid.com.ar
   * es verdad para cualquier empleadora de la plataforma. Por eso vive acá y no en `Company`.
   */
  fuenteEstadoDeclarado?: "sin_revisar" | "sin_fuente_conocida" | "no_aplica";
  /** Qué se buscó y por qué se concluyó eso. Es lo que evita repetir la búsqueda. */
  fuenteNota?: string;
  /** Quién lo declaró. Sin esto, «no hay fuente» no se puede preguntar a nadie. */
  fuenteRevisadaPor?: string;
  fuenteRevisadaEl?: Date;
  data: {
    id?: number;
    nombre: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const convenioSchema = new Schema<IConvenio>(
  {
    externalId: { type: String },
    name: { type: String, required: true },
    signatario: { type: String },
    obraSocialDefaultId: { type: Number },
    /*
      Sin `default` a nivel schema y a propósito: el default de los 2.669 es la AUSENCIA del campo, y
      ponerle uno escribiría "sin_revisar" en cada documento que se toque por cualquier otro motivo.
      Ausente y "sin_revisar" significan lo mismo y se resuelven en un solo lugar
      (`utils/estadoFuenteConvenio.ts`), así que no hace falta materializarlo.
    */
    fuenteEstadoDeclarado: { type: String, enum: ["sin_revisar", "sin_fuente_conocida", "no_aplica"] },
    fuenteNota: { type: String, default: "", trim: true },
    fuenteRevisadaPor: { type: String, default: "", trim: true },
    fuenteRevisadaEl: { type: Date },
    data: {
      id: { type: Number },
      nombre: { type: String },
    },
  },
  {
    timestamps: true,
    collection: "convenios",
  },
);

export const Convenio: Model<IConvenio> = mongoose.model<IConvenio>("Convenio", convenioSchema);
