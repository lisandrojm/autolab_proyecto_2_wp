import { Schema, model } from "mongoose";
import bcrypt from "bcryptjs";
import { differenceInYears, differenceInMonths, differenceInDays, endOfYear } from "date-fns";
const userSchema = new Schema({
    email: { type: String, required: true, unique: false, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    roles: { type: [Schema.Types.ObjectId], ref: "Role", default: [] },
    clientIds: { type: [Schema.Types.ObjectId], ref: "Client", default: [] },
    projectIds: { type: [Schema.Types.ObjectId], ref: "Project", default: [] },
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    firstName: {
        type: String,
        trim: true,
        set: (v) => (v && v.trim() !== "" ? v.trim() : undefined),
    },
    lastName: {
        type: String,
        trim: true,
        set: (v) => (v && v.trim() !== "" ? v.trim() : undefined),
    },
    areaId: { type: Schema.Types.ObjectId, ref: "Area" },
    isActive: { type: Boolean, default: true },
    hireDate: { type: Date, required: true },
    extraVacationDays: { type: Number, default: 0 },
    carryOverVacationDays: { type: Number, default: 0 },
    lastLoginAt: { type: Date },
    metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });
// Virtual: Antigüedad proyectada al 31 de diciembre del año actual
userSchema.virtual("seniorityAtEndOfYear").get(function () {
    if (!this.hireDate)
        return 0;
    const now = new Date();
    const endOfCurrentYear = endOfYear(now);
    return differenceInYears(endOfCurrentYear, this.hireDate);
});
// Virtual: Cálculo de días de vacaciones según LCT
userSchema.virtual("vacationDays").get(function () {
    if (!this.hireDate) {
        return { lawDays: 0, extraDays: 0, carryOverDays: 0, totalDays: 0 };
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
    }
    else if (yearsOfService < 5) {
        lawDays = 14;
    }
    else if (yearsOfService < 10) {
        lawDays = 21;
    }
    else if (yearsOfService < 20) {
        lawDays = 28;
    }
    else {
        lawDays = 35;
    }
    const extraDays = this.extraVacationDays || 0;
    const carryOverDays = this.carryOverVacationDays || 0;
    return {
        lawDays,
        extraDays,
        carryOverDays,
        totalDays: lawDays + extraDays + carryOverDays,
    };
});
userSchema.index({ email: 1, tenantId: 1 }, { unique: true });
userSchema.index({ tenantId: 1, clientIds: 1 });
userSchema.index({ tenantId: 1, projectIds: 1 });
userSchema.pre("save", async function (next) {
    if (!this.isModified("password"))
        return next();
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    }
    catch (error) {
        next(error);
    }
});
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};
// Contemplación del Cierre de Año
// Esta función simula la lógica de transición de periodo.
// Al cerrar el año, los días restantes (disponibles) se convierten en 'carryOverVacationDays' para el nuevo año,
// respetando el límite máximo (FIFO: lo que no se usó de arrastre viejo se pierde, lo nuevo se arrastra).
userSchema.methods.closeYear = async function (remainingDays, maxDiasArrastre = 0) {
    // Lógica FIFO implícita:
    // Si remainingDays > 0, significa que sobraron días.
    // Estos días sobrantes son candidatos a ser el NUEVO arrastre.
    // El arrastre viejo (carryOverVacationDays actual) ya se considera 'vencido' o 'consumido' en la lógica del nuevo cálculo.
    let newCarryOver = remainingDays;
    // Aplicar límite si existe
    if (maxDiasArrastre > 0 && newCarryOver > maxDiasArrastre) {
        newCarryOver = maxDiasArrastre;
    }
    this.carryOverVacationDays = newCarryOver;
    // Nota: extraVacationDays (beneficio) se mantiene o resetea según política aparte, aquí solo tocamos el arrastre.
    await this.save();
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
export const User = model("User", userSchema);
