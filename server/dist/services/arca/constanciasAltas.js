import { Types } from "mongoose";
import { pathToFileURL } from "node:url";
import fs from "fs";
import UserProject from "../../models/UserProject.js";
import { Project } from "../../models/Project.js";
import { User } from "../../models/User.js";
import { Company } from "../../models/Company.js";
import { abrirSesionArca, credencialesDe, guardarSesion } from "./navegador.js";
import { MOTOR, MOTOR_ALTAS } from "./motor.js";
import { soltarCandado, tomarCandado } from "./candadoArca.js";
import { guardarPdfDeAlta, registrarAltaDeContrato } from "../altaTempranaService.js";
import { anotarDescarga, anotarFallo, colaDeDescarga } from "./constanciasArca.js";
import { ArcaDescargaLog } from "../../models/ArcaDescargaLog.js";
const bajaDe = (c) => (/^\d{4}-\d{2}-\d{2}/.test(String(c?.fecha_baja_contrato || "")) ? String(c.fecha_baja_contrato).slice(0, 10) : "");
/** Una por tenant, en memoria, como las demás corridas de ARCA. */
const descargas = new Map();
export const descargaConstanciasDe = (tenantId) => descargas.get(tenantId);
const digitos = (v) => String(v ?? "").replace(/\D/g, "");
const pausa = () => new Promise((r) => setTimeout(r, 1500 + Math.floor(Math.random() * 1500)));
/** Los contratos de esa empleadora presentados en ARCA que todavía no tienen su constancia validada. */
export async function pendientesDeConstancia(tenantObjectId, empresaId) {
    if (!Types.ObjectId.isValid(empresaId))
        return [];
    const proyectos = await Project.find({ tenantId: tenantObjectId }).select("_id").lean();
    const ups = await UserProject.find({
        projectId: { $in: proyectos.map((p) => p._id) },
        contracts: {
            $elemMatch: {
                empresaContratoId: { $in: [new Types.ObjectId(empresaId), empresaId] },
                "altaArcaPresentada.resultado": "presentada",
            },
        },
    })
        .select("userId contracts.empresaContratoId contracts.altaArcaPresentada contracts.altaConstancia contracts.fecha_alta_contrato contracts.fecha_baja_contrato")
        .lean();
    const usuarios = await User.find({
        _id: { $in: ups.map((u) => u.userId) },
        tenantId: tenantObjectId,
    })
        .select("firstName lastName metadata.cuit")
        .lean();
    const porId = new Map(usuarios.map((u) => [String(u._id), u]));
    const out = [];
    for (const up of ups) {
        (up.contracts || []).forEach((c, i) => {
            if (String(c.empresaContratoId || "") !== empresaId || c.altaArcaPresentada?.resultado !== "presentada" || c.altaConstancia?.validadaEl)
                return;
            const u = porId.get(String(up.userId));
            const cuil = digitos(u?.metadata?.cuit);
            const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(c.fecha_alta_contrato || ""));
            if (cuil.length !== 11 || !m)
                return;
            out.push({
                userProjectId: String(up._id),
                contractIndex: i,
                userId: String(up.userId),
                cuil,
                nombre: `${u?.firstName || ""} ${u?.lastName || ""}`.trim(),
                fechaInicio: `${m[3]}${m[2]}${m[1]}`,
                fechaAlta: `${m[1]}-${m[2]}-${m[3]}`,
                presentadaEl: c.altaArcaPresentada?.fecha ? new Date(c.altaArcaPresentada.fecha).toISOString() : "",
                empresaId,
                fechaBaja: bajaDe(c),
            });
        });
    }
    return out;
}
/** Los pendientes de constancia de TODAS las empleadoras con CUIT, con la razón social de cada una. */
export async function pendientesDeConstanciaTodas(tenantObjectId) {
    // UNA consulta para todas las empleadoras: por empresa del catálogo eran N recorridas de users_&_projects y la pantalla tardaba.
    const [empresas, proyectos] = await Promise.all([Company.find({}).select("razonSocial cuit").lean(), Project.find({ tenantId: tenantObjectId }).select("_id").lean()]);
    const empresaPorId = new Map(empresas.filter((e) => digitos(e.cuit).length === 11).map((e) => [String(e._id), String(e.razonSocial || "")]));
    const ups = await UserProject.find({
        projectId: { $in: proyectos.map((p) => p._id) },
        contracts: { $elemMatch: { "altaArcaPresentada.resultado": "presentada" } },
    })
        .select("userId contracts.empresaContratoId contracts.altaArcaPresentada contracts.altaConstancia contracts.fecha_alta_contrato contracts.fecha_baja_contrato")
        .lean();
    const usuarios = await User.find({ _id: { $in: ups.map((u) => u.userId) }, tenantId: tenantObjectId }).select("firstName lastName metadata.cuit").lean();
    const porId = new Map(usuarios.map((u) => [String(u._id), u]));
    const out = [];
    for (const up of ups) {
        (up.contracts || []).forEach((c, i) => {
            const empresaId = String(c.empresaContratoId || "");
            if (!empresaPorId.has(empresaId) || c.altaArcaPresentada?.resultado !== "presentada" || c.altaConstancia?.validadaEl)
                return;
            const u = porId.get(String(up.userId));
            const cuil = digitos(u?.metadata?.cuit);
            // Hasta el 07/11/2026 decía `(d{4})` sin la barra (se perdió en un heredoc): no matcheaba nunca y la pantalla de Descargas salía vacía.
            const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(c.fecha_alta_contrato || ""));
            if (cuil.length !== 11 || !m)
                return;
            out.push({
                userProjectId: String(up._id),
                contractIndex: i,
                userId: String(up.userId),
                cuil,
                nombre: `${u?.firstName || ""} ${u?.lastName || ""}`.trim(),
                fechaInicio: `${m[3]}${m[2]}${m[1]}`,
                fechaAlta: `${m[1]}-${m[2]}-${m[3]}`,
                presentadaEl: c.altaArcaPresentada?.fecha ? new Date(c.altaArcaPresentada.fecha).toISOString() : "",
                empresaId,
                empresaRazonSocial: empresaPorId.get(empresaId) || "",
                fechaBaja: bajaDe(c),
            });
        });
    }
    return out;
}
export async function arrancarDescargaConstancias(o) {
    const { tenantId, tenantObjectId } = o;
    // El candado ANTES de cualquier await, como en las altas: dos clicks no arrancan dos corridas.
    tomarCandado(tenantId, "constancias");
    try {
        const empresa = Types.ObjectId.isValid(o.empresaId) ? await Company.findById(o.empresaId).select("cuit razonSocial").lean() : null;
        const cuit = digitos(empresa?.cuit);
        if (!empresa || cuit.length !== 11)
            throw new Error("Elegí la pestaña de UNA empresa con CUIT: las constancias se bajan logueado como esa empleadora.");
        const todas = await pendientesDeConstancia(tenantObjectId, o.empresaId);
        if (todas.length === 0)
            throw new Error("No hay altas presentadas de esa empleadora esperando su constancia.");
        /*
          QUÉ SE PIDE LO DECIDE `constancias_arca` (07/11/2026). La automática: primero las nunca intentadas,
          después los reintentos vencidos, con el tope; lo que está en revisión o esperando su reintento no
          entra ni ocupa lugar. La forzada: lo elegido, aunque esté esperando o en revisión (es el
          «Reintentar»). En las dos, lo que ya tiene constancia no se pide nunca.
        */
        const cola = await colaDeDescarga(tenantObjectId, o.empresaId, { ahora: new Date(), tope: o.soloItems ? undefined : o.maximo, soloItems: o.soloItems, encadenada: !!o.encadenada });
        const porContrato = new Map(todas.map((p) => [`${p.userProjectId}:${p.contractIndex}`, p]));
        const pendientes = cola.elegidas.flatMap((e) => {
            const p = porContrato.get(`${e.userProjectId}:${e.contractIndex}`);
            return p ? [{ ...p, clave: e.clave, manual: e.manual }] : [];
        });
        if (pendientes.length === 0)
            throw new Error(o.encadenada ? "Las altas recién presentadas ya tienen su constancia o esperan su reintento." : o.soloItems ? "Las altas pedidas ya tienen su constancia o no son de esa empleadora." : "No hay constancias para pedir hoy: las que faltan esperan su reintento o están en revisión.");
        const cred = await credencialesDe(tenantId);
        if (!cred)
            throw new Error("Faltan las credenciales de ARCA. Cargalas en Configuración → ARCA → Conexión.");
        const d = {
            empresaId: o.empresaId,
            empresaRazonSocial: String(empresa.razonSocial || ""),
            total: pendientes.length,
            eventos: [],
            terminada: false,
            arrancadaEl: new Date(),
            origen: o.encadenada ? "encadenada" : o.automatica ? "barrido" : "manual",
            presentacionTerminadaEl: o.encadenada?.terminadaEl,
        };
        descargas.set(tenantId, d);
        void correr({ d, pendientes, cuit, cred, ...o });
        return { total: pendientes.length, pendientes: cola.total, fuera: cola.fuera };
    }
    catch (e) {
        soltarCandado(tenantId, "constancias");
        throw e;
    }
}
async function correr(o) {
    const { d, pendientes, tenantId, tenantObjectId } = o;
    const emitir = (e) => d.eventos.push(e);
    let sesion = null;
    let fallo = false;
    let listas = 0;
    // De ALTA (la relación seguía activa) o de BAJA (ya terminada): la métrica del encadenamiento.
    let deAlta = 0;
    let deBaja = 0;
    try {
        emitir({ tipo: "abriendo" });
        sesion = await abrirSesionArca(tenantId, o.cred);
        emitir({ tipo: "sesion", seLogueo: sesion.seLogueo });
        const { aceptarSelectorDeCuit } = (await import(pathToFileURL(MOTOR).href));
        const motor = (await import(pathToFileURL(MOTOR_ALTAS).href));
        let page = sesion.page;
        // Por el selector se entra UNA vez: volver a él estando adentro cierra la sesión de ARCA.
        if (!(await aceptarSelectorDeCuit(page, o.cuit)))
            throw new Error(`No pude elegir la empleadora ${o.cuit} en ARCA (¿el usuario delegado la tiene?).`);
        const base = page.url().split("/app/")[0];
        /*
          LA PESTAÑA SE CAE A VECES AL SALIR DE LA PANTALLA DEL SELECTOR («Page crashed»), vaya a donde
          vaya: pasó yendo a Consultas y pasó yendo a Registrar Nuevas Altas. La sesión y la empleadora
          elegida viven en el navegador (cookies) y en ARCA, no en la pestaña: se abre OTRA pestaña del
          mismo navegador y se sigue desde ahí. No se vuelve a loguear ni se toca el selector.
    
          Es solo lectura, así que reintentar acá no repite nada en el organismo. Hasta 3 pestañas.
        */
        const seCayo = (e) => /crash|Target (page|closed)|page has been closed/i.test(String(e?.message || e));
        let pestañasNuevas = 0;
        const otraPestaña = async () => {
            if (++pestañasNuevas > 3)
                throw new Error("La pestaña de ARCA se cayó cuatro veces seguidas. Probá de nuevo en unos minutos.");
            await page.close().catch(() => { });
            page = await sesion.ctx.newPage();
            await page.goto(`${base}/app/Contribuyente/RelacionLaboral/Altas.aspx`, {
                waitUntil: "domcontentloaded",
            });
        };
        const conPestañaViva = async (hacer) => {
            for (;;) {
                try {
                    return await hacer();
                }
                catch (e) {
                    if (!seCayo(e))
                        throw e;
                    // Si la pestaña nueva también se cae al abrir, se vuelve a intentar (hasta el tope).
                    for (;;) {
                        try {
                            await otraPestaña();
                            break;
                        }
                        catch (e2) {
                            if (!seCayo(e2))
                                throw e2;
                        }
                    }
                }
            }
        };
        // Se le da un respiro a la pantalla del selector antes de salir de ella, y recién después se navega.
        await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => { });
        await page.waitForTimeout(1500).catch(() => { });
        await conPestañaViva(() => motor.entrarARelacionesLaborales({ page }));
        /*
          SI ARCA NO ENTREGA EL PDF A TIEMPO, SE REINTENTA DESPUÉS. La impresora arma la constancia del
          lado de ARCA y a veces no contesta (pasó con la segunda persona de la primera corrida, con la
          primera ya bajada). No se insiste en el momento: se sigue con los demás y los que quedaron se
          vuelven a pedir al final, en una pestaña nueva y después de una pausa. Hasta 3 vueltas. Es
          solo lectura: repetir la consulta no repite nada en el organismo.
        */
        const VUELTAS = 3;
        let yaSeDescargoEnEstaPestaña = false;
        let cola = pendientes;
        for (let vuelta = 1; cola.length > 0 && vuelta <= VUELTAS; vuelta++) {
            const paraDespues = [];
            if (vuelta > 1) {
                await new Promise((r) => setTimeout(r, 15_000));
                // Pestaña nueva: la anterior pudo quedar a mitad de una descarga que nunca llegó.
                pestañasNuevas = 0;
                await otraPestaña().catch(() => { });
            }
            for (const [i, p] of cola.entries()) {
                if (i > 0)
                    await pausa();
                /*
                  UNA PESTAÑA POR PERSONA. En una misma pestaña la PRIMERA descarga sale enseguida y la segunda
                  se queda colgada hasta agotar la espera (visto dos corridas seguidas: baja la primera, cuelga
                  la siguiente). El navegador frena las descargas automáticas repetidas de un mismo sitio en la
                  misma pestaña; en una pestaña nueva la cuenta arranca de cero. La sesión y la empleadora son
                  del navegador, no de la pestaña, así que no hay que volver a entrar.
                */
                if (yaSeDescargoEnEstaPestaña) {
                    pestañasNuevas = 0;
                    await conPestañaViva(() => otraPestaña());
                }
                yaSeDescargoEnEstaPestaña = true;
                emitir({
                    tipo: "persona",
                    cuil: p.cuil,
                    nombre: p.nombre,
                    estado: "descargando",
                });
                // Cada intento que no trae la constancia queda anotado: cuenta, espera su reintento o pasa a revisión.
                const anotar = async (f) => {
                    if (!p.clave)
                        return "";
                    const r = await anotarFallo(tenantObjectId, p.clave, f, { manual: p.manual, origen: d.origen }).catch((e) => {
                        console.error(`[CONSTANCIAS-ARCA] no pude anotar el intento de ${p.cuil}:`, e?.message || e);
                        return null;
                    });
                    return !r ? "" : r.estado === "requiere_revision" ? " Pasa a revisión." : ` Se reintenta${r.proximoIntentoEl ? ` el ${new Date(r.proximoIntentoEl).toLocaleDateString("es-AR")}` : ""}.`;
                };
                try {
                    const r = await conPestañaViva(() => motor.descargarConstanciaDeAlta({
                        page,
                        cuil: p.cuil,
                        fechaInicio: p.fechaInicio,
                        // Con la baja, entre dos relaciones del mismo inicio se elige la que termina cuando el contrato.
                        fechaFin: p.fechaBaja ? `${p.fechaBaja.slice(8, 10)}${p.fechaBaja.slice(5, 7)}${p.fechaBaja.slice(0, 4)}` : "",
                    }));
                    if (r.resultado !== "descargada" || !r.pdf) {
                        // Lo que la pantalla tenía queda en el log del servidor: con eso se ajusta el lector.
                        console.warn(`[CONSTANCIAS-ARCA] ${p.cuil}: ${r.resultado} — ${r.detalle || ""}`);
                        const detalle = r.detalle || "ARCA no mostró la constancia de esa relación.";
                        const sigue = await anotar({ resultado: r.resultado === "ambigua" ? "ambigua" : "sin_constancia", detalle, sinArreglo: r.sinArreglo === true });
                        emitir({
                            tipo: "persona",
                            cuil: p.cuil,
                            nombre: p.nombre,
                            estado: "sin_constancia",
                            detalle: `${detalle}${sigue}`,
                        });
                        continue;
                    }
                    const buffer = Buffer.from(r.pdf);
                    const up = await UserProject.findById(p.userProjectId);
                    if (!up || !up.contracts[p.contractIndex])
                        throw new Error("El contrato ya no existe.");
                    const guardado = await guardarPdfDeAlta({
                        tenantCarpeta: o.tenantCarpeta,
                        userId: p.userId,
                        buffer,
                    });
                    const res = await registrarAltaDeContrato({
                        tenantObjectId,
                        up,
                        idx: p.contractIndex,
                        userId: p.userId,
                        buffer,
                        altaDocumentoUrl: guardado.url,
                        altaDocumentoNombre: `Constancia de alta ${p.cuil}.pdf`,
                        exigirConstancia: true,
                        origen: { modo: o.automatica ? "automatica" : "descarga", usuarioId: o.usuarioId || null },
                    });
                    if ("problemas" in res) {
                        fs.promises.unlink(guardado.ruta).catch(() => { });
                        const sigue = await anotar({ resultado: "rechazada", detalle: res.problemas.join(" ") });
                        emitir({
                            tipo: "persona",
                            cuil: p.cuil,
                            nombre: p.nombre,
                            estado: "rechazada",
                            detalle: `${res.problemas.join(" ")}${sigue}`,
                        });
                        continue;
                    }
                    listas++;
                    const tipoConstancia = res.constancia?.deBaja ? "baja" : "alta";
                    if (tipoConstancia === "baja")
                        deBaja++;
                    else
                        deAlta++;
                    if (p.clave) {
                        await anotarDescarga(tenantObjectId, p.clave, { tipo: tipoConstancia, mismoDia: !!res.constancia?.mismoDia, vaAFirma: res.ruteo?.vaAFirma !== false, archivadaEn: res.ruteo?.archivadaEn, nombre: res.ruteo?.nombre, dropboxId: res.ruteo?.dropboxId, manual: p.manual, origen: d.origen }).catch((e) => console.error(`[CONSTANCIAS-ARCA] no pude anotar la constancia de ${p.cuil}:`, e?.message || e));
                    }
                    const destino = !res.ruteo?.archivadaEn ? res.ruteo?.aviso || "Quedó cargada en el contrato." : res.ruteo.vaAFirma ? "En el Outbox, lista para enviar a firmar." : "Archivada en «Alta temprana de Arca / No firmar».";
                    const textoDeBaja = res.constancia?.deBaja ? (res.constancia.mismoDia ? "Constancia de la relación (alta y baja el mismo día). " : "Constancia de la relación ya terminada. ") : "";
                    emitir({
                        tipo: "persona",
                        cuil: p.cuil,
                        nombre: p.nombre,
                        estado: "lista",
                        tipoConstancia,
                        detalle: `${textoDeBaja}${destino}${res.ruteo?.estado ? ` El contrato pasó a «${res.ruteo.estado}».` : ""}`,
                    });
                }
                catch (e) {
                    const mensaje = String(e?.message || e);
                    // ARCA no entregó el archivo: no es un error de la persona. Queda para la vuelta siguiente.
                    if (/Timeout.*download|waiting for event "download"/is.test(mensaje)) {
                        // Lo que pasó después del click (ver `imprimirConstancia`): es con lo que se arregla si vuelve a pasar.
                        console.warn(`[CONSTANCIAS-ARCA] ${p.cuil} (vuelta ${vuelta}): ${mensaje}`);
                        const queVio = mensaje.split("Después del click: ")[1] || "";
                        const quedanVueltas = vuelta < VUELTAS;
                        if (quedanVueltas)
                            paraDespues.push(p);
                        // Las vueltas de esta corrida son UN intento: se anota recién cuando se acabaron.
                        const sigue = quedanVueltas ? "" : await anotar({ resultado: "sin_constancia", detalle: `ARCA no entregó el PDF en ${VUELTAS} pedidos seguidos.` });
                        emitir({
                            tipo: "persona",
                            cuil: p.cuil,
                            nombre: p.nombre,
                            estado: "sin_constancia",
                            detalle: quedanVueltas ? "ARCA no entregó el PDF a tiempo. Se vuelve a pedir al final." : `ARCA no entregó el PDF en ${VUELTAS} pedidos. El alta sigue registrada.${sigue}${queVio ? ` Después del click: ${queVio}` : ""}`,
                        });
                        continue;
                    }
                    // Sesión caída o pantalla que no es: no es de la persona, no le cuenta como intento, y no tiene sentido seguir con los demás.
                    const deLaSesion = /sesi[oó]n|No llegu[eé]|Target closed|browser has been closed|crash/i.test(mensaje);
                    const sigue = deLaSesion ? "" : await anotar({ resultado: "error", detalle: mensaje });
                    emitir({
                        tipo: "persona",
                        cuil: p.cuil,
                        nombre: p.nombre,
                        estado: "error",
                        detalle: `${mensaje}${sigue}`,
                    });
                    if (deLaSesion)
                        throw e;
                }
            }
            cola = paraDespues;
        }
        emitir({ tipo: "fin", listas, total: pendientes.length });
    }
    catch (e) {
        fallo = true;
        emitir({ tipo: "fallo", mensaje: String(e?.message || e) });
    }
    finally {
        const s = sesion;
        if (s && !fallo)
            await guardarSesion(tenantId, s.ctx).catch(() => { });
        await s?.browser.close().catch(() => { });
        soltarCandado(tenantId, "constancias");
        d.terminada = true;
        /*
          EL REGISTRO DE LA CORRIDA (11/11/2026): el historial de Descargas y la métrica alta/baja. Lo último
          que se supo de cada persona; el estado de cada constancia sigue en `constancias_arca`. Si no se
          puede guardar, la descarga ya está hecha: queda el log del servidor.
        */
        const porCuil = new Map();
        for (const e of d.eventos)
            if (e.tipo === "persona")
                porCuil.set(e.cuil, e);
        const corte = d.eventos.find((e) => e.tipo === "fallo");
        await ArcaDescargaLog.create({
            tenantId: tenantObjectId,
            origen: d.origen,
            empresaId: Types.ObjectId.isValid(d.empresaId) ? d.empresaId : null,
            empresaRazonSocial: d.empresaRazonSocial,
            arrancadaEl: d.arrancadaEl,
            terminadaEl: new Date(),
            presentacion: o.encadenada ? { terminadaEl: o.encadenada.terminadaEl, logId: o.encadenada.logId && Types.ObjectId.isValid(o.encadenada.logId) ? o.encadenada.logId : null, automatica: o.encadenada.automatica } : null,
            pedidas: pendientes.length,
            listas,
            deAlta,
            deBaja,
            items: [...porCuil.values()].map((e) => ({ cuil: e.cuil, nombre: e.nombre, estado: e.estado, detalle: e.detalle, tipoConstancia: e.tipoConstancia || null })),
            error: corte?.mensaje || null,
        }).catch((e) => console.error("[CONSTANCIAS-ARCA] no pude guardar el registro de la corrida:", e?.message || e));
    }
}
