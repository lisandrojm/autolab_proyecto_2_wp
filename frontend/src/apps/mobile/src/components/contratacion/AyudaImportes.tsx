import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMoneyBillWave } from "@fortawesome/free-solid-svg-icons";

/*
  LOS IMPORTES, COMO SE VEN EN EL ALTA INDIVIDUAL: las clases del móvil para `ImportesDelContrato` y
  la ayuda que va debajo del importe por jornada.

  `ImportesDelContrato` es el componente compartido con el escritorio (calcula jornada, semana, mensual
  y total desde cualquiera de los cuatro); lo que lo hace VERSE como en el móvil son estas clases y esta
  ayuda. Vivían adentro de `UserRegistrationModal`; las plantillas de equipo muestran los mismos importes
  por persona y por puesto, así que van acá para que sean una sola cosa.
*/

/** Las clases, el ícono del rótulo y el billete adentro del campo, tal como los usa el alta individual. */
export const PROPS_IMPORTES_MOVIL = {
  claseEtiqueta: "text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2",
  claseCampo: "w-full h-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium disabled:cursor-not-allowed disabled:opacity-60",
  claseCampoTotal: "w-full h-12 rounded-xl border border-emerald-300 bg-emerald-50 pl-10 pr-4 font-bold text-emerald-800 outline-none transition-all focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
  claseAyuda: "text-[11px] text-slate-400",
  icono: <FontAwesomeIcon icon={faMoneyBillWave} className="text-blue-500 text-[10px]" />,
  adornoCampo: (
    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
      <FontAwesomeIcon icon={faMoneyBillWave} />
    </span>
  ),
};

/**
 * Cuánto se aleja lo cargado de la escala, con el multiplicador incluido (si no, un contrato de 1,5
 * mostraría siempre «+50% contra la escala»). `null` si no hay escala, no hay importe, o son iguales.
 */
export const diferenciaContraEscala = (escala: number, cargado: string | number): { escala: number; delta: number } | null => {
  const n = Number(cargado);
  if (!escala || !Number.isFinite(n) || cargado === "" || cargado === null || cargado === undefined) return null;
  const delta = Number((n - escala).toFixed(2));
  return delta === 0 ? null : { escala, delta };
};

const num = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2 });

/**
 * La ayuda debajo del importe por jornada: de dónde salió el número y qué pasa si se cambia.
 *
 * EL MULTIPLICADOR, DICHO CON LOS DOS NÚMEROS. Un importe que sale 1,5 veces más alto que la escala
 * del convenio parece un error de carga si no se explica de dónde salió: acá se lee la cuenta entera
 * —la escala, el multiplicador y de qué contrato viene—.
 */
export function AyudaImportes({ bloqueado, esServicios, categoria, cct, multiplicador = 1, contrato, escalaBase, diferencia }: { bloqueado: boolean; esServicios: boolean; /** El nombre de la categoría elegida. */ categoria?: string | null; /** El código del convenio («0634/11»). */ cct?: string | null; multiplicador?: number; /** El nombre del tipo de contrato. */ contrato?: string | null; /** La escala de la categoría SIN multiplicador (por jornada). */ escalaBase: number; diferencia: { escala: number; delta: number } | null }) {
  return (
    <>
      {bloqueado && <p className="text-[11px] text-slate-400">Se habilita al elegir la categoría: el importe sale de su escala.</p>}
      {esServicios && <p className="text-[11px] text-slate-400">Es un servicio: no hay convenio ni categoría, así que el importe se carga a mano.</p>}
      {!bloqueado && <p className="text-[11px] text-slate-400">Total ÷ jornadas del contrato. Varía según los días hábiles de cada mes.</p>}
      {categoria && !diferencia && (
        <p className="text-[11px] text-slate-400">
          De la escala de {categoria}
          {cct ? ` · ${cct}` : ""}. Se puede cambiar.
        </p>
      )}
      {categoria && multiplicador !== 1 && (
        <p className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
          Escala {num(escalaBase)} × {multiplicador} del contrato {contrato}.
        </p>
      )}
      {diferencia && (
        <p className={`text-[11px] font-medium ${diferencia.delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
          {diferencia.delta > 0 ? "+" : "−"}
          {num(Math.abs(diferencia.delta))} contra la escala ({num(diferencia.escala)})
        </p>
      )}
    </>
  );
}
