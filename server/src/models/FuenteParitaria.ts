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
  /**
   * CÓMO SE MIRA ESTA FUENTE. No todas se raspan, y forzarlas a que sí es lo que dejaría la mitad
   * del catálogo sin registrar.
   *
   *   listado_html  una página con enlaces a PDF, que la rutina diaria baja y compara. Es lo que
   *                 hacen las webs sindicales (SATSAID, Actores) y lo único que `revisarFuente` sabe.
   *
   *   manual        se sabe DÓNDE se consulta, y se consulta a mano. Sin vigilancia automática.
   *
   * El caso que obliga a `manual` es el buscador oficial del Ministerio (`convenios.trabajo.gob.ar`),
   * que cubre TODOS los convenios homologados y por lo tanto es la red de contención del catálogo
   * entero — pero es un formulario, no un listado: no hay una URL que devuelva «los acuerdos nuevos
   * del 0131/75» para raspar enlaces. Sin este tipo, la única forma de registrarlo sería cargarlo
   * como `listado_html` y que quede eternamente en `sin_enlaces`, o sea, gritando un error que no lo es.
   *
   * Registrar dónde se consulta cuesta cero y ya es mejor que «nadie miró».
   */
  tipo: "listado_html" | "manual";
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
    // El default es el tipo que ya existía: las fuentes cargadas antes de este campo son todas
    // páginas de listado, y ninguna cambia de comportamiento por la migración.
    tipo: { type: String, enum: ["listado_html", "manual"], default: "listado_html" },
    url: { type: String, required: true, trim: true },
    convenios: [{ type: String, trim: true }],
    // Obligatorio solo donde significa algo: una fuente `manual` no se raspa, así que pedirle un
    // patrón sería pedir que se invente una regla para un mecanismo que no va a correr.
    patronIncluir: {
      type: String,
      trim: true,
      default: "",
      required: function (this: IFuenteParitaria) {
        return this.tipo !== "manual";
      },
    },
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
