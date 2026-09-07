import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * LOS VALORES POR DEFECTO DE ARCA, A NIVEL INSTALACIÓN.
 *
 * QUÉ PROBLEMA RESUELVE
 *
 * Cada empleadora ya podía marcar su elección habitual dentro de cada nomenclador (la ★ de
 * Convenios, Domicilios y Grupos de Tipo de Servicio en su ficha). Pero cuando todas las empleadoras
 * de la instalación usan lo mismo —que es el caso normal: una productora factura por dos o tres
 * CUIT y declara igual en todos— ese mismo valor había que volver a marcarlo empresa por empresa, y
 * una empresa nueva arrancaba sin nada.
 *
 * Este documento es el escalón de abajo: lo que vale cuando la empresa no dijo otra cosa.
 *
 * LA CASCADA, DE MÁS ESPECÍFICO A MÁS GENERAL:
 *
 *     el contrato  →  la empresa (`Company.defaultsArca`)  →  esto
 *
 * El contrato siempre gana: es el hecho concreto. La empresa gana sobre lo global: puede tener un
 * CUIT que declara distinto. Y esto es el piso.
 *
 * ES UN SOLO DOCUMENTO. Sin `tenantId`, igual que los nomencladores de ARCA que ordena
 * (`ArcaSucursal`, `Convenio`, `ArcaTipoServicio`…), que tampoco lo tienen: son las tablas del
 * organismo, iguales para todos. Poner el default en otra escala que el catálogo que ordena sería
 * inconsistente.
 *
 * SE GUARDA EL MISMO TIPO DE VALOR QUE EN LA EMPRESA para que la cascada sea una comparación y no
 * una traducción: los códigos como string tal cual viajan al TXT, y las referencias como `_id`.
 */
export interface IArcaDefault extends Document {
  /** `_id` de `ArcaSucursal`: domicilio de explotación. Pos. 74-78 del TXT. */
  sucursalId?: any;
  /** `_id` de `Convenio`. No viaja al TXT: de él cuelgan las categorías posibles. */
  convenioId?: any;
  /** Código del Grupo de Tipo de Servicio. NO viaja al TXT: filtra el combo de Tipo de Servicio. */
  grupoTipoServicio?: string;
  /** Código de Tipo de Servicio. Pos. 107-109 del TXT. */
  tipoServicio?: string;
  /** Código de Modalidad de Contratación. Pos. 17-19 del TXT. */
  modalidadContratacion?: string;
  /** Código de Modalidad de Liquidación. Pos. 73 del TXT. */
  modalidadLiquidacion?: string;
  /**
   * RNOS de la obra social que se OFRECE PRIMERO. No es un escalón de la cascada del TXT.
   *
   * La distinción es la razón de ser del campo. Hubo una obra social global que SÍ decidía, y se
   * eliminó: solo entraba cuando faltaba configurar algo aguas arriba —casi siempre un convenio sin
   * obra social—, así que rellenaba el campo con un valor sin fundamento. ARCA acepta el alta igual,
   * y el error aparece cuando ya está presentado. Ver `frontend/src/pages/ObrasSocialesPage.tsx`.
   *
   * Esto es otra cosa: preselección. Si la cascada real (la propia de la persona → la del convenio →
   * la de excluidos) no resuelve, el checklist sigue marcando FALTANTE y no se genera el TXT.
   */
  obraSocial?: string;
  /**
   * Código de actividad que se OFRECE PRIMERO al cargar actividades en un domicilio.
   *
   * Tampoco decide nada del alta: lo que un contrato puede declarar lo define, y solo, lo que ARCA
   * tiene declarado para ese domicilio de explotación. Un código válido en otro domicilio es
   * rechazado por el organismo. Ver `frontend/src/pages/ArcaActividadesPage.tsx`.
   */
  actividad?: string;
  createdAt: Date;
  updatedAt: Date;
}

const arcaDefaultSchema = new Schema<IArcaDefault>(
  {
    sucursalId: { type: Schema.Types.ObjectId, ref: "ArcaSucursal", default: null },
    convenioId: { type: Schema.Types.ObjectId, ref: "Convenio", default: null },
    grupoTipoServicio: { type: String, default: "" },
    tipoServicio: { type: String, default: "" },
    modalidadContratacion: { type: String, default: "" },
    modalidadLiquidacion: { type: String, default: "" },
    obraSocial: { type: String, default: "" },
    actividad: { type: String, default: "" },
  },
  { timestamps: true },
);

export const ArcaDefault: Model<IArcaDefault> = mongoose.model<IArcaDefault>("ArcaDefault", arcaDefaultSchema);

/**
 * El documento único, creándolo vacío si todavía no existe.
 *
 * Se resuelve con un upsert y no con un `findOne` + `create` para que dos requests simultáneos no
 * dejen dos documentos: el segundo sería invisible y cambiaría los defaults según cuál se leyera.
 */
export async function getArcaDefaults(): Promise<IArcaDefault> {
  const doc = await ArcaDefault.findOneAndUpdate({}, { $setOnInsert: {} }, { new: true, upsert: true });
  return doc as IArcaDefault;
}
