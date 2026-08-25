import { User } from "../../models/User.js";
import { Tenant } from "../../models/Tenant.js";
import { consultarPadron, getTenantAfipConfig } from "../afipService.js";
import { normalizarCuit, cuitEsValido } from "../../utils/constanciaPdf.js";
/**
 * Escribe el nombre de ARCA sobre el de la persona.
 *
 * SE GUARDA TAL CUAL VIENE, en mayúsculas y sin acomodar nada. Cualquier prolijidad que le agreguemos
 * —capitalizar, reordenar— lo aleja de lo que dice el organismo, que es exactamente el valor que
 * tiene el dato.
 *
 * Devuelve el cambio solo si lo hubo. El sello `nombreValidadoArcaAt` se pone igual cuando ya
 * coincidía: lo que afirma es «esto es lo que ARCA tiene», no «esto se cambió».
 */
export async function aplicarNombreDeArca(opts) {
    const { tenantObjectId, userId, cuil, actual, arca } = opts;
    // Sin las DOS partes no se escribe nada. Una persona jurídica trae `razonSocial` y no se puede
    // partir sin adivinar, y un nombre adivinado es peor que el que ya estaba.
    if (!arca.nombre || !arca.apellido)
        return null;
    const antes = `${actual.firstName || ""} ${actual.lastName || ""}`.trim();
    const ahora = `${arca.nombre} ${arca.apellido}`.trim();
    const cambia = (actual.firstName || "") !== arca.nombre || (actual.lastName || "") !== arca.apellido;
    await User.updateOne({ _id: userId, tenantId: tenantObjectId }, {
        $set: {
            ...(cambia
                ? {
                    firstName: arca.nombre,
                    lastName: arca.apellido,
                    // `metadata.nombre`/`apellido` son la copia que trae FRAME. Actualizar solo
                    // `firstName`/`lastName` deja las dos versiones diciendo cosas distintas sobre la misma
                    // persona, y después no hay forma de saber cuál se está mirando.
                    "metadata.nombre": arca.nombre,
                    "metadata.apellido": arca.apellido,
                }
                : {}),
            "metadata.nombreValidadoArcaAt": new Date(),
        },
    });
    return cambia ? { userId, cuil, antes: antes || "(sin nombre cargado)", ahora } : null;
}
/**
 * Confirma contra el Padrón el nombre de un conjunto de personas.
 *
 * POR QUÉ LA VALIDACIÓN DE OBRAS SOCIALES PREGUNTA ACÁ Y NO MIRA LA PANTALLA QUE TIENE ADELANTE
 *
 * La corrida de obras sociales trabaja sobre la pantalla de altas de Simplificación Registral, que
 * muestra el nombre de la persona — pero ENTERO, en un solo campo. Para escribirlo hacen falta nombre
 * y apellido por separado, y partir «MARIA DEL CORAZON DE JESUS SORIA» por un espacio es adivinar
 * dónde termina uno y empieza el otro. El padrón (`ws_sr_padron_a13`) los devuelve separados y es el
 * mismo organismo, así que la respuesta autoritativa ya existe: se pregunta ahí.
 *
 * Best-effort de punta a punta: si el certificado no está conectado, o una consulta falla, quien
 * llama no se entera. Corregir un nombre no puede costar la validación entera.
 */
export async function confirmarNombresConElPadron(opts) {
    const { tenantObjectId, tenantId, userIds } = opts;
    const renombrados = [];
    const confirmados = [];
    if (userIds.length === 0)
        return { renombrados, confirmados, consultados: 0 };
    const tenant = await Tenant.findById(tenantObjectId).lean();
    const cfg = getTenantAfipConfig(tenant);
    if (!cfg) {
        return { renombrados, confirmados, consultados: 0, motivoSinConsultar: "El certificado de ARCA no está conectado, así que no se pudo confirmar ningún nombre contra el Padrón." };
    }
    const users = await User.find({ _id: { $in: userIds }, tenantId: tenantObjectId })
        .select("_id firstName lastName metadata.cuit")
        .lean();
    let consultados = 0;
    /*
      De a seis, no de a tres como la consulta masiva de «Validar CUIT».
  
      Son consultas de LECTURA, y acá hay alguien esperando: de a tres, veinte personas son siete
      vueltas. Seis sigue siendo un goteo para el organismo y parte la espera al medio. Si alguna vez
      ARCA empieza a rechazar por ritmo, este es el número que hay que bajar.
    */
    const CONCURRENCIA = 6;
    for (let i = 0; i < users.length; i += CONCURRENCIA) {
        await Promise.all(users.slice(i, i + CONCURRENCIA).map(async (u) => {
            const cuit = normalizarCuit(u?.metadata?.cuit);
            if (!cuit || !cuitEsValido(cuit))
                return;
            try {
                const r = await consultarPadron(tenantId, cfg, cuit);
                consultados++;
                if (!r.encontrado)
                    return;
                const cambio = await aplicarNombreDeArca({
                    tenantObjectId,
                    userId: String(u._id),
                    cuil: cuit,
                    actual: { firstName: u.firstName, lastName: u.lastName },
                    arca: { nombre: r.nombre, apellido: r.apellido },
                });
                if (r.nombre && r.apellido)
                    confirmados.push(cuit);
                if (cambio)
                    renombrados.push(cambio);
            }
            catch {
                /* best-effort: un nombre no confirmado no puede tumbar la corrida */
            }
        }));
    }
    return { renombrados, confirmados, consultados };
}
/**
 * Los `userId` de un conjunto de CUIL.
 *
 * Se compara por DÍGITOS y no por string: `metadata.cuit` se guarda con o sin guiones según de dónde
 * vino. Es el mismo emparejamiento que hace `pendientesObraSocial`, y comparar crudo es exactamente
 * lo que hacía que la validación de obras sociales no encontrara a nadie.
 */
export async function userIdsDeCuils(tenantObjectId, cuils) {
    const buscados = new Set(cuils.map((c) => String(c || "").replace(/\D/g, "")).filter((c) => c.length === 11));
    if (buscados.size === 0)
        return [];
    const users = await User.find({ tenantId: tenantObjectId, "metadata.cuit": { $exists: true, $ne: "" } })
        .select("_id metadata.cuit")
        .lean();
    return users.filter((u) => buscados.has(String(u?.metadata?.cuit || "").replace(/\D/g, ""))).map((u) => String(u._id));
}
