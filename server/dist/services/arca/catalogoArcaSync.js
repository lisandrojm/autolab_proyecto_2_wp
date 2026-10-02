import { Types } from "mongoose";
import { ArcaCatalogo, ArcaCatalogoLectura } from "../../models/ArcaCatalogo.js";
import { Categoria } from "../../models/Categoria.js";
import { Company } from "../../models/Company.js";
import UserProject from "../../models/UserProject.js";
import { calcularDiff, hashTabla } from "../../compartido/catalogoArca.js";
import { abrirSesionArca, credencialesDe, guardarSesion } from "./navegador.js";
import { MOTOR_CATALOGOS } from "./motor.js";
import { soltarCandado, tomarCandado } from "./candadoArca.js";
import { aplicarFilas } from "./espejoArca.js";
/**
 * SINCRONIZAR EL ESPEJO CONTRA ARCA: leer, comparar, y dejar el diff PENDIENTE.
 *
 * Lee con el Chromium del servidor (mismo usuario delegado, mismo candado de una corrida por tenant
 * que las demás corridas de ARCA) y no aplica nada: guarda una `ArcaCatalogoLectura` con tres listas
 * —nuevos, dejaron de publicarse, descripción cambiada— y para cada cambio qué categorías de WeProdu y
 * cuántos contratos toca. Se aplica con confirmación (`aplicarLectura`).
 */
/** Tablas que dependen de la empleadora: de una lectura no se deduce que ARCA dejó de publicarlas. */
export const TABLAS_POR_EMPRESA = ["CONVENIO_CCT", "SUCURSAL_DOMICILIO", "ACTIVIDAD_DOMICILIO"];
const corridas = new Map();
export const lecturaEnCursoDe = (tenantId) => corridas.get(tenantId);
const digitos = (s) => String(s ?? "").replace(/\D/g, "");
/**
 * Lleva las filas leídas a la forma del espejo:
 *   · el código con el mismo relleno que tiene esa tabla en el espejo (ARCA puede mandarlo sin ceros);
 *   · el padre SOLO cuenta en las categorías (el convenio). En el resto se respeta el que ya tiene el
 *     espejo para ese código: el CSV y la pantalla no siempre nombran igual ese campo, y tomarlo de la
 *     pantalla haría parecer «nuevas» filas que ya estaban.
 */
