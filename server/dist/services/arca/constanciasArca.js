import { Types } from "mongoose";
import UserProject from "../../models/UserProject.js";
import { Project } from "../../models/Project.js";
import { User } from "../../models/User.js";
import { Company } from "../../models/Company.js";
import { ConstanciaArca } from "../../models/ConstanciaArca.js";
import { carpetaMasAvanzada, categoriaDe, claveConstancia, elegirParaCorrida, estadoPorCarpeta, puedeRetomarCircuito, puedeVolverABajarse, siguienteEstado, trasUnFallo, yaTieneConstancia, } from "./cicloConstancia.js";
import { borradoEl, copyEntry, downloadFileContent, listFolder, ubicarArchivo } from "../dropboxService.js";
import { evaluarConstancia, leerConstanciaTrabajador, leerConstanciaTrabajadorPdf } from "../../utils/constanciaTrabajadorPdf.js";
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
            /*
              En revisión se reconoce sólo una constancia DISTINTA de la que ya conoce la fila (otro código: se
              subió a mano). La misma es la del documento que se perdió: hasta el 07/11/2026 esto la devolvía a
              «bajada» en cada sincronización y el escaneo de Dropbox, a revisión, una y otra vez.
            */
            ops.push({
                updateOne: {
                    filter: { tenantId, clave: f.clave, $or: [{ estado: { $in: ["presentada", "constancia_pendiente"] } }, { estado: "requiere_revision", "documento.codigo": { $ne: f.documento?.codigo || "" } }] },
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
    await cerrarRedescarga(tenantObjectId, clave, ahora);
}
/** La re-descarga terminó (se bajó, o volvió a revisión): deja de mostrarse como «Re-descarga» y se puede volver a pedir. */
const cerrarRedescarga = (tenantObjectId, clave, ahora) => ConstanciaArca.updateOne({ tenantId: tenantObjectId, clave, "redescarga.enCurso": true }, { $set: { "redescarga.enCurso": false, "redescarga.terminadaEl": ahora } });
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
    if (r.estado === "requiere_revision")
        await cerrarRedescarga(tenantObjectId, clave, ahora);
    return r;
}
/*
  «VOLVER A BAJAR» UNA CONSTANCIA CUYO DOCUMENTO SE PERDIÓ (07/11/2026). La constancia se validó, se subió
  al Outbox y alguien la borró de ahí antes de enviarla a firmar (Tiero, Aquino y Veliz, 24/10). Para el
  sistema ya la tenía (`altaConstancia.validadaEl`), así que no volvía a la cola nunca. Volver a bajarla
  es: limpiar esa validación del contrato (queda anotada en el intento y en `redescarga`) y dejar la fila
  como recién presentada. Entra en la cola como nueva (primera en el cupo), y la que baje sigue el
  circuito de siempre: se valida (la de baja de una relación terminada vale), va a firma y se archiva.
*/
/** La fila y el contrato después de pedir volver a bajarla, o por qué no. Puro (lo prueba `constanciasArca.test.ts`). */
export function planDeRedescarga(fila, contrato, o) {
    const puede = puedeVolverABajarse(fila);
    if (puede.ok === false)
        return { ok: false, motivo: puede.motivo };
    if (!contrato || fechaIso(contrato.fecha_alta_contrato) !== fila.fechaAlta)
        return { ok: false, motivo: "El contrato ya no es el de esta constancia (se borró o cambió su fecha de alta)." };
    const anterior = contrato.altaConstancia?.validadaEl ? new Date(contrato.altaConstancia.validadaEl) : null;
    const doc = fila.documento || {};
    const intento = {
        fecha: o.ahora,
        resultado: "redescarga",
        detalle: `Re-descarga pedida: ${doc.fueraDelCircuito ? "el documento que apareció fuera del circuito no es la constancia de este contrato" : "documento no ubicado"}${doc.codigo ? ` (${doc.codigo})` : ""}.${anterior ? ` La constancia anterior se había validado el ${fechaHoraArgentina(anterior)}.` : ""}`,
        manual: true,
    };
    const { validadaEl: _, ...sinValidar } = contrato.altaConstancia || {};
    return {
        ok: true,
        intento,
        fila: {
            estado: "presentada",
            proximoIntentoEl: null,
            motivoRevision: null,
            documento: null,
            tipoConstancia: null,
            mismoDia: false,
            redescarga: { pedidaEl: o.ahora, porUsuarioId: o.porUsuarioId || null, validadaElAnterior: anterior, documentoAnterior: doc.codigo || doc.path ? { codigo: doc.codigo, nombre: doc.nombre, path: doc.path } : null, enCurso: true, terminadaEl: null },
            intentos: [...(fila.intentos || []), intento],
        },
        contrato: { ...contrato, altaConstancia: contrato.altaConstancia ? sinValidar : contrato.altaConstancia },
    };
}
/**
 * Pide volver a bajar esas constancias. Por cada una: la fila se toma con una escritura condicionada
 * (sigue en revisión por documento no ubicado), así dos pedidos a la vez no la encolan dos veces; recién
 * después se limpia la validación del contrato. Si el contrato no se pudo tocar, la fila vuelve a como
 * estaba. Antes de llamar, `actualizarUbicaciones` sobre estas filas: un documento que reapareció sale
 * de revisión y acá ya no se toca.
 */
export async function pedirRedescarga(tenantObjectId, claves, o = {}) {
    const ahora = o.ahora || new Date();
    const docs = await ConstanciaArca.find({ tenantId: tenantObjectId, clave: { $in: claves } }).select("-historial").lean();
    const porClave = new Map(docs.map((d) => [d.clave, d]));
    const out = [];
    for (const clave of [...new Set(claves)]) {
        const d = porClave.get(clave);
        if (!d) {
            out.push({ clave, nombre: "", cuil: "", pedida: false, motivo: "No está en el registro de constancias." });
            continue;
        }
        const base = { clave, nombre: d.nombre, cuil: d.cuil };
        const up = await UserProject.findById(d.userProjectId).select({ contracts: { $slice: [d.contractIndex, 1] } }).lean();
        const contrato = up?.contracts?.[0];
        const plan = planDeRedescarga(d, contrato, { ahora, porUsuarioId: o.porUsuarioId });
        if (plan.ok === false) {
            out.push({ ...base, pedida: false, motivo: plan.motivo });
            continue;
        }
        const { intentos: _, ...set } = plan.fila;
        const tomada = await ConstanciaArca.updateOne({ _id: d._id, estado: "requiere_revision", $or: [{ "documento.noUbicadoDesde": { $ne: null } }, { "documento.fueraDelCircuito": true }] }, { $set: set, $push: { intentos: plan.intento, historial: { estado: "presentada", fecha: ahora, motivo: plan.intento.detalle } } });
        if (tomada.modifiedCount === 0) {
            out.push({ ...base, pedida: false, motivo: "Ya se pidió volver a bajarla, o el documento reapareció." });
            continue;
        }
        const enContrato = `contracts.${d.contractIndex}`;
        const limpio = await UserProject.updateOne({ _id: d.userProjectId, [`${enContrato}.fecha_alta_contrato`]: contrato.fecha_alta_contrato }, { $unset: { [`${enContrato}.altaConstancia.validadaEl`]: "" } });
        if (limpio.matchedCount === 0) {
            await ConstanciaArca.updateOne({ _id: d._id }, { $set: { estado: d.estado, documento: d.documento, motivoRevision: d.motivoRevision, tipoConstancia: d.tipoConstancia, mismoDia: d.mismoDia, redescarga: d.redescarga ?? null }, $pull: { intentos: { fecha: ahora, resultado: "redescarga" } }, $push: { historial: { estado: d.estado, fecha: new Date(), motivo: "Re-descarga cancelada: el contrato cambió mientras se pedía" } } });
            out.push({ ...base, pedida: false, motivo: "El contrato cambió mientras se pedía: no se tocó nada." });
            continue;
        }
        out.push({ ...base, pedida: true, motivo: plan.intento.detalle || "" });
    }
    return out;
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
    const r = { revisadas: docs.length, cambiadas: 0, archivadas: 0, noUbicadas: 0, fueraDelCircuito: 0, cambios: [] };
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
            set["documento.fueraDelCircuito"] = false;
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
                /*
                  EXISTE, PERO FUERA DEL CIRCUITO (se movió del Outbox a otra carpeta). No es «en Outbox» ni
                  «no ubicado»: pasa a revisión con dónde está, para «Retomar el circuito». Hasta el 07/11/2026
                  acá sólo se anotaba el path y la fila quedaba en revisión con el motivo viejo («no ubicado»),
                  sin ninguna acción que la sacara.
                */
                if (!doc.fueraDelCircuito || doc.path !== aca.path || d.estado !== "requiere_revision") {
                    motivo = `El documento apareció en ${aca.path.replace(/\/[^/]+$/, "") || "/"}, fuera del circuito de firma: no está en Outbox, Pendbox, Requested signatures ni «Alta temprana de Arca». «Retomar el circuito» lo vuelve a poner en el Outbox.`;
                    set["documento.path"] = aca.path;
                    if (aca.name)
                        set["documento.nombre"] = aca.name;
                    if (aca.id)
                        set["documento.dropboxId"] = aca.id;
                    set["documento.carpeta"] = null;
                    set["documento.ubicadoEl"] = ahora;
                    set["documento.noUbicadoDesde"] = null;
                    set["documento.fueraDelCircuito"] = true;
                    set.estado = siguienteEstado(d.estado, "requiere_revision");
                    set.motivoRevision = motivo;
                    r.fueraDelCircuito++;
                }
            }
            else if (!doc.noUbicadoDesde || d.estado !== "requiere_revision") {
                const cuando = doc.path ? await dbx.borradoEl(doc.path) : null;
                const lugar = doc.path ? doc.path.replace(/\/[^/]+$/, "") : "su carpeta";
                motivo = `Documento no ubicado: ${cuando ? `se borró de ${lugar} el ${fechaHoraArgentina(cuando)} y` : ""} no está en Outbox, Pendbox, Requested signatures ni «Alta temprana de Arca». No se envió a firmar.`;
                set.estado = siguienteEstado(d.estado, "requiere_revision");
                set.motivoRevision = motivo;
                set["documento.noUbicadoDesde"] = ahora;
                set["documento.fueraDelCircuito"] = false;
                r.noUbicadas++;
            }
        }
        if (Object.keys(set).length === 0)
            continue;
        const otroEstado = !!set.estado && set.estado !== d.estado;
        if (otroEstado)
            r.cambiadas++;
        // Un motivo nuevo cuenta aunque siga en revisión: es lo que se ve en pantalla.
        if (otroEstado || (motivo && set.motivoRevision === motivo && motivo !== d.motivoRevision)) {
            r.cambios.push({ clave: d.clave, de: d.estado, a: set.estado || d.estado, motivo, ...(set["documento.path"] ? { path: set["documento.path"] } : {}), ...("documento.fueraDelCircuito" in set ? { fueraDelCircuito: !!set["documento.fueraDelCircuito"] } : {}) });
        }
        if (o.enSeco)
            continue;
        const anotar = otroEstado || (!!motivo && motivo !== d.motivoRevision);
        await ConstanciaArca.updateOne({ _id: d._id }, { $set: set, ...(anotar ? { $push: { historial: { estado: set.estado || d.estado, fecha: ahora, motivo } } } : {}) });
    }
    return r;
}
/**
 * «VOLVER A BAJAR», completo: primero se mira en Dropbox dónde están hoy esos documentos (uno que
 * reapareció sale de revisión y no se toca) y después se pide la re-descarga de lo que sigue perdido.
 * Sin Dropbox conectado no se puede mirar: se pide igual (la constancia nueva tampoco tendría a dónde ir,
 * pero queda en el contrato).
 */
