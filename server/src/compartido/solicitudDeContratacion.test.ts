/**
 * EL PAYLOAD DE UNA SOLICITUD NO CAMBIÓ AL SACARLO DEL FORMULARIO.
 *
 * `payloadComoAntes` es una copia LITERAL de lo que armaba `UserRegistrationModal.handleSubmit` antes de
 * usar `armarPayloadDeSolicitud` (hasta el commit a1a92e1f), con `formData` y las variables del
 * componente como parámetros (y `new Date()` fijado al instante del test, para que sea reproducible).
 * Está congelada a propósito: es la referencia de «cómo era», y cada caso
 * compara las dos salidas campo por campo, `undefined` incluidos.
 *
 * Cuando exista el alta masiva, su test de «bulk == individual» se apoya en esto: las dos pasan por
 * `armarPayloadDeSolicitud`, y esta función es exactamente lo que el formulario mandaba.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { armarPayloadDeSolicitud, DatosSolicitud } from "./solicitudDeContratacion.js";

interface Formulario {
  fullName: string;
  projectIds: string[];
  roleFrameIds: string[];
  categoriaSatId: string;
  startDate: string;
  dueDate: string;
  workdaysCount: string;
  workdaysOverrideReason: string;
  workdaysOverrideNote: string;
  diasPorSemana: string;
  diasSemana: number[];
  diasRotativos: boolean;
  fechasTrabajadas: string[];
  inTime: string;
  outTime: string;
  empresaContratoId: string;
  convenioId: string;
  dailyRate: string;
  isReplacement: boolean;
  empleado_id_reemplezado: string;
  replacedUserId: string;
  motivoReemplazoId: string;
  comentarios: string;
  tipoImpositivo: string;
  contratoId: string;
  areaShiftAssignments: { areaId: string; shiftIds: string[] }[];
}

interface Contexto {
  selectedUser: { _id: string } | null;
  esServicios: boolean;
  indeterminado: boolean;
  porDiasSueltos: boolean;
  jornadasCalculadas: number | null;
  ajuste: boolean;
  contratoElegido: { name: string } | undefined;
  renovacion: { userProjectId: string; fechaBajaContrato: string } | null;
  editingUser: { metadata: any } | null;
}

/** COPIA CONGELADA del armado original. No se toca: es la referencia. */
function payloadComoAntes(formData: Formulario, c: Contexto, timestamp: number) {
  const { selectedUser, esServicios, indeterminado, porDiasSueltos, jornadasCalculadas, contratoElegido, renovacion, editingUser } = c;
  const hayAjusteDatos = c.ajuste;
  const placeholderEmail = `solicitud_${timestamp}@pending.com`;
  const placeholderPassword = `pass_${timestamp}`;
  return {
    email: placeholderEmail,
    password: placeholderPassword,
    firstName: formData.fullName.split(" ")[0] || "Pendiente",
    lastName: formData.fullName.split(" ").slice(1).join(" ") || "Pendiente",
    isActive: false,
    hireDate: formData.startDate || new Date(timestamp).toISOString(),
    metadata: {
      fullName: formData.fullName,
      projectIds: formData.projectIds,
      solicitudUserId: selectedUser?._id || undefined,
      roles_frame: formData.roleFrameIds,
      categoriaSatId: esServicios ? undefined : formData.categoriaSatId,
      startDate: formData.startDate,
      dueDate: indeterminado && !porDiasSueltos ? "" : formData.dueDate,
      workdaysCount: Number(formData.workdaysCount),
      workdaysCalculated: jornadasCalculadas,
      workdaysOverridden: hayAjusteDatos,
      workdaysOverrideReason: hayAjusteDatos ? formData.workdaysOverrideReason : null,
      workdaysOverrideNote: hayAjusteDatos ? formData.workdaysOverrideNote.trim() || null : null,
      diasPorSemana: Number(formData.diasPorSemana) || undefined,
      diasSemana: formData.diasSemana,
      diasRotativos: formData.diasRotativos,
      fechasTrabajadas: formData.fechasTrabajadas.length > 0 ? formData.fechasTrabajadas : undefined,
      schedule: `${formData.inTime} - ${formData.outTime}`,
      empresaContratoId: formData.empresaContratoId || undefined,
      convenioId: esServicios ? undefined : formData.convenioId || undefined,
      dailyRate: Number(formData.dailyRate),
      isReplacement: formData.isReplacement,
      empleado_id_reemplezado: formData.isReplacement ? formData.empleado_id_reemplezado || undefined : undefined,
      replacedUserId: formData.isReplacement ? formData.replacedUserId || undefined : undefined,
      motivoReemplazoId: formData.isReplacement ? formData.motivoReemplazoId || undefined : undefined,
      comentarios: formData.comentarios.trim() || undefined,
      tipoImpositivo: formData.tipoImpositivo || undefined,
      contratoId: formData.contratoId || undefined,
      nombre_contrato: contratoElegido?.name || undefined,
      areaShiftAssignments: formData.areaShiftAssignments,
      esRenovacion: renovacion ? true : (editingUser?.metadata as any)?.esRenovacion || undefined,
      renovacionDe: renovacion ? { userProjectId: renovacion.userProjectId, fechaBajaContrato: renovacion.fechaBajaContrato } : (editingUser?.metadata as any)?.renovacionDe || undefined,
      isSolicitud: true,
    },
  };
}

