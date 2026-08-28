/**
 * Compatibilidad entre el modelo nuevo de categorías (`Categoria` + `ConvenioGrupo`, con la escala
 * salarial en el grupo) y la forma vieja y plana de `categorias-sat` (`data.sueldoBruto` y compañía).
 *
 * Existe porque la migración dejó los dos modelos conviviendo: la escala se movió al grupo, pero el
 * generador del TXT de ARCA, el chequeo de completitud, las Funciones FRAME y los PDFs siguen
 * consumiendo `data.*`. Resolver acá —y no en cada ruta— es lo que evita que una ruta quede leyendo
 * la tabla vieja mientras otra lee la nueva, que es exactamente el bug que motivó este archivo:
 * `GET /categorias-sat` ya devolvía los `_id` de `categorias`, pero `POST/PUT /role-frames` seguía
 * buscándolos en `CategoriaSat` y, al no encontrarlos, guardaba la función con CERO categorías.
 *
 * Cuando no quede ningún consumidor de `data.*`, este archivo y `CategoriaSat` se borran juntos.
 */
import { Categoria } from "../models/Categoria.js";
import { escalaDeCategoria } from "./escalaCategoria.js";
import { ConvenioGrupo } from "../models/ConvenioGrupo.js";
import { CategoriaSat } from "../models/CategoriaSat.js";
const aplanar = (c, g) => {
    // La escala sale de UNA sola regla, compartida con el modal de contrato y con el TXT: propia de la
    // categoría → del grupo → ninguna. Antes se leía siempre del grupo, y por eso una categoría de un
    // convenio SIN grupos no podía tener retribución ni aunque se la cargaran.
    const e = escalaDeCategoria(c, g);
    return {
        _id: c._id,
        externalId: c.codigoArca || String(c.legacyId ?? ""),
        name: c.nombre,
        // Las de la tabla vieja no tienen el campo: se asumen elegibles, que es como se comportaban.
        isActive: c.isActive !== false,
        data: {
            id: c.legacyId,
            numeroCategoria: g?.numero,
            nombre: c.nombre,
            // Numérico por compatibilidad; el canónico de 6 dígitos con ceros va en `codigoArca`.
            codigoAfip: c.codigoArca ? Number(c.codigoArca) : 0,
            codigoArca: c.codigoArca,
            convenio: c.convenio,
            grupoId: c.grupoId,
            sueldoBasico: e.sueldoBasico,
            sueldoAdicional: e.sueldoAdicional,
            presentismo: e.presentismo,
            sueldoBruto: e.sueldoBruto,
            sueldoBrutoLetras: e.sueldoBrutoLetras,
            neto: e.neto,
            sueldoNetoLetras: e.sueldoNetoLetras,
            fechaActualizacion: e.fechaActualizacion,
            escalaOrigen: e.origen,
        },
    };
};
/** ¿Ya se corrió la migración en esta base? Mientras `categorias` esté vacía se sirve la tabla vieja. */
export const migracionCategoriasCorrida = async () => (await Categoria.estimatedDocumentCount()) > 0;
/**
 * Todas las categorías en la forma vieja. Si la migración todavía no corrió, devuelve `categorias-sat`
 * tal cual.
 */
export const listarCategoriasCompat = async () => {
    const [cats, grupos] = await Promise.all([Categoria.find().lean(), ConvenioGrupo.find().lean()]);
    if (cats.length === 0)
        return (await CategoriaSat.find().sort({ name: 1 }).lean());
    const porGrupo = new Map(grupos.map((g) => [String(g._id), g]));
    return cats.map((c) => aplanar(c, porGrupo.get(String(c.grupoId)))).sort((a, b) => String(a.name).localeCompare(String(b.name), "es", { sensitivity: "base" }));
};
/**
 * Resuelve categorías por `_id` en la forma vieja, mirando las DOS colecciones.
 *
 * Acepta ids de cualquiera de los dos modelos a propósito: hay datos guardados de antes de la
 * migración que todavía referencian `categorias-sat`, y perderlos en silencio es peor que servirlos
 * con la escala vieja. Lo que NO puede pasar es devolver vacío porque el id era del otro modelo.
 */
export const resolverCategoriasCompatPorId = async (ids) => {
    if (!Array.isArray(ids) || ids.length === 0)
        return [];
    const [cats, grupos] = await Promise.all([Categoria.find({ _id: { $in: ids } }).lean(), ConvenioGrupo.find().lean()]);
    const porGrupo = new Map(grupos.map((g) => [String(g._id), g]));
    const resueltas = cats.map((c) => aplanar(c, porGrupo.get(String(c.grupoId))));
    const encontrados = new Set(resueltas.map((c) => String(c._id)));
    const faltantes = ids.filter((id) => !encontrados.has(String(id)));
    if (faltantes.length > 0) {
        const viejas = (await CategoriaSat.find({ _id: { $in: faltantes } }).lean());
        resueltas.push(...viejas);
    }
    return resueltas;
};
/** Una categoría por su id numérico legacy (`categoria_sat_id` de los contratos). */
export const buscarCategoriaCompatPorLegacyId = async (legacyId) => {
    // Los contratos sin categoría llegan como `Number(undefined)` = NaN: cortar acá evita dos
    // consultas que no pueden matchear nada.
    if (!Number.isFinite(legacyId))
        return null;
    const c = await Categoria.findOne({ legacyId }).lean();
    if (c) {
        const g = c.grupoId ? await ConvenioGrupo.findById(c.grupoId).lean() : null;
        return aplanar(c, g);
    }
    return (await CategoriaSat.findOne({ "data.id": legacyId }).lean());
};
/**
 * El próximo `legacyId` libre para una categoría nueva.
 *
 * `contracts.categoria_sat_id` es un NÚMERO, así que una categoría sin `legacyId` no se puede asignar
 * a ningún contrato: el selector la lista, se la clickea y no pasa nada. Así nacieron 226 de las 335
 * que había en producción, todas creadas desde el ABM nuevo.
 *
 * Mira LAS DOS colecciones. `categorias-sat` sigue sirviendo de fallback en la resolución por id
 * (ver `buscarCategoriaCompatPorLegacyId`), así que reusar un número de ahí haría que dos categorías
 * distintas respondan al mismo id — y esa ambigüedad se manifestaría como un sueldo equivocado en un
 * contrato, que es de los errores más caros de encontrar.
 */
export const proximoLegacyId = async () => {
    const [nuevo, viejo] = await Promise.all([
        Categoria.findOne({ legacyId: { $ne: null } }).sort({ legacyId: -1 }).select("legacyId").lean(),
        CategoriaSat.findOne({ "data.id": { $ne: null } }).sort({ "data.id": -1 }).select("data.id").lean(),
    ]);
    return Math.max(Number(nuevo?.legacyId || 0), Number(viejo?.data?.id || 0)) + 1;
};
