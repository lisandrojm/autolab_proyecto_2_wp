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
export const codigoPuesto = (v: unknown): string => {
  const d = String(v ?? "").replace(/\D/g, "");
  return d ? d.slice(-4).padStart(4, "0") : "";
};

// ───────────────────────────────────────────────────────────────── resolución

export type OrigenPuesto = "funcion" | "categoria" | "convenio" | "empresa" | "global" | "ninguno";

/**
 * EL PUESTO DE UN CONTRATO, en este orden:
 *
 *   Rol Empresa del contrato → Categoría → CONVENIO de la categoría → default de la empleadora →
 *   default de la instalación
 *
 * La función va primero porque ES el puesto («Asistente de Cámara»); la categoría es el encuadre del
 * convenio y varias funciones distintas comparten la misma.
 *
 * EL CONVENIO VA ANTES QUE LA EMPLEADORA, por lo mismo que la obra social (`Convenio.obraSocialDefaultId`):
 * el puesto típico lo define el convenio —quien trabaja bajo el de televisión es personal de apoyo a
 * la producción, lo contrate la productora que lo contrate—, y el default de la empleadora queda para
 * lo que el convenio no decide (el 9999/99 «excluido de convenio», o un convenio sin default). Entra
 * SOLO cuando rol y categoría están vacíos: lo que ya resolvían esos dos no cambia.
 *
 * Lo usan el generador del registro (frontend) y el cotejo del lote (servidor): si cada uno
 * resolviera por su cuenta, podrían discrepar. Por eso es UNA función, y los dos le pasan los cinco.
 */
export function resolverPuesto(o: { rol?: unknown; categoria?: unknown; convenio?: unknown; empresa?: unknown; global?: unknown }): { codigo: string; origen: OrigenPuesto } {
  for (const [valor, origen] of [
    [o.rol, "funcion"],
    [o.categoria, "categoria"],
    [o.convenio, "convenio"],
    [o.empresa, "empresa"],
    [o.global, "global"],
  ] as Array<[unknown, OrigenPuesto]>) {
    const c = codigoPuesto(valor);
    if (c) return { codigo: c, origen };
  }
  return { codigo: "", origen: "ninguno" };
}

// ───────────────────────────────────────────────────────────────── importación

export interface PuestoExistente {
  codigo: string;
  descripcion: string;
  origen?: "arca" | "manual";
}

export interface FilaPuesto {
  codigo: string;
  descripcion: string;
}

export interface PlanImportacionPuestos {
  nuevos: FilaPuesto[];
  actualizados: Array<FilaPuesto & { descripcionAnterior: string }>;
  sinCambios: string[];
  /** Códigos que la tabla trae pero que se cargaron a mano: no se pisan. */
  manualesRespetados: Array<FilaPuesto & { descripcionManual: string }>;
  /** Filas descartadas (sin código o sin descripción) y repetidas. */
  descartadas: number;
}

const igualTexto = (a: string, b: string) => String(a || "").replace(/\s+/g, " ").trim() === String(b || "").replace(/\s+/g, " ").trim();

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
export function planDeImportacionPuestos(existentes: PuestoExistente[], filas: FilaPuesto[]): PlanImportacionPuestos {
  const porCodigo = new Map(existentes.map((e) => [codigoPuesto(e.codigo), e]));
  const plan: PlanImportacionPuestos = { nuevos: [], actualizados: [], sinCambios: [], manualesRespetados: [], descartadas: 0 };
  const vistos = new Set<string>();
  for (const f of filas) {
    const codigo = codigoPuesto(f.codigo);
    const descripcion = String(f.descripcion || "").replace(/\s+/g, " ").trim();
    if (!codigo || !descripcion || vistos.has(codigo)) {
      plan.descartadas++;
      continue;
    }
    vistos.add(codigo);
    const previo = porCodigo.get(codigo);
    if (!previo) plan.nuevos.push({ codigo, descripcion });
    else if (previo.origen === "manual") {
      if (igualTexto(previo.descripcion, descripcion)) plan.sinCambios.push(codigo);
      else plan.manualesRespetados.push({ codigo, descripcion, descripcionManual: previo.descripcion });
    } else if (igualTexto(previo.descripcion, descripcion)) plan.sinCambios.push(codigo);
    else plan.actualizados.push({ codigo, descripcion, descripcionAnterior: previo.descripcion });
  }
  return plan;
}
