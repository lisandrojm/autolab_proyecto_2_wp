/**
 * LOS EFECTOS QUE RIGEN ESE DÍA PARA ESA PERSONA.
 *
 * Los efectos son ADITIVOS: todos los que matchean se aplican. No hay override por especificidad
 * —"el de la empresa le gana al general"—, porque esa regla es invisible en la pantalla y hace que
 * agregar una línea haga desaparecer otra sin que se vea. Si algo no tiene que aplicar a una
 * empresa, se acota esa empresa; no se lo tapa con otro efecto.
 */
export function efectosVigentesEn(efectos, fecha, contexto = {}) {
    const dia = String(fecha).slice(0, 10);
    return (efectos || []).filter((e) => {
        if (!e.vigenteDesde || e.vigenteDesde > dia)
            return false;
        if (e.vigenteHasta && e.vigenteHasta < dia)
            return false;
        // Vacío = todas las empresas. Con empresa, sólo esa.
        if (e.empresaId && contexto.empresaId && String(e.empresaId) !== String(contexto.empresaId))
            return false;
        /*
          Un efecto acotado a una empresa NO se aplica cuando no se sabe de qué empresa es el contrato.
          Aplicarlo "por las dudas" es lo que pone un concepto de 2030 en el recibo de alguien de FZERO.
        */
        if (e.empresaId && !contexto.empresaId)
            return false;
        if (e.soloRegimen && contexto.regimen && e.soloRegimen !== contexto.regimen)
            return false;
        if (e.soloRegimen && !contexto.regimen)
            return false;
        if (contexto.aplicaA && e.aplicaA !== contexto.aplicaA)
            return false;
        return true;
    });
}
/**
 * SI EL EFECTO SE PUEDE EMITIR CONTRA EL CATÁLOGO.
 *
 * Devuelve el problema en castellano, o `null` si está bien. Chequea tres cosas, y las tres
 * existen porque las tres pasan:
 *
 *   1. Que el concepto exista. Un código inventado hace que Memosoft rechace el archivo entero.
 *   2. Que el parámetro elegido sea uno que el concepto USA. Poner el número en la columna que el
 *      concepto ignora no da error: entra como cero y la persona cobra de menos.
 *   3. Que la unidad coincida. Un 0012 con 3 en la columna de importe son tres PESOS de licencia
 *      por enfermedad en vez de tres DÍAS, y eso no lo detecta nadie mirando el archivo.
 */
export function validarEfecto(efecto, concepto) {
    if (!concepto)
        return `El concepto ${efecto.conceptoCodigo} no está en el catálogo de esa empresa.`;
    if (concepto.activo === false)
        return `El concepto ${efecto.conceptoCodigo} (${concepto.descripcion}) está desactivado.`;
    const usa = efecto.param === "par1" ? concepto.usaPar1 : concepto.usaPar2;
    if (!usa) {
        const cual = efecto.param === "par1" ? "par2" : "par1";
        const otroUsa = efecto.param === "par1" ? concepto.usaPar2 : concepto.usaPar1;
        return otroUsa
            ? `${efecto.conceptoCodigo} (${concepto.descripcion}) no usa ${efecto.param}; usa ${cual}.`
            : `${efecto.conceptoCodigo} (${concepto.descripcion}) no usa ningún parámetro.`;
    }
    const unidadEsperada = efecto.param === "par1" ? concepto.unidadPar1 : concepto.unidadPar2;
    if (unidadEsperada && unidadEsperada !== efecto.unidad) {
        return `${efecto.conceptoCodigo} (${concepto.descripcion}) espera ${unidadEsperada} en ${efecto.param}, no ${efecto.unidad}.`;
    }
    if (efecto.fuente === "fijo" && (efecto.valorFijo == null || Number.isNaN(Number(efecto.valorFijo)))) {
        return `El efecto de ${efecto.conceptoCodigo} es de valor fijo pero no tiene valor.`;
    }
    if (efecto.vigenteHasta && efecto.vigenteDesde && efecto.vigenteHasta < efecto.vigenteDesde) {
        return `La vigencia de ${efecto.conceptoCodigo} termina antes de empezar.`;
    }
    return null;
}
/**
 * Cierra los efectos que regían y deja los nuevos, en vez de pisar la lista.
 *
 * Es lo que convierte "editar el mapeo" en una operación que no borra historia: lo que regía hasta
 * ayer queda con su `vigenteHasta`, y lo nuevo arranca hoy. Los que ya estaban cerrados no se tocan.
 */
export function reemplazarVigentes(actuales, nuevos, desde) {
    const dia = String(desde).slice(0, 10);
    const ayer = new Date(`${dia}T00:00:00.000Z`);
    ayer.setUTCDate(ayer.getUTCDate() - 1);
    const vigenteHasta = ayer.toISOString().slice(0, 10);
    const historia = (actuales || []).map((e) => {
        const seguiaAbierto = !e.vigenteHasta;
        if (!seguiaAbierto)
            return e;
        /*
          Un efecto que ARRANCABA hoy o después no se cierra: se descarta. Cerrarlo con una fecha
          anterior a su propio inicio dejaría una vigencia imposible en la base.
        */
        if (e.vigenteDesde >= dia)
            return null;
        return { ...e, vigenteHasta };
    });
    return [...historia.filter((e) => e !== null), ...nuevos.map((e) => ({ ...e, vigenteDesde: dia, vigenteHasta: null }))];
}
