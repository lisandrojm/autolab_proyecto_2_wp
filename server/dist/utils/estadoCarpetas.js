import { Info } from "../models/Info.js";
import { PROPOSITOS, definicionDe, esProposito, textoDeCarpeta, etiquetaProposito } from "./propositosCarpeta.js";
/**
 * Cada vez que hizo falta el fallback. En memoria, por proceso.
 *
 * No es un log de auditoría: es el insumo del síntoma visible. Sin esto, una carpeta sin migrar
 * resuelve bien y nadie se entera de que está resolviendo por el camino frágil — hasta que alguien
 * la renombra y deja de resolver.
 */
const usosDeFallback = new Map();
export const fallbacksUsados = () => [...usosDeFallback.values()].sort((a, b) => b.cuando.getTime() - a.cuando.getTime());
const anotarFallback = (proposito, carpeta) => {
    const previo = usosDeFallback.get(proposito);
    usosDeFallback.set(proposito, { proposito, carpeta, cuando: new Date(), veces: (previo?.veces || 0) + 1 });
    // Una línea por proceso y por propósito: sirve para enterarse, no para llenar el log.
    if (!previo) {
        console.warn(`[CARPETAS] «${etiquetaProposito(proposito)}» se resolvió POR EL NOMBRE de la carpeta ("${carpeta}"), no por su propósito. Cargale el propósito en Configuración → Documentos → Dropbox: si alguien la renombra, esta resolución deja de funcionar sin avisar.`);
    }
};
async function estadosConTransicion() {
    const estados = await Info.find({ type: "estado-empleado", "data.transicionAutomatica.carpetas.0": { $exists: true } })
        .select("name data.transicionAutomatica")
        .lean();
    return estados.map((e) => ({ name: e.name, carpetas: (e?.data?.transicionAutomatica?.carpetas || []) }));
}
/**
 * La decisión, SIN base de datos. Es lo que se testea.
 *
 * Separada de la lectura a propósito: el comportamiento que importa —propósito primero, patrón
 * como último recurso, y nunca prestarse una carpeta que ya tiene otro propósito— se puede fijar
 * en tests sin levantar Mongo ni inventar un mock del modelo.
 */
export function elegirCarpeta(estados, proposito) {
    for (const estado of estados) {
        const match = estado.carpetas.find((c) => c.proposito === proposito && c.dropboxCarpeta);
        if (match)
            return { proposito, carpeta: match.dropboxCarpeta, origen: "proposito", estado: estado.name };
    }
    const patrones = definicionDe(proposito)?.patrones || [];
    for (const estado of estados) {
        /*
          Solo las que NO tienen propósito.
    
          Una carpeta con OTRO propósito cargado no puede "prestarse" porque su nombre se parezca: eso
          sería el acierto por casualidad que este cambio viene a eliminar, y encima pisando una
          decisión que alguien tomó explícitamente.
        */
        const match = estado.carpetas.find((c) => !esProposito(c.proposito) && c.dropboxCarpeta && patrones.every((re) => re.test(textoDeCarpeta(c))));
        if (match)
            return { proposito, carpeta: match.dropboxCarpeta, origen: "patron", estado: estado.name };
    }
    return { proposito, carpeta: null, origen: "no_resuelta" };
}
/** Igual que `elegirCarpeta`, pero leyendo la configuración y dejando registro del fallback. */
export async function resolverProposito(proposito) {
    const r = elegirCarpeta(await estadosConTransicion(), proposito);
    if (r.origen === "patron" && r.carpeta)
        anotarFallback(proposito, r.carpeta);
    return r;
}
/** El path, o `null`. Es lo que consume el código que solo necesita la ruta. */
export async function resolverCarpetaPorProposito(proposito) {
    return (await resolverProposito(proposito)).carpeta;
}
/**
 * La carpeta de «Sin CUIT», que puede no estar configurada y deducirse de la de Constancia.
 *
 * LA DEDUCCIÓN TAMBIÉN PASA POR PROPÓSITO. Antes se resolvía Constancia por patrón y se le colgaba
 * «/Sin cuit» al padre: o sea que seguía atada al nombre por la puerta de atrás, aunque el primer
 * paso ya no lo estuviera. Ahora el hermano se calcula sobre la carpeta que el PROPÓSITO devolvió.
 *
 * El nombre «Sin cuit» del último tramo es lo único que queda escrito, y es inevitable: se está
 * nombrando una carpeta que todavía no existe en ningún lado. Por eso `origen` lo dice — quien mire
 * el estado va a ver que esa ruta se dedujo y no se configuró.
 */
/** La decisión de «Sin CUIT», sin base de datos. */
export function elegirSinCuit(estados) {
    const propia = elegirCarpeta(estados, "sin_cuit");
    if (propia.carpeta)
        return propia;
    const constancia = elegirCarpeta(estados, "constancia_cuit");
    if (!constancia.carpeta)
        return { proposito: "sin_cuit", carpeta: null, origen: "no_resuelta" };
    const raiz = constancia.carpeta.replace(/\/$/, "").split("/").slice(0, -1).join("/");
    return { proposito: "sin_cuit", carpeta: `${raiz}/Sin cuit`, origen: "derivada", estado: constancia.estado };
}
export async function resolverSinCuit() {
    const estados = await estadosConTransicion();
    const r = elegirSinCuit(estados);
    if (r.origen === "patron" && r.carpeta)
        anotarFallback("sin_cuit", r.carpeta);
    return r;
}
/**
 * El ESTADO cuya configuración incluye alguna carpeta de alguno de estos propósitos.
 *
 * Lo usa la bandeja de Firma Digital para saber qué estado la alimenta, sin hardcodear su nombre.
 */
export async function resolverEstadoPorPropositos(propositos) {
    const estados = await estadosConTransicion();
    for (const estado of estados) {
        if (estado.carpetas.some((c) => esProposito(c.proposito) && propositos.includes(c.proposito)))
            return estado.name;
    }
    // Fallback por nombre, igual que arriba y con el mismo ruido.
    for (const estado of estados) {
        for (const p of propositos) {
            const patrones = definicionDe(p)?.patrones || [];
            const match = estado.carpetas.find((c) => !esProposito(c.proposito) && patrones.every((re) => re.test(textoDeCarpeta(c))));
            if (match) {
                anotarFallback(p, match.dropboxCarpeta || "");
                return estado.name;
            }
        }
    }
    return null;
}
/**
 * Estado de resolución de los seis propósitos. Es lo que dibuja el síntoma en pantalla.
 *
 * NO bloquea nada ni afirma que falte algo: un tenant puede legítimamente no usar un propósito. Solo
 * dice, para cada uno, si se resolvió por su propósito, de casualidad por el nombre, o no se resolvió.
 */
export async function diagnosticoCarpetas() {
    const out = [];
    for (const p of PROPOSITOS)
        out.push(p.valor === "sin_cuit" ? await resolverSinCuit() : await resolverProposito(p.valor));
    return out;
}
