/**
 * LAS REGLAS DE LAS TRES OPERACIONES SOBRE UNA RELACIÓN LABORAL EN ARCA (20/11/2026), puras: baja, modificación y
 * anulación. Reciben el contrato, lo que el espejo de Relaciones Laborales sabe y lo que se pide, y devuelven un
 * PLAN: si se puede mandar, por qué no, los avisos, y el payload exacto que iría a ARCA. Sin base ni navegador,
 * para probarlas campo por campo (`reglasOperacionRelacion.test.ts`).
 *
 * Son tres trámites distintos y acá se tratan por separado: cada uno con sus prerrequisitos, su idempotencia y
 * sus plazos. Lo que ARCA decide por su cuenta (habilitar o no el ícono, rechazar por plazo) no se adivina: acá
 * se AVISA («ARCA puede observarla») y el motor lo confirma leyendo la pantalla.
 *
 * IDEMPOTENCIA. No se manda dos veces lo mismo: una marca `presentada`, `presentando` o `indeterminado` de la misma
 * operación traba; y si el espejo ya muestra el resultado (la baja con esa fecha, los valores pedidos), tampoco se
 * manda. El espejo se sincroniza una vez por día: la lectura definitiva la hace el motor en vivo, antes de operar.
 */
import { relacionParaOperar } from "../../compartido/arca/relacionParaOperar.js";
export const NOMBRE_OPERACION = { baja: "la baja", modificacion: "la modificación", anulacion: "la anulación" };
/** Los campos que el motor sabe modificar en `ModificaAlta.aspx` (ver `CAMPOS_MODIFICACION` en el motor). */
export const CAMPOS_MODIFICABLES = ["fechaInicio", "fechaFin", "obraSocial", "modalidadContrato", "situacionRevista", "sucursal", "actividad", "convenio", "categoria", "puesto", "tipoServicio", "retribucion", "modalidadLiquidacion"];
export const ETIQUETA_CAMPO = {
    fechaInicio: "Fecha de inicio",
    fechaFin: "Fecha de fin",
    obraSocial: "Obra social",
    modalidadContrato: "Modalidad de contrato",
    situacionRevista: "Situación de revista",
    sucursal: "Sucursal",
    actividad: "Actividad",
    convenio: "Convenio colectivo",
    categoria: "Categoría",
    puesto: "Puesto desempeñado",
    tipoServicio: "Tipo de servicio",
    retribucion: "Retribución pactada",
    modalidadLiquidacion: "Modalidad de liquidación",
};
/** Código de ARCA de «Renuncia del trabajador / ART.240 - LCT»: la única situación que lleva fecha de telegrama. */
export const SITUACION_RENUNCIA = "21";
/** Plazo de la RG 2988 para informar la baja: dentro de los 5 días corridos del cese. Aviso, no bloqueo: lo decide ARCA. */
export const DIAS_PLAZO_BAJA = 5;
const esISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const dig = (s) => String(s ?? "").replace(/\D/g, "");
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const corta = (iso) => (esISO(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);
/** Una marca que traba volver a mandar la misma operación. */
export const marcaTraba = (m) => ["presentada", "presentando", "indeterminado"].includes(String(m?.resultado || ""));
const motivoDeMarca = (m, que) => {
    const cuando = m.fecha ? ` el ${new Date(m.fecha).toLocaleDateString("es-AR")}` : "";
    if (m.resultado === "presentada")
        return `${que} ya se mandó a ARCA${cuando}${m.acuse?.cbt ? ` (C.B.T. ${m.acuse.cbt})` : ""}. No se manda dos veces.`;
    if (m.resultado === "presentando")
        return `${que} se estaba mandando a ARCA${cuando} y la corrida se cortó sin resultado: mirá la relación en ARCA antes de volver a intentar.`;
    return `${que} se mandó a ARCA${cuando} y no se pudo leer el resultado: mirá la relación en ARCA antes de volver a intentar.`;
};
/**
 * Lo que las tres operaciones exigen antes de mirar la suya: que haya una relación en ARCA sobre la cual operar.
 * Es la MISMA condición que decide el ícono de la bandeja Contratos (`compartido/arca/relacionParaOperar.ts`).
 * "" si está todo.
 */
function prerrequisitos(c, espejo) {
    return relacionParaOperar({ tramite: c.tramite, estadoContrato: c.estadoContrato, cuil: c.cuil, empresaCuit: c.empresaCuit, alta: c.alta, altaArcaPresentada: c.altaArcaPresentada, enEspejo: !!espejo && espejo.inicio === c.alta }).motivo;
}
export function planDeBaja(c, espejo, datos, hoy, catalogo) {
    const avisos = [];
    const fechaFin = String(datos?.fechaFin || c.baja || "").slice(0, 10);
    const situacionBaja = String(datos?.situacionBaja || "").trim();
    const fechaTelegrama = String(datos?.fechaTelegrama || "").slice(0, 10);
    const payload = { fechaFin, situacionBaja, ...(fechaTelegrama ? { fechaTelegrama } : {}) };
    const no = (motivo) => ({ op: "baja", puede: false, motivo, avisos, payload });
    const pre = prerrequisitos(c, espejo);
    if (pre)
        return no(pre);
    if (!esISO(fechaFin))
        return no("Falta la fecha de fin de la baja (el contrato no tiene fecha de baja y no se indicó una).");
    if (fechaFin < c.alta)
        return no(`La fecha de fin (${corta(fechaFin)}) es anterior al alta (${corta(c.alta)}).`);
    if (!situacionBaja)
        return no("Elegí el motivo de la baja (situación de baja de ARCA).");
    if (catalogo && !catalogo.has(situacionBaja))
        return no(`El motivo «${situacionBaja}» no está en la tabla de situaciones de baja de ARCA.`);
    if (fechaTelegrama && !esISO(fechaTelegrama))
        return no("La fecha del telegrama tiene que ser aaaa-mm-dd.");
    if (marcaTraba(c.bajaArcaPresentada))
        return no(motivoDeMarca(c.bajaArcaPresentada, "La baja"));
    if (c.anulacionArcaPresentada?.resultado === "presentando" || c.anulacionArcaPresentada?.resultado === "indeterminado")
        return no("Hay una anulación sin resultado sobre esta relación: mirala en ARCA antes de dar la baja.");
    if (espejo?.fin) {
        if (espejo.fin === fechaFin)
            return no(`ARCA ya tiene la baja al ${corta(fechaFin)}${espejo.situacionBaja ? ` (${espejo.situacionBaja})` : ""}, según la sincronización${espejo.sincronizadoEl ? ` del ${new Date(espejo.sincronizadoEl).toLocaleDateString("es-AR")}` : ""}. No hay nada que mandar.`);
        return no(`ARCA ya tiene esta relación con fecha de fin ${corta(espejo.fin)}: cambiarla es una MODIFICACIÓN, no una baja. Usá «Modificar».`);
    }
    if (c.baja && c.baja !== fechaFin)
        avisos.push(`La fecha de fin que se manda (${corta(fechaFin)}) no es la fecha de baja del contrato (${corta(c.baja)}). El contrato en WeProdu no se cambia.`);
    if (!c.baja)
        avisos.push("El contrato no tiene fecha de baja en WeProdu: la baja se informa en ARCA y el contrato queda como está.");
    if (esISO(hoy) && diasEntre(fechaFin, hoy) > DIAS_PLAZO_BAJA)
        avisos.push(`La baja se informa ${diasEntre(fechaFin, hoy)} días después del fin: ARCA pide hacerlo dentro de los ${DIAS_PLAZO_BAJA} días corridos y puede observarla.`);
    if (esISO(hoy) && fechaFin > hoy)
        avisos.push(`La fecha de fin (${corta(fechaFin)}) es futura: se informa una baja a futuro.`);
    if (situacionBaja === SITUACION_RENUNCIA && !fechaTelegrama)
        avisos.push("Es una renuncia y no se indicó la fecha del telegrama: ARCA puede pedirla.");
    if (situacionBaja !== SITUACION_RENUNCIA && fechaTelegrama)
        avisos.push("Se indicó fecha de telegrama en un motivo que no es renuncia: ARCA puede ignorarla o rechazarla.");
    return { op: "baja", puede: true, motivo: "", avisos, payload };
}
/** El valor del espejo para un campo modificable, como texto comparable; `undefined` si el espejo no lo tiene. */
function valorEnEspejo(espejo, campo) {
    if (!espejo)
        return undefined;
    if (campo === "fechaInicio")
        return espejo.inicio || undefined;
    if (campo === "fechaFin")
        return espejo.fin || undefined;
    if (campo === "modalidadContrato")
        return espejo.modalidad ? dig(espejo.modalidad).padStart(3, "0") : undefined;
    if (campo === "retribucion")
        return espejo.retribucion != null ? Number(espejo.retribucion).toFixed(2) : undefined;
    if (campo === "obraSocial")
        return espejo.obraSocial ? dig(espejo.obraSocial).padStart(6, "0") : undefined;
    return undefined;
}
export function planDeModificacion(c, espejo, datos, hoy) {
    const avisos = [];
    const cambios = {};
    for (const campo of CAMPOS_MODIFICABLES) {
        const v = (datos?.cambios || {})[campo];
        if (v === undefined || v === null || String(v).trim() === "")
            continue;
        cambios[campo] = String(v).trim();
    }
    const payload = { ...cambios, ...(datos?.obraSocialTexto ? { obraSocialTexto: datos.obraSocialTexto } : {}) };
    const no = (motivo) => ({ op: "modificacion", puede: false, motivo, avisos, payload });
    const pre = prerrequisitos(c, espejo);
    if (pre)
        return no(pre);
    const desconocidos = Object.keys(datos?.cambios || {}).filter((k) => !CAMPOS_MODIFICABLES.includes(k));
    if (desconocidos.length)
        return no(`No se puede modificar: ${desconocidos.join(", ")}. Campos posibles: ${CAMPOS_MODIFICABLES.join(", ")}.`);
    if (Object.keys(cambios).length === 0)
        return no("No se indicó ningún cambio.");
    for (const campo of ["fechaInicio", "fechaFin"])
        if (cambios[campo] && !esISO(cambios[campo]))
            return no(`${ETIQUETA_CAMPO[campo]}: la fecha tiene que ser aaaa-mm-dd.`);
    if (cambios.fechaInicio && cambios.fechaFin && cambios.fechaFin < cambios.fechaInicio)
        return no("La fecha de fin es anterior a la de inicio.");
    if (cambios.fechaFin && !cambios.fechaInicio && cambios.fechaFin < c.alta)
        return no(`La fecha de fin (${corta(cambios.fechaFin)}) es anterior al alta (${corta(c.alta)}).`);
    if (cambios.retribucion !== undefined && !(Number(cambios.retribucion.replace(",", ".")) > 0))
        return no("La retribución tiene que ser un número mayor que cero.");
    if (cambios.obraSocial && dig(cambios.obraSocial).length !== 6)
        return no("La obra social va con su código RNOS de 6 dígitos.");
    const m = c.modificacionArcaPresentada;
    if (m?.resultado === "presentando" || m?.resultado === "indeterminado")
        return no(motivoDeMarca(m, "Una modificación"));
    if (c.anulacionArcaPresentada?.resultado === "presentando" || c.anulacionArcaPresentada?.resultado === "indeterminado")
        return no("Hay una anulación sin resultado sobre esta relación: mirala en ARCA antes de modificar.");
    if (m?.resultado === "presentada" && m.payload && Object.entries(cambios).every(([k, v]) => String(m.payload[k] ?? "") === v))
        return no(`Exactamente esta modificación ya se mandó a ARCA el ${new Date(m.fecha || Date.now()).toLocaleDateString("es-AR")}. No se manda dos veces.`);
    // Lo que el espejo ya muestra igual no es un cambio; si TODO está igual, no hay nada que mandar.
    const comparables = Object.entries(cambios).map(([k, v]) => ({ campo: k, pedido: v, espejo: valorEnEspejo(espejo, k) }));
    const conEspejo = comparables.filter((x) => x.espejo !== undefined);
    const normal = (campo, v) => (campo === "retribucion" ? Number(v.replace(",", ".")).toFixed(2) : campo === "modalidadContrato" ? dig(v).padStart(3, "0") : campo === "obraSocial" ? dig(v).padStart(6, "0") : v);
    if (conEspejo.length === comparables.length && conEspejo.every((x) => normal(x.campo, x.pedido) === x.espejo)) {
        return no(`ARCA ya tiene esos valores según la sincronización${espejo?.sincronizadoEl ? ` del ${new Date(espejo.sincronizadoEl).toLocaleDateString("es-AR")}` : ""}. No hay nada que mandar.`);
    }
    for (const x of conEspejo)
        if (normal(x.campo, x.pedido) === x.espejo)
            avisos.push(`${ETIQUETA_CAMPO[x.campo]}: el espejo de ARCA ya tiene «${x.pedido}»; el motor lo comprueba en vivo y no lo toca si está igual.`);
    avisos.push("Se modifica la relación en ARCA. El contrato en WeProdu no se cambia: si corresponde, editalo aparte.");
    if (cambios.fechaInicio)
        avisos.push("Cambiar la fecha de inicio cambia la identidad de la relación en ARCA: la sincronización de Relaciones Laborales la va a ver como otra relación hasta que se reconcilie.");
    if (cambios.fechaFin && esISO(hoy) && cambios.fechaFin < hoy)
        avisos.push(`La nueva fecha de fin (${corta(cambios.fechaFin)}) ya pasó: ARCA puede tratarla como una baja fuera de plazo.`);
    return { op: "modificacion", puede: true, motivo: "", avisos, payload };
}
export function planDeAnulacion(c, espejo, datos, hoy) {
    const avisos = [];
    const que = datos?.que;
    const payload = { que };
    const no = (motivo) => ({ op: "anulacion", puede: false, motivo, avisos, payload });
    if (que !== "alta" && que !== "baja")
        return no("Hay que decir qué se anula: el alta o la baja.");
    const pre = prerrequisitos(c, espejo);
    if (pre)
        return no(pre);
    const a = c.anulacionArcaPresentada;
    if (a?.resultado === "presentando" || a?.resultado === "indeterminado")
        return no(motivoDeMarca(a, "La anulación"));
    if (a?.resultado === "presentada" && a.que === que)
        return no(`${que === "alta" ? "El alta" : "La baja"} ya se anuló en ARCA el ${new Date(a.fecha || Date.now()).toLocaleDateString("es-AR")}.`);
    if (que === "baja") {
        const hayBaja = c.bajaArcaPresentada?.resultado === "presentada" || !!espejo?.fin;
        if (!hayBaja)
            return no("No hay una baja registrada en ARCA para esta relación (ni mandada desde WeProdu ni en el espejo): no hay baja que anular.");
        if (c.bajaArcaPresentada?.resultado === "presentando" || c.bajaArcaPresentada?.resultado === "indeterminado")
            return no("La baja está sin confirmar en ARCA: mirala antes de anularla.");
        avisos.push("Anular la baja deja la relación abierta en ARCA. La fecha de baja del contrato en WeProdu no se cambia.");
    }
    else {
        if (c.bajaArcaPresentada?.resultado === "presentada" || espejo?.fin)
            return no(`La relación ya tiene la baja registrada en ARCA${espejo?.fin ? ` (fin ${corta(espejo.fin)})` : ""}: lo que ARCA permitiría anular es la baja, no el alta.`);
        if (esISO(hoy) && c.alta <= hoy)
            avisos.push(`La relación ya empezó (${corta(c.alta)}): ARCA suele no habilitar la anulación del alta una vez iniciada. Lo decide el ícono en la pantalla.`);
        avisos.push("Anular el alta no anula el contrato en WeProdu: después se puede anular el contrato desde «Todos los contratos» (queda habilitado).");
    }
    return { op: "anulacion", puede: true, motivo: "", avisos, payload };
}
export function planDeOperacion(op, c, espejo, datos, hoy, catalogo) {
    if (op === "baja")
        return planDeBaja(c, espejo, datos, hoy, catalogo);
    if (op === "modificacion")
        return planDeModificacion(c, espejo, datos, hoy);
    if (op === "anulacion")
        return planDeAnulacion(c, espejo, datos, hoy);
    return { op, puede: false, motivo: `Operación desconocida: ${String(op)}.`, avisos: [], payload: {} };
}
/**
 * DE QUÉ LADO ESTUVO EL PROBLEMA cuando el motor tiró: `regla_arca` si ARCA lo rechazó o no lo habilita (el motor
 * lo marca con `reglaArca`), `navegacion` para todo lo demás (sesión caída, pantalla que no es, ARCA que no
 * contesta, timeout). Lo segundo se puede reintentar sin tocar nada; lo primero no cambia por reintentar.
 */
export function claseDeFallo(e) {
    if (e?.reglaArca || e?.clase === "regla_arca")
        return "regla_arca";
    return "navegacion";
}
