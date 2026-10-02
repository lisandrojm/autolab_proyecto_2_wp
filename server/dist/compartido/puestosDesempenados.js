/**
 * ═══════════════════════════════════════════════════════════════════════
 * CÓDIGO COMPARTIDO SERVER ↔ FRONTEND (`server/src/compartido/`)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Solo código puro: nada de Node, Mongoose ni del DOM, y sin imports (ver `jornadas.ts`).
 *
 * ═══════════════════════════════════════════════════════════════════════
 * PUESTO DESEMPEÑADO: de dónde sale y cómo se importa la tabla
 * ═══════════════════════════════════════════════════════════════════════
 *
 * El registro de 85 de Altas Masivas (pos. 29-32) exige el código de puesto desempeñado de ARCA
 * (4 dígitos). La Carga Masiva no lo usa.
 */
/** Código canónico: solo dígitos, 4 posiciones con ceros a la izquierda. "" si no hay. */
export const codigoPuesto = (v) => {
    const d = String(v ?? "").replace(/\D/g, "");
    return d ? d.slice(-4).padStart(4, "0") : "";
};
/**
 * EL PUESTO DE UN CONTRATO, en este orden:
 *
 *   Rol Empresa del contrato → Categoría → default de la empleadora → default de la instalación
 *
 * La función va primero porque ES el puesto («Asistente de Cámara»); la categoría es el encuadre del
 * convenio y varias funciones distintas comparten la misma. Lo usan el generador del registro
 * (frontend) y el cotejo del lote (servidor): si cada uno resolviera por su cuenta, podrían discrepar.
 */
export function resolverPuesto(o) {
    for (const [valor, origen] of [
        [o.rol, "funcion"],
        [o.categoria, "categoria"],
        [o.empresa, "empresa"],
        [o.global, "global"],
    ]) {
        const c = codigoPuesto(valor);
        if (c)
            return { codigo: c, origen };
    }
    return { codigo: "", origen: "ninguno" };
}
const igualTexto = (a, b) => String(a || "").replace(/\s+/g, " ").trim() === String(b || "").replace(/\s+/g, " ").trim();
/**
 * Qué hace una importación de la tabla oficial, sin escribir nada: upsert por código.
 *
 *   · código nuevo                         → se crea (origen ARCA, activo)
 *   · de ARCA con otra descripción         → se actualiza la descripción
 *   · de ARCA igual                        → sin cambios
 *   · creado A MANO                        → no se pisa (se informa)
 *   · existe y la tabla no lo trae         → no se toca (ni se borra ni se desactiva)
 *
 * Las asignaciones (rol, categoría, defaults) guardan el CÓDIGO: reimportar nunca las rompe.
 */
export function planDeImportacionPuestos(existentes, filas) {
    const porCodigo = new Map(existentes.map((e) => [codigoPuesto(e.codigo), e]));
    const plan = { nuevos: [], actualizados: [], sinCambios: [], manualesRespetados: [], descartadas: 0 };
    const vistos = new Set();
    for (const f of filas) {
        const codigo = codigoPuesto(f.codigo);
        const descripcion = String(f.descripcion || "").replace(/\s+/g, " ").trim();
        if (!codigo || !descripcion || vistos.has(codigo)) {
            plan.descartadas++;
            continue;
        }
        vistos.add(codigo);
        const previo = porCodigo.get(codigo);
        if (!previo)
            plan.nuevos.push({ codigo, descripcion });
        else if (previo.origen === "manual") {
            if (igualTexto(previo.descripcion, descripcion))
                plan.sinCambios.push(codigo);
            else
                plan.manualesRespetados.push({ codigo, descripcion, descripcionManual: previo.descripcion });
        }
        else if (igualTexto(previo.descripcion, descripcion))
            plan.sinCambios.push(codigo);
        else
            plan.actualizados.push({ codigo, descripcion, descripcionAnterior: previo.descripcion });
    }
    return plan;
}
