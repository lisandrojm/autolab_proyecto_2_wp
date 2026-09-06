import { Types } from "mongoose";
import UserProject from "../models/UserProject.js";
import { User } from "../models/User.js";
import { Company } from "../models/Company.js";
import { ObraSocial } from "../models/ObraSocial.js";
/** Error de entrada: el lote no se aplica y hay que decir por qué. */
export class LoteObrasSocialesError extends Error {
    status;
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}
const soloDigitos = (v) => String(v ?? "").replace(/\D/g, "");
/**
 * ¿Este contrato ya tiene la obra social sellada por ARCA?
 *
 * ES LA REGLA DE IDEMPOTENCIA, y está acá afuera por dos motivos: la usan los dos caminos —aplicar y
 * listar pendientes— y tienen que coincidir exactamente. Si "pendiente" y "no se pisa" no fueran la
 * misma condición, el script pediría gente que después el POST rechaza, o peor: pisaría algo que la
 * grilla ya daba por resuelto.
 *
 * `obraSocialNoFigura` cuenta como constatada a propósito: "ARCA no tiene ninguna" es una RESPUESTA
 * —rige la del convenio— y volver a preguntarla es trabajo repetido, no un pendiente.
 */
export function yaConstatadaEnArca(contrato) {
    if (!contrato)
        return false;
    if (contrato.obraSocialBloqueada === true)
        return true;
    return contrato.obraSocialConstatadaEn === "arca" && (contrato.obraSocialId != null || contrato.obraSocialNoFigura === true);
}
export function clasificarRnos(rnos, porRnos, registradas) {
    if (!rnos)
        return { estado: "sin_obra_social" };
    const os = porRnos.get(soloDigitos(rnos)) || null;
    if (!os)
        return { estado: "rnos_desconocido" };
    // `registradas` vacío = la empleadora no cargó su lista: no se puede afirmar que falte, así que no
    // se rechaza. Es la misma tolerancia que tenía el panel.
    if (registradas.size > 0 && !registradas.has(String(os._id)))
        return { estado: "no_registrada", os };
    return { estado: "ok", os };
}
export async function aplicarLoteObrasSociales(opts) {
    const { tenantObjectId, empresaId, filas, previsualizar = false, forzar = false, origen = "panel", usuarioId } = opts;
    if (!Types.ObjectId.isValid(empresaId)) {
        throw new LoteObrasSocialesError("Falta la empleadora: el lote se aplica a los contratos de un solo CUIT.");
    }
    if (filas.length === 0)
        throw new LoteObrasSocialesError("No llegó ninguna fila para aplicar.");
    // Tope defensivo: una tanda real son decenas. Miles significa que algo se pegó mal, y conviene
    // frenarlo antes de escribir que a la mitad.
    if (filas.length > 500) {
        throw new LoteObrasSocialesError(`Llegaron ${filas.length} filas. El lote está pensado para una tanda de constatación, no para una carga masiva: revisá lo que pegaste.`);
    }
    const empresa = await Company.findById(empresaId).select("obrasSocialesIds razonSocial").lean();
    if (!empresa)
        throw new LoteObrasSocialesError("Empresa no encontrada", 404);
    const registradas = new Set((empresa.obrasSocialesIds || []).map((id) => String(id)));
    // Se normalizan y deduplican las filas ANTES de tocar la base: el pegado puede traer la misma
    // persona dos veces (dos corridas encimadas) y aplicarla dos veces daría dos resultados distintos
    // si los RNOS no coinciden, sin que nadie lo note.
    const porCuil = new Map();
    const conflictos = [];
    for (const f of filas) {
        const cuil = soloDigitos(f?.cuil);
        if (cuil.length !== 11)
            continue;
        const rnos = soloDigitos(f?.rnos);
        if (porCuil.has(cuil) && porCuil.get(cuil) !== rnos)
            conflictos.push(cuil);
        porCuil.set(cuil, rnos);
    }
    if (porCuil.size === 0) {
        throw new LoteObrasSocialesError("Ninguna fila tenía un CUIL de 11 dígitos. El formato esperado es CUIL,RNOS por línea.");
    }
    if (conflictos.length > 0) {
        throw new LoteObrasSocialesError(`El mismo CUIL vino con dos obras sociales distintas (${conflictos.slice(0, 3).join(", ")}${conflictos.length > 3 ? "…" : ""}). No se aplicó nada: revisá el pegado antes de reintentar.`);
    }
    // Catálogo de las obras sociales mencionadas, en una sola consulta.
    const rnosPedidos = [...new Set([...porCuil.values()].filter(Boolean))];
    const catalogo = await ObraSocial.find({ externalId: { $in: rnosPedidos } })
        .select("_id name externalId data")
        .lean();
    const porRnos = new Map(catalogo.map((o) => [soloDigitos(o.externalId), o]));
    // Usuarios de este tenant por CUIL. `metadata.cuit` guarda el CUIL de la persona.
    const usuarios = await User.find({ tenantId: tenantObjectId, "metadata.cuit": { $exists: true, $ne: "" } })
        .select("_id metadata.cuit firstName lastName")
        .lean();
    const usuariosPorCuil = new Map();
    for (const u of usuarios) {
        const c = soloDigitos(u?.metadata?.cuit);
        if (c.length !== 11)
            continue;
        usuariosPorCuil.set(c, [...(usuariosPorCuil.get(c) || []), u]);
    }
    const resultado = {
        aplicados: 0,
        contratosAlcanzados: 0,
        sinContrato: [],
        rnosDesconocido: [],
        noRegistrada: [],
        yaBloqueados: [],
        noFigura: 0,
        previsualizacion: previsualizar,
    };
    for (const [cuil, rnos] of porCuil) {
        const users = usuariosPorCuil.get(cuil) || [];
        if (users.length === 0) {
            resultado.sinContrato.push(cuil);
            continue;
        }
        // Se resuelve la obra social ANTES de escribir: si el código no existe o la empleadora no lo
        // tiene registrado, esa fila no se aplica y se informa — pero no frena a las demás.
        const clasificacion = clasificarRnos(rnos, porRnos, registradas);
        if (clasificacion.estado === "rnos_desconocido") {
            resultado.rnosDesconocido.push({ cuil, rnos });
            continue;
        }
        if (clasificacion.estado === "no_registrada") {
            resultado.noRegistrada.push({ cuil, rnos, nombre: clasificacion.os?.name || "" });
            continue;
        }
        const os = clasificacion.estado === "ok" ? clasificacion.os : null;
        const ups = await UserProject.find({ userId: { $in: users.map((u) => u._id) }, "contracts.empresaContratoId": new Types.ObjectId(empresaId) });
        let alcanzados = 0;
        let bloqueadoAlguno = false;
        for (const up of ups) {
            let tocado = false;
            up.contracts.forEach((contrato, idx) => {
                if (String(contrato?.empresaContratoId || "") !== empresaId)
                    return;
                // Lo ya sellado en ARCA no se pisa: el lote es para constatar lo pendiente, y una corrida
                // repetida no puede cambiar en silencio algo que quedó fijo. ESTO es lo que hace idempotente
                // al endpoint — la segunda pasada del mismo lote cae entera acá.
                if (!forzar && yaConstatadaEnArca(contrato)) {
                    bloqueadoAlguno = true;
                    return;
                }
                alcanzados++;
                if (previsualizar)
                    return;
                up.contracts[idx] = {
                    ...contrato.toObject(),
                    obraSocialId: os ? Number(os?.data?.id) : null,
                    obraSocialOrigen: os ? "constatada" : undefined,
                    obraSocialConstatadaEn: "arca",
                    obraSocialConstatadaEl: new Date(),
                    obraSocialNoFigura: !os,
                    obraSocialBloqueada: true,
                    obraSocialAplicadaOrigen: origen,
                    obraSocialAplicadaPor: usuarioId ? new Types.ObjectId(String(usuarioId)) : null,
                };
                tocado = true;
            });
            if (tocado && !previsualizar) {
                up.markModified("contracts");
                await up.save();
            }
        }
        if (alcanzados === 0) {
            if (bloqueadoAlguno)
                resultado.yaBloqueados.push(cuil);
            else
                resultado.sinContrato.push(cuil);
            continue;
        }
        resultado.aplicados++;
        resultado.contratosAlcanzados += alcanzados;
        if (!os)
            resultado.noFigura++;
    }
    return resultado;
}
/**
 * Los CUIL que le faltan constatar a una empleadora.
 *
 * Mismo criterio que la grilla usa para su "N sin validar": el contrato es de esa empleadora, la
 * persona tiene un CUIL de 11 dígitos, y la obra social todavía no quedó sellada por ARCA. Se calcula
 * del lado del server para que el script no tenga que replicar la regla — replicarla es cómo se
 * termina validando gente que ya estaba, o salteando gente que faltaba.
 */
