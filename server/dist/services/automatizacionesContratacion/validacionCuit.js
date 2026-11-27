import { Project } from "../../models/Project.js";
import { User } from "../../models/User.js";
import UserProject from "../../models/UserProject.js";
import { Info } from "../../models/Info.js";
import { claveEstado } from "../../utils/estadoClave.js";
import { sigueElCircuito } from "../../utils/circuitoContrato.js";
import { normalizarCuit, cuitEsValido } from "../../utils/constanciaPdf.js";
import { avanzarConstanciasArchivadas, consultarPadronDeContratos } from "../afip/consultaPadronContratos.js";
import { desdeBandeja, enVentana } from "./generacionDocumentos.js";
const DIA_MS = 24 * 60 * 60 * 1000;
const nombreDe = (u) => [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim() || "Persona";
/** Sin CUIT/CUIL argentino: lo declarado al dar de alta, o un placeholder (vacío, 00-00000000-0). Misma regla que la pantalla (`noPoseeCuit`). */
const noPoseeCuit = (raw, sinCuit) => {
    if (sinCuit === true)
        return true;
    const d = String(raw || "").replace(/\D/g, "");
    return d.length === 0 || /^(\d)\1*$/.test(d);
};
/** `escribir: false` = SÓLO MIRAR: arma las listas pero no consulta al padrón ni avanza nada; `consultados` y `avanzados` dicen lo que haría. */
export async function correrValidacionCuit(tenantObjectId, log = () => { }, opciones = {}) {
    const escribir = opciones.escribir !== false;
    const resumen = { fecha: new Date(), revisados: 0, consultados: 0, activos: 0, inactivos: 0, desconocidos: 0, avanzados: 0, esperando: 0, paraResolver: [], errores: [] };
    const estados = await Info.find({ type: "estado-empleado", "data.esImpositivo": true, "data.tipoImpositivo": "constancia_cuit" }).select("name").lean();
    if (estados.length === 0)
        throw new Error("No hay un estado impositivo de Constancia de CUIT configurado.");
    const claves = new Set(estados.map((e) => claveEstado(String(e.name || ""))));
    const projects = await Project.find({ tenantId: tenantObjectId }).select("_id name").lean();
    if (projects.length === 0)
        return resumen;
    const projectIds = projects.map((p) => p._id);
    const nombreProyecto = new Map(projects.map((p) => [String(p._id), String(p.name || "")]));
    const crudos = await UserProject.distinct("contracts.nombre_estado_empleado", { projectId: { $in: projectIds } });
    const nombres = crudos.map((n) => String(n ?? "")).filter((n) => n && claves.has(claveEstado(n)));
    if (nombres.length === 0)
        return resumen;
    const ups = await UserProject.find({ projectId: { $in: projectIds }, "contracts.nombre_estado_empleado": { $in: nombres } }).select("projectId userId contracts").lean();
    const users = await User.find({ _id: { $in: [...new Set(ups.map((u) => u.userId))] } }).select("firstName lastName metadata.cuit metadata.sinCuit").lean();
    const userDe = new Map(users.map((u) => [String(u._id), u]));
    const consultar = [];
    const avanzar = [];
    const ahora = Date.now();
    const desde = desdeBandeja();
    for (const up of ups) {
        const projectId = String(up.projectId);
        const userId = String(up.userId);
        const user = userDe.get(userId);
        const persona = nombreDe(user);
        const proyecto = nombreProyecto.get(projectId) || "";
        const contratos = up.contracts || [];
        for (let idx = 0; idx < contratos.length; idx++) {
            const c = contratos[idx];
            if (!c || c.estadoContrato === "ANULADO")
                continue;
            if (!claves.has(claveEstado(String(c.nombre_estado_empleado || ""))))
                continue;
            if (!sigueElCircuito(c))
                continue;
            // La ventana de la bandeja (ver `enVentana`): lo viejo que quedó en el trámite no se toca solo.
            if (!enVentana(c, desde))
                continue;
            resumen.revisados++;
            const cuit = normalizarCuit(user?.metadata?.cuit);
            if (!user || noPoseeCuit(user.metadata?.cuit, user.metadata?.sinCuit) || !cuit || !cuitEsValido(cuit)) {
                resumen.paraResolver.push({ persona, proyecto, motivo: "Sin CUIT válido cargado" });
                continue;
            }
            if (!c.empresaContratoId) {
                resumen.paraResolver.push({ persona, proyecto, motivo: "Sin Empresa del Contrato: sin ella el comprobante no se archiva" });
                continue;
            }
            const target = { projectId, userId, contractIndex: idx };
            const estado = c.constanciaAfipEstado;
            if (estado === "activo" && c.constanciaAfipDropboxSubidaAt)
                avanzar.push(target);
            else if (!estado || estado === "activo")
                consultar.push(target);
            else {
                const consultada = c.constanciaAfipConsultadaAt ? new Date(c.constanciaAfipConsultadaAt).getTime() : 0;
                if (ahora - consultada >= DIA_MS)
                    consultar.push(target);
                else
                    resumen.esperando++;
            }
        }
    }
    if (!escribir) {
        resumen.consultados = consultar.length;
        resumen.avanzados = avanzar.length;
        log(`consultaría ${consultar.length} y avanzaría ${avanzar.length}`);
        return resumen;
    }
    if (consultar.length > 0) {
        log(`consultando ${consultar.length} contrato(s) al padrón`);
        try {
            const r = await consultarPadronDeContratos(tenantObjectId, consultar);
            resumen.consultados = r.consultados;
            resumen.avanzados += r.avanzados;
            for (const x of r.resultados) {
                if (x.error)
                    resumen.errores.push({ persona: x.cuit, proyecto: "", motivo: x.error });
                else if (x.estado === "activo") {
                    resumen.activos++;
                    if (x.dropboxSubido === false && x.dropboxError)
                        resumen.errores.push({ persona: x.cuit, proyecto: "", motivo: x.dropboxError });
                }
                else if (x.estado === "inactivo")
                    resumen.inactivos++;
                else
                    resumen.desconocidos++;
            }
        }
        catch (e) {
            resumen.errores.push({ persona: "", proyecto: "", motivo: e?.message || String(e) });
            log(`no se pudo consultar al padrón: ${e?.message || e}`);
        }
    }
    if (avanzar.length > 0) {
        try {
            const r = await avanzarConstanciasArchivadas(tenantObjectId, avanzar);
            resumen.avanzados += r.avanzados;
            for (const x of r.resultados)
                if (!x.ok && x.motivo)
                    resumen.errores.push({ persona: nombreDe(userDe.get(x.userId)), proyecto: nombreProyecto.get(x.projectId) || "", motivo: x.motivo });
        }
        catch (e) {
            resumen.errores.push({ persona: "", proyecto: "", motivo: e?.message || String(e) });
        }
    }
    return resumen;
}
