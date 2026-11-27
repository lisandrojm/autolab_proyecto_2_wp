/**
 * ═══════════════════════════════════════════════════════════════════════
 * LA CONSULTA AL PADRÓN DE ARCA DE LOS CONTRATOS DE CONSTANCIA DE CUIT (Trámite impositivo › Constancia de CUIT)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Un solo click consulta el CUIT de cada contrato (deduplicado por persona), guarda el resultado en el
 * contrato, archiva el JSON en la carpeta «Constancia de cuit» de Dropbox cuando ARCA dice «activo»
 * —es lo que da por terminado el trámite— y pasa el contrato al estado siguiente («Envío de
 * documentación») en el momento, sin esperar al escaneo de carpetas.
 *
 * Vivía adentro de `routes/afip.ts` (POST /afip/consulta-padron/bulk). Pasó a servicio el 27/11/2026
 * para que la VALIDACIÓN AUTOMÁTICA (`services/automatizacionesContratacion`) haga exactamente lo mismo
 * que el botón «Validar Masivo»: la ruta valida el pedido y llama acá; el reloj llama acá directo.
 */
import { Types } from "mongoose";
import { Tenant } from "../../models/Tenant.js";
import { Project } from "../../models/Project.js";
import { User } from "../../models/User.js";
import UserProject from "../../models/UserProject.js";
import { aplicarNombreDeArca } from "../arca/nombreArca.js";
import { normalizarCuit, cuitEsValido } from "../../utils/constanciaPdf.js";
import { nombreArchivoDocumento } from "../nomenclaturaService.js";
import { resolverCarpetaPorProposito } from "../../utils/estadoCarpetas.js";
import { getTenantAfipConfig, consultarPadron } from "../afipService.js";
import { getTenantDropboxConfig, uploadFile } from "../dropboxService.js";
import { aplicarTransicion, estadoDestinoPorProposito } from "../estadoTransicionAutomaticaService.js";
/** Un error que es de la configuración o del pedido, no del server: la ruta lo devuelve con su status. */
export class ErrorConsultaPadron extends Error {
    status;
    constructor(status, mensaje) {
        super(mensaje);
        this.status = status;
    }
}
/** La carpeta «Constancia de cuit» de Dropbox (misma resolución que la ruta: por propósito). */
export async function resolverCarpetaConstanciaCuit() {
    return resolverCarpetaPorProposito("constancia_cuit");
}
export async function consultarPadronDeContratos(tenantObjectId, targets) {
    const tenant = await Tenant.findById(tenantObjectId).lean();
    const cfg = getTenantAfipConfig(tenant);
    if (!cfg)
        throw new ErrorConsultaPadron(400, "AFIP no está conectado para esta organización.");
    if (targets.length === 0)
        throw new ErrorConsultaPadron(400, "No se seleccionó ningún contrato.");
    // El archivado en Dropbox es best-effort: si no está conectado o no hay carpeta configurada, la
    // consulta a AFIP sigue funcionando igual — solo que el contrato queda "activo pero sin archivar"
    // en vez de completo, hasta que se resuelva esa configuración.
    const dropboxCfg = getTenantDropboxConfig(tenant);
    // "Best-effort" de verdad: si resolver la carpeta falla (Mongo lento, Dropbox caído), la consulta
    // a AFIP tiene que seguir igual.
    let carpetaConstancia = null;
    if (dropboxCfg) {
        try {
            carpetaConstancia = await resolverCarpetaConstanciaCuit();
        }
        catch (e) {
            console.error("AFIP: no se pudo resolver la carpeta de Constancia de CUIT (se sigue sin archivar):", e?.message || e);
        }
    }
    const projectIds = [...new Set(targets.map((t) => t.projectId))].filter((id) => Types.ObjectId.isValid(id));
    const userIds = [...new Set(targets.map((t) => t.userId))].filter((id) => Types.ObjectId.isValid(id));
    const [projects, users] = await Promise.all([
        Project.find({ _id: { $in: projectIds }, tenantId: tenantObjectId }).select("_id").lean(),
        User.find({ _id: { $in: userIds }, tenantId: tenantObjectId }).select("_id firstName lastName email metadata.cuit").lean(),
    ]);
    const projectIdsValidos = new Set(projects.map((p) => String(p._id)));
    const userById = new Map(users.map((u) => [String(u._id), u]));
    // CUIT (11 dígitos) → targets de esa persona — se consulta UNA vez por CUIT aunque tenga varios contratos.
    const targetsPorCuit = new Map();
    const sinCuit = [];
    for (const t of targets) {
        const user = userById.get(t.userId);
        if (!user || !projectIdsValidos.has(t.projectId))
            continue;
        const cuit = normalizarCuit(user?.metadata?.cuit);
        // Un CUIT que no pasa el dígito verificador (típico: 00000000000) no se consulta: AFIP solo
        // devuelve error y queda registrado como un fallo del webservice que en realidad es un dato mal
        // cargado. Cuenta como "sin CUIT" para que la UI lo muestre como pendiente de corregir.
        if (!cuit || !cuitEsValido(cuit)) {
            sinCuit.push(t);
            continue;
        }
        const lista = targetsPorCuit.get(cuit) || [];
        lista.push(t);
        targetsPorCuit.set(cuit, lista);
    }
    const tenantId = String(tenantObjectId);
    const docsCache = new Map(); // `${projectId}|${userId}` → documento UserProject
    const resultados = [];
    // Los contratos cuya constancia quedó archivada en esta corrida: avanzan de estado al final.
    const archivados = [];
    // Concurrencia acotada: no golpear el webservice de AFIP con todo el lote en simultáneo.
    const CONCURRENCIA = 3;
    const cuits = [...targetsPorCuit.keys()];
    for (let i = 0; i < cuits.length; i += CONCURRENCIA) {
        const lote = cuits.slice(i, i + CONCURRENCIA);
        await Promise.all(lote.map(async (cuit) => {
            const matches = targetsPorCuit.get(cuit) || [];
            try {
                const resultado = await consultarPadron(tenantId, cfg, cuit);
                // "desconocido" es sospechoso: se deja el raw completo en el log para poder ajustar el mapeo sin volver a consultar.
                if (resultado.estado === "desconocido") {
                    console.warn(`AFIP: estado desconocido para CUIT ${cuit} (encontrado=${resultado.encontrado}, faultCode=${resultado.faultCode || "-"}, faultString=${resultado.faultString || "-"})`, JSON.stringify(resultado.raw));
                }
                // El nombre de ARCA manda. La regla vive en `services/arca/nombreArca.ts`, compartida con
                // la validación de obras sociales para que los dos caminos escriban el mismo nombre.
                let renombrado;
                if (resultado.encontrado) {
                    for (const uid of [...new Set(matches.map((t) => t.userId))]) {
                        const u = userById.get(uid);
                        if (!u)
                            continue;
                        const cambio = await aplicarNombreDeArca({
                            tenantObjectId,
                            userId: uid,
                            cuil: cuit,
                            actual: { firstName: u.firstName, lastName: u.lastName },
                            arca: { nombre: resultado.nombre, apellido: resultado.apellido },
                        });
                        if (cambio) {
                            // El cache local se actualiza para que el nombre del JSON que se archiva en Dropbox
                            // sea el nuevo, y no el que se acaba de reemplazar.
                            u.firstName = resultado.nombre;
                            u.lastName = resultado.apellido;
                            renombrado = { antes: cambio.antes, ahora: cambio.ahora };
                        }
                    }
                }
                let contratosActualizados = 0;
                let dropboxSubido;
                let dropboxError;
                for (const t of matches) {
                    const key = `${t.projectId}|${t.userId}`;
                    let up = docsCache.get(key);
                    if (!up) {
                        up = await UserProject.findOne({ projectId: t.projectId, userId: t.userId });
                        if (!up)
                            continue;
                        docsCache.set(key, up);
                    }
                    if (t.contractIndex < 0 || t.contractIndex >= up.contracts.length)
                        continue;
                    // El JSON solo se archiva cuando AFIP confirma "activo": es justo lo que dispara el
                    // avance automático de estado (estadoDropboxCronService.ts vigila esa misma carpeta), y
                    // no tiene sentido destrabar ese paso si la persona figura inactiva.
                    let subidaAt;
                    let dropboxPath;
                    if (resultado.estado === "activo") {
                        if (!dropboxCfg) {
                            dropboxSubido = false;
                            dropboxError = "Dropbox no está conectado para esta organización.";
                        }
                        else if (!carpetaConstancia) {
                            dropboxSubido = false;
                            dropboxError = 'No se encontró ninguna carpeta de Dropbox configurada como "Constancia de cuit" en Documentos → Configurar transición automática.';
                        }
                        else if (!up.contracts[t.contractIndex]?.empresaContratoId) {
                            /*
                              SIN EMPLEADORA NO SE ARCHIVA. La nomenclatura incluye `{{empresaCuit}}`, que sale de la
                              empresa del contrato: sin ella el comprobante quedaría en Dropbox con un hueco donde va
                              el CUIT de la empleadora, y ahí ya no se corrige. La consulta a ARCA sí se hizo y su
                              resultado se devuelve; lo único que se frena es el archivado.
                            */
                            dropboxSubido = false;
                            dropboxError = "El contrato no tiene Empresa del Contrato asignada, y su CUIT va en el nombre del comprobante. Elegí la empleadora y volvé a validar.";
                        }
                        else {
                            try {
                                const user = userById.get(t.userId);
                                const contract = up.contracts[t.contractIndex];
                                const nombreArchivo = await nombreArchivoDocumento({ tenantId: tenantObjectId, tipo: "ConstanciaCUIT", user, up, contract, docName: "ValidacionAFIP" });
                                const contenido = Buffer.from(JSON.stringify({
                                    cuit,
                                    estado: resultado.estado,
                                    encontrado: resultado.encontrado,
                                    denominacion: resultado.denominacion,
                                    consultadoEn: new Date().toISOString(),
                                    persona: { userId: t.userId, nombre: user?.firstName, apellido: user?.lastName },
                                    proyecto: { id: t.projectId, nombre: up.nombre_proyecto },
                                    contrato: { index: t.contractIndex, fechaAlta: contract?.fecha_alta_contrato, fechaBaja: contract?.fecha_baja_contrato },
                                    raw: resultado.raw,
                                }, null, 2));
                                const subida = await uploadFile(tenantId, dropboxCfg, `${carpetaConstancia.replace(/\/$/, "")}/${nombreArchivo}.json`, contenido);
                                // `uploadFile` sube con autorename: si ya existía un archivo con ese nombre, Dropbox
                                // le cambia el nombre solo. Se guarda el path que realmente devolvió Dropbox.
                                dropboxPath = subida.path;
                                subidaAt = new Date();
                                dropboxSubido = true;
                                archivados.push({ up, idx: t.contractIndex, cuit });
                            }
                            catch (e) {
                                const detalle = e?.response?.data ? JSON.stringify(e.response.data) : e?.message || String(e);
                                console.error(`AFIP: no se pudo archivar la constancia en Dropbox (CUIT ${cuit}, carpeta "${carpetaConstancia}"):`, detalle);
                                dropboxSubido = dropboxSubido ?? false;
                                dropboxError = `No se pudo subir a Dropbox (carpeta "${carpetaConstancia}"): ${detalle}`;
                            }
                        }
                    }
                    up.contracts[t.contractIndex] = {
                        ...up.contracts[t.contractIndex].toObject(),
                        constanciaAfipEstado: resultado.estado,
                        constanciaAfipConsultadaAt: new Date(),
                        constanciaAfipRaw: resultado.raw,
                        ...(subidaAt ? { constanciaAfipDropboxSubidaAt: subidaAt, constanciaAfipDropboxPath: dropboxPath } : {}),
                    };
                    up.markModified("contracts");
                    contratosActualizados++;
                }
                // Se devuelve el raw completo + con qué CUIT representada/ambiente se consultó — para poder
                // ver desde la UI exactamente qué se mandó y qué contestó AFIP.
                resultados.push({ cuit, estado: resultado.estado, encontrado: resultado.encontrado, denominacion: resultado.denominacion, contratosActualizados, dropboxSubido, dropboxError, cuitRepresentada: cfg.cuitRepresentada, ambiente: cfg.ambiente, raw: resultado.raw, faultCode: resultado.faultCode, faultString: resultado.faultString, renombrado });
            }
            catch (e) {
                resultados.push({ cuit, error: e?.message || "Error al consultar AFIP", contratosActualizados: 0 });
            }
        }));
    }
    await Promise.all([...docsCache.values()].map((up) => up.save()));
    /*
      CON LA CONSTANCIA ARCHIVADA EL TRÁMITE TERMINÓ: el contrato pasa YA al estado siguiente («Envío de
      documentación», la bandeja Generar Documentos). El escaneo de carpetas sigue existiendo para lo que
      se suba a mano; acá se le gana de mano con lo que ya se sabe.
    */
    let avanzados = 0;
    if (archivados.length > 0) {
        try {
            const destino = await estadoDestinoPorProposito("constancia_cuit");
            if (destino) {
                for (const a of archivados) {
                    const r = await aplicarTransicion(a.up, a.idx, destino);
                    if (r.aplicada)
                        avanzados++;
                    const res_ = resultados.find((x) => x.cuit === a.cuit);
                    if (!res_)
                        continue;
                    // A dónde fue de verdad: lo que no se firma va a Contratos, y lo que ya estaba más adelante no se mueve.
                    if (r.aplicada) {
                        res_.estadoNuevo = r.estadoNuevo?.nombre || destino.name;
                        if (r.estadoNuevo && r.estadoNuevo.nombre !== destino.name)
                            res_.directoAContratos = true;
                    }
                    else if (r.motivo === "no_es_hacia_adelante")
                        res_.estadoSinCambio = true;
                    else
                        res_.estadoNuevo = destino.name;
                }
            }
        }
        catch (e) {
            console.error("AFIP: la constancia se archivó pero no se pudo avanzar el estado (lo hará el escaneo):", e?.message || e);
        }
    }
    return {
        resultados,
        consultados: cuits.length,
        sinCuit: sinCuit.length,
        contratosActualizados: resultados.reduce((acc, r) => acc + r.contratosActualizados, 0),
        avanzados,
    };
}
/**
 * Para un contrato que YA tiene el CUIT validado y la constancia archivada pero sigue en Constancia de
 * CUIT (validado antes de que el archivado avanzara el estado, o el escaneo todavía no pasó): lo pasa al
 * estado siguiente ahora. No consulta a ARCA ni vuelve a subir nada.
 */