export function normalizarLeidas(leidas, espejo) {
    const largoDe = new Map();
    for (const e of espejo)
        largoDe.set(e.tabla, Math.max(largoDe.get(e.tabla) || 0, String(e.codigo).length));
    const padreDe = new Map(espejo.filter((e) => e.tabla !== "CATEGORIA_CCT").map((e) => [`${e.tabla}|${e.codigo}`, e.filtroPadre]));
    return leidas.map((f) => {
        const largo = largoDe.get(f.tabla) || 0;
        const codigo = /^\d+$/.test(f.codigo) && largo > f.codigo.length ? f.codigo.padStart(largo, "0") : f.codigo;
        const filtroPadre = f.tabla === "CATEGORIA_CCT" ? f.filtroPadre : padreDe.get(`${f.tabla}|${codigo}`) ?? f.filtroPadre;
        return { ...f, codigo, filtroPadre };
    });
}
/** Contratos por `legacyId` de categoría. */
async function usoPorLegacy() {
    const r = await UserProject.aggregate([{ $unwind: "$contracts" }, { $match: { "contracts.categoria_sat_id": { $ne: null } } }, { $group: { _id: "$contracts.categoria_sat_id", n: { $sum: 1 } } }]);
    return new Map(r.map((x) => [Number(x._id), x.n]));
}
/** Para cada cambio de CATEGORIA_CCT, qué categorías de WeProdu usan ese código y cuántos contratos. */
async function impactoDe(diff) {
    const cambios = [...diff.dejaronDePublicarse.map((f) => ({ ...f, tipo: "dejo_de_publicarse" })), ...diff.descripcionCambiada.map((f) => ({ ...f, tipo: "descripcion_cambiada" }))].filter((f) => f.tabla === "CATEGORIA_CCT");
    if (cambios.length === 0)
        return [];
    const cats = await Categoria.find({ $or: cambios.map((c) => ({ convenio: c.filtroPadre, codigoArca: c.codigo })) }).select("nombre convenio codigoArca legacyId").lean();
    const uso = await usoPorLegacy();
    return cambios
        .map((c) => {
        const usan = cats.filter((x) => x.convenio === c.filtroPadre && x.codigoArca === c.codigo);
        return { tipo: c.tipo, convenio: c.filtroPadre, codigo: c.codigo, descripcion: c.descripcion, categorias: usan.map((x) => x.nombre), contratos: usan.reduce((n, x) => n + (uso.get(Number(x.legacyId)) || 0), 0) };
    })
        .filter((x) => x.categorias.length > 0);
}
export async function arrancarLecturaCatalogo(o) {
    if (!Types.ObjectId.isValid(o.empresaId))
        throw Object.assign(new Error("Empleadora inválida."), { status: 400 });
    tomarCandado(o.tenantId, "catalogo");
    try {
        const empresa = await Company.findById(o.empresaId).select("cuit razonSocial").lean();
        const empresaCuit = digitos(empresa?.cuit);
        if (empresaCuit.length !== 11)
            throw Object.assign(new Error("La empleadora no tiene CUIT cargado."), { status: 400 });
        const cred = await credencialesDe(o.tenantId);
        if (!cred)
            throw Object.assign(new Error("Faltan las credenciales de ARCA. Cargalas en Configuración → ARCA → Conexión."), { status: 400 });
        const corrida = { empresaId: o.empresaId, empresaCuit, razonSocial: String(empresa?.razonSocial || ""), eventos: [], terminada: false, arrancadaEl: new Date() };
        corridas.set(o.tenantId, corrida);
        void correr(o.tenantId, corrida, cred, o.usuarioId);
        return { empresaCuit, razonSocial: corrida.razonSocial };
    }
    catch (e) {
        soltarCandado(o.tenantId, "catalogo");
        throw e;
    }
}
async function correr(tenantId, corrida, cred, usuarioId) {
    const emitir = (e) => corrida.eventos.push(e);
    let sesion = null;
    try {
        emitir({ tipo: "abriendo" });
        sesion = await abrirSesionArca(tenantId, cred);
        const { leerCatalogosArca } = (await import(MOTOR_CATALOGOS));
        const leido = await leerCatalogosArca({ page: sesion.page, empresaCuit: corrida.empresaCuit, onProgreso: emitir });
        const espejo = await ArcaCatalogo.find({ tabla: { $in: leido.tablasLeidas } }).select("tabla filtroPadre codigo descripcion vigente").lean();
        const filas = normalizarLeidas(leido.filas, espejo);
        const convenios = [...new Set(filas.filter((f) => f.tabla === "CATEGORIA_CCT").map((f) => f.filtroPadre))];
        const filtrosLeidos = { CATEGORIA_CCT: convenios };
        const diff = calcularDiff(espejo.filter((e) => e.vigente !== false), filas, leido.tablasLeidas.filter((t) => !TABLAS_POR_EMPRESA.includes(t)), filtrosLeidos);
        // Las tablas de la empleadora sí suman «nuevos» y «descripción cambiada», nunca bajas.
        const deEmpresa = calcularDiff(espejo.filter((e) => e.vigente !== false), filas, leido.tablasLeidas.filter((t) => TABLAS_POR_EMPRESA.includes(t)));
        diff.nuevos.push(...deEmpresa.nuevos);
        diff.descripcionCambiada.push(...deEmpresa.descripcionCambiada);
        const porTabla = {};
        for (const t of leido.tablasLeidas) {
            const de = filas.filter((f) => f.tabla === t);
            porTabla[t] = { cantidad: de.length, hash: hashTabla(de) };
        }
        const lectura = await ArcaCatalogoLectura.create({
            usuarioId: usuarioId && Types.ObjectId.isValid(usuarioId) ? usuarioId : undefined,
            empresaCuit: corrida.empresaCuit,
            empresaRazonSocial: corrida.razonSocial,
            origen: "arca",
            porTabla,
            filas,
            tablasLeidas: leido.tablasLeidas,
            filtrosLeidos,
            diff,
            impacto: await impactoDe(diff),
            // Sin cambios no hay nada que confirmar: queda aplicada (sirve igual como «última lectura»).
            estado: diff.nuevos.length + diff.dejaronDePublicarse.length + diff.descripcionCambiada.length === 0 ? "aplicada" : "pendiente",
            error: leido.faltaron?.length ? `No se encontraron en la pantalla: ${leido.faltaron.join(", ")}` : undefined,
        });
        if (lectura.estado === "aplicada")
            await ArcaCatalogo.updateMany({ tabla: { $in: leido.tablasLeidas }, vigente: true }, { $set: { ultimaVezVisto: new Date() } });
        corrida.lecturaId = String(lectura._id);
        emitir({ tipo: "fin", lecturaId: corrida.lecturaId, nuevos: diff.nuevos.length, dejaronDePublicarse: diff.dejaronDePublicarse.length, descripcionCambiada: diff.descripcionCambiada.length, faltaron: leido.faltaron || [] });
    }
    catch (e) {
        corrida.error = String(e?.message || e);
        emitir({ tipo: "fallo", mensaje: corrida.error });
    }
    finally {
        corrida.terminada = true;
        const s = sesion;
        if (s && !corrida.error)
            await guardarSesion(tenantId, s.ctx).catch(() => { });
        await s?.browser.close().catch(() => { });
        soltarCandado(tenantId, "catalogo");
    }
}
/**
 * Aplica una lectura pendiente al espejo. Las descripciones que cambiaron en códigos que usa alguna
 * categoría le sacan la confirmación de nombre: vuelven a `nombre_distinto` hasta que alguien revise.
 */
