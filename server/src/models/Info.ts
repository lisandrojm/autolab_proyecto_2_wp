import mongoose, { Schema, Document, Model } from "mongoose";

export interface IInfo extends Document {
  externalId: string;
  type: string;
  data: {
    id: number;
    nombre: string;
    [key: string]: any;
  };
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const infoSchema = new Schema<IInfo>(
  {
    externalId: { type: String, required: true },
    type: { type: String, required: true },
    data: {
      id: { type: Number },
      nombre: { type: String },
    },
    name: { type: String, required: true },
  },
  {
    timestamps: true,
    strict: false,
  },
);

export const Info: Model<IInfo> = mongoose.model<IInfo>("Info", infoSchema);
