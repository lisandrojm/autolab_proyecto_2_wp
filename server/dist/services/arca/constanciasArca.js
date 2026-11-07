import { Types } from "mongoose";
import UserProject from "../../models/UserProject.js";
import { Project } from "../../models/Project.js";
import { User } from "../../models/User.js";
import { Company } from "../../models/Company.js";
import { ConstanciaArca } from "../../models/ConstanciaArca.js";
import { carpetaMasAvanzada, categoriaDe, claveConstancia, elegirParaCorrida, estadoPorCarpeta, siguienteEstado, trasUnFallo, yaTieneConstancia, } from "./cicloConstancia.js";
import { borradoEl, copyEntry, listFolder, ubicarArchivo } from "../dropboxService.js";
import { resolverCarpetaPorProposito } from "../../utils/estadoCarpetas.js";
/**
 * LAS CONSTANCIAS DE ARCA EN LA BASE (`constancias_arca`): de dónde salen, quién las pide, qué pasó en
 * cada intento y dónde está hoy cada documento. Las reglas son de `cicloConstancia.ts` (puro); esto
 * es lo que lee y escribe.
 *
 *   · `sincronizarConstancias`: una fila por cada alta presentada (idempotente: la clave es persona +
 *     empleadora + fecha de alta). La llaman la descarga antes de elegir y el script de migración.
 *   · `colaDeDescarga`: qué se pide en esta corrida y qué queda afuera (y por qué).
 *   · `anotarDescarga` / `anotarFallo`: el resultado de cada persona.
 *   · `actualizarUbicaciones`: dónde está hoy cada documento (Outbox, Pendbox, firmados…) y el estado
 *     que eso significa; archiva el firmado en «Alta temprana de Arca/Firmadas». Corre con el escaneo
 *     de carpetas (polling y webhook de Dropbox) y después de cada descarga.
 *   · `constanciasDeLaPantalla`: lo que leen las pantallas. SOLO LEE: si una presentada todavía no
 *     tiene fila (antes de la migración), se deduce del contrato sin escribir nada.
 */
const digitos = (v) => String(v ?? "").replace(/\D/g, "");
const fechaIso = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v ?? "")) ? String(v).slice(0, 10) : "");
const codigoDe = (nombre) => /ID-\d{6,}/.exec(String(nombre ?? ""))?.[0] || "";
/**
 * La huella de una constancia de alta por su NOMBRE: CUIL|fecha de alta|CUIT de la empleadora. Sólo
 * para nombres de constancias de alta (AltaAFIP / AltaArca) que traen las tres cosas; si no, "". Puro.
 */
export function huellaDelNombre(nombre) {
    const n = String(nombre || "");
    if (!/_Alta(AFIP|Arca)_/i.test(n))
        return "";
    const fecha = /_D-(\d{8})_/.exec(n)?.[1];
    const cuil = /_(\d{11})_/.exec(n)?.[1];
    const cuit = /Empresa-(\d{11})/.exec(n)?.[1];
    return fecha && cuil && cuit ? `${cuil}|${fecha}|${cuit}` : "";
}
/** La misma huella, de una fila de `constancias_arca`. Puro. */
export const huellaDe = (d) => `${digitos(d.cuil)}|${String(d.fechaAlta || "").replace(/-/g, "")}|${digitos(d.empresaCuit)}`;
/** La subcarpeta de «Alta temprana de Arca» donde se archiva la constancia firmada (la raíz la lee el escaneo de estados). */
export const SUBCARPETA_FIRMADAS = "Firmadas";
/**
 * El estado que dice el contrato, para una presentación que todavía no tiene fila. Puro.
 *
 * Con la constancia validada: descargada si fue al Outbox; archivada si fue a «No firmar». Dónde está
 * HOY lo dice después `actualizarUbicaciones`; esto es sólo el punto de partida.
 */
