import fs from "fs";
import path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { Types } from "mongoose";
import { Info } from "../models/Info.js";
import { User } from "../models/User.js";
import { Company } from "../models/Company.js";
import { Contrato } from "../models/Contrato.js";
import { Tenant } from "../models/Tenant.js";
import { leerConstanciaTrabajador, leerConstanciaTrabajadorPdf, problemasDeConstancia } from "../utils/constanciaTrabajadorPdf.js";
import { getTenantDropboxConfig, uploadFile } from "./dropboxService.js";
import { resolverCarpetaPorProposito } from "../utils/estadoCarpetas.js";
import { aplicarTransicion, cargarEstadosPorEvento } from "./estadoTransicionAutomaticaService.js";
import { nombreArchivoDocumento } from "./nomenclaturaService.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
export async function registrarAltaDeContrato(o) {
    const { up, idx, userId, tenantObjectId } = o;
    const contratoActual = up.contracts[idx].toObject();
    const constancia = await leerConstanciaTrabajadorPdf(o.buffer).catch(() => leerConstanciaTrabajador(""));
    const estadoActual = contratoActual.estado_id != null ? await Info.findOne({ type: "estado-empleado", "data.id": contratoActual.estado_id }).select("data.tipoImpositivo").lean() : null;
    const esAltaTemprana = estadoActual?.data?.tipoImpositivo === "alta_temprana_afip" || !!contratoActual.altaArcaPresentada;
    const validarConstancia = !!o.exigirConstancia || esAltaTemprana || !!constancia.tipo;
    const persona = validarConstancia ? await User.findOne({ _id: userId, tenantId: tenantObjectId }).select("firstName lastName email metadata").lean() : null;
    if (validarConstancia) {
        const empresa = contratoActual.empresaContratoId ? await Company.findById(contratoActual.empresaContratoId).select("cuit").lean() : null;
        const problemas = problemasDeConstancia(constancia, { cuil: persona?.metadata?.cuit, empleadorCuit: empresa?.cuit, fechaInicio: contratoActual.fecha_alta_contrato });
        if (problemas.length > 0)
            return { ok: false, problemas };
    }
    // Reemplazo: borrar el archivo anterior del disco (best-effort, no bloquea la respuesta).
    const anterior = contratoActual.altaDocumentoUrl;
    if (anterior && typeof anterior === "string" && anterior !== o.altaDocumentoUrl) {
        fs.promises.unlink(path.join(__dirname, "../..", anterior.replace(/^\/storage\//, "storage/"))).catch(() => { });
    }
    let ruteo;
    let altaConstancia;
    if (validarConstancia) {
        const tipoContrato = Types.ObjectId.isValid(String(contratoActual.contrato_id || "")) ? await Contrato.findById(contratoActual.contrato_id).select("data.requiereFirmaAlta").lean() : null;
        // Sin el dato, sí: el mismo criterio que la pantalla (`contratoRequiereFirmaAlta`).
        ruteo = { vaAFirma: tipoContrato?.data?.requiereFirmaAlta !== false };
        let enviadaComo;
        try {
            const tenant = await Tenant.findById(tenantObjectId).lean();
            const cfg = getTenantDropboxConfig(tenant);
            const carpeta = await resolverCarpetaPorProposito(ruteo.vaAFirma ? "outbox" : "alta_temprana");
            if (!cfg || !carpeta) {
                ruteo.aviso = !cfg ? "Dropbox no está conectado: el alta quedó cargada en el contrato pero no se subió." : `No hay una carpeta de «${ruteo.vaAFirma ? "Outbox" : "Alta temprana de ARCA"}» configurada: el alta quedó cargada en el contrato pero no se subió.`;
            }
            else {
                const nombre = `${await nombreArchivoDocumento({ tenantId: tenantObjectId, tipo: "AltaAFIP", user: persona, up, contract: contratoActual, docName: "AltaAFIP" })}.pdf`;
                // Dropbox crea «No firmar» sola la primera vez: subir a un path arma las carpetas que falten.
                const destino = `${carpeta.replace(/\/$/, "")}${ruteo.vaAFirma ? "" : "/No firmar"}/${nombre}`;
                await uploadFile(String(tenantObjectId), cfg, destino, o.buffer, true);
                ruteo.archivadaEn = destino;
                enviadaComo = nombre;
            }
        }
        catch (e) {
            console.error("Alta temprana: no se pudo subir a Dropbox:", e?.message || e);
            ruteo.aviso = "No se pudo subir el alta a Dropbox. Quedó cargada en el contrato: volvé a cargarla para reintentar.";
        }
        altaConstancia = { clave: constancia.clave || undefined, nroTramite: constancia.nroTramite || undefined, validadaEl: new Date(), vaAFirma: ruteo.vaAFirma, archivadaEn: ruteo.archivadaEn, enviadaComo };
    }
    const conAlta = { ...up.contracts[idx].toObject(), altaDocumentoUrl: o.altaDocumentoUrl, altaDocumentoNombre: o.altaDocumentoNombre };
    if (altaConstancia) {
        conAlta.altaConstancia = altaConstancia;
        // Enviada = quedó en el Outbox. Si no se pudo subir, no se marca: viaja con el contrato cuando
        // se lo envíe a firmar, que es el camino de antes, y tampoco sale dos veces.
        conAlta.altaEnviadaAFirmarEl = ruteo?.vaAFirma && ruteo.archivadaEn ? new Date() : undefined;
        // La clave de alta que da ARCA: es la que la presentación no pudo leer de la pantalla.
        if (conAlta.altaArcaPresentada && constancia.clave)
            conAlta.altaArcaPresentada = { ...conAlta.altaArcaPresentada, cat: constancia.clave };
    }
    up.contracts[idx] = conAlta;
    up.markModified("contracts");
    await up.save();
    if (ruteo) {
        try {
            const destino = (await cargarEstadosPorEvento("dropbox_carpeta")).find((e) => (e.data?.transicionAutomatica?.carpetas || []).some((c) => [].concat(c.proposito || []).includes("alta_temprana")));
            if (destino) {
                const r = await aplicarTransicion(up, idx, destino);
                if (r.aplicada)
                    ruteo.estado = destino.name;
            }
        }
        catch (e) {
            console.error("Alta temprana: no se pudo avanzar el estado:", e?.message || e);
        }
    }
    return { ok: true, altaDocumentoUrl: o.altaDocumentoUrl, altaDocumentoNombre: o.altaDocumentoNombre, ruteo };
}
/** Guarda en el storage local un PDF que no llegó por formulario (la descarga desde ARCA). Devuelve su URL. */
export async function guardarPdfDeAlta(o) {
    const dir = path.join(__dirname, "../../storage", o.tenantCarpeta, o.userId, "contratos");
    await fs.promises.mkdir(dir, { recursive: true });
    const archivo = `constancia-alta-${Date.now()}-${Math.round(Math.random() * 1e6)}.pdf`;
    const ruta = path.join(dir, archivo);
    await fs.promises.writeFile(ruta, o.buffer);
    return { url: `/storage/${o.tenantCarpeta}/${o.userId}/contratos/${archivo}`, ruta };
}
