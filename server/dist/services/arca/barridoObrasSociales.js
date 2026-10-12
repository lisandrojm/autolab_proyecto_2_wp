import { Project } from "../../models/Project.js";
import { User } from "../../models/User.js";
import UserProject from "../../models/UserProject.js";
import { Tenant } from "../../models/Tenant.js";
import { yaConstatadaEnArca } from "../obrasSocialesLoteService.js";
import { quienTiene, CandadoArcaOcupado } from "./candadoArca.js";
import { destrabarCorridaColgada } from "./corridaServidor.js";
/** Una corrida sin novedades de ARCA durante este tiempo se considera colgada y se destraba sola. */
export const INACTIVIDAD_COLGADA_MS = 20 * 60_000;
import { credencialesDe } from "./navegador.js";
/**
 * EL BARRIDO DE OBRAS SOCIALES SIN VALIDAR: la red de seguridad de la cola.
 *
 * La cola (`colaObrasSociales.ts`) valida en segundo plano apenas nace el contrato, pero vive en memoria:
 * un reinicio la pierde, y si ARCA está ocupada diez minutos la abandona. Este barrido corre cada
 * `ARCA_BARRIDO_OS_MIN` minutos (10) por tenant y toma TODO lo que quedó sin validar: contratos creados
 * en WeProdu (Solicitudes o «Agregar miembro») en los últimos `DIAS_ATRAS` días, con empleadora,
 * categoría y CUIL válido, que todavía no están constatados en ARCA. Los manda a la MISMA corrida que
 * el botón y la cola (`arrancarCorrida`), marcada como automática.
 *
 * NO PISA A NADIE: con el candado tomado no hace nada y vuelve a probar en el próximo tick (sin tope:
 * «rendirse» es lo que hacía la cola y dejaba gente sin validar). Y no insiste con quien ARCA acaba de
 * rechazar: a cada CUIL se lo vuelve a intentar recién pasados `ARCA_BARRIDO_OS_REINTENTO_MIN` (60).
 *
 * La DECISIÓN (`planBarrido`) es pura y se testea; `barrerTenant` la ejecuta.
 */
export const DIAS_ATRAS = 30;
/**
 * Qué mandar a ARCA: agrupa por empleadora, un CUIL por empleadora, y deja afuera a quien se intentó
 * hace menos de `reintentoMs`.
 */
export function planBarrido(sinValidar, ultimoIntento, ahora, reintentoMs) {
    const porEmpresa = new Map();
    let esperando = 0;
    for (const c of sinValidar) {
        const cuil = String(c.cuil || "").replace(/\D/g, "");
        if (cuil.length !== 11 || !c.empresaId)
            continue;
        const ultimo = ultimoIntento.get(cuil);
        if (ultimo !== undefined && ahora - ultimo < reintentoMs) {
            esperando++;
            continue;
        }
        const lista = porEmpresa.get(c.empresaId) || new Set();
        lista.add(cuil);
        porEmpresa.set(c.empresaId, lista);
    }
    return { grupos: [...porEmpresa].map(([empresaId, cuils]) => ({ empresaId, cuils: [...cuils] })), esperando };
}
/** "YYYY-MM-DD" de hace n días (UTC: alcanza para un corte de 30 días). */
const hace = (dias) => new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
/**
 * Los contratos del tenant que la automática todavía debe validar. Proyectado en la base: no viajan
 * los `contracts` enteros (ver memoria «Latencia = bytes desde Atlas»).
 */
