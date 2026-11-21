const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const diaSiguiente = (f) => {
    const d = new Date(`${f}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
};
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const SIN_FIN = "9999-12-31";
const idDe = (r) => `${r.cuil}|${r.empleadoraCuit}|${r.inicio}`;
export function relacionesSinContratoExacto(contratos, relaciones, hoy) {
    const vivos = contratos.filter((c) => c.estadoContrato !== "ANULADO" && ES_FECHA.test(c.alta) && c.cuil.length === 11 && c.cuit.length === 11);
    const altasExactas = new Set(vivos.map((c) => `${c.cuil}|${c.cuit}|${c.alta}`));
    const porPersona = new Map();
    for (const c of vivos) {
        const k = `${c.cuil}|${c.cuit}`;
        (porPersona.get(k) || porPersona.set(k, []).get(k)).push(c);
    }
    // Explicadas: las de alta exacta y, desde cada una, su cadena de tramos contiguos.
    const relsPorPersona = new Map();
    for (const r of relaciones) {
        const k = `${r.cuil}|${r.empleadoraCuit}`;
        (relsPorPersona.get(k) || relsPorPersona.set(k, []).get(k)).push(r);
    }
    const explicadas = new Set(relaciones.map(idDe).filter((id) => altasExactas.has(id)));
    for (const r of relaciones) {
        if (!altasExactas.has(idDe(r)))
            continue;
        const mismas = relsPorPersona.get(`${r.cuil}|${r.empleadoraCuit}`) || [];
        for (let u = r; u.fin;) {
            const n = mismas.find((x) => x.inicio === diaSiguiente(u.fin));
            if (!n || explicadas.has(idDe(n)))
                break;
            explicadas.add(idDe(n));
            u = n;
        }
    }
    const out = [];
    const vistas = new Set();
    for (const r of relaciones) {
        if (!ES_FECHA.test(r.inicio) || r.inicio > hoy)
            continue;
        const id = idDe(r);
        if (vistas.has(id) || explicadas.has(id))
            continue;
        const fin = r.fin || SIN_FIN;
        const solapados = (porPersona.get(`${r.cuil}|${r.empleadoraCuit}`) || [])
            .filter((c) => c.alta <= fin && (c.baja || SIN_FIN) >= r.inicio)
            .map((c) => ({ contratoKey: c.contratoKey, alta: c.alta, baja: c.baja, dias: diasEntre(c.alta, r.inicio) }))
            .sort((a, b) => Math.abs(a.dias) - Math.abs(b.dias) || a.alta.localeCompare(b.alta));
        if (!solapados.length)
            continue;
        vistas.add(id);
        out.push({ cuil: r.cuil, cuit: r.empleadoraCuit, inicio: r.inicio, fin: r.fin || "", situacionBaja: String(r.situacionBaja || "").trim(), contratos: solapados });
    }
    return out;
}
