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
/** Lo que devuelve siempre: lo que miran los contadores y la Jerarquía. */
const CAMPOS_BASE = ["fecha_alta_contrato", "fecha_baja_contrato", "nombre_estado_empleado", "nombre_contrato", "areaShiftAssignments"];
/**
 * `camposExtra`: campos del contrato que además hacen falta. La tabla de Gestionar Equipo pide una
 * docena —tipo, reemplazo, horario, jornadas, empresas— porque los muestra en sus columnas. Se piden
 * explícitos y no «todo el contrato» para que el peso de esto no crezca cada vez que alguien agrega
 * un campo al contrato.
 *
 * `_indice` es la posición en el array del UserProject —la que esperan editar y descargar— y `_total`
 * cuántos contratos tiene la persona en ese proyecto, que es lo que muestra la columna CONTRATOS.
 */
export async function contratosQueRigenDelProyecto(projectId, hoy, camposExtra = []) {
    const campos = [...new Set([...CAMPOS_BASE, ...camposExtra])];
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
                total: { $size: { $ifNull: ["$contracts", []] } },
                contrato: {
                    $cond: [
                        { $eq: ["$elegido", null] },
                        null,
                        {
                            $let: {
                                vars: { c: { $arrayElemAt: ["$contracts", "$elegido.i"] } },
                                in: Object.fromEntries(campos.map((campo) => [campo, `$$c.${campo}`])),
                            },
                        },
                    ],
                },
            },
        },
    ]);
    return new Map(filas.map((f) => [String(f.userId), f.contrato ? { ...f.contrato, _indice: f.indice, _total: f.total } : null]));
}
/**
 * EL CONTRATO QUE RIGE DE CADA PERSONA, MIRANDO TODOS SUS PROYECTOS.
 *
 * La variante de arriba responde «en este proyecto»; ésta responde «hoy, en cualquier lado», que es
 * lo que pregunta el buscador de personas de la solicitud de contratación: al lado de cada nombre
 * dice si tiene contrato vigente y desde cuándo, sin importar de qué proyecto salga.
 *
 * Devuelve SÓLO las dos fechas porque es lo único que esa fila muestra. Antes el front recibía las
 * fechas de TODOS los contratos de TODAS las personas para calcular esto en el teléfono: 4592
 * contratos y 638 KB por página de 1000 personas, casi 11 segundos contra Atlas.
 *
 * Misma regla que `getContratoActivo`: entre los vigentes manda el de tiempo indeterminado; si no,
 * el más reciente por alta y, a igualdad, por carga; sin vigentes, el más reciente de todos.
 */
export async function contratosQueRigenDeLasPersonas(userIds, hoy) {
    const ids = userIds.map((id) => new Types.ObjectId(String(id)));
    if (ids.length === 0)
        return new Map();
    const filas = await UserProject.aggregate([
        { $match: { userId: { $in: ids } } },
        /*
          Se desarma el array y se vuelve a armar con TRES CAMPOS por contrato, no con el contrato.
    
          Una persona puede tener varios vínculos (uno por proyecto) y la elección es sobre todos sus
          contratos juntos, así que hay que juntarlos. Juntar los contratos ENTEROS para quedarse con dos
          fechas sería mover el historial completo adentro de Mongo; con las claves, cada contrato son
          tres strings cortos.
        */
        { $unwind: { path: "$contracts", preserveNullAndEmptyArrays: false } },
        {
            $project: {
                _id: 0,
                userId: 1,
                alta: fechaISOExpr("$contracts.fecha_alta_contrato"),
                baja: fechaISOExpr("$contracts.fecha_baja_contrato"),
                carga: { $toString: { $ifNull: ["$contracts.fecha_carga", ""] } },
            },
        },
        { $group: { _id: "$userId", claves: { $push: { alta: "$alta", baja: "$baja", carga: "$carga" } } } },
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
                elegido: {
                    $reduce: {
                        input: "$candidatos",
                        initialValue: null,
                        in: { $cond: [{ $or: [{ $eq: ["$$value", null] }, { $gte: [{ $concat: ["$$this.alta", "|", "$$this.carga"] }, { $concat: ["$$value.alta", "|", "$$value.carga"] }] }] }, "$$this", "$$value"] },
                    },
                },
            },
        },
        { $project: { _id: 1, alta: "$elegido.alta", baja: "$elegido.baja" } },
    ]);
    return new Map(filas.map((f) => [String(f._id), f.alta === undefined && f.baja === undefined ? null : { fecha_alta_contrato: f.alta || "", fecha_baja_contrato: f.baja || "" }]));
}
