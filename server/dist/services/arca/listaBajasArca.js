/**
 * BAJAS ARCA: LA LISTA (22/11/2026, pedido del usuario). El único lugar desde donde se da de baja una relación en
 * ARCA. Una fila por relación VIVA en ARCA (abierta, o con fin de hoy en adelante) sobre la que se puede operar, y
 * cada fila con exactamente UNA situación:
 *
 *   1. Terminado en WeProdu            el contrato tiene fecha de baja pasada y la relación sigue abierta en ARCA.
 *   2. Termina antes de su fecha       contrato a plazo cuya baja en WeProdu es anterior al fin que tiene ARCA.
 *   3. Baja presentada, sin confirmar  se mandó desde acá y no se leyó el resultado, o quedó en error de navegación.
 *   4. Sin contrato en WeProdu         ningún contrato con esa persona, empleadora y fecha de inicio. Incluye las
 *                                      que ARCA cierra sola (fin futuro): «ARCA la cierra sola» supone que hay un
 *                                      contrato, y acá no lo hay (Peralta Recio, Viggiano). La fila distingue
 *                                      «persona sin ficha en WeProdu» de «ficha sin contrato con esa alta».
 *   5. Indeterminado vigente           abierto de los dos lados. Inventario, no trabajo: no suma al total del menú.
 *
 * QUÉ NO ENTRA (y por qué, en `fuera`): relaciones cerradas; plazos vigentes que ARCA cierra sola; las que tienen
 * VARIOS contratos candidatos (van a Auditoría ARCA › «Relación con varios contratos»). Son dos cosas distintas:
 *   · `varios_contratos`: duplicados dentro del MISMO proyecto. Se anula el que sobra y la relación entra a la lista.
 *   · `varios_proyectos`: la misma relación cargada en VARIOS proyectos («agregar miembro»: Quinteiro, Yorio). No es
 *     un problema de datos sino una decisión que WeProdu modela mal, y se resuelve A MANO. La lista NO elige un
 *     contrato «principal»: la baja en ARCA quedaría atada a un proyecto arbitrario y el resto seguiría vigente.
 * Tampoco entran las que la regla compartida dice que no se operan (alta sin confirmar o
 * anulada); y las que ya tienen la baja presentada y confirmada (falta que la sincronización la traiga cerrada).
 * Servicios y anulados no cuentan como contrato de ninguna relación (`relacionesOperables.ts`).
 *
 * SOBRE EL ORDEN: la 3 se mira ANTES que la 1 y la 2. Una baja que se mandó y quedó sin confirmar casi siempre es de
 * un contrato que ya terminó: si ganara la 1, la fila diría «Terminado en WeProdu» con el botón «Dar de baja», como
 * si nadie hubiera mandado nada. La lista igual se ordena 1 a 5.
 *
 * «Se puede operar» lo decide la regla de siempre, `compartido/arca/relacionParaOperar.ts` (vía
 * `relacionesOperables`): la misma que usa el panel.
 *
 * LA FOTO DE LAS 06:00 (`guardarCorridaBajasArca`): después de cada sincronización automática se guardan los conteos
 * por situación y qué relación está en cuál, como hace la Auditoría con sus totales. Y contra la foto anterior se
 * anota quién entró, quién salió y quién cambió de situación: un número que cambia tiene que poder explicarse.
 */
