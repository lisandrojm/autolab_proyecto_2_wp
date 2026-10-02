import { CHARSET_REGISTRO, LARGO_130, LARGO_85, MAX_ALTAS_MASIVAS, RETRIBUCION_130_EN_CENTAVOS, fecha85, partirRegistro130, partirRegistro85, } from "../../compartido/layoutAltaArca.js";
const digitos = (s) => String(s || "").replace(/\D/g, "");
/** "YYYY-MM-DD" / "DD/MM/YYYY" → AAAA/MM/DD (formato del 130). */
export const fecha130 = (s) => {
    if (!s)
        return "";
    let m = /^(\d{4})[-/](\d{2})[-/](\d{2})/.exec(s);
    if (m)
        return `${m[1]}/${m[2]}/${m[3]}`;
    m = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(s);
    if (m)
        return `${m[3]}/${m[2]}/${m[1]}`;
    return "";
};
/** Errores de FORMA del lote, antes de mirar la base: largo, charset, cantidad. */
export function problemasDeForma(modo, registros) {
    const largo = modo === "carga_masiva" ? LARGO_130 : LARGO_85;
    const out = [];
    if (registros.length === 0)
        out.push("El lote no tiene registros.");
    if (modo === "altas_masivas" && registros.length > MAX_ALTAS_MASIVAS)
        out.push(`Altas Masivas admite hasta ${MAX_ALTAS_MASIVAS} registros y el lote tiene ${registros.length}.`);
    registros.forEach((r, i) => {
        if (typeof r !== "string")
            out.push(`El registro ${i + 1} no es texto.`);
        else if (r.length !== largo)
            out.push(`El registro ${i + 1} mide ${r.length} caracteres; tienen que ser ${largo}.`);
        else if (!CHARSET_REGISTRO.test(r))
            out.push(`El registro ${i + 1} tiene caracteres que el generador no produce.`);
    });
    return out;
}
/**
 * Compara UN registro contra lo esperado. Devuelve las diferencias (vacío = coincide).
 *
 * Lo que es dato del contrato se compara EXACTO. Lo que sale de una cascada que el servidor no
 * replica (modalidades y tipo de servicio, que dependen del tipo de contrato) se valida contra el
 * nomenclador; sucursal y actividad, contra lo que la empleadora tiene declarado.
 */
export function cotejarRegistro(modo, registro, e, cat) {
    const dif = [];
    const igual = (campo, esperado, recibido) => {
        if (esperado !== recibido)
            dif.push({ etiqueta: e.etiqueta, campo, esperado, recibido });
    };
    const enCatalogo = (campo, valor, conjunto) => {
        if (!conjunto.has(valor))
            dif.push({ etiqueta: e.etiqueta, campo, esperado: "un código del nomenclador", recibido: valor });
    };
    const p = modo === "carga_masiva" ? partirRegistro130(registro) : partirRegistro85(registro);
    igual("CUIL", digitos(e.cuil), p.cuil);
    if (!e.rnos)
        dif.push({ etiqueta: e.etiqueta, campo: "Obra social", esperado: e.rnosMotivo || "una obra social validada", recibido: p.rnos });
    else
        igual("Obra social", e.rnos.padStart(6, "0"), p.rnos);
    igual("Categoría", digitos(e.categoria).padStart(6, "0"), p.categoriaProf);
    enCatalogo("Modalidad de contratación", p.modalidadContrato, cat.modalidadesContrato);
    enCatalogo("Modalidad de liquidación", p.modalidadLiq, cat.modalidadesLiquidacion);
    enCatalogo("Tipo de servicio", p.tipoServicio, cat.tiposServicio);
    const actividades = cat.sucursales.get(p.sucursal);
    if (!actividades)
        dif.push({ etiqueta: e.etiqueta, campo: "Sucursal", esperado: "un domicilio de la empleadora", recibido: p.sucursal });
    else if (!actividades.has(p.actividad))
        dif.push({ etiqueta: e.etiqueta, campo: "Actividad", esperado: "una actividad declarada en ese domicilio", recibido: p.actividad });
    if (modo === "carga_masiva") {
        igual("Tipo de registro", "01", p.tipoRegistro);
        igual("Movimiento", "AT", p.movimiento);
        igual("Fecha de inicio", fecha130(e.fechaInicio).padEnd(10, " "), p.fechaInicio);
        igual("Fecha de fin", e.fechaFin ? fecha130(e.fechaFin).padEnd(10, " ") : " ".repeat(10), p.fechaFin);
        const enviado = Number(p.retribucion);
        const pesos = RETRIBUCION_130_EN_CENTAVOS ? enviado / 100 : enviado;
        if (!(Math.abs(pesos - e.retribucion) <= 0.01))
            dif.push({ etiqueta: e.etiqueta, campo: "Retribución", esperado: e.retribucion.toFixed(2), recibido: pesos.toFixed(2) });
    }
    else {
        igual("Fecha de inicio", fecha85(e.fechaInicio), p.fechaInicio);
        igual("Fecha de fin", e.fechaFin ? fecha85(e.fechaFin) : " ".repeat(8), p.fechaFin);
        const pesos = Number(p.retribucionEntera) + Number(p.retribucionDecimal) / 100;
        if (!(Math.abs(pesos - e.retribucion) <= 0.01))
            dif.push({ etiqueta: e.etiqueta, campo: "Retribución", esperado: e.retribucion.toFixed(2), recibido: pesos.toFixed(2) });
        igual("Convenio", String(e.convenio || "").padEnd(10, " "), p.convenio);
        igual("Puesto desempeñado", digitos(e.puesto || "").padStart(4, "0"), p.puesto);
        igual("Situación de revista", digitos(e.situacionRevista || "").padStart(2, "0"), p.situacionRevista);
        igual("Marca agropecuario", "0", p.agropecuario);
        igual("Marca CCG", "0", p.ccg);
        if (!e.puesto)
            dif.push({ etiqueta: e.etiqueta, campo: "Puesto desempeñado", esperado: "un puesto en la categoría o en los defaults", recibido: p.puesto });
    }
    return dif;
}
/** El CUIL de un registro, sin importar el formato. */
export const cuilDeRegistro = (modo, registro) => (modo === "carga_masiva" ? partirRegistro130(registro).cuil : partirRegistro85(registro).cuil);
