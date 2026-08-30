import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Un PDF detectado en una fuente. INMUTABLE: lo que se vio, se vio.
 *
 * Esta entrega solo DETECTA. No abre el PDF, no lee importes y no toca ninguna escala: guarda que
 * apareció algo, dónde, y con qué texto figuraba. Extraer los números es otra cosa y viene después.
 */
export interface IPublicacionParitaria extends Document {
  fuente: mongoose.Types.ObjectId;
  url: string;
  /** Cómo figuraba en la página: "ACUERDO SALARIAL 2025-2026 (PERIODO FEBRERO A JUNIO 2026)". */
  textoEnlace: string;
  /**
   * Hash del CONTENIDO del PDF.
   *
   * Es lo que distingue «el mismo archivo de siempre» de «reemplazaron el archivo sin cambiarle el
   * nombre», que es como los organismos corrigen un acuerdo. Con la URL sola, esa corrección pasaría
   * inadvertida.
   */
  hash: string;
  detectadaEl: Date;
  /**
   * Ya la miró alguien. Se marca a mano.
   *
   * La primera revisión de una fuente nace con esto en `true` para TODO lo que encuentre: es la línea
   * de base, no una novedad. Ver `ultimaRevision` en `FuenteParitaria`.
   */
  vista: boolean;
  /** `descartada` = alguien decidió que no era una escala. No se borra: se deja el rastro. */
  estado: "detectada" | "descartada";
  /**
   * EL PDF GUARDADO. La evidencia de qué decía el acuerdo.
   *
   * Hasta esta entrega el archivo se bajaba para calcular el hash y se descartaba, así que lo único
   * que quedaba era un enlace al sitio del gremio. Los gremios reorganizan sus webs: el día que ese
   * PDF se mueva, desaparece la prueba del importe con el que se liquidó — y ese importe viaja al
   * TXT de alta temprana como retribución pactada.
   *
   * Ausente = todavía no se bajó, o no se pudo. NO significa que la publicación sea inválida: las
   * 33 que existían antes de esta entrega nacieron sin archivo.
   */
  archivo?: {
    /** Relativa a `storage/`. El nombre del archivo es el hash: mismo contenido, mismo archivo. */
    ruta: string;
    /** Cómo se llamaba en la página del gremio. */
    nombreOriginal: string;
    contentType: string;
    bytes: number;
    descargadoEl: Date;
  };
  /**
   * Por qué NO hay archivo, cuando se intentó y falló.
   *
   * El caso que importa: al rebajar una publicación vieja, el PDF ya no está o cambió de contenido.
   * Eso no es un error del sistema — es exactamente el riesgo que guardar el archivo viene a
   * cubrir— y tiene que quedar dicho, no como un campo vacío que se confunde con «todavía no».
   */
  archivoError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IPublicacionParitaria>(
  {
    fuente: { type: Schema.Types.ObjectId, ref: "FuenteParitaria", required: true },
    url: { type: String, required: true, trim: true },
    textoEnlace: { type: String, default: "", trim: true },
    hash: { type: String, required: true },
    detectadaEl: { type: Date, default: Date.now },
    vista: { type: Boolean, default: false },
    estado: { type: String, enum: ["detectada", "descartada"], default: "detectada" },
    archivo: {
      type: {
        ruta: { type: String, required: true },
        nombreOriginal: { type: String, default: "" },
        contentType: { type: String, default: "application/pdf" },
        bytes: { type: Number, default: 0 },
        descargadoEl: { type: Date, default: Date.now },
      },
      // Sin `_id`: es un subdocumento de datos, no una entidad con vida propia.
      _id: false,
      default: undefined,
    },
    archivoError: { type: String, default: "" },
  },
  { timestamps: true, collection: "publicaciones-paritaria" },
);

/**
 * La identidad de una publicación es (fuente, url, hash), y el hash está adentro a propósito.
 *
 * Si el mismo PDF cambia de contenido es una publicación NUEVA, no una actualización de la anterior:
 * el acuerdo corregido es otro documento aunque viva en la misma dirección. Con la clave en
 * (fuente, url) el reemplazo se perdería, que es justamente el caso que el hash existe para atrapar.
 */
schema.index({ fuente: 1, url: 1, hash: 1 }, { unique: true });

export const PublicacionParitaria: Model<IPublicacionParitaria> = mongoose.model<IPublicacionParitaria>("PublicacionParitaria", schema);
