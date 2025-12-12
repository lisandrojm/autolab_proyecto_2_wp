import { Schema, model, type Document, type HydratedDocument, Types } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  email: string;
  password: string;
  roles: Types.ObjectId[];
  clientIds: Types.ObjectId[];
  tenantId: Types.ObjectId;
  firstName?: string;
  lastName?: string;
  positionId?: Types.ObjectId;
  levelId?: Types.ObjectId;
  areaId?: Types.ObjectId;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: false, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    roles: { type: [Schema.Types.ObjectId], ref: "Role", default: [] },
    clientIds: { type: [Schema.Types.ObjectId], ref: "Client", default: [] },
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    firstName: {
      type: String,
      trim: true,
      set: (v: string) => (v && v.trim() !== "" ? v.trim() : undefined),
    },
    lastName: {
      type: String,
      trim: true,
      set: (v: string) => (v && v.trim() !== "" ? v.trim() : undefined),
    },
    positionId: { type: Schema.Types.ObjectId, ref: "Position" },
    levelId: { type: Schema.Types.ObjectId, ref: "Level" },
    areaId: { type: Schema.Types.ObjectId, ref: "Area" },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ email: 1, tenantId: 1 }, { unique: true });
userSchema.index({ tenantId: 1, clientIds: 1 });

userSchema.pre("save", async function (this: IUser, next) {
  if (!this.isModified("password")) return next();
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as any);
  }
});

userSchema.methods.comparePassword = async function (this: IUser, candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// No exponer password en respuestas JSON
userSchema.set("toJSON", {
  transform: function (_doc, ret) {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

export type UserDocument = HydratedDocument<IUser>;
export const User = model<IUser>("User", userSchema);