export function filaDesdeContrato(o) {
    const cuil = digitos(o.user?.metadata?.cuit);
    const fechaAlta = fechaIso(o.c.fecha_alta_contrato);
    if (cuil.length !== 11 || !fechaAlta)
        return null;
    const fechaBaja = fechaIso(o.c.fecha_baja_contrato);
    const k = o.c.altaConstancia;
    const archivadaEn = String(k?.archivadaEn || "");
    const noFirmar = /\/No firmar\//i.test(archivadaEn);
    const tipo = k?.validadaEl ? (k.tipo === "baja" ? "baja" : "alta") : null;
    return {
        clave: claveConstancia({ cuil, empresaCuit: o.empresa.cuit, fechaAlta }),
        cuil,
        nombre: `${o.user?.firstName || ""} ${o.user?.lastName || ""}`.trim(),
        userId: String(o.up.userId),
        userProjectId: String(o.up._id),
        contractIndex: o.idx,
        empresaId: String(o.empresa._id),
        empresaCuit: digitos(o.empresa.cuit),
        empresaRazonSocial: o.empresa.razonSocial,
        fechaAlta,
        fechaBaja,
        presentadaEl: o.c.altaArcaPresentada?.fecha ? new Date(o.c.altaArcaPresentada.fecha) : null,
        logId: o.c.altaArcaPresentada?.logId ? String(o.c.altaArcaPresentada.logId) : null,
        estado: !k?.validadaEl ? "presentada" : noFirmar ? (tipo === "baja" ? "baja_mismo_dia_ok" : "archivada") : "constancia_descargada",
        tipoConstancia: tipo,
        mismoDia: tipo === "baja" && !!fechaBaja && fechaBaja === fechaAlta,
        documento: k?.validadaEl
            ? { codigo: codigoDe(k.enviadaComo || archivadaEn), nombre: String(k.enviadaComo || ""), path: archivadaEn || undefined, dropboxId: k.dropboxId || undefined, carpeta: !archivadaEn ? null : noFirmar ? "no_firmar" : "outbox", vaAFirma: k.vaAFirma !== false, firmadaEl: null, archivadaEn: null, ubicadoEl: null, noUbicadoDesde: null }
            : null,
    };
}
/** Las altas presentadas del tenant (o de una empleadora), como filas. SOLO LEE. */
export async function filasPresentadas(tenantObjectId, o = {}) {
    const [empresas, proyectos] = await Promise.all([Company.find({}).select("razonSocial cuit").lean(), Project.find({ tenantId: tenantObjectId }).select("_id").lean()]);
    const empresaPorId = new Map(empresas.filter((e) => digitos(e.cuit).length === 11).map((e) => [String(e._id), { _id: e._id, cuit: digitos(e.cuit), razonSocial: String(e.razonSocial || "") }]));
    const match = { "altaArcaPresentada.resultado": "presentada" };
    if (o.empresaId && Types.ObjectId.isValid(o.empresaId))
        match.empresaContratoId = { $in: [new Types.ObjectId(o.empresaId), o.empresaId] };
    const ups = await UserProject.find({ projectId: { $in: proyectos.map((p) => p._id) }, contracts: { $elemMatch: match } })
        .select("userId contracts.empresaContratoId contracts.altaArcaPresentada contracts.altaConstancia contracts.fecha_alta_contrato contracts.fecha_baja_contrato")
        .lean();
    const usuarios = await User.find({ _id: { $in: ups.map((u) => u.userId) }, tenantId: tenantObjectId }).select("firstName lastName metadata.cuit").lean();
    const porId = new Map(usuarios.map((u) => [String(u._id), u]));
    const out = [];
    for (const up of ups) {
        (up.contracts || []).forEach((c, idx) => {
            const empresa = empresaPorId.get(String(c.empresaContratoId || ""));
            if (!empresa || c.altaArcaPresentada?.resultado !== "presentada")
                return;
            if (o.empresaId && String(empresa._id) !== o.empresaId)
                return;
            const f = filaDesdeContrato({ up, idx, c, user: porId.get(String(up.userId)), empresa });
            if (f)
                out.push(f);
        });
    }
    return out;
}
/**
 * UNA FILA POR CADA ALTA PRESENTADA, sin duplicar nunca (upsert por clave). Lo que ya existe no se pisa
 * —sus intentos y su estado son la historia—, salvo para reconocer una constancia que entró por otro
 * lado (subida a mano en Contratos): eso la saca de pendiente o de revisión.
 */
