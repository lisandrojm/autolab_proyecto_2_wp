import { Tenant } from "../models/Tenant.js";
import { Info } from "../models/Info.js";
import { deleteEntry, getTenantDropboxConfig, listFolder, uploadFile } from "./dropboxService.js";
import { CARPETA_SOLICITUDES, ESTADO_TYPE, NOMBRE_ESTADO_SOLICITUD } from "../utils/estadosImpositivosSistema.js";
/**
 * EL REGISTRO DE CADA SOLICITUD DE CONTRATACIÓN EN DROPBOX (05/11/2026).
 *
 * Una solicitud es un `User` con `metadata.isSolicitud`: vive en la base y no dejaba ningún archivo,
 * así que no había dónde ir a verla. Ahora cada una deja un `.json` en la carpeta del estado «Solicitud
 * pendiente» (propósito `solicitudes`; por defecto `/WEPRODU/Solicitudes`), como
 * `espejoDropboxRegistros.ts`. Es LA FOTO DE LO PEDIDO: se reescribe cada vez que se edita la solicitud
 * (`modificadaEl` dice cuándo). Si después se aprueba o se rechaza, el estado vigente sigue siendo el de
 * la base.
 *
 * NUNCA FRENA LA SOLICITUD: se sube en segundo plano y un error de Dropbox sólo se loguea. Tampoco
 * guarda la contraseña provisoria: el contenido sale de una lista de campos, no del documento entero.
 */
/** El nombre del archivo: fecha, persona e id (el id lo hace único aunque se repita la persona). */
export function nombreArchivoSolicitud(o) {
    const fecha = new Date(o.creadaEl).toISOString().slice(0, 10);
    const persona = String(o.nombre || "sin-nombre").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
    return `${fecha}_${persona || "sin-nombre"}_${o.id}.json`;
}
/** Lo que se guarda de la solicitud: lo pedido, sin credenciales. */
export function contenidoDeSolicitud(s, creador, estado = NOMBRE_ESTADO_SOLICITUD) {
    const m = s?.metadata || {};
    return {
        solicitudId: String(s?._id || ""),
        estado,
        creadaEl: s?.createdAt || null,
        modificadaEl: s?.updatedAt || null,
        creadaPor: creador || null,
        persona: { nombre: m.fullName || `${s?.firstName || ""} ${s?.lastName || ""}`.trim(), personaId: m.solicitudUserId ? String(m.solicitudUserId) : null },
        proyectos: (m.projectIds || []).map(String),
        desde: m.startDate || null,
        hasta: m.dueDate || null,
        contrato: m.nombre_contrato || null,
        tramite: m.tipoImpositivo || null,
        areasYTurnos: m.areaShiftAssignments || [],
        diasPorSemana: m.diasPorSemana ?? null,
        jornadas: m.workdaysCount ?? null,
        fechasTrabajadas: m.fechasTrabajadas || [],
        importePorJornada: m.dailyRate ?? null,
        esRenovacion: !!m.esRenovacion,
        comentarios: m.comentarios || null,
    };
}
/** El estado del Paso 1 como está en el ABM: su nombre va en el registro y de su configuración sale la carpeta. */
const estadoDeSolicitudes = async () => {
    const estado = await Info.findOne({ type: ESTADO_TYPE, "data.esSolicitud": true }).select("name data.transicionAutomatica").lean();
    const c = (estado?.data?.transicionAutomatica?.carpetas || []).find((x) => [].concat(x.proposito || []).includes("solicitudes"));
    return { nombre: estado?.name || NOMBRE_ESTADO_SOLICITUD, carpeta: String(c?.dropboxCarpeta || CARPETA_SOLICITUDES).replace(/\/+$/, "") };
};
/** Sube el registro en segundo plano. No devuelve nada que haya que esperar y no tira nunca. */
export function guardarSolicitudEnDropbox(o) {
    void (async () => {
        try {
            const tenant = await Tenant.findById(o.tenantId).select("integrations.dropbox").lean();
            const cfg = getTenantDropboxConfig(tenant);
            if (!cfg)
                return; // sin Dropbox conectado no hay dónde guardar: no es un error de la solicitud
            const { nombre: estado, carpeta } = await estadoDeSolicitudes();
            /*
              Se verifica el PRIMER tramo antes de subir (ver `espejoDropboxRegistros.ts`): con un token de app,
              subir a una ruta inexistente no falla y los archivos quedan donde nadie los mira. Si lo que falta
              es sólo `Solicitudes`, se crea al subir.
            */
            await listFolder(o.tenantId, cfg, "/" + carpeta.split("/").filter(Boolean)[0]);
            const m = o.solicitud?.metadata || {};
            const nombreDelArchivo = (persona) => nombreArchivoSolicitud({ creadaEl: o.solicitud?.createdAt || new Date(), nombre: persona, id: String(o.solicitud?._id || "") });
            const nombre = nombreDelArchivo(m.fullName || `${o.solicitud?.lastName || ""} ${o.solicitud?.firstName || ""}`);
            await uploadFile(o.tenantId, cfg, `${carpeta}/${nombre}`, Buffer.from(JSON.stringify(contenidoDeSolicitud(o.solicitud, o.creador, estado), null, 2), "utf8"), true);
            // Editada con otra persona: el nombre del archivo cambió y el anterior quedaría como una solicitud más.
            const anterior = o.nombreAnterior === undefined ? nombre : nombreDelArchivo(o.nombreAnterior);
            if (anterior !== nombre)
                await deleteEntry(o.tenantId, cfg, `${carpeta}/${anterior}`);
        }
        catch (e) {
            console.warn(`[SOLICITUDES→DROPBOX] No se pudo guardar la solicitud ${o.solicitud?._id || "?"}:`, e?.response?.data?.error_summary || e?.message || e);
        }
    })();
}
