import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBanco extends Document {
  externalId: string;
  name: string;
  data: {
    id: number;
    nombre: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const bancoSchema = new Schema<IBanco>(
  {
    externalId: { type: String },
    name: { type: String, required: true },
    data: {
      id: { type: Number },
      nombre: { type: String },
    },
  },
  {
    timestamps: true,
    collection: "bancos",
  }
);

export const Banco: Model<IBanco> = mongoose.model<IBanco>("Banco", bancoSchema);