export async function pendientesObraSocial(tenantObjectId, empresaId) {
    if (!Types.ObjectId.isValid(empresaId)) {
        throw new LoteObrasSocialesError("Falta la empleadora: los pendientes son siempre de un CUIT.");
    }
    const usuarios = await User.find({ tenantId: tenantObjectId, "metadata.cuit": { $exists: true, $ne: "" } })
        .select("_id metadata.cuit firstName lastName")
        .lean();
    const porId = new Map(usuarios.map((u) => [String(u._id), u]));
    const ups = await UserProject.find({
        userId: { $in: usuarios.map((u) => u._id) },
        "contracts.empresaContratoId": new Types.ObjectId(empresaId),
    })
        .select("userId contracts")
        .lean();
    // `userId` va incluido porque la corrida confirma además el NOMBRE de cada persona contra el
    // padrón (ver `services/arca/nombreArca.ts`): sin esto habría que volver a resolver CUIT → usuario
    // del otro lado, que es resolver dos veces lo mismo.
    const out = [];
    const vistos = new Set();
    for (const up of ups) {
        const u = porId.get(String(up.userId));
        const cuil = soloDigitos(u?.metadata?.cuit);
        if (cuil.length !== 11)
            continue;
        for (const c of up.contracts || []) {
            if (String(c?.empresaContratoId || "") !== empresaId)
                continue;
            // La MISMA condición que usa el aplicador para no pisar: ver `yaConstatadaEnArca`.
            if (yaConstatadaEnArca(c))
                continue;
            // Un CUIL una sola vez: la consulta a ARCA es por persona, y la misma puede tener varios
            // contratos en la misma empleadora. Repetirlo desperdiciaría lugares de la tanda de 10.
            if (vistos.has(cuil))
                continue;
            vistos.add(cuil);
            out.push({ contratoId: String(c._id || ""), cuil, nombre: [u?.firstName, u?.lastName].filter(Boolean).join(" "), userId: String(up.userId) });
        }
    }
    return out;
}