export async function avanzarConstanciasArchivadas(tenantObjectId, targets) {
    const projectIds = [...new Set(targets.map((t) => t.projectId))].filter((id) => Types.ObjectId.isValid(id));
    const proyectosDelTenant = new Set((await Project.find({ _id: { $in: projectIds }, tenantId: tenantObjectId }).select("_id").lean()).map((p) => String(p._id)));
    const destino = await estadoDestinoPorProposito("constancia_cuit");
    const resultados = [];
    for (const t of targets) {
        if (!proyectosDelTenant.has(t.projectId) || !Types.ObjectId.isValid(t.userId)) {
            resultados.push({ ...t, ok: false, motivo: "El contrato no existe en esta cuenta." });
            continue;
        }
        const up = await UserProject.findOne({ projectId: t.projectId, userId: t.userId });
        const c = up?.contracts?.[t.contractIndex];
        if (!c) {
            resultados.push({ ...t, ok: false, motivo: "El contrato ya no existe." });
            continue;
        }
        if (c.constanciaAfipEstado !== "activo" || !c.constanciaAfipDropboxSubidaAt) {
            resultados.push({ ...t, ok: false, motivo: "El CUIT no está validado y archivado: hay que validarlo primero." });
            continue;
        }
        if (!destino) {
            resultados.push({ ...t, ok: false, motivo: "No hay un estado con la carpeta «Constancia de cuit» configurada (Documentos → Configurar transición automática)." });
            continue;
        }
        const r = await aplicarTransicion(up, t.contractIndex, destino);
        resultados.push({ ...t, ok: true, aplicada: r.aplicada, estado: destino.name });
    }
    return { resultados, avanzados: resultados.filter((r) => r.aplicada).length };
}
