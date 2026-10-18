import { rangoDelMesEnVentana, sumarDias } from "./fechas.js";
export function coberturaDelMes(bloques, personasDelGrupo, mes, ventanaDesde, ventanaHasta) {
    const rango = rangoDelMesEnVentana(mes, ventanaDesde, ventanaHasta);
    if (!rango)
        return { dias: 0, diasConAlguienAfuera: 0, diasSinNadie: 0, porDia: [] };
    const grupo = new Set(personasDelGrupo);
    const vivos = bloques.filter((b) => b.estado !== "cancelado" && b.estado !== "rechazado" && grupo.has(b.userId));
    const porDia = [];
    let dia = rango.desde;
    for (let i = 0; i < rango.dias; i++) {
        const ausentes = [...new Set(vivos.filter((b) => b.desde <= dia && dia <= b.hasta).map((b) => b.userId))];
        porDia.push({ dia, ausentes, presentes: Math.max(0, grupo.size - ausentes.length) });
        dia = sumarDias(dia, 1);
    }
    return {
        dias: rango.dias,
        diasConAlguienAfuera: porDia.filter((d) => d.ausentes.length > 0).length,
        diasSinNadie: porDia.filter((d) => grupo.size > 0 && d.presentes === 0).length,
        porDia,
    };
}
