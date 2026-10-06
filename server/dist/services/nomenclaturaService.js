import { Types } from "mongoose";
import NomenclaturaArchivo from "../models/NomenclaturaArchivo.js";
import { Company } from "../models/Company.js";
import { Project } from "../models/Project.js";
import { CentroCosto } from "../models/CentroCosto.js";
import { PATRON_POR_DEFECTO, renderNomenclatura, recortarNombre, asegurarCodigo } from "../utils/nomenclatura.js";
import { DocumentoGenerado, proximoNumeroDeDocumento, formatoCodigo } from "../models/DocumentoGenerado.js";
import { fechaISO } from "../utils/contratoVigencia.js";
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
 * El código único de un documento nuevo («ID-000123») y su registro en `documentos_generados`.
 *
 * Si algo falla, devuelve "" y el documento sale igual, sin código: un nombre sin código se sigue
 * reconociendo por el nombre completo, mientras que no poder generar el contrato no tiene arreglo.
 */
async function nuevoCodigo(tenantId, tipo, registro) {
    const nada = { codigo: "", guardar: async () => { } };
    if (!tenantId)
        return nada;
    try {
        const numero = await proximoNumeroDeDocumento(tenantId);
        const codigo = formatoCodigo(numero);
        const oid = (v) => (v && Types.ObjectId.isValid(String(v)) ? new Types.ObjectId(String(v)) : null);
        return {
            codigo,
            guardar: async (archivo) => {
                await DocumentoGenerado.create({
                    tenantId: oid(tenantId),
                    codigo,
                    numero,
                    tipo,
                    archivo,
                    userId: oid(registro?.userId),
                    userProjectId: oid(registro?.userProjectId),
                    projectId: oid(registro?.projectId),
                    contrato: registro?.contrato || {},
                }).catch((e) => console.warn(`[NOMENCLATURA] No se pudo registrar ${codigo}:`, e?.message || e));
            },
        };
    }
    catch (e) {
        console.warn("[NOMENCLATURA] No se pudo pedir el código del documento; sale sin código:", e?.message || e);
        return nada;
    }
}
export async function nombreArchivo(tenantId, tipo, datos, reservar = 4, 
/** De quién es el documento. Con esto el aviso de Dropbox Sign encuentra el contrato por el código. */
registro) {
    // Cada nombre que se genera es un documento nuevo, con su número. Quien ya trae uno, lo conserva.
    const nuevo = datos.codigo ? null : await nuevoCodigo(tenantId, tipo, registro);
    const conCodigo = nuevo ? { ...datos, codigo: nuevo.codigo } : datos;
    const porDefecto = renderNomenclatura(PATRON_POR_DEFECTO[tipo], conCodigo);
    let nombre;
    try {
        const fila = await NomenclaturaArchivo.findOne({ tenantId: tenantId, tipo }).select("patron").lean();
        // Todo patrón lleva el código, aunque el guardado sea de antes de que existiera.
        nombre = recortarNombre((fila?.patron && renderNomenclatura(asegurarCodigo(fila.patron), conCodigo)) || porDefecto, reservar);
    }
    catch (e) {
        console.warn("[NOMENCLATURA] No pude leer el patrón configurado; uso el de por defecto:", e?.message || e);
        nombre = recortarNombre(porDefecto, reservar);
    }
    if (nuevo)
        await nuevo.guardar(nombre);
    return nombre;
}
/** Atajo para los documentos de un contrato: arma los datos y aplica el patrón. */
export async function nombreArchivoDocumento(opts) {
    const { tenantId, tipo, empresa, ...resto } = opts;
    const valoresEmpresa = empresa ? empresaAValores(empresa) : await datosEmpresa(resto.contract?.empresaContratoId, resto.contract?.nombre_empresa_contrato);
    const centroDeCosto = await centroDeCostoDelProyecto({ projectId: resto.up?.projectId, externalProjectId: resto.up?.externalProjectId ?? resto.contract?.proyecto_id });
    return nombreArchivo(tenantId, tipo, { ...datosNombreArchivo({ tipo, ...resto }), ...valoresEmpresa, centroDeCosto }, 4, registroDelContrato(resto.user, resto.up, resto.contract));
}
/**
 * De quién es un documento de contrato: la persona, su vínculo con el proyecto y el contrato.
 *
 * El contrato se guarda por su posición Y por sus fechas: casi ninguno tiene `_id`, y la posición se
 * corre si se borra uno anterior. La posición se busca por identidad o, si llegó una copia
 * (`toObject`), por las mismas fechas de alta, baja y carga.
 */
function registroDelContrato(user, up, contract) {
    const c = contract || {};
    const contratos = Array.isArray(up?.contracts) ? up.contracts : [];
    const mismo = (x) => x === c || (fechaISO(x?.fecha_alta_contrato) === fechaISO(c.fecha_alta_contrato) && fechaISO(x?.fecha_baja_contrato) === fechaISO(c.fecha_baja_contrato) && String(x?.fecha_carga ?? "") === String(c.fecha_carga ?? ""));
    const indice = contratos.findIndex(mismo);
    const pid = up?.projectId;
    return {
        userId: user?._id,
        userProjectId: up?._id,
        projectId: typeof pid === "object" && pid?._id ? pid._id : pid,
        contrato: { indice: indice >= 0 ? indice : null, alta: fechaISO(c.fecha_alta_contrato), baja: fechaISO(c.fecha_baja_contrato), carga: String(c.fecha_carga ?? "") },
    };
}
