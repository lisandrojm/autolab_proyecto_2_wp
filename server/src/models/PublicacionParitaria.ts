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

  /**
   * EL TEXTO PLANO DEL PDF. Dato DERIVADO: se regenera con `npm run paritarias-texto`.
   *
   * Está guardado y no se extrae al vuelo porque es lo que hace buscables las 31 publicaciones del
   * SATSAID: «¿cuál cubría julio?» se contesta con una consulta, no abriendo PDFs de a uno.
   *
   * No lleva importes ni tablas. Extraer escalas es la capa 3 y todavía no existe.
   */
  extraccion?: {
    texto: string;
    paginas: number;
    extraidoEl: Date;
    /** `vacio` = el PDF es imagen escaneada. NO es éxito: ver `extraerTextoParitaria`. */
    estado: "ok" | "vacio" | "error";
    motivo: string;
    /** Con cuál se extrajo. Los dos dan layouts distintos y la capa 3 va a depender de eso. */
    extractor?: "pdftotext" | "pdf-parse";
    /** Códigos de CCT citados en el texto, normalizados a 4 dígitos, con su fragmento. */
    conveniosMencionados: { valor: string; fragmento: string }[];
    periodoMencionado?: { valor: string; fragmento: string };
    expediente?: { valor: string; fragmento: string };
    /**
     * Presente = el documento dice que sus importes no son mensuales («Valores por jornada»).
     *
     * Es la señal que más vale de todas: cargar un tarifario por jornada como sueldo bruto mensual
     * declara mal la remuneración ante ARCA, y ninguna validación aritmética lo detecta porque los
     * números están bien — está mal la unidad.
     */
    unidadSospechosa?: { valor: string; fragmento: string };
    /** Cómo se lleva lo citado con lo que la fuente dice alimentar. NO descarta nada: informa. */
    cotejoConvenios?: "coinciden" | "ajeno" | "sin_mencion";
    /** El período del PDF contra el del texto del enlace. `null` = no hay con qué comparar. */
    periodoCoincide?: boolean;
  };

  /**
   * EL ESPEJO EN DROPBOX. Copia con nombre legible, para que la evidencia no viva en un solo disco.
   *
   * DROPBOX ES ESPEJO, NO ALMACÉN: la app sigue leyendo el PDF del disco del server y ningún endpoint
   * lee de acá. Si Dropbox falla, cambia de token o alguien reordena la carpeta a mano, la app no se
   * entera y no se rompe — servir un PDF sigue siendo abrir un archivo local.
   */
  dropbox?: {
    /**
     * Ruta completa en Dropbox. PUNTERO DE CONVENIENCIA QUE PUEDE QUEDAR VIEJO: si alguien mueve el
     * archivo allá, esta ruta miente. Nunca se usa para leer ni para decidir si el archivo existe;
     * eso lo sigue contestando el disco.
     */
    path: string;
    subidoEl?: Date;
    estado: "ok" | "pendiente" | "error";
    motivo: string;
  };

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Una señal detectada y el fragmento del que salió.
 *
 * El fragmento no es decorativo: una detección sin su origen no se puede verificar sin volver a
 * abrir el PDF, que es justo el trabajo que la extracción viene a evitar.
 */
const senalSchema = new Schema<{ valor: string; fragmento: string }>(
  {
    valor: { type: String, default: "" },
    fragmento: { type: String, default: "" },
  },
  { _id: false },
);

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
    extraccion: {
      type: {
        texto: { type: String, default: "" },
        paginas: { type: Number, default: 0 },
        extraidoEl: { type: Date, default: Date.now },
        estado: { type: String, enum: ["ok", "vacio", "error"], default: "ok" },
        motivo: { type: String, default: "" },
        extractor: { type: String, enum: ["pdftotext", "pdf-parse"], default: undefined },
        conveniosMencionados: { type: [senalSchema], default: [] },
        periodoMencionado: { type: senalSchema, default: undefined },
        expediente: { type: senalSchema, default: undefined },
        unidadSospechosa: { type: senalSchema, default: undefined },
        cotejoConvenios: { type: String, enum: ["coinciden", "ajeno", "sin_mencion"], default: "sin_mencion" },
        periodoCoincide: { type: Boolean },
      },
      _id: false,
      default: undefined,
    },
    dropbox: {
      type: {
        path: { type: String, default: "" },
        subidoEl: { type: Date },
        estado: { type: String, enum: ["ok", "pendiente", "error"], default: "pendiente" },
        motivo: { type: String, default: "" },
      },
      _id: false,
      default: undefined,
    },
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

/*
  Índice de texto para el buscador del modal.

  Sin él, «¿cuál acuerdo cubría julio?» obliga a traer los 31 textos completos —más de 800 KB— y
  filtrarlos en Node. Con `$text`, Mongo lo resuelve y devuelve solo las que coinciden. El índice es
  sobre el texto extraído, que es dato derivado: si se borra y se regenera, el índice lo sigue.
*/
schema.index({ "extraccion.texto": "text" }, { default_language: "spanish", name: "texto_publicacion" });

export const PublicacionParitaria: Model<IPublicacionParitaria> = mongoose.model<IPublicacionParitaria>("PublicacionParitaria", schema);