export async function volverABajar(tenantObjectId, claves, o) {
    if (o.cfg && claves.length > 0) {
        const docs = await ConstanciaArca.find({ tenantId: tenantObjectId, clave: { $in: claves }, estado: "requiere_revision", documento: { $ne: null } }).select("clave cuil empresaCuit fechaAlta estado documento tipoConstancia").lean();
        if (docs.length > 0)
            await actualizarUbicaciones(String(tenantObjectId), o.cfg, { docs, log: o.log });
    }
    return pedirRedescarga(tenantObjectId, claves, { porUsuarioId: o.porUsuarioId });
}
export async function retomarCircuito(tenantId, cfg, o) {
    const guardar = o.guardar ?? guardarEnLaBase;
    const dbx = o.dropbox ?? { copiar: (desde, hacia) => copyEntry(tenantId, cfg, desde, hacia), descargar: (path) => downloadFileContent(tenantId, cfg, path) };
    const leer = o.leer ?? ((b) => leerConstanciaTrabajadorPdf(b).catch(() => leerConstanciaTrabajador("")));
    const log = o.log || (() => { });
    const { outbox, altaTemprana } = o.carpetas ?? { outbox: await resolverCarpetaPorProposito("outbox"), altaTemprana: await resolverCarpetaPorProposito("alta_temprana") };
    const out = [];
    for (const d of o.docs) {
        const base = { clave: d.clave, nombre: d.nombre || "", cuil: d.cuil };
        const puede = puedeRetomarCircuito(d);
        if (puede.ok === false) {
            out.push({ ...base, resultado: "salteada", motivo: puede.motivo });
            continue;
        }
        const doc = d.documento;
        const vaAFirma = doc.vaAFirma !== false;
        const carpetaDestino = vaAFirma ? outbox : altaTemprana ? `${altaTemprana.replace(/\/$/, "")}/No firmar` : null;
        if (!carpetaDestino) {
            out.push({ ...base, resultado: "salteada", motivo: `No hay una carpeta de «${vaAFirma ? "Outbox" : "Alta temprana de ARCA"}» configurada.` });
            continue;
        }
        // ¿Es la constancia de esta presentación? La misma validación que al bajarla de ARCA.
        const ev = evaluarConstancia(await leer(await dbx.descargar(doc.path)), { cuil: d.cuil, empleadorCuit: d.empresaCuit, fechaInicio: d.fechaAlta, fechaBaja: d.fechaBaja });
        if (ev.problemas.length > 0) {
            out.push({ ...base, resultado: "no_sirve", motivo: `El PDF de ${doc.path} no es la constancia de este contrato: ${ev.problemas.join(" ")}`, desde: doc.path });
            continue;
        }
        const nombre = doc.nombre || doc.path.split("/").pop();
        const hacia = `${carpetaDestino.replace(/\/$/, "")}/${nombre}`;
        const carpeta = vaAFirma ? "outbox" : "no_firmar";
        const estado = siguienteEstado(d.estado, estadoPorCarpeta(carpeta, { esDeBaja: ev.deBaja }));
        const motivo = `Circuito retomado: el documento estaba en ${doc.path.replace(/\/[^/]+$/, "")} y se copió a ${ETIQUETA_CARPETA[carpeta]}.`;
        if (o.enSeco) {
            out.push({ ...base, resultado: "retomada", motivo, desde: doc.path, hacia, estado });
            continue;
        }
        // Se toma la fila antes de copiar: dos pedidos a la vez no dejan dos copias en el Outbox.
        if (!(await guardar.tomar(d, { estado, tipoConstancia: ev.deBaja ? "baja" : "alta", mismoDia: ev.mismoDia, carpeta, motivo }))) {
            out.push({ ...base, resultado: "salteada", motivo: "Ya se retomó el circuito, o el documento volvió solo." });
            continue;
        }
        try {
            const copia = await dbx.copiar(doc.path, hacia);
            await guardar.copiada(d, copia);
            log(`[constancias] ${doc.codigo || d.clave}: ${motivo}`);
            out.push({ ...base, resultado: "retomada", motivo, desde: doc.path, hacia: copia.path, estado });
        }
        catch (e) {
            await guardar.revertir(d, `No se pudo copiar a ${ETIQUETA_CARPETA[carpeta]}: ${e?.message || e}`);
            out.push({ ...base, resultado: "salteada", motivo: `No se pudo copiar a ${carpetaDestino}: ${e?.message || e}` });
        }
    }
    return out;
}
const guardarEnLaBase = {
    tomar: async (d, c) => {
        const ahora = new Date();
        const r = await ConstanciaArca.updateOne({ _id: d._id, estado: "requiere_revision", "documento.fueraDelCircuito": true }, { $set: { estado: c.estado, motivoRevision: null, tipoConstancia: c.tipoConstancia, mismoDia: c.mismoDia, "documento.fueraDelCircuito": false, "documento.carpeta": c.carpeta, "documento.ubicadoEl": ahora }, $push: { historial: { estado: c.estado, fecha: ahora, motivo: c.motivo } } });
        return r.modifiedCount > 0;
    },
    copiada: async (d, copia) => {
        await ConstanciaArca.updateOne({ _id: d._id }, { $set: { "documento.path": copia.path, "documento.nombre": copia.name, ...(copia.id ? { "documento.dropboxId": copia.id } : {}) } });
        // El contrato dice a dónde se subió su constancia: ahora es la copia.
        const k = `contracts.${d.contractIndex}`;
        await UserProject.updateOne({ _id: d.userProjectId, [`${k}.fecha_alta_contrato`]: d.fechaAlta }, { $set: { [`${k}.altaConstancia.archivadaEn`]: copia.path, [`${k}.altaConstancia.enviadaComo`]: copia.name, ...(copia.id ? { [`${k}.altaConstancia.dropboxId`]: copia.id } : {}) } });
    },
    revertir: async (d, motivo) => {
        await ConstanciaArca.updateOne({ _id: d._id }, { $set: { estado: d.estado, motivoRevision: d.motivoRevision, tipoConstancia: d.tipoConstancia ?? null, mismoDia: !!d.mismoDia, "documento.fueraDelCircuito": true, "documento.carpeta": null }, $push: { historial: { estado: d.estado, fecha: new Date(), motivo } } });
    },
};
/**
 * «Retomar el circuito», completo: las que no sirven (el PDF no es la constancia) se vuelven a bajar.
 * Primero se mira dónde están hoy (si volvió solo al circuito, no se toca).
 */