export async function aplicarLectura(id, usuarioId) {
    const l = await ArcaCatalogoLectura.findById(id);
    if (!l)
        throw Object.assign(new Error("Lectura no encontrada."), { status: 404 });
    if (l.estado !== "pendiente")
        throw Object.assign(new Error(`La lectura ya está ${l.estado}.`), { status: 409 });
    const r = await aplicarFilas({ filas: l.filas || [], origen: "arca", empresaCuit: l.empresaCuit, tablas: l.tablasLeidas, filtros: l.filtrosLeidos || {}, sinBajas: TABLAS_POR_EMPRESA });
    const cambiadas = (l.diff?.descripcionCambiada || []).filter((d) => d.tabla === "CATEGORIA_CCT");
    if (cambiadas.length)
        await Categoria.updateMany({ $or: cambiadas.map((d) => ({ convenio: d.filtroPadre, codigoArca: d.codigo })) }, { $set: { confirmacionNombre: null } });
    l.estado = "aplicada";
    l.aplicadaPor = usuarioId && Types.ObjectId.isValid(usuarioId) ? usuarioId : undefined;
    l.aplicadaEl = new Date();
    await l.save();
    return r;
}
export async function descartarLectura(id, usuarioId) {
    const l = await ArcaCatalogoLectura.findById(id);
    if (!l)
        throw Object.assign(new Error("Lectura no encontrada."), { status: 404 });
    if (l.estado !== "pendiente")
        throw Object.assign(new Error(`La lectura ya está ${l.estado}.`), { status: 409 });
    l.estado = "descartada";
    l.aplicadaPor = usuarioId && Types.ObjectId.isValid(usuarioId) ? usuarioId : undefined;
    l.aplicadaEl = new Date();
    await l.save();
}
/** Cuándo se leyó por última vez el catálogo desde ARCA con esta empleadora (cualquier estado). */
export async function ultimaLecturaDe(empresaCuit) {
    const l = await ArcaCatalogoLectura.findOne({ origen: "arca", empresaCuit: digitos(empresaCuit) }).sort({ fecha: -1 }).select("fecha").lean();
    return l?.fecha || null;
}
