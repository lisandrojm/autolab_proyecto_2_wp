import { Types } from "mongoose";
import NomenclaturaArchivo from "../models/NomenclaturaArchivo.js";
import { Company } from "../models/Company.js";
import { Project } from "../models/Project.js";
import { CentroCosto } from "../models/CentroCosto.js";
import { PATRON_POR_DEFECTO, renderNomenclatura, recortarNombre } from "../utils/nomenclatura.js";
import { datosNombreArchivo } from "../utils/employeeDocData.js";
/**
 * Razón social y CUIT de la empleadora, para el final del nombre.
 *
 * El CUIT sale PELADO: son los once dígitos y nada más. La etiqueta vive en el PATRÓN
 * (`EMPRESA-{{empresaCuit}}`), donde se ve y se puede acortar; acá adentro estaba escondida y
 * costaba cinco caracteres que el nombre no tiene para regalar.
 *
 * Lo que impide confundirlo con el CUIL de la persona no es la etiqueta sino el ORDEN:
 * `extraerCuitDeNombre` toma el primer número de once dígitos, `{{cuit}}` es obligatoria y
 * `validarPatron` no deja poner `{{empresaCuit}}` antes que ella.
 */
export function empresaAValores(c) {
    const cuit = String(c?.cuit || "").replace(/\D/g, "");
    return { empresa: String(c?.razonSocial || ""), empresaCuit: cuit };
}
export async function datosEmpresa(empresaId, nombreCache) {
    if (!empresaId)
        return { empresa: nombreCache || "", empresaCuit: "" };
    try {
        const c = await Company.findById(String(empresaId)).select("razonSocial cuit").lean();
        const v = empresaAValores(c);
        return { empresa: v.empresa || nombreCache || "", empresaCuit: v.empresaCuit };
    }
    catch {
        // Sin la empresa el nombre pierde un campo, no se rompe: el resto de los datos sigue estando.
        return { empresa: nombreCache || "", empresaCuit: "" };
    }
}
/**
 * El código del centro de costo de un proyecto («426»), para `{{centroDeCosto}}`.
 *
 * Es `codAuxiliar` —el número con el que producción nombra al proyecto—, no el `centroCostoId` que
 * guarda el proyecto: ese es el id de Tango, y el mismo id es otro código en cada empresa. Por eso se
 * busca primero el par (empresa de Tango, id), igual que la ficha del proyecto.
 *
 * Se acepta el `_id` del proyecto o su id externo de FRAME, porque los contratos viejos solo tienen
 * el segundo. Sin proyecto o sin centro devuelve "": el campo se cae del nombre y el resto sigue.
 */
export async function centroDeCostoDelProyecto(o) {
    try {
        const id = String(o.projectId || "");
        const externo = Number(o.externalProjectId);
        const project = Types.ObjectId.isValid(id)
            ? await Project.findById(id).select("metadata.centroCostoId metadata.centroCostoEmpresaTangoId").lean()
            : Number.isFinite(externo) && externo > 0
                ? await Project.findOne({ externalId: externo }).select("metadata.centroCostoId metadata.centroCostoEmpresaTangoId").lean()
                : null;
        const ccId = Number(project?.metadata?.centroCostoId);
        if (!Number.isFinite(ccId) || ccId <= 0)
            return "";
        const porId = { $or: [{ idAuxiliar: ccId }, { "data.id": ccId }] };
        const empresaTango = project.metadata.centroCostoEmpresaTangoId;
        const cc = (empresaTango ? await CentroCosto.findOne({ empresaTangoId: empresaTango, ...porId }).select("codAuxiliar name").lean() : null) || (await CentroCosto.findOne(porId).select("codAuxiliar name").lean());
        return String(cc?.codAuxiliar ?? cc?.name ?? "").trim();
    }
    catch (e) {
        console.warn("[NOMENCLATURA] No pude resolver el centro de costo:", e?.message || e);
        return "";
    }
}
/**
 * El nombre de un archivo, según lo que el tenant configuró.
 *
 * Si no configuró nada rige `PATRON_POR_DEFECTO`. Los archivos ya generados NO se renombran nunca:
 * este patrón solo decide cómo se van a llamar los próximos.
 *
 * Ante CUALQUIER problema —la base no responde, el patrón guardado quedó raro, el render sale
 * vacío— cae al default en vez de fallar. Un documento tiene que poder generarse siempre: quedarse
 * sin contrato porque alguien escribió mal una configuración de nombres sería un intercambio pésimo.
 *
 * El resultado entra siempre en `MAX_NOMBRE`: si no entra, se recorta lo descriptivo sin tocar los
 * bloques que los parsers de vuelta necesitan (ver `recortarNombre`). `reservar` es lo que el que
 * llama va a pegar después y todavía no está en el string — como mínimo la extensión.
 */
export async function nombreArchivo(tenantId, tipo, datos, reservar = 4) {
    const porDefecto = renderNomenclatura(PATRON_POR_DEFECTO[tipo], datos);
    try {
        const fila = await NomenclaturaArchivo.findOne({ tenantId: tenantId, tipo }).select("patron").lean();
        if (!fila?.patron)
            return recortarNombre(porDefecto, reservar);
        const nombre = renderNomenclatura(fila.patron, datos);
        return recortarNombre(nombre || porDefecto, reservar);
    }
    catch (e) {
        console.warn("[NOMENCLATURA] No pude leer el patrón configurado; uso el de por defecto:", e?.message || e);
        return recortarNombre(porDefecto, reservar);
    }
}
/** Atajo para los documentos de un contrato: arma los datos y aplica el patrón. */
export async function nombreArchivoDocumento(opts) {
    const { tenantId, tipo, empresa, ...resto } = opts;
    const valoresEmpresa = empresa ? empresaAValores(empresa) : await datosEmpresa(resto.contract?.empresaContratoId, resto.contract?.nombre_empresa_contrato);
    const centroDeCosto = await centroDeCostoDelProyecto({ projectId: resto.up?.projectId, externalProjectId: resto.up?.externalProjectId ?? resto.contract?.proyecto_id });
    return nombreArchivo(tenantId, tipo, { ...datosNombreArchivo({ tipo, ...resto }), ...valoresEmpresa, centroDeCosto });
}
