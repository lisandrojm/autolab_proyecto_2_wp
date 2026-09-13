import { Types } from "mongoose";
import UserProject from "../models/UserProject.js";
/**
 * Normaliza una fecha de contrato ADENTRO de Mongo, igual que `fechaISO` de `contratoVigencia`:
 * "YYYY-MM-DD...", "DD/MM/YYYY" y "DD-MM-YYYY" → "YYYY-MM-DD"; vacío, "null", "-" o lo que no sea
 * texto → "". (En JS un Date pasado por `String()` tampoco matchea ningún formato, así que también da "".)
 */
const fechaISOExpr = (campo) => ({
    $let: {
        vars: { t: { $cond: [{ $eq: [{ $type: campo }, "string"] }, { $trim: { input: campo } }, ""] } },
        in: {
            $switch: {
                branches: [
                    { case: { $in: [{ $toLower: "$$t" }, ["", "null", "undefined", "-", "—"]] }, then: "" },
                    { case: { $regexMatch: { input: "$$t", regex: /^\d{4}-\d{2}-\d{2}/ } }, then: { $substrCP: ["$$t", 0, 10] } },
                ],
                default: {
                    $let: {
                        vars: { p: { $split: ["$$t", { $cond: [{ $gt: [{ $indexOfCP: ["$$t", "/"] }, -1] }, "/", "-"] }] } },
                        in: {
                            $cond: [
                                { $and: [{ $eq: [{ $size: "$$p" }, 3] }, { $eq: [{ $strLenCP: { $arrayElemAt: ["$$p", 2] } }, 4] }] },
                                {
                                    $concat: [
                                        { $arrayElemAt: ["$$p", 2] },
                                        "-",
                                        { $cond: [{ $eq: [{ $strLenCP: { $arrayElemAt: ["$$p", 1] } }, 1] }, { $concat: ["0", { $arrayElemAt: ["$$p", 1] }] }, { $arrayElemAt: ["$$p", 1] }] },
                                        "-",
                                        { $cond: [{ $eq: [{ $strLenCP: { $arrayElemAt: ["$$p", 0] } }, 1] }, { $concat: ["0", { $arrayElemAt: ["$$p", 0] }] }, { $arrayElemAt: ["$$p", 0] }] },
                                    ],
                                },
                                "",
                            ],
                        },
                    },
                },
            },
        },
    },
});
/**
 * EL CONTRATO QUE RIGE DE CADA MIEMBRO, ELEGIDO ADENTRO DE MONGO.
 *
 * Los vínculos de un proyecto grande pesan: 254 personas con 22 contratos de promedio son 5,3 MB.
 * Traerlos para quedarse con UNO por persona hacía que `area-shift-counts` bajara ~1 MB aun pidiendo
 * cuatro campos (11 s medidos), y la Jerarquía lo repetía una vez por área. Acá la elección se hace
 * en la base con la misma regla que `getContratoActivo` —vigentes; entre ellos manda el tiempo
 * indeterminado; el más reciente por alta y, a igualdad, por carga; sin vigentes, el más reciente de
 * todos— y viaja una fila chica por persona.
 *
 * Si se toca la regla de `getContratoActivo`, hay que tocar esta también.
 *
 * Devuelve userId → contrato que rige (sólo los campos que usan los contadores y el detalle), o sin
 * entrada si la persona no tiene vínculo con el proyecto.
 */
export async function contratosQueRigenDelProyecto(projectId, hoy) {
    const filas = await UserProject.aggregate([
        { $match: { projectId: new Types.ObjectId(projectId) } },
        {
            $project: {
                userId: 1,
                contracts: 1,
                claves: {
                    $map: {
                        input: { $range: [0, { $size: { $ifNull: ["$contracts", []] } }] },
                        as: "i",
                        in: {
                            $let: {
                                vars: { c: { $arrayElemAt: ["$contracts", "$$i"] } },
                                in: {
                                    i: "$$i",
                                    alta: fechaISOExpr("$$c.fecha_alta_contrato"),
                                    baja: fechaISOExpr("$$c.fecha_baja_contrato"),
                                    carga: { $toString: { $ifNull: ["$$c.fecha_carga", ""] } },
                                },
                            },
                        },
                    },
                },
            },
        },
        {
            $addFields: {
                vigentes: {
                    $filter: {
                        input: "$claves",
                        as: "k",
                        cond: { $and: [{ $or: [{ $eq: ["$$k.alta", ""] }, { $lte: ["$$k.alta", hoy] }] }, { $or: [{ $eq: ["$$k.baja", ""] }, { $gte: ["$$k.baja", hoy] }] }] },
                    },
                },
            },
        },
        {
            $addFields: {
                candidatos: {
                    $let: {
                        vars: { indeterminados: { $filter: { input: "$vigentes", as: "k", cond: { $eq: ["$$k.baja", ""] } } } },
                        in: { $cond: [{ $gt: [{ $size: "$$indeterminados" }, 0] }, "$$indeterminados", { $cond: [{ $gt: [{ $size: "$vigentes" }, 0] }, "$vigentes", "$claves"] }] },
                    },
                },
            },
        },
        {
            $addFields: {
                // Mismo desempate que `masReciente`: el de clave mayor, y a igualdad gana el que viene después.
                elegido: {
                    $reduce: {
                        input: "$candidatos",
                        initialValue: null,
                        in: { $cond: [{ $or: [{ $eq: ["$$value", null] }, { $gte: [{ $concat: ["$$this.alta", "|", "$$this.carga"] }, { $concat: ["$$value.alta", "|", "$$value.carga"] }] }] }, "$$this", "$$value"] },
                    },
                },
            },
        },
        {
            $project: {
                _id: 0,
                userId: 1,
                indice: "$elegido.i",
                contrato: {
                    $cond: [
                        { $eq: ["$elegido", null] },
                        null,
                        {
                            $let: {
                                vars: { c: { $arrayElemAt: ["$contracts", "$elegido.i"] } },
                                in: {
                                    fecha_alta_contrato: "$$c.fecha_alta_contrato",
                                    fecha_baja_contrato: "$$c.fecha_baja_contrato",
                                    nombre_estado_empleado: "$$c.nombre_estado_empleado",
                                    nombre_contrato: "$$c.nombre_contrato",
                                    areaShiftAssignments: "$$c.areaShiftAssignments",
                                },
                            },
                        },
                    ],
                },
            },
        },
    ]);
    return new Map(filas.map((f) => [String(f.userId), f.contrato ? { ...f.contrato, _indice: f.indice } : null]));
}
