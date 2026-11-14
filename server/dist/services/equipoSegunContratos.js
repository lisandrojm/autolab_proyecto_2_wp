import { claveFilaArea, idDe, sedeDe } from "../compartido/areaTurno.js";
import { contratosQueRigenDelProyecto } from "../utils/contratosQueRigen.js";
import { esContratoVigente, getContratoActivo, hoyArgentina } from "../utils/contratoVigencia.js";
/**
 * EL ÁREA Y EL TURNO DE CADA MIEMBRO SE LEEN DE SUS CONTRATOS VIGENTES (12/11/2026, 14/11/2026).
 *
 * Pedido del 12/11: «quiero que las pantallas del equipo lean directamente el contrato que rige»; que el
 * equipo dijera «Tarde» y el contrato «Mañana» confundía. `project.teamConfig` sigue guardando la fila de
 * cada persona (si puede registrar, su horario propio, quién la tocó), pero su ÁREA/TURNO/SEDE ya no se lee
 * de ahí: antes de que `teamConfig` salga del server o de que el server lo use para contar, se le superpone
 * lo que dicen los contratos de cada uno. Así todas las pantallas (Gestionar Equipo, Jerarquía,
 * Supervisores, la app, vacaciones, reportes de novedades) muestran lo mismo sin tocar cada una.
 *
 * VARIOS CONTRATOS VIGENTES A LA VEZ SE SUMAN (14/11/2026). Con «el que rige» solo, a quien le sumaban un
 * segundo contrato en otro turno —un plazo fijo a la Mañana y un Servicios Adicional a la Tarde— desaparecía
 * del primero: regía el último cargado. Son contratos distintos y la persona trabaja en los dos turnos, así
 * que su área/turno es la UNIÓN de todos los que están vigentes hoy en el proyecto. Con un solo vigente (o
 * ninguno) no cambia nada: es el que rige, como antes. Medido en producción el 14/11: 22 personas tienen dos
 * vigentes en el mismo proyecto y sólo a una le difiere el turno.
 *
 * Reglas:
 *   · Tiene contrato que rige con área → ésa, exacta (áreas, turnos y sede de cada fila).
 *   · Tiene más de un contrato vigente → las de todos, una fila por área + sede con los turnos de todos; las
 *     del que rige van primero (los campos viejos `areaId`/`shiftId` siguen a la primera).
 *   · El contrato sólo tiene los campos viejos (`areaId`/`shiftId`) → una fila con ésos.
 *   · Ningún contrato de los que cuentan tiene área cargada, o la persona no tiene contratos en el proyecto
 *     → queda lo que diga su fila del equipo (no se la manda a «sin área» por un contrato viejo incompleto).
 *   · Tiene contrato con área y no tenía fila → se le arma una, con los defaults del modelo.
 *
 * Qué contrato rige lo decide `getContratoActivo` / `contratosQueRigenDelProyecto` (vigentes; entre
 * ellos el de tiempo indeterminado; el más reciente). Cambia solo con el calendario: es lo pedido.
 */
/** Las filas de área de UN contrato (las de `areaShiftAssignments`, o una armada con los campos viejos). [] si no tiene. */
export function filasDeArea(contrato) {
    const filas = (contrato?.areaShiftAssignments || []).filter((a) => a?.areaId);
    if (filas.length)
        return filas;
    if (contrato?.areaId)
        return [{ areaId: contrato.areaId, shiftIds: contrato.shiftId ? [contrato.shiftId] : [] }];
    return [];
}
/**
 * Junta las filas de varios contratos: una fila por área + sede, con los turnos de todos sin repetir. El
 * orden es el de llegada (primero las del primer contrato). Una fila que no se mezcla con otra sale tal cual.
 */
