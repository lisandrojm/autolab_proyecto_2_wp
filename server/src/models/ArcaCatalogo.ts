import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * EL ESPEJO DE ARCA: lo que el organismo publica, tal cual, sin edición humana.
 *
 * Una fila por (tabla, filtroPadre, codigo). Las tablas se llaman como en el CSV del repo
 * (`CATEGORIA_CCT`, `CONVENIO_CCT`, `PUESTO_DESEMPENADO`…); `filtroPadre` es el convenio en las
 * categorías y el grupo en los tipos de servicio.
 *
 * QUIÉN ESCRIBE: SOLO la semilla desde el CSV (`scripts/sembrarCatalogoArca.ts`) y la aplicación de
 * una lectura de ARCA confirmada (`services/arca/catalogoArca.ts`). Ningún endpoint de ABM: un test
 * escanea las rutas y falla si alguna lo importa. El código de una categoría de WeProdu se valida
 * contra esto; si esto se pudiera editar a mano, la validación no valdría nada.
 *
 * NADA SE BORRA: lo que ARCA deja de publicar pasa a `vigente: false` y conserva su historia.
 *
 * Las tablas que dependen de la empleadora (convenios, categorías, sucursales, actividades) guardan
 * en `fuentes` desde qué CUIT se vio cada fila: un convenio puede estar en una empleadora y no en otra.
 */
export interface IArcaCatalogo extends Document {
  tabla: string;
  filtroPadre: string;
  codigo: string;
  /** Como lo escribe el CSV (relleno a su largo); para regenerarlo igual. */
  codigoPadded: string;
  largo: number;
  /** `global` | `por_empresa` | `depende_de_convenio`… — columna `alcance` del CSV. */
  alcance: string;
  /** Texto LITERAL de ARCA. */
  descripcion: string;
  vigente: boolean;
  primeraVezVisto: Date;
  ultimaVezVisto: Date;
  origen: "csv" | "arca";
  fuentes: Array<{ empresaCuit: string; ultimaVezVisto: Date }>;
  /** Posición en el CSV, para que el export lo reproduzca en el mismo orden. */
  orden: number;
}

const schema = new Schema<IArcaCatalogo>(
  {
    tabla: { type: String, required: true },
    filtroPadre: { type: String, default: "" },
    codigo: { type: String, required: true },
    codigoPadded: { type: String, default: "" },
    largo: { type: Number, default: 0 },
    alcance: { type: String, default: "" },
    descripcion: { type: String, default: "" },
    vigente: { type: Boolean, default: true },
    primeraVezVisto: { type: Date, default: Date.now },
    ultimaVezVisto: { type: Date, default: Date.now },
    origen: { type: String, enum: ["csv", "arca"], default: "csv" },
    fuentes: [{ _id: false, empresaCuit: String, ultimaVezVisto: Date }],
    orden: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "arca_catalogo" },
);

schema.index({ tabla: 1, filtroPadre: 1, codigo: 1 }, { unique: true });

export const ArcaCatalogo: Model<IArcaCatalogo> = mongoose.model<IArcaCatalogo>("ArcaCatalogo", schema);

/**
 * Cada lectura del catálogo (semilla o ARCA): quién, cuándo, desde qué empleadora, cantidad y hash por
 * tabla, y el diff contra el espejo. Una lectura de ARCA queda `pendiente` hasta que alguien la aplica.
 */
export interface IArcaCatalogoLectura extends Document {
  usuarioId?: Types.ObjectId;
  fecha: Date;
  /** null = semilla desde el CSV. */
  empresaCuit: string | null;
  empresaRazonSocial?: string;
  origen: "csv" | "arca";
  porTabla: Record<string, { cantidad: number; hash: string }>;
  /** Para aplicar sin volver a leer: las filas leídas (solo en lecturas de ARCA). */
  filas?: Array<{ tabla: string; filtroPadre: string; codigo: string; descripcion: string }>;
  tablasLeidas: string[];
  filtrosLeidos?: Record<string, string[]>;
  diff: {
    nuevos: any[];
    dejaronDePublicarse: any[];
    descripcionCambiada: any[];
  };
  /** Por cada cambio, qué categorías de WeProdu y cuántos contratos toca. */
  impacto?: any[];
  estado: "pendiente" | "aplicada" | "descartada";
  aplicadaPor?: Types.ObjectId;
  aplicadaEl?: Date;
  error?: string;
}

const lecturaSchema = new Schema<IArcaCatalogoLectura>(
  {
    usuarioId: { type: Schema.Types.ObjectId, ref: "User" },
    fecha: { type: Date, default: Date.now },
    empresaCuit: { type: String, default: null },
    empresaRazonSocial: String,
    origen: { type: String, enum: ["csv", "arca"], required: true },
    porTabla: { type: Schema.Types.Mixed, default: {} },
    filas: { type: Schema.Types.Mixed },
    tablasLeidas: [String],
    filtrosLeidos: { type: Schema.Types.Mixed },
    diff: { type: Schema.Types.Mixed, default: { nuevos: [], dejaronDePublicarse: [], descripcionCambiada: [] } },
    impacto: { type: Schema.Types.Mixed },
    estado: { type: String, enum: ["pendiente", "aplicada", "descartada"], default: "pendiente" },
    aplicadaPor: { type: Schema.Types.ObjectId, ref: "User" },
    aplicadaEl: Date,
    error: String,
  },
  { timestamps: true, collection: "arca_catalogo_lecturas" },
);
lecturaSchema.index({ empresaCuit: 1, fecha: -1 });

export const ArcaCatalogoLectura: Model<IArcaCatalogoLectura> = mongoose.model<IArcaCatalogoLectura>("ArcaCatalogoLectura", lecturaSchema);
