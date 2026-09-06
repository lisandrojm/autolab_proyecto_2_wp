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
/** Un token normalizado para comparar: sin acentos, en mayúsculas, sin puntuación. */
const clave = (x) => String(x || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
/**
 * Reescribe un campo guardado con la grafía EXACTA que devolvió ARCA.
 *
 * Se usa cuando el Padrón manda el nombre entero en un solo campo y ya sabemos que las palabras son
 * las mismas: ahí no hace falta adivinar qué es nombre y qué apellido —eso ya está decidido en la
 * ficha—, solo tomar de ARCA cómo se escribe cada palabra. Así "martina moreno" queda "MARTINA" y
 * "MORENO", que es como figura ante el organismo y como tiene que salir en un contrato.
 *
 * Cada palabra de ARCA se consume una sola vez, para que un nombre repetido ("JUAN JUAN") no
 * termine duplicando la misma.
 */
const conGrafiaDeArca = (guardado, palabrasDeArca) => {
    const disponibles = [...palabrasDeArca];
    return String(guardado || "")
        .split(/\s+/)
        .filter(Boolean)
        .map((palabra) => {
        const i = disponibles.findIndex((p) => clave(p) === clave(palabra));
        return i >= 0 ? disponibles.splice(i, 1)[0] : palabra;
    })
        .join(" ");
};
export async function aplicarNombreDeArca(opts) {
    const { tenantObjectId, userId, cuil, actual, arca } = opts;
    /*
      ARCA A VECES DEVUELVE EL NOMBRE ENTERO EN UNA SOLA PARTE.
  
      Para bastantes personas físicas el Padrón manda `apellido: "MORENO MARTINA"` y `nombre` vacío,
      todo junto en un campo. Con la regla anterior —sin las dos partes no se escribe nada— esas
      consultas se descartaban en silencio: el sello no se ponía, la fila seguía diciendo "Validar" y la
      corrida informaba "todos los nombres ya coincidían". El botón parecía no hacer nada.
  
      NO SE PARTE A LA ADIVINANZA. "DE LA TORRE JUAN" no se puede separar sin equivocarse, y un nombre
      inventado es peor que el que ya estaba. Lo que sí se puede es VERIFICAR: si las palabras que
      devolvió ARCA son exactamente las que ya están guardadas —sin importar orden, acentos ni
      mayúsculas—, entonces el nombre está confirmado y el sello corresponde, sin tocar los campos.
  
      Si no coinciden, no se escribe nada y el caso se informa: ahí hace falta que alguien mire.
    */
    if (!arca.nombre || !arca.apellido) {
        const deArca = `${arca.nombre || ""} ${arca.apellido || ""}`.trim();
        const guardado = `${actual.firstName || ""} ${actual.lastName || ""}`.trim();
        if (!deArca || !mismoNombre(deArca, guardado))
            return null;
        // Mismas palabras: se conserva qué es nombre y qué apellido, y se toma de ARCA cómo se escriben.
        const palabras = deArca.split(/\s+/).filter(Boolean);
        const nombreArca = conGrafiaDeArca(actual.firstName || "", palabras);
        const apellidoArca = conGrafiaDeArca(actual.lastName || "", palabras);
        const cambiaGrafia = nombreArca !== (actual.firstName || "") || apellidoArca !== (actual.lastName || "");
        await User.updateOne({ _id: userId, tenantId: tenantObjectId }, {
            $set: {
                ...(cambiaGrafia ? { firstName: nombreArca, lastName: apellidoArca, "metadata.nombre": nombreArca, "metadata.apellido": apellidoArca } : {}),
                "metadata.nombreValidadoArcaAt": new Date(),
            },
        });
        return cambiaGrafia ? { userId, cuil, antes: guardado || "(sin nombre cargado)", ahora: `${nombreArca} ${apellidoArca}`.trim() } : null;
    }
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
 * ¿Es el mismo nombre, aunque venga escrito distinto?
 *
 * Se compara como CONJUNTO DE PALABRAS, normalizadas: ARCA muestra «STOLTZING MICAELA SOL» —apellido
 * primero, todo en mayúsculas— y WeProdu guarda «Micaela Sol» + «Stoltzing». Comparar los strings
 * daría distinto SIEMPRE, y mandaría a consultar el padrón por las veinte personas en cada corrida.
 *
 * Comparar el conjunto y no la secuencia es a propósito: el orden apellido/nombre cambia según la
 * pantalla, y no es una diferencia de dato. Lo que sí importa —que falte o sobre una palabra— se
 * detecta igual.
 */
export function mismoNombre(a, b) {
    const partes = (x) => String(x || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // los acentos no son una diferencia de nombre
        .toUpperCase()
        .replace(/[^A-Z\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .sort()
        .join(" ");
    const pa = partes(a);
    return pa.length > 0 && pa === partes(b);
}
/** Prefijos de CUIT de persona física: solo en esos el tramo del medio es un DNI. */
const PREFIJOS_PERSONA_FISICA = ["20", "23", "24", "25", "26", "27"];
/** El DNI que se desprende del propio CUIT. Vacío si no es de persona física. */
const dniDelCuit = (cuit) => (PREFIJOS_PERSONA_FISICA.includes(cuit.slice(0, 2)) ? String(Number(cuit.slice(2, 10))) : "");
/**
 * Resuelve contra el Padrón el nombre de unas pocas personas.
 *
 * SOLO SE LLAMA POR LOS QUE DIFIEREN, y esa es toda la diferencia de costo.
 *
 * La corrida de obras sociales ya lee el nombre de la pantalla de altas —ARCA lo precompleta al lado
 * del CUIL— así que comparar es gratis. Pero la pantalla lo muestra ENTERO: para ESCRIBIRLO hacen
 * falta nombre y apellido por separado, y partir «MARIA DEL CORAZON DE JESUS SORIA» por un espacio es
 * adivinar dónde termina uno y empieza el otro. El padrón (`ws_sr_padron_a13`) los devuelve separados
 * y es el mismo organismo.
 *
 * Antes esto se corría por TODAS las personas de la corrida, en paralelo con el navegador: veinte
 * consultas SOAP y veinte handshakes TLS peleando por el mismo VPS con el Chromium que estaba
 * cargando el login de AFIP. Ahora se llama por los pocos que de verdad difieren — casi siempre,
 * ninguno.
 *
 * Best-effort de punta a punta: si el certificado no está conectado, o una consulta falla, quien
 * llama no se entera. Corregir un nombre no puede costar la validación entera.
 */
export async function confirmarNombresConElPadron(opts) {
    const { tenantObjectId, tenantId, userIds } = opts;
    const renombrados = [];
    const confirmados = [];
    const noEncontrados = [];
    const inactivos = [];
    if (userIds.length === 0)
        return { renombrados, confirmados, consultados: 0, noEncontrados, inactivos };
    const tenant = await Tenant.findById(tenantObjectId).lean();
    const cfg = getTenantAfipConfig(tenant);
    if (!cfg) {
        return { renombrados, confirmados, consultados: 0, noEncontrados, inactivos, motivoSinConsultar: "El certificado de ARCA no está conectado, así que no se pudo confirmar ningún nombre contra el Padrón." };
    }
    const users = await User.find({ _id: { $in: userIds }, tenantId: tenantObjectId })
        .select("_id firstName lastName metadata.cuit metadata.documento")
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
                /*
                  INACTIVO NO ES «NO RECONOCIDO». Se informa aparte y la corrida sigue.
      
                  Los dos casos llegan como SOAP Fault y por eso caían juntos acá, con el cartel «ARCA no
                  reconoció ese CUIT · corregí el dato en la ficha» sobre un número que estaba bien.
      
                  No hay nombre para corregir —el fault no trae ninguno— así que estas personas no se
                  renombran ni reciben el sello, y eso es lo correcto: nadie confirmó ese nombre. Lo que sí
                  se puede verificar es el DOCUMENTO, que sale del propio CUIT sin preguntarle nada a nadie.
                  Se compara y se informa; escribirlo sería otra decisión y no la toma una corrida masiva.
                */
                if (r.estado === "inactivo") {
                    const documento = dniDelCuit(cuit);
                    const guardado = String(u?.metadata?.documento || "").replace(/\D/g, "");
                    inactivos.push({ cuit, documento, documentoGuardado: guardado, coincide: !!documento && !!guardado && String(Number(guardado)) === documento });
                    return;
                }
                if (!r.encontrado) {
                    noEncontrados.push({ cuit, motivo: String(r.faultString || "ARCA no devolvió datos para este CUIT.") });
                    return;
                }
                const cambio = await aplicarNombreDeArca({
                    tenantObjectId,
                    userId: String(u._id),
                    cuil: cuit,
                    actual: { firstName: u.firstName, lastName: u.lastName },
                    arca: { nombre: r.nombre, apellido: r.apellido },
                });
                if (r.nombre && r.apellido)
                    confirmados.push(cuit);
                /*
                  ARCA contestó, pero no se pudo dejar el sello: el nombre vino en una sola parte y NO
                  coincide con el guardado. Se informa en vez de descartarlo, que es lo que hacía que el
                  botón pareciera no hacer nada.
                */
                if (!r.nombre || !r.apellido) {
                    const u2 = await User.findById(u._id).select("metadata.nombreValidadoArcaAt").lean();
                    if (!u2?.metadata?.nombreValidadoArcaAt) {
                        const deArca = `${r.nombre || ""} ${r.apellido || ""}`.trim();
                        noEncontrados.push({
                            cuit,
                            motivo: deArca
                                ? `ARCA devolvió «${deArca}» en un solo campo y no coincide con el nombre guardado. Corregilo a mano y volvé a validar.`
                                : "ARCA no devolvió nombre ni apellido para este CUIT (puede ser una persona jurídica).",
                        });
                    }
                }
                if (cambio)
                    renombrados.push(cambio);
            }
            catch (e) {
                // best-effort: un nombre no confirmado no puede tumbar la corrida, pero SÍ se informa.
                noEncontrados.push({ cuit, motivo: String(e?.message || "No se pudo consultar.") });
            }
        }));
    }
    return { renombrados, confirmados, consultados, noEncontrados, inactivos };
}
/**
 * Los usuarios de un conjunto de CUIL, indexados por CUIL en dígitos.
 *
 * Se compara por DÍGITOS y no por string: `metadata.cuit` se guarda con o sin guiones según de dónde
 * vino. Es el mismo emparejamiento que hace `pendientesObraSocial`, y comparar crudo es exactamente
 * lo que hacía que la validación de obras sociales no encontrara a nadie.
 *
 * Devuelve el usuario entero y no solo el id porque quien llama necesita el nombre guardado para
 * compararlo: con los ids sueltos habría que volver a leer los mismos documentos.
 */
export async function usuariosDeCuils(tenantObjectId, cuils) {
    const buscados = new Set(cuils.map((c) => String(c || "").replace(/\D/g, "")).filter((c) => c.length === 11));
    const out = new Map();
    if (buscados.size === 0)
        return out;
    const users = await User.find({ tenantId: tenantObjectId, "metadata.cuit": { $exists: true, $ne: "" } })
        .select("_id firstName lastName metadata.cuit metadata.nombreValidadoArcaAt")
        .lean();
    for (const u of users) {
        const d = String(u?.metadata?.cuit || "").replace(/\D/g, "");
        if (buscados.has(d))
            out.set(d, u);
    }
    return out;
}