export function unirAreas(listas) {
    const porFila = new Map();
    for (const filas of listas) {
        for (const f of filas || []) {
            if (!f?.areaId)
                continue;
            const clave = claveFilaArea(f);
            const ya = porFila.get(clave);
            if (!ya) {
                porFila.set(clave, f);
                continue;
            }
            const vistos = new Set((ya.shiftIds || []).map(idDe));
            const nuevos = (f.shiftIds || []).filter((s) => !vistos.has(idDe(s)));
            if (!nuevos.length)
                continue;
            const sede = sedeDe(ya.sedeId);
            porFila.set(clave, { areaId: ya.areaId, shiftIds: [...(ya.shiftIds || []), ...nuevos], ...(sede ? { sedeId: sede } : {}) });
        }
    }
    return [...porFila.values()];
}
/**
 * Los contratos vigentes a la vez que viajan con el que rige (`_vigentes`, ver `contratosQueRigenDelProyecto`),
 * con el que rige primero. `null` si hay uno solo o ninguno: ahí vale el que rige y nada más.
 */
export function vigentesALaVez(contrato) {
    const varios = contrato?._vigentes;
    if (!Array.isArray(varios) || varios.length < 2)
        return null;
    return [...varios].sort((a, b) => Number(b?._indice === contrato._indice) - Number(a?._indice === contrato._indice));
}
/**
 * Las filas de área que le corresponden a la persona según el contrato que rige y, si hay más de uno vigente,
 * todos ellos. `null` si ninguno tiene área cargada.
 */
export function areasDelContrato(contrato) {
    const varios = vigentesALaVez(contrato);
    const filas = varios ? unirAreas(varios.map(filasDeArea)) : filasDeArea(contrato);
    return filas.length ? filas : null;
}
/** `teamConfig` con el área de cada persona tomada de sus contratos (`contratoDe`: userId → contrato que rige). No modifica el original. */
export function superponerContratos(teamConfig, contratoDe) {
    const vistos = new Set();
    const conArea = (fila, areas) => ({ ...fila, areaShiftAssignments: areas, areaId: areas[0]?.areaId ?? null, shiftId: areas[0]?.shiftIds?.[0] ?? null });
    const filas = (teamConfig || []).map((fila) => {
        const uid = String(fila?.userId?._id ?? fila?.userId ?? "");
        vistos.add(uid);
        const areas = areasDelContrato(contratoDe.get(uid));
        return areas ? conArea(fila, areas) : fila;
    });
    for (const [uid, contrato] of contratoDe) {
        if (vistos.has(uid))
            continue;
        const areas = areasDelContrato(contrato);
        if (areas)
            filas.push(conArea({ userId: uid, canRegister: true, useProjectSchedule: true }, areas));
    }
    return filas;
}
/** Lo mismo, buscando los contratos que rigen del proyecto. */
export async function equipoSegunContratos(projectId, teamConfig) {
    return superponerContratos(teamConfig, await contratosQueRigenDelProyecto(String(projectId), hoyArgentina()));
}
/** Para UNA persona con sus contratos del proyecto a mano (la ficha del usuario): la misma regla, sin ir a la base. */
export function filaSegunContratos(fila, contratos, hoy = hoyArgentina()) {
    const lista = (contratos || []);
    const rige = getContratoActivo(lista, hoy);
    const vigentes = lista.filter((c) => esContratoVigente(c, hoy));
    const filas = vigentes.length > 1 ? unirAreas([rige, ...vigentes.filter((c) => c !== rige)].map(filasDeArea)) : filasDeArea(rige);
    return filas.length && fila ? { ...fila, areaShiftAssignments: filas, areaId: filas[0]?.areaId ?? null, shiftId: filas[0]?.shiftIds?.[0] ?? null } : fila;
}
/** Las filas desarmadas en combinaciones área × turno × sede (una fila sin turnos da una combinación sin turno). */
const combinacionesDe = (filas) => (filas || [])
    .filter((f) => f?.areaId)
    .flatMap((f) => {
    const turnos = (f.shiftIds || []).length ? f.shiftIds : [null];
    return turnos.map((t) => ({ area: idDe(f.areaId), turno: t == null ? "" : idDe(t), sede: sedeDe(f.sedeId), areaId: f.areaId, shiftId: t }));
});
const aFilas = (combinaciones) => unirAreas(combinaciones.map((c) => [{ areaId: c.areaId, shiftIds: c.shiftId == null ? [] : [c.shiftId], ...(c.sede ? { sedeId: c.sede } : {}) }]));
/**
 * AL CAMBIAR EL ÁREA DESDE EL EQUIPO, QUÉ LE QUEDA A CADA CONTRATO VIGENTE (14/11/2026).
 *
 * Con un solo contrato la respuesta es obvia: lo nuevo, entero. Con varios vigentes el equipo muestra la
 * suma de todos, así que lo que se guarda desde ahí (arrastrar en la Jerarquía, la tabla, «Pasar todos a…»)
 * es esa suma ya cambiada, y hay que devolverla a los contratos sin mezclarlos:
 *
 *   · cada contrato CONSERVA las combinaciones área × turno que tenía y siguen estando (con la sede nueva,
 *     si lo que cambió fue la sede);
 *   · lo que es NUEVO —no lo tenía ninguno— va al contrato que rige;
 *   · un contrato que se queda sin nada de lo que tenía pasa a decir lo mismo que el que rige: no se deja un
 *     contrato vigente «sin área», y si conservara lo viejo la persona seguiría apareciendo ahí;
 *   · un contrato que no tenía área cargada se deja como está.
 *
 * La unión del resultado es siempre exactamente `nuevas`. `vigentes` son las filas de área de cada contrato
 * y `iRige` la posición del que rige; devuelve las filas nuevas de cada uno, en el mismo orden.
 */
