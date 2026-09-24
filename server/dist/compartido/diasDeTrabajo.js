/**
 * LOS DÍAS DE LA SEMANA QUE TRABAJA UN CONTRATO: cuándo están completos.
 *
 * Código compartido server ↔ frontend (ver el encabezado de `jornadas.ts`): puro y sin imports. Lo usan
 * el campo «Días que trabaja» del wizard de contratos (para avisar y para frenar el guardado) y el server
 * al guardar un contrato (`POST /projects/:id/assign-member`), para que un contrato no pueda quedar sin
 * decir qué días trabaja la persona —sin ellos no se puede saber si se superpone con otro, ni si un
 * feriado o una licencia le cae en día laborable—.
 */
/**
 * Qué le falta a esta configuración para estar completa. `null` = está bien.
 *
 * EL MENSAJE CUENTA LO QUE FALTA, no repite la consigna. «Elegí exactamente 5 día(s)» decía la regla
 * y nada más: con tres marcados había que contarlos a mano para saber cuántos quedaban. Ahora dice
 * los dos números, que es la única pregunta que alguien se hace mientras los tilda.
 *
 * En ROTATIVO no hay descuento posible y por eso el texto es otro: el tope no es la cantidad de días
 * que trabaja sino la semana entera. Se pide un mínimo —rotar entre exactamente los días que trabaja
 * es un esquema fijo con otro nombre— y de ahí para arriba cualquier cantidad es válida.
 */
export const problemaDeDias = (jornadas, rotativos, dias) => {
    if (!jornadas || jornadas < 1)
        return null; // Sin jornadas cargadas todavía no hay nada que validar.
    if (rotativos) {
        if (dias.length < jornadas)
            return `Elegí al menos ${jornadas} día(s) entre los que rota: llevás ${dias.length}.`;
        return null;
    }
    const faltan = jornadas - dias.length;
    if (faltan > 0)
        return `${dias.length} de ${jornadas} elegidos · falta${faltan === 1 ? "" : "n"} ${faltan}.`;
    // Sobrar no debería pasar —`maximoDiasElegibles` frena en el tope— pero si pasa hay que verlo.
    if (faltan < 0)
        return `Elegiste ${dias.length} días y trabaja ${jornadas}: destildá ${-faltan}.`;
    return null;
};
/**
 * QUÉ FALTA PARA PODER GUARDAR. `null` = está completo.
 *
 * Es distinto de `problemaDeDias`, y la diferencia es EL MOMENTO. Aquél dibuja el aviso mientras se
 * completa el formulario, así que con la cantidad todavía vacía calla: gritarle a alguien por un
 * campo que no llegó a tocar es ruido. Éste corre al guardar, cuando ya no hay «todavía»: un contrato
 * sin días definidos queda afirmando que la persona trabaja, sin decir cuánto ni cuándo.
 *
 * Los dos comparten la regla de los días para no poder discrepar sobre qué está completo; lo único
 * que agrega éste es exigir la cantidad, que es la que habilita todo lo demás.
 */
export const faltaDefinirDias = (jornadas, rotativos, dias) => {
    if (!jornadas || jornadas < 1)
        return "cargá cuántos días por semana trabaja";
    const problema = problemaDeDias(jornadas, rotativos, dias);
    return problema ? problema.replace(/\.$/, "").toLowerCase() : null;
};
