/**
 * LA CLAVE DE AGRUPACIÓN.
 *
 * Lleva empresa, centro de costo y régimen porque son los que definen la HOJA, y legajo y concepto
 * porque son los que definen la FILA. Dos líneas del mismo legajo y el mismo concepto en centros de
 * costo distintos NO se suman: van a hojas distintas, y sumarlas escondería en cuál se trabajó.
 */
const claveDe = (l) => [l.empresaId || "", l.ccCodigo || "", l.regimen || "", l.legajo || "", l.conceptoCodigo].join("|");
export function agregarLineas(lineas) {
    const porClave = new Map();
    for (const l of lineas) {
        const clave = claveDe(l);
        const actual = porClave.get(clave);
        if (!actual) {
            porClave.set(clave, {
                empresaId: l.empresaId,
                ccCodigo: l.ccCodigo,
                regimen: l.regimen,
                legajo: l.legajo,
                apellidoYNombre: l.apellidoYNombre,
                userId: l.userId,
                conceptoCodigo: l.conceptoCodigo,
                par1: l.par1,
                par2: l.par2,
                eventIds: [l.eventoId],
                origenes: [l.origen],
                dias: 0,
                fechas: new Set([l.fecha]),
            });
            continue;
        }
        actual.par1 += l.par1;
        actual.par2 += l.par2;
        actual.eventIds.push(l.eventoId);
        actual.fechas.add(l.fecha);
        if (!actual.origenes.includes(l.origen))
            actual.origenes.push(l.origen);
    }
    return [...porClave.values()]
        .map(({ fechas, ...resto }) => ({
        ...resto,
        dias: fechas.size,
        /*
          Los decimales se redondean a dos. Sumar horas en punto flotante da cosas como 7.499999999998,
          y ese número entra tal cual en el XLSX si no se lo corta.
        */
        par1: Math.round(resto.par1 * 100) / 100,
        par2: Math.round(resto.par2 * 100) / 100,
    }))
        .sort((a, b) => String(a.empresaId).localeCompare(String(b.empresaId)) ||
        String(a.ccCodigo).localeCompare(String(b.ccCodigo)) ||
        String(a.regimen).localeCompare(String(b.regimen)) ||
        String(a.legajo).localeCompare(String(b.legajo)) ||
        a.conceptoCodigo.localeCompare(b.conceptoCodigo));
}
/**
 * EN QUÉ HOJA DEL ARCHIVO VA CADA FILA.
 *
 * El nombre imita el del archivo que hacen hoy a mano: "2030 CC426 La Nación", "FZERO CC703 JSA",
 * y los jornaleros con su sufijo. Se arma acá y no al serializar para que la agrupación y el nombre
 * no se puedan desincronizar.
 */
export function hojaDe(linea, nombreEmpresa, nombreCC) {
    const empresa = String(nombreEmpresa || "SIN EMPRESA").replace(/\s*S\.?R\.?L\.?\s*$/i, "").trim();
    const cc = linea.ccCodigo ? `CC${linea.ccCodigo}` : "SIN CC";
    /*
      La descripción del centro casi siempre EMPIEZA con el código ("426 - La Nacion"), así que
      pegarla tal cual daba "2030 CC426 426 - La Nacion". Se le saca ese prefijo cuando está.
  
      Sin expresiones regulares a propósito: el código es un dato del usuario ("99", "SinAsignar"),
      y meterlo adentro de una regex obliga a escaparlo bien todas las veces.
    */
    const SEPARADORES = " -_.";
    let descripcion = String(nombreCC || "").trim();
    const codigo = String(linea.ccCodigo || "");
    if (codigo && descripcion.startsWith(codigo)) {
        descripcion = descripcion.slice(codigo.length);
        while (descripcion.length > 0 && SEPARADORES.includes(descripcion[0]))
            descripcion = descripcion.slice(1);
    }
    const sufijo = linea.regimen === "jornalero" ? " Jornaleros" : "";
    return [empresa, cc, descripcion, sufijo.trim()].filter(Boolean).join(" ").trim();
}