export function repartirAreas(nuevas, vigentes, iRige) {
    const pedidas = combinacionesDe(nuevas);
    const usadas = new Set();
    const quedan = vigentes.map((filas) => {
        const propias = [];
        for (const c of combinacionesDe(filas)) {
            const mismas = pedidas.filter((n) => n.area === c.area && n.turno === c.turno);
            const n = mismas.find((x) => x.sede === c.sede) || mismas.find((x) => !usadas.has(x)) || mismas[0];
            if (!n)
                continue;
            usadas.add(n);
            if (!propias.includes(n))
                propias.push(n);
        }
        return propias;
    });
    quedan[iRige] = [...quedan[iRige], ...pedidas.filter((n) => !usadas.has(n))];
    return quedan.map((propias, i) => {
        if (i === iRige || propias.length > 0)
            return aFilas(propias);
        return combinacionesDe(vigentes[i]).length > 0 ? aFilas(quedan[iRige]) : [];
    });
}
/**
 * POR CONTRATO, QUÉ TURNOS PONE (14/11/2026). Para quien tiene más de un contrato vigente a la vez EN
 * TURNOS DISTINTOS: el reporte de asistencia lo lista una vez por contrato —a la Mañana con el plazo fijo y
 * a la Tarde con el adicional, cada uno con su horario— y Equipos muestra en cada turno el contrato que
 * corresponde. `clavesDe` arma las claves de las filas de un contrato (la pantalla pasa `clavesDelMiembro`
 * con las sedes del proyecto).
 *
 * Devuelve `null` cuando no hay nada que separar: un solo vigente, o varios que dicen el mismo turno (ahí la
 * persona va una sola vez, como siempre). Los contratos con exactamente las mismas combinaciones se juntan
 * en uno (manda el que rige, que va primero). Los que no tienen área no cuentan.
 */
export function turnosPorContrato(contrato, clavesDe) {
    const varios = vigentesALaVez(contrato);
    if (!varios)
        return null;
    const grupos = new Map();
    for (const v of varios) {
        const claves = [...clavesDe(filasDeArea(v))].sort();
        if (!claves.length)
            continue;
        const firma = claves.join("|");
        if (grupos.has(firma))
            continue;
        grupos.set(firma, {
            claves,
            nombreContrato: String(v?.nombre_contrato || ""),
            estadoContrato: String(v?.nombre_estado_empleado || ""),
            fechaAlta: String(v?.fecha_alta_contrato || ""),
            fechaBaja: String(v?.fecha_baja_contrato || ""),
            horaInicio: String(v?.hora_inicio || ""),
            horaFin: String(v?.hora_fin || ""),
        });
    }
    return grupos.size > 1 ? [...grupos.values()] : null;
}