/** Lo que el formulario le pasa hoy a `armarPayloadDeSolicitud` (mismo mapeo que `UserRegistrationModal`). */
function datosDelFormulario(formData: Formulario, c: Contexto): DatosSolicitud {
  return {
    fullName: formData.fullName,
    projectIds: formData.projectIds,
    solicitudUserId: c.selectedUser?._id || undefined,
    roleFrameIds: formData.roleFrameIds,
    esServicios: c.esServicios,
    categoriaSatId: formData.categoriaSatId,
    startDate: formData.startDate,
    dueDate: formData.dueDate,
    indeterminado: c.indeterminado,
    porDiasSueltos: c.porDiasSueltos,
    workdaysCount: formData.workdaysCount,
    workdaysCalculated: c.jornadasCalculadas,
    ajusteJornadas: c.ajuste,
    motivoAjuste: formData.workdaysOverrideReason,
    notaAjuste: formData.workdaysOverrideNote,
    diasPorSemana: formData.diasPorSemana,
    diasSemana: formData.diasSemana,
    diasRotativos: formData.diasRotativos,
    fechasTrabajadas: formData.fechasTrabajadas,
    inTime: formData.inTime,
    outTime: formData.outTime,
    empresaContratoId: formData.empresaContratoId,
    convenioId: formData.convenioId,
    dailyRate: formData.dailyRate,
    isReplacement: formData.isReplacement,
    empleado_id_reemplezado: formData.empleado_id_reemplezado,
    replacedUserId: formData.replacedUserId,
    motivoReemplazoId: formData.motivoReemplazoId,
    comentarios: formData.comentarios,
    tipoImpositivo: formData.tipoImpositivo,
    contratoId: formData.contratoId,
    nombreContrato: c.contratoElegido?.name,
    areaShiftAssignments: formData.areaShiftAssignments,
    esRenovacion: c.renovacion ? true : (c.editingUser?.metadata as any)?.esRenovacion || undefined,
    renovacionDe: c.renovacion ? { userProjectId: c.renovacion.userProjectId, fechaBajaContrato: c.renovacion.fechaBajaContrato } : (c.editingUser?.metadata as any)?.renovacionDe || undefined,
  };
}

const T = 1790000000000;

