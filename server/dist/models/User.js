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
    hireDate: { type: Date, required: true },
    extraVacationDays: { type: Number, default: 0 },
    carryOverVacationDays: { type: Number, default: 0 },
    lastLoginAt: { type: Date },
    isSystem: { type: Boolean, default: false },
    name: { type: String }, // Optional compatibility field
    metadata: {
        id: Number,
        nombre: String,
        apellido: String,
        generoId: Number,
        tipoDocumentoId: Number,
        documento: String,
        cuit: String,
        estadoCivil: String,
        calle: String,
        altura: String,
        pisoDepto: String,
        codigoPostal: String,
        localidad: String,
        paisId: Number,
        nacionalidadId: Number,
        nivelEstudioId: Number,
        osId: Number,
        osPrepaga: Boolean,
        fechaNac: String,
        fechaAlta: String,
        telefono: String,
        telefono2: String,
        visa: Boolean,
        activo: { type: Boolean, default: true },
        tipoEntidadFinanciera: String,
        solicitaCreacionCuenta: Boolean,
        cuentaBancariaConfirmada: Boolean,
        cuentaBancariaConfirmadaAt: Date,
        bancoId: Number,
        cbu: String,
        tipoDeCuentaBancaria: String,
        nroDeCuentaBancaria: String,
        aliasBancario: String,
        email: String,
        estadoId: Number,
        inHouse: Boolean,
        numeroLegajoTango: String,
        afiliadoAlSindicato: Boolean,
        rutaImagen: String,
        bancoReceptor: String,
        swift: String,
        informacionBancariaAdicional: String,
        projects: [{ type: Schema.Types.ObjectId, ref: "UserProject" }],
        // Solicitud de alta fields
        fullName: String,
        categoriaSatId: String,
        startDate: String,
        dueDate: String,
        workdaysCount: Number,
        schedule: String,
        dailyRate: Number,
        isReplacement: Boolean,
        isSolicitud: { type: Boolean, default: false },
        projectIds: [{ type: Schema.Types.ObjectId, ref: "Project" }],
        roles_frame: {
            type: [{ type: Schema.Types.ObjectId, ref: "RoleFrame" }],
            alias: "rolesFrameIds",
        },
    },
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
userSchema.index({ tenantId: 1, createdAt: -1 });
userSchema.index({ tenantId: 1, isActive: 1, createdAt: -1 });
userSchema.index({ tenantId: 1, clientIds: 1 });
userSchema.index({ tenantId: 1, projectIds: 1 });
// Soporta el filtro por proyecto en GET /users ($or sobre metadata.projects.projectId)
userSchema.index({ tenantId: 1, "metadata.projects.projectId": 1 });
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
userSchema.methods.closeYear = async function (remainingDays, maxDiasArrastre = 0) {
    let newCarryOver = remainingDays;
    // Aplicar límite si existe
    if (maxDiasArrastre > 0 && newCarryOver > maxDiasArrastre) {
        newCarryOver = maxDiasArrastre;
    }
    this.carryOverVacationDays = newCarryOver;
    await this.save();
};
export const User = model("User", userSchema);
