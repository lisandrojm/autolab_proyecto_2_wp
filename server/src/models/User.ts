import { Schema, model, type Document, type HydratedDocument, Types } from "mongoose";
import bcrypt from "bcryptjs";
import { differenceInYears, differenceInMonths, differenceInDays, endOfYear } from "date-fns";

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
  hireDate: Date;
  extraVacationDays: number;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
  // Virtuals
  seniorityAtEndOfYear?: number;
  vacationDays?: {
    lawDays: number;
    extraDays: number;
    totalDays: number;
  };
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
    hireDate: { type: Date, required: true },
    extraVacationDays: { type: Number, default: 0 },
    lastLoginAt: { type: Date },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Virtual: Antigüedad proyectada al 31 de diciembre del año actual
userSchema.virtual("seniorityAtEndOfYear").get(function (this: IUser) {
  if (!this.hireDate) return 0;
  const now = new Date();
  const endOfCurrentYear = endOfYear(now);
  return differenceInYears(endOfCurrentYear, this.hireDate);
});

// Virtual: Cálculo de días de vacaciones según LCT
userSchema.virtual("vacationDays").get(function (this: IUser) {
  if (!this.hireDate) {
    return { lawDays: 0, extraDays: 0, totalDays: 0 };
  }

  const now = new Date();
  const endOfCurrentYear = endOfYear(now);
  const hireDate = new Date(this.hireDate);

  // Calcular antigüedad en años y meses al 31 de diciembre
  const yearsOfService = differenceInYears(endOfCurrentYear, hireDate);
  const monthsOfService = differenceInMonths(endOfCurrentYear, hireDate);

  let lawDays = 0;

  // Reglas de la LCT N° 20.744
  if (monthsOfService < 6) {
    // Menos de 6 meses: 1 día por cada 20 trabajados
    // Calculamos días trabajados hasta el 31/12 (o hasta hoy si es menor, aunque la ley dice al 31/12 para el derecho pleno,
    // para el proporcional se suele tomar hasta fin de año si sigue empleado)
    const daysWorked = differenceInDays(endOfCurrentYear, hireDate);
    lawDays = Math.floor(daysWorked / 20);
  } else if (yearsOfService < 5) {
    lawDays = 14;
  } else if (yearsOfService < 10) {
    lawDays = 21;
  } else if (yearsOfService < 20) {
    lawDays = 28;
  } else {
    lawDays = 35;
  }

  const extraDays = this.extraVacationDays || 0;

  return {
    lawDays,
    extraDays,
    totalDays: lawDays + extraDays,
  };
});

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
  virtuals: true,
  transform: function (_doc, ret) {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

export type UserDocument = HydratedDocument<IUser>;
export const User = model<IUser>("User", userSchema);