export async function retomarElCircuito(tenantObjectId, claves, o) {
    if (!o.cfg)
        throw new Error("Dropbox no está conectado: no se puede copiar el documento.");
    const filtro = { tenantId: tenantObjectId, clave: { $in: claves }, estado: "requiere_revision", documento: { $ne: null } };
    const antes = await ConstanciaArca.find(filtro).select("clave cuil empresaCuit fechaAlta estado documento tipoConstancia").lean();
    if (antes.length > 0)
        await actualizarUbicaciones(String(tenantObjectId), o.cfg, { docs: antes, log: o.log });
    const docs = await ConstanciaArca.find({ tenantId: tenantObjectId, clave: { $in: claves } }).select("-historial").lean();
    const r = await retomarCircuito(String(tenantObjectId), o.cfg, { docs, log: o.log });
    const sinServir = r.filter((x) => x.resultado === "no_sirve").map((x) => x.clave);
    if (sinServir.length > 0) {
        const re = await pedirRedescarga(tenantObjectId, sinServir, { porUsuarioId: o.porUsuarioId });
        for (const x of r) {
            const y = re.find((z) => z.clave === x.clave);
            if (y)
                x.motivo = `${x.motivo} ${y.pedida ? "Se vuelve a bajar de ARCA: quedó en la cola como «Re-descarga»." : `No se pudo re-encolar: ${y.motivo}`}`;
        }
    }
    const pedidas = new Set(claves);
    for (const c of pedidas)
        if (!docs.some((d) => d.clave === c))
            r.push({ clave: c, nombre: "", cuil: "", resultado: "salteada", motivo: "No está en el registro de constancias." });
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
    noUbicado: d.estado === "requiere_revision" && !!d.documento?.noUbicadoDesde,
    fueraDelCircuito: puedeRetomarCircuito({ estado: d.estado, documento: d.documento }).ok,
    redescarga: d.redescarga?.pedidaEl ? { pedidaEl: new Date(d.redescarga.pedidaEl).toISOString(), enCurso: !!d.redescarga.enCurso && !yaTieneConstancia(d.estado), codigoAnterior: d.redescarga.documentoAnterior?.codigo || "" } : null,
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
/**
 * LA CONSTANCIA DE CADA CONTRATO, para el padrón de Contratados (09/11/2026: «ver en un solo lugar qué está
 * dado de alta en ARCA y qué no»). Clave `${userProjectId}:${contractIndex}`; si un contrato tiene más de
 * una fila, la última tocada. SOLO LEE.
 */
export async function constanciasPorContrato(tenantObjectId, userProjectIds) {
    const ids = [...new Set(userProjectIds)].filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
    const porContrato = new Map();
    if (ids.length === 0)
        return porContrato;
    const docs = await ConstanciaArca.find({ tenantId: tenantObjectId, userProjectId: { $in: ids } }).select("-historial").sort({ updatedAt: 1 }).lean();
    for (const d of docs)
        porContrato.set(`${d.userProjectId}:${d.contractIndex}`, aPantalla(d));
    return porContrato;
}
/** «24/10/2026 17:59» en hora argentina (el `toLocaleString` de Node daba «05:59» sin el p. m.). */
export function fechaHoraArgentina(iso) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
    return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}
