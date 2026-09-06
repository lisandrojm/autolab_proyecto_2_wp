/**
 * LOS DOS ESTADOS IMPOSITIVOS SON DEL SISTEMA. Siempre existen y no se pueden borrar.
 *
 * Todo contrato declara uno de los dos trámites: o es un alta temprana ante ARCA, o es una locación
 * de servicios. No es una preferencia de cada productora — es cómo se declara el vínculo ante el
 * organismo—, así que no puede depender de que alguien se acuerde de crearlos en el ABM.
 *
 * El problema real era ese: si alguien los borraba, o si un tenant nuevo arrancaba sin ellos, el
 * wizard se quedaba sin ningún estado que ofrecer y las altas entraban sin trámite declarado. Y eso
 * no se nota en la pantalla: se nota cuando el TXT de ARCA sale mal.
 *
 * SE CREAN SIN TIPOS DE CONTRATO ASOCIADOS, a propósito. Qué tipo de contrato lleva cuál lo decide
 * cada productora en el ABM; el sistema garantiza que los dos estados estén, no a qué se aplican.
 *
 * ADOPTA, NO DUPLICA. Si ya hay un estado con la misma clave canónica —«Falta pedido de AFIP» es el
 * mismo que «Pedido de AFIP»— se lo marca como de sistema y se le completa SOLO lo que le falte.
 * Nunca se pisa un valor ya configurado: el color, la etiqueta o los tipos que cargó alguien quedan
 * como están. Crear uno nuevo al lado dejaría dos estados para el mismo trámite, que es peor que el
 * problema que esto resuelve.
 *
 * El NOMBRE GUARDADO sigue diciendo «AFIP». Es la clave con la que matchean los contratos ya
 * guardados y los filtros (`claveEstado`); el renombre a ARCA se hace al dibujar (`TEXTO_VIEJO` en
 * `EstadoSelect.tsx`). Cambiarlo acá es una migración, no un seed.
 */
import { Info } from "../models/Info.js";
import { claveEstado } from "./estadoClave.js";
export const ESTADO_TYPE = "estado-empleado";
/** Los ids de FRAME son bajos; los locales arrancan bien arriba para no pisarlos nunca. */
const LOCAL_ESTADO_ID_BASE = 100000;
export const ESTADOS_IMPOSITIVOS_SISTEMA = [
    { name: "Pedido de AFIP", tipoImpositivo: "alta_temprana_afip", etiquetaSecundaria: "Alta ARCA", color: "#b91c1c", orden: 0 },
    { name: "Pedido de Servicios", tipoImpositivo: "constancia_cuit", etiquetaSecundaria: "Alta Servicios", color: "#c2410c", orden: 1 },
];
/** ¿Este estado (su `data`) es uno de los dos de sistema? */
export const esEstadoDeSistema = (data) => data?.esSistema === true;
/**
 * Deja los dos estados creados. Idempotente: se puede correr en cada arranque.
 *
 * Devuelve qué hizo, para que el log del arranque lo diga en vez de quedar en silencio.
 */
export async function ensureEstadosImpositivosSistema() {
    const creados = [];
    const adoptados = [];
    const existentes = await Info.find({ type: ESTADO_TYPE }).lean();
    const porClave = new Map();
    for (const e of existentes)
        porClave.set(claveEstado(e.name), e);
    for (const semilla of ESTADOS_IMPOSITIVOS_SISTEMA) {
        const yaEsta = porClave.get(claveEstado(semilla.name));
        if (yaEsta) {
            /*
              Solo se agrega lo que falta. `esSistema` es lo único que se fuerza —es la marca que hace que
              no se pueda borrar, y es el punto de todo esto—; el resto entra únicamente si el campo está
              vacío, para no pisar lo que configuró la productora.
            */
            const data = yaEsta.data || {};
            const set = {};
            if (data.esSistema !== true)
                set["data.esSistema"] = true;
            if (data.esImpositivo !== true)
                set["data.esImpositivo"] = true;
            if (!data.tipoImpositivo)
                set["data.tipoImpositivo"] = semilla.tipoImpositivo;
            if (!data.etiquetaSecundaria)
                set["data.etiquetaSecundaria"] = semilla.etiquetaSecundaria;
            if (!data.color)
                set["data.color"] = semilla.color;
            // Los impositivos van al Paso 1 del flujo de dependencias (misma regla que el ABM).
            if (typeof data.ordenDependencia !== "number")
                set["data.ordenDependencia"] = 1;
            if (Object.keys(set).length > 0) {
                await Info.updateOne({ _id: yaEsta._id }, { $set: set });
                adoptados.push(yaEsta.name);
            }
            continue;
        }
        // No existe ninguno con esa clave: se crea. El id local no puede pisar los de FRAME.
        const ultimoLocal = await Info.findOne({ type: ESTADO_TYPE, "data.id": { $gte: LOCAL_ESTADO_ID_BASE } })
            .sort({ "data.id": -1 })
            .lean();
        const nuevoId = Math.max(LOCAL_ESTADO_ID_BASE, Number(ultimoLocal?.data?.id ?? 0) + 1);
        await Info.create({
            type: ESTADO_TYPE,
            externalId: `local-${nuevoId}`,
            name: semilla.name,
            data: {
                id: nuevoId,
                nombre: semilla.name,
                esSistema: true,
                esImpositivo: true,
                tipoImpositivo: semilla.tipoImpositivo,
                etiquetaSecundaria: semilla.etiquetaSecundaria,
                color: semilla.color,
                colorEtiquetaSecundaria: semilla.color,
                // Sin tipos de contrato: a cuáles se aplica lo decide cada productora en el ABM.
                contratoFrameIds: [],
                orden: semilla.orden,
                ordenDependencia: 1,
            },
        });
        creados.push(semilla.name);
        // El siguiente de la vuelta tiene que ver este id: se refresca el mapa por las dudas de que
        // las dos semillas caigan en la misma corrida.
        porClave.set(claveEstado(semilla.name), { name: semilla.name });
    }
    return { creados, adoptados };
}