const plazoFijo: Formulario = {
  fullName: "Agustín Federico Barbona",
  projectIds: ["p1"],
  roleFrameIds: ["rf1", "rf2"],
  categoriaSatId: "cat9",
  startDate: "2026-09-01",
  dueDate: "2026-09-30",
  workdaysCount: "22",
  workdaysOverrideReason: "",
  workdaysOverrideNote: "",
  diasPorSemana: "5",
  diasSemana: [1, 2, 3, 4, 5],
  diasRotativos: false,
  fechasTrabajadas: [],
  inTime: "10:00",
  outTime: "18:00",
  empresaContratoId: "emp2030",
  convenioId: "conv634",
  dailyRate: "58831.22",
  isReplacement: false,
  empleado_id_reemplezado: "",
  replacedUserId: "",
  motivoReemplazoId: "",
  comentarios: "",
  tipoImpositivo: "",
  contratoId: "c5x7",
  areaShiftAssignments: [{ areaId: "a1", shiftIds: ["s1"] }],
};
const ctx: Contexto = { selectedUser: { _id: "u1" }, esServicios: false, indeterminado: false, porDiasSueltos: false, jornadasCalculadas: 22, ajuste: false, contratoElegido: { name: "Plazo fijo 5x7" }, renovacion: null, editingUser: null };

const casos: { nombre: string; f: Formulario; c: Contexto }[] = [
  { nombre: "plazo fijo común", f: plazoFijo, c: ctx },
  {
    nombre: "jornada por días sueltos",
    f: { ...plazoFijo, fechasTrabajadas: ["2026-09-24", "2026-09-25", "2026-09-26"], dueDate: "2026-09-26", startDate: "2026-09-24", workdaysCount: "3", contratoId: "cJornada" },
    c: { ...ctx, porDiasSueltos: true, jornadasCalculadas: 3, contratoElegido: { name: "Jornada" } },
  },
  { nombre: "tiempo indeterminado (sin baja)", f: plazoFijo, c: { ...ctx, indeterminado: true } },
  { nombre: "servicios (sin categoría ni convenio)", f: { ...plazoFijo, dailyRate: "90000" }, c: { ...ctx, esServicios: true } },
  {
    nombre: "reemplazo con motivo y comentario",
    f: { ...plazoFijo, isReplacement: true, empleado_id_reemplezado: "882", replacedUserId: "u9", motivoReemplazoId: "mVac", comentarios: "  cubre vacaciones  " },
    c: ctx,
  },
  {
    nombre: "jornadas ajustadas con motivo «otro»",
    f: { ...plazoFijo, workdaysCount: "20", workdaysOverrideReason: "otro", workdaysOverrideNote: "  llovió dos días  " },
    c: { ...ctx, ajuste: true },
  },
  { nombre: "rotativos, persona nueva (sin usuario)", f: { ...plazoFijo, diasRotativos: true, fullName: "Nadie" }, c: { ...ctx, selectedUser: null } },
  { nombre: "renovación de un contrato por vencer", f: plazoFijo, c: { ...ctx, renovacion: { userProjectId: "up1", fechaBajaContrato: "2026-09-30" } } },
  { nombre: "edición de una renovación (conserva la etiqueta)", f: plazoFijo, c: { ...ctx, editingUser: { metadata: { esRenovacion: true, renovacionDe: { userProjectId: "up1", fechaBajaContrato: "2026-09-30" } } } } },
  { nombre: "sin fecha de inicio (hireDate = ahora)", f: { ...plazoFijo, startDate: "" }, c: ctx },
];

for (const { nombre, f, c } of casos) {
  test(`mismo payload que el formulario original: ${nombre}`, () => {
    assert.deepStrictEqual(armarPayloadDeSolicitud(datosDelFormulario(f, c), { ahora: T }), payloadComoAntes(f, c, T));
  });
}

test("el sufijo del alta masiva sólo cambia el email provisorio", () => {
  const individual = armarPayloadDeSolicitud(datosDelFormulario(plazoFijo, ctx), { ahora: T });
  const delLote = armarPayloadDeSolicitud(datosDelFormulario(plazoFijo, ctx), { ahora: T, sufijoEmail: "_3_k9x2" });
  assert.equal(delLote.email, `solicitud_${T}_3_k9x2@pending.com`);
  assert.deepStrictEqual({ ...delLote, email: individual.email }, individual);
});
