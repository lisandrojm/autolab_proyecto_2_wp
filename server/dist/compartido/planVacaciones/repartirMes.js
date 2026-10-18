import { diasDelMes, rangoDelMesEnVentana, sumarDias } from "./fechas.js";
export function repartirMes(personas, mes, o) {
    const rango = rangoDelMesEnVentana(mes, o.ventanaDesde, o.ventanaHasta);
    if (!rango || personas.length === 0)
        return [];
    const n = personas.length;
    const base = Math.floor(rango.dias / n);
    const resto = rango.dias % n;
    const mesRecortado = rango.dias < diasDelMes(mes);
    const out = [];
    let cursor = rango.desde;
    personas.forEach((p, i) => {
        // Los últimos `resto` tramos llevan un día más: así el mes queda cubierto entero y parejo.
        const largoTramo = base + (i >= n - resto ? 1 : 0);
        const segmentoDesde = cursor;
        const segmentoHasta = sumarDias(cursor, largoTramo - 1);
        cursor = sumarDias(segmentoHasta, 1);
        const disponibles = Math.max(0, Math.floor(p.disponibles || 0));
        const tope = Math.max(0, Math.floor(o.tope || 0));
        const dias = Math.min(largoTramo, disponibles, tope);
        let recortadoPor = "ninguno";
        if (dias < largoTramo)
            recortadoPor = disponibles <= tope ? "saldo" : "tope";
        else if (mesRecortado)
            recortadoPor = "ventana";
        out.push({ userId: p.userId, desde: segmentoDesde, hasta: dias > 0 ? sumarDias(segmentoDesde, dias - 1) : segmentoDesde, dias, segmentoDesde, segmentoHasta, recortadoPor });
    });
    return out;
}
