import { Schema, model } from "mongoose";
const memosoftConceptoSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    empresaId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    codigo: { type: String, required: true, trim: true },
    descripcion: { type: String, required: true, trim: true },
    usaPar1: { type: Boolean, default: false },
    usaPar2: { type: Boolean, default: false },
    unidadPar1: { type: String, enum: ["cantidad", "importe", null], default: null },
    unidadPar2: { type: String, enum: ["cantidad", "importe", null], default: null },
    activo: { type: Boolean, default: true },
}, { timestamps: true, collection: "memosoft_conceptos" });
// Un código por empresa: es la identidad del concepto, y dos filas iguales serían dos verdades.
memosoftConceptoSchema.index({ tenantId: 1, empresaId: 1, codigo: 1 }, { unique: true });
export const MemosoftConcepto = model("MemosoftConcepto", memosoftConceptoSchema);
/**
 * LOS 29 CÓDIGOS DE 2030 Y FZERO, como los pasó el estudio de sueldos.
 *
 * Semilla, no verdad inmutable: el script de la fase 0 los carga una vez por empresa y de ahí en
 * más se editan desde la pantalla. Está acá y no en el script para que se pueda leer el catálogo
 * sin abrir una migración.
 *
 * LA LEYENDA DICE BIEN QUÉ COLUMNA USA CADA CONCEPTO, PERO NO SIEMPRE LA UNIDAD.
 *
 * Se confirmó contra el archivo real de agosto:
 *
 *   · 0090 Licencia Sin Goce — la leyenda decía importe en par2. El único caso de agosto (Prestes)
 *     trae par2 = 1, y un importe de un peso no existe: son DÍAS. Corregido.
 *   · 0099 Adelanto — la leyenda dice importe y ahí sí acierta: 100.000, 200.000, 250.000, 430.000.
 *   · 0040 Ropa — SIGUE ABIERTA: no aparece ninguna vez en agosto, así que no hay con qué decidir.
 *     Queda como vino, con el guard de magnitud de `validarEfecto` avisando si el número es chico.
 *
 * Nada se cambia "porque tiene más sentido": lo que se corrige es lo que el archivo real contradice.
 */
export const CONCEPTOS_SEMILLA = [
    { codigo: "0000", descripcion: "Jornal", par2: "cantidad" },
    { codigo: "0001", descripcion: "Sueldo Básico", par2: "cantidad" },
    { codigo: "0008", descripcion: "Adicional H" },
    { codigo: "0009", descripcion: "Suspensiones", par1: "cantidad" },
    { codigo: "0010", descripcion: "Inasistencia", par1: "importe" },
    { codigo: "0011", descripcion: "Inasistencia Injustificada", par1: "cantidad", par2: "importe" },
    { codigo: "0012", descripcion: "Licencia por Enfermedad", par1: "cantidad" },
    { codigo: "0013", descripcion: "Suspención Disciplinaria", par1: "cantidad", par2: "importe" },
    { codigo: "0015", descripcion: "Horas Extras al 50%", par1: "cantidad" },
    { codigo: "0016", descripcion: "Horas Extras al 100%", par1: "cantidad" },
    { codigo: "0017", descripcion: "Feriado", par1: "cantidad" },
    { codigo: "0018", descripcion: "Dia del gremio", par1: "cantidad" },
    { codigo: "0019", descripcion: "Adicional F", par1: "cantidad" },
    { codigo: "0020", descripcion: "BONO", par1: "importe" },
    { codigo: "0029", descripcion: "Adicional Especial", par1: "importe" },
    { codigo: "0030", descripcion: "Adicional Especial LN+", par1: "importe" },
    { codigo: "0040", descripcion: "Ropa", par2: "importe" },
    { codigo: "0041", descripcion: "Guarderia", par1: "importe" },
    { codigo: "0042", descripcion: "Exteriores", par1: "cantidad" },
    { codigo: "0043", descripcion: "Reintegro Comida", par1: "cantidad" },
    { codigo: "0080", descripcion: "Prest.Dineraria L.24577 (Empl)", par2: "importe" },
    { codigo: "0081", descripcion: "Prest.Dineraria L.24577 (ART)", par2: "importe" },
    // Días, no importe: el caso de agosto trae par2 = 1 (ver el comentario de arriba).
    { codigo: "0090", descripcion: "Licencia Sin Goce de Sueldo", par2: "cantidad" },
    { codigo: "0099", descripcion: "Adelanto de Sueldos", par1: "importe" },
    { codigo: "0500", descripcion: "S.A.C.", par1: "cantidad", par2: "importe" },
    { codigo: "0501", descripcion: "S.A.C. Proporcional", par1: "cantidad", par2: "importe" },
    { codigo: "0601", descripcion: "Plus Vacacional", par1: "cantidad" },
    { codigo: "0604", descripcion: "Licencia por Matrimonio", par1: "cantidad" },
    { codigo: "0701", descripcion: "Vacaciones No Gozadas", par1: "cantidad" },
];
