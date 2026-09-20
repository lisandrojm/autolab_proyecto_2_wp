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
    isProjectResponsible: { type: Boolean, default: false },
    name: { type: String }, // Optional compatibility field
    metadata: {
        id: Number,
        nombre: String,
        apellido: String,
        generoId: Number,
        tipoDocumentoId: Number,
        documento: String,
        cuit: String,
        nombreValidadoArcaAt: Date,
        sinCuit: Boolean,
        estadoCivil: String,
        calle: String,
        altura: String,
        pisoDepto: String,
        codigoPostal: String,
        localidad: String,
        paisId: Number,
        nacionalidadId: Number,
        nacionalizado: Boolean,
        paisNacimientoId: Number,
        nivelEstudioId: Number,
        osId: Number,
        osPrepaga: Boolean,
        fechaNac: String,
        fechaAlta: String,
        telefono: String,
        activo: { type: Boolean, default: true },
        tipoEntidadFinanciera: String,
        solicitaCreacionCuenta: Boolean,
        sinBancoMotivo: { type: String, enum: ["crear_cuenta", "proveera_cuenta", "otro", null] },
        sinBancoDetalle: String,
        cuentaBancariaConfirmada: Boolean,
        cuentaBancariaConfirmadaAt: Date,
        solicitaCambioCuenta: Boolean,
        cambioCuentaConfirmada: Boolean,
        cambioCuentaConfirmadaAt: Date,
        bancoId: Number,
        cbu: String,
        tipoDeCuentaBancaria: String,
        nroDeCuentaBancaria: String,
        aliasBancario: String,
        email: String,
        estadoId: Number,
        inHouse: Boolean,
        numeroLegajoTango: String,
        /* El legajo de Memosoft, uno por empresa. Ver la interfaz para por qué no es uno solo. */
        legajosPorEmpresa: {
            type: [
                {
                    _id: false,
                    empresaId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
                    legajo: { type: String, required: true, trim: true },
                },
            ],
            default: undefined,
        },
        afiliadoAlSindicato: Boolean,
        sindicatoIds: [String],
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
        workdaysCalculated: { type: Number, default: undefined },
        workdaysOverridden: { type: Boolean, default: undefined },
        workdaysOverrideReason: { type: String, enum: ["extension_rodaje", "jornada_caida", "feriado_trabajado", "franco_trabajado", "alta_baja_parcial", "reemplazo_parcial", "otro", null], default: undefined },
        workdaysOverrideNote: { type: String, default: undefined },
        terminosAceptados: {
            terminosId: { type: Schema.Types.ObjectId, ref: "TerminosCondiciones" },
            version: { type: Number },
            titulo: { type: String },
            aceptadoEl: { type: Date },
            ip: { type: String },
        },
        registro: {
            linkId: { type: Schema.Types.ObjectId, ref: "RegistroLink" },
            invitadoPor: { type: Schema.Types.ObjectId, ref: "User" },
            projectId: { type: Schema.Types.ObjectId, ref: "Project" },
            areaId: { type: Schema.Types.ObjectId, ref: "Area" },
            shiftId: { type: Schema.Types.ObjectId, ref: "Shift" },
            registradoAt: { type: Date },
        },
        diasPorSemana: { type: Number },
        diasSemana: { type: [Number], default: undefined },
        fechasTrabajadas: { type: [String], default: undefined },
        diasRotativos: { type: Boolean, default: false },
        schedule: String,
        dailyRate: Number,
        isReplacement: Boolean,
        // Ver el comentario de la interfaz: esto viajaba desde la app y se perdía al guardar.
        tipoImpositivo: { type: String, enum: ["alta_temprana_afip", "constancia_cuit"] },
        contratoId: { type: Schema.Types.ObjectId, ref: "Contrato" },
        nombre_contrato: String,
        areaShiftAssignments: [
            {
                _id: false,
                areaId: { type: Schema.Types.ObjectId, ref: "Area" },
                shiftIds: [{ type: Schema.Types.ObjectId, ref: "Shift" }],
            },
        ],
        empresaContratoId: { type: Schema.Types.ObjectId, ref: "Company" },
        convenioId: { type: Schema.Types.ObjectId, ref: "Convenio" },
        // El id de FRAME de la persona reemplazada: puede venir como número o como texto.
        empleado_id_reemplezado: Schema.Types.Mixed,
        replacedUserId: { type: Schema.Types.ObjectId, ref: "User" },
        motivoReemplazoId: { type: Schema.Types.ObjectId, ref: "RequestConfig" },
        comentarios: String,
        isSolicitud: { type: Boolean, default: false },
        solicitudStatus: { type: String, enum: ["pendiente", "aprobada", "rechazada", "cancelada"] },
        solicitudUserId: { type: Schema.Types.ObjectId, ref: "User" },
        solicitudCreadaPor: { type: Schema.Types.ObjectId, ref: "User" },
        solicitudMotivoRechazo: { type: String },
        solicitudRechazadaPor: { type: Schema.Types.ObjectId, ref: "User" },
        solicitudRechazadaEl: { type: Date },
        // Ver el comentario de la interfaz: una rechazada que se corrige y se vuelve a mandar.
        solicitudReenviada: {
            veces: Number,
            el: Date,
            motivoAnterior: String,
        },
        // Ver el comentario de la interfaz: se guarda en texto, no en ids.
        solicitudRevision: {
            cambios: [{ _id: false, campo: String, pedido: String, aprobado: String }],
            comentario: String,
            porNombre: String,
            el: Date,
        },
        esRenovacion: { type: Boolean },
        renovacionDe: {
            userProjectId: { type: Schema.Types.ObjectId, ref: "UserProject" },
            fechaBajaContrato: { type: String },
        },
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
// Soporta GET /users/eligible-responsables, que lista los candidatos a responsable de un proyecto.
userSchema.index({ tenantId: 1, isProjectResponsible: 1 });
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
