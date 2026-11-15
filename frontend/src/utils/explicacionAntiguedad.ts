/**
 * DE QUÉ EMPRESA SALEN LOS DÍAS DE VACACIONES (15/11/2026). Desde que la antigüedad ya no se suma
 * entre empleadoras, cada total dice de cuál salió. El mismo texto va en el tooltip del total y en el
 * modal «Antigüedad de …» de Vacaciones › Gestión por Usuario.
 */

export interface EmpresaComputo {
  cuit: string;
  nombre: string;
  motivo: "vigente" | "unica" | "precedencia";
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
};

const fecha = (iso: string): string => {
  const [a, m, d] = String(iso || "").slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : "—";
};

/** Las tres líneas: de qué empresa, en cuáles trabajó, y la antigüedad en ella. */
export const explicacionDeEmpresaComputo = (e: EmpresaComputo, total: number, persona: string): string[] => {
  const anios = (e.dias / 365.25).toLocaleString("es-AR", { maximumFractionDigits: 2 });
  return [
    `Los ${total} días se calculan con la antigüedad en ${e.nombre} (${MOTIVO_EMPRESA_COMPUTO[e.motivo]}).`,
    // Sin doble punto cuando la última termina en «S.R.L.».
    `${persona} trabajó en: ${e.empresasConsideradas.map((x) => x.nombre).join(", ").replace(/\.$/, "")}. No se suman entre empresas.`,
    `Antigüedad en ${e.nombre}: ${anios} años / ${e.dias.toLocaleString("es-AR")} días desde ${fecha(e.primeraAlta)}.`,
  ];
};