export async function sincronizarConstancias(tenantObjectId, o = {}) {
    const filas = await filasPresentadas(tenantObjectId, o);
    if (filas.length === 0)
        return { filas: 0, nuevas: 0, actualizadas: 0 };
    const ahora = new Date();
    const tenantId = new Types.ObjectId(String(tenantObjectId));
    const ops = [];
    for (const f of filas) {
        const base = { ...f, userId: new Types.ObjectId(f.userId), userProjectId: new Types.ObjectId(f.userProjectId), empresaId: new Types.ObjectId(f.empresaId), logId: f.logId && Types.ObjectId.isValid(f.logId) ? new Types.ObjectId(f.logId) : null };
        const { nombre, fechaBaja, empresaRazonSocial, ...soloAlCrear } = base;
        ops.push({
            updateOne: {
                filter: { tenantId, clave: f.clave },
                update: { $setOnInsert: { ...soloAlCrear, tenantId, intentos: [], historial: [{ estado: f.estado, fecha: ahora, motivo: "Alta presentada" }] }, $set: { nombre, fechaBaja, empresaRazonSocial } },
                upsert: true,
            },
        });
        if (yaTieneConstancia(f.estado)) {
            ops.push({
                updateOne: {
                    filter: { tenantId, clave: f.clave, estado: { $in: ["presentada", "constancia_pendiente", "requiere_revision"] } },
                    update: { $set: { estado: f.estado, documento: f.documento, tipoConstancia: f.tipoConstancia, mismoDia: f.mismoDia, proximoIntentoEl: null, motivoRevision: null }, $push: { historial: { estado: f.estado, fecha: ahora, motivo: "La constancia ya estaba en el contrato" } } },
                },
            });
        }
    }
    const r = await ConstanciaArca.bulkWrite(ops, { ordered: false });
    return { filas: filas.length, nuevas: r.upsertedCount || 0, actualizadas: r.modifiedCount || 0 };
}
/**
 * QUÉ SE PIDE EN ESTA CORRIDA DE UNA EMPLEADORA. La automática respeta el cupo (nuevas primero), las
 * esperas y la revisión; la forzada (`soloItems`) pide lo que se eligió aunque esté esperando o en
 * revisión. En las dos, lo que ya tiene su constancia no se pide nunca.
 */