export async function contratosSinValidar(tenantObjectId, diasAtras = DIAS_ATRAS) {
    const proyectos = await Project.find({ tenantId: tenantObjectId }).select("_id name").lean();
    const nombreProyecto = new Map(proyectos.map((p) => [String(p._id), String(p.name || "")]));
    if (proyectos.length === 0)
        return [];
    const desde = hace(diasAtras);
    const cond = {
        $and: [
            { $gte: ["$$c.fecha_carga", desde] },
            { $gt: ["$$c.empresaContratoId", null] },
            { $gt: ["$$c.categoria_sat_id", null] },
            { $or: [{ $gt: ["$$c.solicitudId", null] }, { $eq: ["$$c.origen", "agregar_miembro"] }] },
        ],
    };
    const filas = await UserProject.aggregate([
        { $match: { projectId: { $in: proyectos.map((p) => p._id) }, contracts: { $elemMatch: { fecha_carga: { $gte: desde }, empresaContratoId: { $exists: true, $ne: null } } } } },
        {
            $project: {
                userId: 1,
                projectId: 1,
                c: {
                    $map: {
                        input: { $filter: { input: { $ifNull: ["$contracts", []] }, as: "c", cond } },
                        as: "c",
                        in: {
                            empresaContratoId: "$$c.empresaContratoId",
                            fecha_carga: "$$c.fecha_carga",
                            obraSocialId: "$$c.obraSocialId",
                            obraSocialNoFigura: "$$c.obraSocialNoFigura",
                            obraSocialConstatadaEn: "$$c.obraSocialConstatadaEn",
                            obraSocialBloqueada: "$$c.obraSocialBloqueada",
                        },
                    },
                },
            },
        },
        { $match: { "c.0": { $exists: true } } },
    ]);
    if (filas.length === 0)
        return [];
    const usuarios = await User.find({ _id: { $in: filas.map((f) => f.userId) }, tenantId: tenantObjectId }).select("firstName lastName metadata.cuit").lean();
    const porId = new Map(usuarios.map((u) => [String(u._id), u]));
    const out = [];
    for (const f of filas) {
        const u = porId.get(String(f.userId));
        const cuil = String(u?.metadata?.cuit || "").replace(/\D/g, "");
        if (!u || cuil.length !== 11)
            continue;
        for (const c of f.c || []) {
            if (yaConstatadaEnArca(c))
                continue;
            out.push({ cuil, empresaId: String(c.empresaContratoId), userId: String(u._id), nombre: `${u.firstName || ""} ${u.lastName || ""}`.trim(), fechaCarga: String(c.fecha_carga || "").slice(0, 10), projectId: String(f.projectId || ""), proyecto: nombreProyecto.get(String(f.projectId || "")) || "" });
        }
    }
    return out;
}
/** ¿El tenant tiene la validación automática prendida? Por defecto sí; se apaga en Configuración → ARCA → Conexión. */
export async function validacionAutomaticaActivaEn(tenantObjectId) {
    const t = await Tenant.findById(tenantObjectId).select("integrations.arcaSimplificacion.validacionAutomaticaObrasSociales.activa").lean();
    return t?.integrations?.arcaSimplificacion?.validacionAutomaticaObrasSociales?.activa !== false;
}
const minutos = (valor, porDefecto) => {
    const n = Number(String(valor ?? "").trim() || porDefecto);
    return (Number.isFinite(n) && n > 0 ? n : porDefecto) * 60_000;
};
export const reintentoMs = () => minutos(process.env.ARCA_BARRIDO_OS_REINTENTO_MIN, 60);
/** Por tenant: cuándo se intentó cada CUIL por última vez (en memoria: con un reinicio se vuelve a intentar, que es lo deseado). */
const intentos = new Map();
/** Una pasada del barrido para UN tenant. Nunca tira. `ignorarReintentos` es «Validar ahora»: manda también a quien espera reintento. */
export async function barrerTenant(tenantId, tenantObjectId, log = () => { }, opts = {}) {
    try {
        if (!(await validacionAutomaticaActivaEn(tenantObjectId)))
            return { resultado: "apagada", total: 0, esperando: 0 };
        // El vigilante: una corrida colgada se destraba acá, antes de rendirse por «ocupado».
        if (destrabarCorridaColgada(tenantId, INACTIVIDAD_COLGADA_MS))
            log("barrido: destrabé una corrida colgada");
        if (quienTiene(tenantId))
            return { resultado: "ocupado", total: 0, esperando: 0 };
        const sinValidar = await contratosSinValidar(tenantObjectId);
        if (sinValidar.length === 0)
            return { resultado: "nada", total: 0, esperando: 0 };
        if (!(await credencialesDe(tenantId)))
            return { resultado: "sin_credenciales", total: sinValidar.length, esperando: 0 };
        const porCuil = intentos.get(tenantId) || new Map();
        intentos.set(tenantId, porCuil);
        const plan = planBarrido(sinValidar, porCuil, Date.now(), opts.ignorarReintentos ? 0 : reintentoMs());
        if (plan.grupos.length === 0)
            return { resultado: "nada", total: 0, esperando: plan.esperando };
        const { arrancarCorrida } = await import("./corridaServidor.js");
        const ahora = Date.now();
        for (const g of plan.grupos)
            for (const cuil of g.cuils)
                porCuil.set(cuil, ahora);
        try {
            const r = await arrancarCorrida({ tenantId, tenantObjectId, grupos: plan.grupos, automatica: true });
            log(`barrido: ${r.total} persona(s) a validar en ${plan.grupos.length} empleadora(s)${plan.esperando ? ` · ${plan.esperando} esperando reintento` : ""}`);
            return { resultado: "arrancada", total: r.total, esperando: plan.esperando };
        }
        catch (e) {
            if (e instanceof CandadoArcaOcupado)
                return { resultado: "ocupado", total: 0, esperando: plan.esperando };
            log(`barrido: no pude arrancar: ${e?.message || e}`);
            return { resultado: "fallo", total: 0, esperando: plan.esperando };
        }
    }
    catch (e) {
        log(`barrido: ${e?.message || e}`);
        return { resultado: "fallo", total: 0, esperando: 0 };
    }
}
/** Para la pantalla: si ese CUIL está esperando reintento (se intentó hace poco y falló). */
export const esperaReintento = (tenantId, cuil) => {
    const t = intentos.get(tenantId)?.get(cuil);
    return t !== undefined && Date.now() - t < reintentoMs();
};
/** Para la pantalla: cuántos CUILs del tenant están esperando reintento. */
export const esperandoReintento = (tenantId) => {
    const porCuil = intentos.get(tenantId);
    if (!porCuil)
        return 0;
    const ahora = Date.now();
    return [...porCuil.values()].filter((t) => ahora - t < reintentoMs()).length;
};
