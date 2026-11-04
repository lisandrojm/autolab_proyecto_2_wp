import { fechaCorta } from "./altasVigentes.js";
const normalizar = (t) => String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const codigo3 = (c) => {
    const d = String(c || "").replace(/\D/g, "");
    return d ? d.padStart(3, "0").slice(-3) : "";
};
/**
 * ¿La modalidad de ARCA es la del contrato? `true`/`false`, o `null` si no se puede saber (ARCA la
 * informa y del contrato no se conoce el código o su nombre).
 */
export function mismaModalidad(alta, deArca) {
    const texto = String(deArca || "").trim();
    if (!texto)
        return true; // ARCA no la informó: no se compara.
    const codigoContrato = codigo3(alta.modalidadCodigo);
    // El TXT a veces trae el código adelante («022 - A tiempo completo…»): entonces se compara el código.
    const conCodigo = texto.match(/^(\d{1,3})(?:\s*[-–:]\s*|\s+|$)/);
    if (conCodigo)
        return codigoContrato ? codigo3(conCodigo[1]) === codigoContrato : null;
    if (!codigoContrato || !alta.modalidadNombre)
        return null;
    const a = normalizar(texto);
    const b = normalizar(alta.modalidadNombre);
    if (!a || !b)
        return null;
    // El TXT es de ancho fijo y puede cortar la descripción: alcanza con que una empiece por la otra.
    return a === b || (Math.min(a.length, b.length) >= 12 && (a.startsWith(b) || b.startsWith(a)));
}
const periodo = (inicio, fin) => (fin ? `${fechaCorta(inicio)} → ${fechaCorta(fin)}` : `${fechaCorta(inicio)} → sin fin`);
const textoModalidad = (codigo, nombre) => [codigo3(codigo), nombre].filter(Boolean).join(" - ") || "sin resolver";
export function decidirAltaExterna(a, relaciones) {
    const esperado = { inicio: a.alta, fin: a.baja, modalidad: textoModalidad(a.modalidadCodigo, a.modalidadNombre) };
    // Las que pueden ser esta alta: empiezan el día del alta o durante el contrato.
    const candidatas = relaciones.filter((r) => r.inicio && r.inicio >= a.alta && (!a.baja || r.inicio <= a.baja));
    if (candidatas.length === 0)
        return null;
    const ladoALado = { esperado, encontradas: candidatas };
    const manual = (motivo, relacion) => ({ accion: "revision_manual", motivo, ...(relacion ? { relacion } : {}), ...ladoALado });
    const delDia = candidatas.filter((r) => r.inicio === a.alta);
    if (a.otroContratoMismoDia && delDia.length > 0)
        return manual(`ARCA tiene una relación que empieza el ${fechaCorta(a.alta)}, pero otro contrato de esta persona con esta empleadora que empieza ese día ya figura presentado desde WeProdu: revisar si éste es un duplicado. No se adopta para no tener dos contratos con la misma alta.`, delDia[0]);
    const exactas = delDia.filter((r) => (r.fin || "") === (a.baja || "") && mismaModalidad(a, r.modalidad) === true);
    if (exactas.length === 1) {
        const r = exactas[0];
        return { accion: "adoptar", motivo: `Alta externa: ARCA ya tiene la relación ${periodo(r.inicio, r.fin)}${r.modalidad ? `, ${r.modalidad}` : ""}, idéntica a este contrato. Se adoptó como presentada (no se vuelve a presentar).`, relacion: r, ...ladoALado };
    }
    if (exactas.length > 1)
        return manual(`ARCA tiene ${exactas.length} relaciones idénticas a este contrato (${periodo(a.alta, a.baja)}): no se puede saber cuál es la de este contrato. Revisar a mano.`);
    // Hay algo que empieza durante el contrato y no coincide en todo: qué difiere, de la más parecida.
    const r = delDia[0] || candidatas[0];
    const diferencias = [];
    if (r.inicio !== a.alta)
        diferencias.push(`empieza el ${fechaCorta(r.inicio)} y el contrato el ${fechaCorta(a.alta)}`);
    if ((r.fin || "") !== (a.baja || ""))
        diferencias.push(`${r.fin ? `termina el ${fechaCorta(r.fin)}` : "no tiene fecha de fin"} y el contrato ${a.baja ? `el ${fechaCorta(a.baja)}` : "es por tiempo indeterminado"}`);
    const modalidad = mismaModalidad(a, r.modalidad);
    if (modalidad === false)
        diferencias.push(`la modalidad es «${r.modalidad}» y la del contrato «${esperado.modalidad}»`);
    if (modalidad === null)
        diferencias.push(`no se pudo comparar la modalidad («${r.modalidad}» en ARCA; el contrato: ${esperado.modalidad})`);
    const otras = candidatas.length > 1 ? ` (hay ${candidatas.length} relaciones que empiezan durante el contrato)` : "";
    return manual(`Parece un alta hecha a mano en ARCA que no coincide con el contrato: ${diferencias.join("; ")}${otras}. No se adopta sola: revisar cuál es la correcta.`, r);
}
