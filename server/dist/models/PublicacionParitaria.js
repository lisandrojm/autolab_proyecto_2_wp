import mongoose, { Schema } from "mongoose";
/**
 * Una señal detectada y el fragmento del que salió.
 *
 * El fragmento no es decorativo: una detección sin su origen no se puede verificar sin volver a
 * abrir el PDF, que es justo el trabajo que la extracción viene a evitar.
 */
const senalSchema = new Schema({
    valor: { type: String, default: "" },
    fragmento: { type: String, default: "" },
}, { _id: false });
const schema = new Schema({
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
}, { timestamps: true, collection: "publicaciones-paritaria" });
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
export const PublicacionParitaria = mongoose.model("PublicacionParitaria", schema);
