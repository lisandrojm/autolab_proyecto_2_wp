import mongoose, { Schema, Document, Model, Types } from "mongoose";

// Registro de cada llamado real al webservice de AFIP (Consulta Padrón A13), tanto los disparados
// por "Validar CUIT"/"Consultar en AFIP" como la autoconsulta de "Revalidar servicio". Existe para
// poder ver, sin depender de un toast que aparece una sola vez, exactamente qué se mandó y qué
// contestó AFIP en cada intento — nunca guarda el certificado ni la clave privada.
export interface IAfipLog extends Document {
  tenantId: Types.ObjectId;
  /** "padron" = consulta real (Validar CUIT / bulk); "servicio_test" = autoconsulta de Revalidar servicio. */
  tipo: "padron" | "servicio_test";
  cuitConsultado: string;
  cuitRepresentada: string;
  ambiente: "homologacion" | "produccion";
  encontrado: boolean;
  estado: "activo" | "inactivo" | "desconocido";
  faultCode?: string;
  faultString?: string;
  raw: any;
  /** Si la llamada tiró una excepción (transporte/WSAA) en vez de devolver un resultado. */
  error?: string;
  createdAt: Date;
}

const afipLogSchema = new Schema<IAfipLog>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    tipo: { type: String, enum: ["padron", "servicio_test"], required: true },
    cuitConsultado: { type: String },
    cuitRepresentada: { type: String },
    ambiente: { type: String, enum: ["homologacion", "produccion"] },
    encontrado: { type: Boolean },
    estado: { type: String, enum: ["activo", "inactivo", "desconocido"] },
    faultCode: { type: String },
    faultString: { type: String },
    raw: { type: Schema.Types.Mixed },
    error: { type: String },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 }, // TTL: 30 días
  },
  { collection: "afip_logs" },
);

afipLogSchema.index({ tenantId: 1, createdAt: -1 });

export const AfipLog: Model<IAfipLog> = mongoose.model<IAfipLog>("AfipLog", afipLogSchema);