import { Types } from "mongoose";
import { Tenant } from "../../models/Tenant.js";
import { relacionesOperables } from "./relacionesOperables.js";
export const SITUACIONES_BAJA_ARCA = {
    1: "Terminado en WeProdu",
    2: "Termina antes de su fecha",
    3: "Baja presentada, sin confirmar",
    4: "Sin contrato en WeProdu",
    5: "Indeterminado vigente",
};
export const MOTIVOS_FUERA = {
    cerrada: "La relación ya está cerrada en ARCA.",
    varios_contratos: "Tiene varios contratos en WeProdu con esa alta y empleadora: está en Auditoría ARCA › «Relación con varios contratos». No se puede dar de baja desde WeProdu hasta anular el duplicado.",
    varios_proyectos: "Misma relación en varios proyectos: resolver a mano. Está en Auditoría ARCA › «Relación con varios contratos»; desde acá no se da de baja porque quedaría atada a un solo proyecto.",
    plazo_vigente: "Plazo vigente que ARCA cierra sola en su fecha. Si termina antes, cargá la baja en el contrato y aparece acá.",
    baja_presentada: "La baja ya se presentó desde WeProdu y ARCA la tomó: falta que la sincronización la traiga cerrada.",
    no_se_opera: "No hay nada que operar.",
};
const dias = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const corta = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const diaDe = (v) => {
    if (!v)
        return "";
    const d = v instanceof Date ? v : new Date(String(v));
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
/** La baja se mandó y no se sabe cómo quedó (`presentando`, `indeterminado`), o el intento murió navegando. */
export const bajaSinConfirmar = (m) => {
    const r = String(m?.resultado || "");
    return r === "presentando" || r === "indeterminado" || (r === "fallida" && m?.clase === "navegacion");
};
/** LA SITUACIÓN DE UNA RELACIÓN, o por qué no entra en la lista. Pura: es lo que se prueba. */
export function situacionDeBaja(d, hoy) {
    const fuera = (m) => ({ situacion: null, fuera: m });
    const en = (s) => ({ situacion: s, fuera: null });
    if (d.estado !== "abierta" && d.estado !== "fin_futuro")
        return fuera("cerrada");
    if (d.contratos > 1)
        return fuera(d.proyectos > 1 ? "varios_proyectos" : "varios_contratos");
    if (!d.puede)
        return fuera("no_se_opera");
    if (String(d.baja?.resultado || "") === "presentada")
        return fuera("baja_presentada");
    if (bajaSinConfirmar(d.baja))
        return en(3);
    if (d.contratos === 0)
        return en(4);
    // Un contrato. Abierta en ARCA: terminó en WeProdu (1) o sigue (5; también si termina de hoy en adelante: todavía no hay nada que cerrar).
    if (d.estado === "abierta")
        return en(d.bajaContrato && d.bajaContrato < hoy ? 1 : 5);
    // ARCA tiene fecha de fin de hoy en adelante: sólo importa si WeProdu termina ANTES.
    return d.bajaContrato && d.bajaContrato < d.finArca ? en(2) : fuera("plazo_vigente");
}
const detalleDe = (situacion, r, c, baja, hoy) => {
    if (situacion === 3) {
        const cuando = diaDe(baja?.fecha);
        return String(baja?.resultado) === "fallida"
            ? `El intento${cuando ? ` del ${corta(cuando)}` : ""} quedó en error de navegación: no se llegó a mandar. Se puede reintentar.`
            : `Se mandó${cuando ? ` el ${corta(cuando)}` : ""} y no se leyó el resultado: mirá la relación en ARCA antes de volver a mandar.`;
    }
    if (situacion === 4)
        return `${r.userId ? "Ficha sin contrato con esa alta" : "Persona sin ficha en WeProdu"}${r.fin ? ` · en ARCA termina el ${corta(r.fin)}` : ""}`;
    if (situacion === 2)
        return `En ARCA termina el ${corta(r.fin)}`;
    if (situacion === 5 && c?.baja && c.baja >= hoy)
        return `En WeProdu termina el ${corta(c.baja)}; ARCA no tiene fecha de fin`;
    return "";
};
/** Arma la lista a partir de las relaciones vivas y cómo se opera cada una. Pura. */
export function armarListaBajas(relaciones, hoy) {
    const filas = [];
    const fuera = [];
    for (const r of relaciones) {
        const unico = r.contratos.length === 1 ? r.contratos[0] : null;
        const baja = unico?.bajaPresentada || r.bajaEnRegistro || null;
        const s = situacionDeBaja({ estado: r.estado, finArca: r.fin, contratos: r.contratos.length, proyectos: new Set(r.contratos.map((c) => c.userProjectId)).size, puede: r.puede, bajaContrato: unico?.baja || "", baja }, hoy);
        const comun = { clave: r.clave, empleadoraCuit: r.empleadoraCuit, empleadora: r.empleadora, cuil: r.cuil, persona: r.persona, userId: r.userId, inicio: r.inicio, finArca: r.fin };
        if (s.situacion === null) {
            if (s.fuera === "cerrada")
                continue;
            fuera.push({ ...comun, motivo: s.fuera, texto: s.fuera === "no_se_opera" ? r.motivo || MOTIVOS_FUERA.no_se_opera : s.fuera === "plazo_vigente" ? `Plazo vigente que ARCA cierra sola el ${corta(r.fin)}. Si termina antes, cargá la baja en el contrato y aparece acá.` : MOTIVOS_FUERA[s.fuera], contratos: r.contratos });
            continue;
        }
        filas.push({
            ...comun,
            sinFicha: !r.userId,
            modalidadArca: r.modalidadContrato,
            tipoContrato: unico?.contrato || "",
            proyecto: unico?.proyecto || "",
            finWeprodu: unico?.baja || "",
            diasDesdeFin: unico?.baja && unico.baja < hoy ? dias(unico.baja, hoy) : null,
            situacion: s.situacion,
            detalle: detalleDe(s.situacion, r, unico, baja, hoy),
            contrato: unico ? { userProjectId: unico.userProjectId, contratoKey: unico.contratoKey, posicion: unico.posicion } : null,
        });
    }
    // Por situación y, dentro de cada una, primero las que llevan más días desde el fin.
    filas.sort((a, b) => a.situacion - b.situacion || (b.diasDesdeFin ?? -1) - (a.diasDesdeFin ?? -1) || a.persona.localeCompare(b.persona) || a.inicio.localeCompare(b.inicio));
    fuera.sort((a, b) => a.persona.localeCompare(b.persona) || a.inicio.localeCompare(b.inicio));
    return { hoy, filas, fuera, conteos: contar(filas, fuera) };
}
export function contar(filas, fuera = []) {
    const n = (s) => filas.filter((f) => f.situacion === s).length;
    const c = { s1: n(1), s2: n(2), s3: n(3), s4: n(4), s5: n(5), pendientes: 0, fuera: {} };
    c.pendientes = c.s1 + c.s2 + c.s3 + c.s4;
    for (const f of fuera)
        c.fuera[f.motivo] = (c.fuera[f.motivo] || 0) + 1;
    return c;
}
/** La lista de hoy, sobre el espejo. No abre ARCA. */
export async function listaBajasArca(tenantId) {
    const { hoy, relaciones } = await relacionesOperables(tenantId);
    return armarListaBajas(relaciones, hoy);
}
export const sinMovimientos = (m) => !m.entraron.length && !m.salieron.length && !m.cambiaron.length;
/** Qué cambió entre dos fotos de la lista. Pura. */
export function movimientosEntre(antes, ahora, fuera = []) {
    const eraDe = new Map(antes.map((f) => [f.clave, f]));
    const esDe = new Map(ahora.map((f) => [f.clave, f]));
    const fueraDe = new Map(fuera.map((f) => [f.clave, f.motivo]));
    const AHORA = { cerrada: "se cerró en ARCA", varios_contratos: "ahora tiene varios contratos (Auditoría ARCA)", varios_proyectos: "ahora está en varios proyectos (Auditoría ARCA)", plazo_vigente: "es un plazo vigente que ARCA cierra sola", baja_presentada: "se presentó la baja y ARCA la tomó", no_se_opera: "ya no hay nada que operar" };
    return {
        entraron: ahora.filter((f) => !eraDe.has(f.clave)),
        salieron: antes.filter((f) => !esDe.has(f.clave)).map((f) => ({ ...f, ahora: AHORA[fueraDe.get(f.clave) || "cerrada"] })),
        cambiaron: ahora.filter((f) => eraDe.has(f.clave) && eraDe.get(f.clave).situacion !== f.situacion).map((f) => ({ clave: f.clave, persona: f.persona, de: eraDe.get(f.clave).situacion, a: f.situacion })),
    };
}
const BASE = "integrations.arcaSimplificacion.sincronizacionRelaciones.bajasArca";
/** Cuántos días con cambios se guardan. */
const MOVIMIENTOS_GUARDADOS = 60;
const iso = (d) => (d ? new Date(d).toISOString() : "");
export async function guardadoBajasArca(tenantId) {
    const t = await Tenant.findById(new Types.ObjectId(String(tenantId))).select(BASE).lean();
    const b = t?.integrations?.arcaSimplificacion?.sincronizacionRelaciones?.bajasArca;
    return {
        actual: b?.actual?.conteos ? { el: iso(b.actual.el), conteos: b.actual.conteos } : null,
        corrida: b?.corrida?.conteos ? { el: iso(b.corrida.el), conteos: b.corrida.conteos, filas: b.corrida.filas || [] } : null,
        movimientos: (b?.movimientos || []).map((m) => ({ el: iso(m.el), conteos: m.conteos, entraron: m.entraron || [], salieron: m.salieron || [], cambiaron: m.cambiaron || [] })).reverse(),
    };
}
/** Deja los conteos de ahora para el contador del menú (cada vez que se abre la lista). No toca la foto de la corrida. */
export async function guardarConteosActuales(tenantId, conteos) {
    await Tenant.updateOne({ _id: new Types.ObjectId(String(tenantId)) }, { $set: { [`${BASE}.actual`]: { el: new Date(), conteos } } });
}
const fotoDe = (l) => l.filas.map((f) => ({ clave: f.clave, persona: f.persona, situacion: f.situacion }));
/**
 * Para la corrida automática de las 06:00: calcula la lista, guarda la foto y, si algo cambió respecto de la foto
 * anterior, lo anota. Nunca tira.
 */
export async function guardarCorridaBajasArca(tenantId) {
    try {
        const [lista, previo] = await Promise.all([listaBajasArca(tenantId), guardadoBajasArca(tenantId)]);
        const el = new Date();
        const filas = fotoDe(lista);
        const set = { [`${BASE}.corrida`]: { el, conteos: lista.conteos, filas }, [`${BASE}.actual`]: { el, conteos: lista.conteos } };
        const mov = previo.corrida ? movimientosEntre(previo.corrida.filas, filas, lista.fuera) : null;
        const update = { $set: set };
        if (mov && !sinMovimientos(mov))
            update.$push = { [`${BASE}.movimientos`]: { $each: [{ el, conteos: lista.conteos, ...mov }], $slice: -MOVIMIENTOS_GUARDADOS } };
        await Tenant.updateOne({ _id: new Types.ObjectId(String(tenantId)) }, update);
        const c = lista.conteos;
        console.log(`[bajas-arca] ${tenantId}: ${c.pendientes} pendientes (1: ${c.s1} · 2: ${c.s2} · 3: ${c.s3} · 4: ${c.s4}) y ${c.s5} de inventario${mov && !sinMovimientos(mov) ? ` · entraron ${mov.entraron.length}, salieron ${mov.salieron.length}, cambiaron ${mov.cambiaron.length}` : ""}`);
        return c;
    }
    catch (e) {
        console.error(`[bajas-arca] ${tenantId}: no pude guardar la foto de la lista:`, e?.message || e);
        return null;
    }
}
/** La lista con lo guardado: lo que pide la pantalla. Deja los conteos de ahora para el menú. */
export async function listaBajasArcaConFoto(tenantId) {
    const [lista, guardado] = await Promise.all([listaBajasArca(tenantId), guardadoBajasArca(tenantId)]);
    await guardarConteosActuales(tenantId, lista.conteos).catch(() => { });
    return {
        ...lista,
        corrida: guardado.corrida ? { el: guardado.corrida.el, conteos: guardado.corrida.conteos } : null,
        desdeLaCorrida: guardado.corrida ? movimientosEntre(guardado.corrida.filas, fotoDe(lista), lista.fuera) : null,
        movimientos: guardado.movimientos,
    };
}
