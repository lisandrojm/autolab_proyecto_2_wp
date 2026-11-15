/**
 * DE QUÉ EMPRESA SALEN LOS DÍAS DE VACACIONES (15/11/2026). Desde que la antigüedad ya no se suma
 * entre empleadoras, cada total dice de cuál salió. El mismo texto va en el tooltip del total y en el
 * modal «Antigüedad de …» de Vacaciones › Gestión por Usuario.
 */

export interface EmpresaComputo {
  cuit: string;
  nombre: string;
  /** «suma»: se sumaron todas (la configuración lo pide o el período ya cerró). */
  motivo: "vigente" | "unica" | "precedencia" | "suma";
  fuente: "arca" | "contratos";
  dias: number;
  primeraAlta: string;
  tieneRelacionAbierta: boolean;
  empresasConsideradas: { cuit: string; nombre: string; dias: number }[];
}

export const MOTIVO_EMPRESA_COMPUTO: Record<EmpresaComputo["motivo"], string> = {
  vigente: "empresa vigente",
  unica: "única empresa",
  precedencia: "precedencia manual",
  suma: "suma de todas las empresas",
};

const fecha = (iso: string): string => {
  const [a, m, d] = String(iso || "").slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : "—";
};

/** Las tres líneas: de qué empresa, en cuáles trabajó, y la antigüedad en ella. */
export const explicacionDeEmpresaComputo = (e: EmpresaComputo, total: number, persona: string, razonSuma?: "config" | "periodoCerrado" | null): string[] => {
  const anios = (e.dias / 365.25).toLocaleString("es-AR", { maximumFractionDigits: 2 });
  const empresas = e.empresasConsideradas.map((x) => x.nombre).join(", ").replace(/\.$/, "");
  if (e.motivo === "suma")
    return [
      `Los ${total} días se calculan sumando la antigüedad de todas las empresas (${razonSuma === "periodoCerrado" ? "período cerrado: conserva el cálculo con que se liquidó" : "la configuración de Vacaciones lo pide"}).`,
      ...(empresas ? [`${persona} trabajó en: ${empresas}.`] : []),
      `Antigüedad sumada: ${anios} años / ${e.dias.toLocaleString("es-AR")} días${e.primeraAlta ? ` desde ${fecha(e.primeraAlta)}` : ""}.`,
    ];
  return [
    `Los ${total} días se calculan con la antigüedad en ${e.nombre} (${MOTIVO_EMPRESA_COMPUTO[e.motivo]}).`,
    // Sin doble punto cuando la última termina en «S.R.L.».
    `${persona} trabajó en: ${e.empresasConsideradas.map((x) => x.nombre).join(", ").replace(/\.$/, "")}. No se suman entre empresas.`,
    `Antigüedad en ${e.nombre}: ${anios} años / ${e.dias.toLocaleString("es-AR")} días desde ${fecha(e.primeraAlta)}.`,
  ];
};

/** La ruta de la configuración «Antigüedad por empresa», con la pestaña ya abierta. */
export const RUTA_CONFIG_ANTIGUEDAD = "/vacations-rules/antiguedad-por-empresa";

/**
 * POR QUÉ ESA EMPRESA, en una o dos líneas (15/11/2026): el (i) de «Antigüedad» en Gestión por Usuario y
 * el modal. `empresas`: las empleadoras en que trabajó (se nombran sólo si son más de una).
 */
export const porQueDeLaEmpresa = (e: Pick<EmpresaComputo, "nombre" | "motivo">, empresas: string[] = []): string[] => {
  const motivo =
    e.motivo === "vigente"
      ? `Se toma la antigüedad de ${e.nombre}: es su empresa vigente (su relación más reciente/activa). No se suman las demás.`
      : e.motivo === "unica"
        ? `Se toma la antigüedad de ${e.nombre}: es la única empresa en la que trabajó.`
        : e.motivo === "precedencia"
          ? `Se toma la antigüedad de ${e.nombre}: quedó primera en la precedencia configurada. No se suman las demás.`
          : "Se están SUMANDO todas las empresas (cálculo anterior).";
  return empresas.length > 1 ? [motivo, `Trabajó en: ${empresas.join(", ")}.`] : [motivo];
};