export async function colaDeDescarga(tenantObjectId, empresaId, o) {
    await sincronizarConstancias(tenantObjectId, { empresaId });
    const docs = await ConstanciaArca.find({ tenantId: tenantObjectId, empresaId: new Types.ObjectId(empresaId) }).select("clave estado proximoIntentoEl fechaAlta userProjectId contractIndex").lean();
    const sinConstancia = docs.filter((d) => !yaTieneConstancia(d.estado));
    if (o.soloItems) {
        const pedidas = sinConstancia.filter((d) => o.soloItems.some((i) => i.userProjectId === String(d.userProjectId) && Number(i.contractIndex) === d.contractIndex));
        return { elegidas: pedidas.map((d) => ({ userProjectId: String(d.userProjectId), contractIndex: d.contractIndex, clave: d.clave, manual: true })), fuera: { nuevasPorTope: 0, reintentosPorTope: 0, esperandoReintento: 0, enRevision: 0 }, total: sinConstancia.length };
    }
    const { elegidas, fuera } = elegirParaCorrida(sinConstancia, { ahora: o.ahora, tope: o.tope ?? 0 });
    return { elegidas: elegidas.map((d) => ({ userProjectId: String(d.userProjectId), contractIndex: d.contractIndex, clave: d.clave, manual: false })), fuera, total: sinConstancia.length };
}
/** La constancia se bajó y quedó subida (o cargada en el contrato). */
export async function anotarDescarga(tenantObjectId, clave, r) {
    const noFirmar = !!r.archivadaEn && /\/No firmar\//i.test(r.archivadaEn);
    const estado = !noFirmar ? "constancia_descargada" : r.tipo === "baja" ? "baja_mismo_dia_ok" : "archivada";
    const ahora = new Date();
    await ConstanciaArca.updateOne({ tenantId: tenantObjectId, clave }, {
        $set: {
            estado,
            tipoConstancia: r.tipo,
            mismoDia: r.mismoDia,
            proximoIntentoEl: null,
            motivoRevision: null,
            documento: { codigo: codigoDe(r.nombre || r.archivadaEn), nombre: r.nombre || "", path: r.archivadaEn || undefined, dropboxId: r.dropboxId, carpeta: r.archivadaEn ? (noFirmar ? "no_firmar" : "outbox") : null, vaAFirma: r.vaAFirma, firmadaEl: null, archivadaEn: null, ubicadoEl: r.archivadaEn ? ahora : null, noUbicadoDesde: null },
        },
        $push: {
            intentos: { fecha: ahora, resultado: "descargada", detalle: r.tipo === "baja" ? (r.mismoDia ? "Constancia de la relación (alta y baja el mismo día)." : "Constancia de la relación ya terminada (de baja).") : undefined, manual: !!r.manual },
            historial: { estado, fecha: ahora, motivo: r.tipo === "baja" ? "Constancia de baja aceptada: la relación ya terminó" : "Constancia bajada de ARCA" },
        },
    });
}
/** Un intento que no trajo la constancia: cuenta, espera o pasa a revisión (ver `trasUnFallo`). */
export async function anotarFallo(tenantObjectId, clave, fallo, o = {}) {
    const doc = await ConstanciaArca.findOne({ tenantId: tenantObjectId, clave }).select("intentos estado").lean();
    if (!doc || yaTieneConstancia(doc.estado))
        return { estado: doc?.estado || "presentada" };
    const ahora = new Date();
    const r = trasUnFallo((doc.intentos || []), fallo, ahora, o);
    await ConstanciaArca.updateOne({ tenantId: tenantObjectId, clave }, {
        $set: { estado: r.estado, proximoIntentoEl: r.proximoIntentoEl, motivoRevision: r.motivoRevision ?? null },
        $push: {
            intentos: { fecha: ahora, resultado: fallo.resultado, detalle: fallo.detalle, manual: !!o.manual },
            ...(r.estado !== doc.estado ? { historial: { estado: r.estado, fecha: ahora, motivo: r.motivoRevision } } : {}),
        },
    });
    return r;
}
export async function actualizarUbicaciones(tenantId, cfg, o = {}) {
    const dbx = o.dropbox ?? {
        listar: async (path) => (await listFolder(tenantId, cfg, path, true)).entries || [],
        copiar: (desde, hacia) => copyEntry(tenantId, cfg, desde, hacia),
        ubicar: (ref) => ubicarArchivo(tenantId, cfg, ref, { borrados: true }),
        borradoEl: (path) => borradoEl(tenantId, cfg, path),
    };
    const log = o.log || (() => { });
    const docs = o.docs ?? await ConstanciaArca.find({ tenantId: new Types.ObjectId(tenantId), documento: { $ne: null }, estado: { $in: ["constancia_descargada", "enviada_a_firmar", "firmada", "requiere_revision", "archivada"] } })
        .select("clave cuil empresaCuit fechaAlta estado documento tipoConstancia")
        .lean();
    const r = { revisadas: docs.length, cambiadas: 0, archivadas: 0, noUbicadas: 0, cambios: [] };
    if (docs.length === 0)
        return r;
    const { outbox, pendbox, firmados, altaTemprana } = o.carpetas ?? Object.fromEntries(await Promise.all(["outbox", "pendbox", "firmados", "altaTemprana"].map(async (k) => [k, await resolverCarpetaPorProposito(k === "altaTemprana" ? "alta_temprana" : k)])));
    const carpetas = [];
    if (outbox)
        carpetas.push({ carpeta: "outbox", path: outbox });
    if (pendbox)
        carpetas.push({ carpeta: "pendbox", path: pendbox });
    if (firmados)
        carpetas.push({ carpeta: "firmados", path: firmados });
    if (altaTemprana) {
        carpetas.push({ carpeta: "alta_firmadas", path: `${altaTemprana.replace(/\/$/, "")}/${SUBCARPETA_FIRMADAS}` });
        carpetas.push({ carpeta: "no_firmar", path: `${altaTemprana.replace(/\/$/, "")}/No firmar` });
    }
    const porCodigo = new Map();
    const porHuella = new Map();
    const anotar = (m, k, a) => m.set(k, [...(m.get(k) || []), a]);
    for (const c of carpetas) {
        let entradas = [];
        try {
            entradas = await dbx.listar(c.path);
        }
        catch (e) {
            if (!/not_found/.test(String(e?.response?.data?.error_summary || e?.message || "")))
                throw e;
        }
        for (const e of entradas) {
            if (e.tag !== "file")
                continue;
            const a = { carpeta: c.carpeta, name: e.name, path: e.path, id: e.id };
            const cod = codigoDe(e.name);
            if (cod)
                anotar(porCodigo, cod, a);
            const h = huellaDelNombre(e.name);
            if (h)
                anotar(porHuella, h, a);
        }
    }
    const ahora = new Date();
    for (const d of docs) {
        const doc = d.documento || {};
        const donde = (doc.codigo && porCodigo.get(doc.codigo)) || porHuella.get(huellaDe(d)) || [];
        let carpeta = carpetaMasAvanzada(donde.map((x) => x.carpeta));
        let archivo = donde.find((x) => x.carpeta === carpeta);
        const set = {};
        let motivo = "";
        // Firmada y todavía sin archivar: copia en «Alta temprana de Arca/Firmadas» con el mismo nombre (el patrón de siempre).
        if (carpeta === "firmados" && archivo && altaTemprana) {
            const destino = `${altaTemprana.replace(/\/$/, "")}/${SUBCARPETA_FIRMADAS}/${archivo.name}`;
            try {
                const copia = o.enSeco ? { path: destino, name: archivo.name, id: undefined } : await dbx.copiar(archivo.path, destino);
                set["documento.firmadaEl"] = doc.firmadaEl || ahora;
                set["documento.archivadaEn"] = copia.path;
                r.archivadas++;
                log(`[constancias] ${doc.codigo}: firmada, archivada en ${copia.path}`);
                carpeta = "alta_firmadas";
                archivo = { carpeta, name: copia.name, path: copia.path, id: copia.id };
            }
            catch (e) {
                log(`[constancias] ${doc.codigo}: firmada, pero no se pudo archivar (${e?.message || e}); se reintenta en la próxima pasada`);
            }
        }
        if (carpeta && archivo) {
            if (carpeta === "firmados" || carpeta === "alta_firmadas")
                set["documento.firmadaEl"] = set["documento.firmadaEl"] || doc.firmadaEl || ahora;
            set["documento.carpeta"] = carpeta;
            set["documento.path"] = archivo.path;
            set["documento.nombre"] = archivo.name;
            // Encontrada por la huella: si el archivo ya tiene código (se lo puso un renombre), queda anotado.
            if (!doc.codigo && codigoDe(archivo.name))
                set["documento.codigo"] = codigoDe(archivo.name);
            if (archivo.id && carpeta === "outbox")
                set["documento.dropboxId"] = archivo.id;
            set["documento.ubicadoEl"] = ahora;
            set["documento.noUbicadoDesde"] = null;
            const nuevo = siguienteEstado(d.estado, estadoPorCarpeta(carpeta, { esDeBaja: d.tipoConstancia === "baja" }));
            if (nuevo !== d.estado) {
                set.estado = nuevo;
                set.motivoRevision = null;
                motivo = `El documento está en ${ETIQUETA_CARPETA[carpeta]}`;
            }
        }
        else if (d.estado !== "archivada") {
            // No está en ninguna carpeta del circuito: se lo sigue por su id o su path.
            const ref = doc.dropboxId || doc.path;
            const aca = ref ? await dbx.ubicar(ref).catch(() => null) : null;
            if (aca && !aca.borrado) {
                set["documento.path"] = aca.path;
                set["documento.ubicadoEl"] = ahora;
                set["documento.noUbicadoDesde"] = null;
            }
            else if (!doc.noUbicadoDesde || d.estado !== "requiere_revision") {
                const cuando = doc.path ? await dbx.borradoEl(doc.path) : null;
                const lugar = doc.path ? doc.path.replace(/\/[^/]+$/, "") : "su carpeta";
                motivo = `Documento no ubicado: ${cuando ? `se borró de ${lugar} el ${fechaHoraArgentina(cuando)} y` : ""} no está en Outbox, Pendbox, Requested signatures ni «Alta temprana de Arca». No se envió a firmar.`;
                set.estado = siguienteEstado(d.estado, "requiere_revision");
                set.motivoRevision = motivo;
                set["documento.noUbicadoDesde"] = ahora;
                r.noUbicadas++;
            }
        }
        if (Object.keys(set).length === 0)
            continue;
        if (set.estado && set.estado !== d.estado) {
            r.cambiadas++;
            r.cambios.push({ clave: d.clave, de: d.estado, a: set.estado, motivo });
        }
        if (o.enSeco)
            continue;
        await ConstanciaArca.updateOne({ _id: d._id }, { $set: set, ...(set.estado && set.estado !== d.estado ? { $push: { historial: { estado: set.estado, fecha: ahora, motivo } } } : {}) });
    }
    return r;
}
export const ETIQUETA_CARPETA = {
    outbox: "Outbox",
    pendbox: "Pendbox",
    firmados: "Requested signatures",
    alta_firmadas: "Alta temprana de Arca / Firmadas",
    no_firmar: "Alta temprana de Arca / No firmar",
};
const aPantalla = (d, deducida = false) => ({
    clave: d.clave,
    cuil: d.cuil,
    nombre: d.nombre,
    userProjectId: String(d.userProjectId),
    contractIndex: d.contractIndex,
    empresaId: String(d.empresaId || ""),
    empresaRazonSocial: d.empresaRazonSocial || "",
    fechaAlta: d.fechaAlta,
    fechaBaja: d.fechaBaja || "",
    presentadaEl: d.presentadaEl ? new Date(d.presentadaEl).toISOString() : null,
    estado: d.estado,
    categoria: categoriaDe(d.estado, { firmada: !!d.documento?.firmadaEl }),
    mismoDia: !!d.mismoDia,
    tipoConstancia: d.tipoConstancia || null,
    intentos: (d.intentos || []).map((i) => ({ fecha: new Date(i.fecha).toISOString(), resultado: i.resultado, detalle: i.detalle, manual: !!i.manual })),
    proximoIntentoEl: d.proximoIntentoEl ? new Date(d.proximoIntentoEl).toISOString() : null,
    motivoRevision: d.motivoRevision || null,
    documento: d.documento?.codigo || d.documento?.path
        ? { codigo: d.documento.codigo || "", nombre: d.documento.nombre || "", path: d.documento.path || "", carpeta: d.documento.carpeta || null, etiquetaCarpeta: d.documento.carpeta ? ETIQUETA_CARPETA[d.documento.carpeta] || d.documento.carpeta : "", firmada: !!d.documento.firmadaEl }
        : null,
    ...(deducida ? { deducida: true } : {}),
});
/** Las constancias para las pantallas: las de la colección y, para las presentadas sin fila, lo que dice el contrato. SOLO LEE. */
export async function constanciasDeLaPantalla(tenantObjectId, o = {}) {
    const filtro = { tenantId: tenantObjectId };
    if (o.empresaId && Types.ObjectId.isValid(o.empresaId))
        filtro.empresaId = new Types.ObjectId(o.empresaId);
    const [docs, filas] = await Promise.all([ConstanciaArca.find(filtro).select("-historial").lean(), filasPresentadas(tenantObjectId, o)]);
    const conFila = new Set(docs.map((d) => d.clave));
    return [...docs.map((d) => aPantalla(d)), ...filas.filter((f) => !conFila.has(f.clave)).map((f) => aPantalla({ ...f, intentos: [], proximoIntentoEl: null, motivoRevision: null }, true))];
}
/** «24/10/2026 17:59» en hora argentina (el `toLocaleString` de Node daba «05:59» sin el p. m.). */
export function fechaHoraArgentina(iso) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
    return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}
