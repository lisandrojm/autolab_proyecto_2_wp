import mongoose, { Schema, Document, Types } from "mongoose";

export interface IRelease extends Document {
  tenantId: Types.ObjectId;
  name: string;
  version: string;
  description?: string;
  /** Contenido del release redactado en la plataforma (HTML del editor, con variables `{{variable}}`). */
  content: string;
  /** Tipo de release (colección `ReleaseTipo`) al que pertenece este documento. */
  releaseTipoId?: Types.ObjectId;
  isActive: boolean;
  /** Si el release lleva membrete (logo + encabezado de empresa) y firma al generar el PDF. */
  usaMembrete: boolean;
  /**
   * PLANTILLA CUSTOM: el cuerpo se escribe al generar el documento (Firma digital) y vive en el trámite
   * (`UserProject.contracts[i].contenidoCustom…`). `content` guarda sólo el placeholder. Ver
   * `compartido/textoCustom.ts`.
   */
  esCustom: boolean;
  /**
   * DEL SISTEMA: «Contrato custom» / «Release custom» (y sus tipos). Los crea el server solo (ver
   * `services/plantillasCustomSistema.ts`) y no se pueden eliminar.
   */
  delSistema?: boolean;
  /**
   * LOS TIPOS DE CONTRATO A LOS QUE PERTENECE (`Contrato._id`), como `ContratoFrame.contratoIds`
   * (16/10/2026). VACÍO o ausente = vale para TODOS los tipos, como antes de existir el campo: los
   * releases que nadie asigne siguen saliendo para todos los contratos.
   */
  contratoIds?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const releaseSchema = new Schema<IRelease>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 150,
    },
    version: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 50,
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000,
    },
    content: {
      type: String,
      default: "",
      maxlength: 200000,
    },
    releaseTipoId: { type: Schema.Types.ObjectId, ref: "ReleaseTipo" },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    usaMembrete: {
      type: Boolean,
      default: false,
    },
    esCustom: { type: Boolean, default: false },
    delSistema: { type: Boolean, default: false },
    contratoIds: { type: [String], default: undefined },
  },
  { timestamps: true, collection: "release" },
);

releaseSchema.index({ tenantId: 1, isActive: 1 });

export const Release = mongoose.model<IRelease>("Release", releaseSchema);
