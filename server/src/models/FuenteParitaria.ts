import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Una página que publica acuerdos paritarios, vigilada por WeProdu.
 *
 * POR QUÉ LA CONFIGURACIÓN VIVE ACÁ Y NO EN EL CONVENIO
 *
 * La relación es de muchos a muchos y ninguna de las dos puntas la domina: UN acuerdo del SATSAID
 * cubre 0131/75 y 0634/11 a la vez, y la Asociación de Actores publica en dos páginas distintas que
 * alimentan convenios distintos. Colgarla del convenio obligaría a repetir la misma URL, el mismo
 * patrón y el mismo estado de revisión en cada uno, y a mantenerlos sincronizados a mano.
 *
 * Acá se da de alta la fuente una vez y se tildan los convenios que cubre.
 */
export interface IFuenteParitaria extends Document {
  /** Quién publica: "SATSAID", "Asociación Argentina de Actores". */
  entidad: string;
  /** Etiqueta corta para la pantalla: "Actores · televisión". */
  nombre: string;
  /** La página de LISTADO, no el PDF: lo que se vigila es qué aparece ahí. */
  url: string;
  /** Códigos de convenio que alimenta ("0131/75"). Muchos a muchos. */
  convenios: string[];
  /**
   * Qué enlaces son una escala salarial. Se prueba contra el texto del enlace Y el nombre del
   * archivo, porque según la página el dato útil está en uno o en el otro.
   */
  patronIncluir: string;
  /**
   * Qué NO es una escala aunque matchee lo anterior.
   *
   * NO ES OPCIONAL. La página del SATSAID cuelga `convenio131-75-1.pdf` —el texto del convenio
   * colectivo— junto a los acuerdos, y también subsidios y protocolos. Si entran como publicación,
   * el sistema avisa de una novedad que no existe, y a la segunda vez nadie le cree.
   */
  patronExcluir: string;
  activa: boolean;
  ultimaRevision?: Date;
  ultimoResultado?: "ok" | "sin_enlaces" | "error_red" | "error_parseo";
  ultimoError?: string;
  /**
   * Cuántos enlaces devolvió la última revisión que SÍ encontró algo.
   *
   * Es la referencia contra la que se detecta que una fuente se quedó ciega. Un sitio que cambia de
   * estructura sigue devolviendo HTTP 200 y cero enlaces: sin este número, esa revisión se registra
   * como exitosa y la fuente deja de avisar sin que nadie se entere.
   */
  enlacesUltimaExitosa?: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IFuenteParitaria>(
  {
    entidad: { type: String, required: true, trim: true },
    nombre: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    convenios: [{ type: String, trim: true }],
    patronIncluir: { type: String, required: true, trim: true },
    patronExcluir: { type: String, default: "", trim: true },
    activa: { type: Boolean, default: true },
    /**
     * `undefined` significa NUNCA REVISADA, y de eso depende la línea de base.
     *
     * La primera revisión de una fuente registra todo lo que encuentra como YA VISTO: sin eso, dar de
     * alta el SATSAID reportaría treinta acuerdos viejos como novedad, y un sistema de avisos que
     * arranca gritando cosas que no importan ya perdió. No hace falta un modo especial ni un botón
     * aparte — es una condición sobre este campo, y sirve igual para la fuente que agreguen el mes
     * que viene.
     */
    ultimaRevision: { type: Date },
    ultimoResultado: { type: String, enum: ["ok", "sin_enlaces", "error_red", "error_parseo"] },
    ultimoError: { type: String, default: "" },
    enlacesUltimaExitosa: { type: Number },
  },
  { timestamps: true, collection: "fuentes-paritaria" },
);

export const FuenteParitaria: Model<IFuenteParitaria> = mongoose.model<IFuenteParitaria>("FuenteParitaria", schema);
