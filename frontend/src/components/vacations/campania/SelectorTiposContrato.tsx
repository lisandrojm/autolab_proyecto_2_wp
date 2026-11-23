import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBan, faCheck } from "@fortawesome/free-solid-svg-icons";
import type { TipoContratoVacaciones } from "../../../api/vacationConfig";

/** «008 · 000 · 1»: modalidad de contrato, tipo de servicio y modalidad de liquidación de ARCA ("" sin códigos). */
export const codigosArca = (t: Pick<TipoContratoVacaciones, "arca">) => [t.arca?.modalidad, t.arca?.servicio, t.arca?.liquidacion].filter(Boolean).join(" · ");

/**
 * A QUÉ TIPOS DE CONTRATO INVITA LA CAMPAÑA DE GOCE: un tilde por tipo del CATÁLOGO (23/11/2026:
 * `/vacation-config/tipos-contrato`, uno por tipo y sólo los activos; antes se agrupaba por el número de FRAME y
 * aparecía un segundo «Tiempo Indeterminado» que juntaba todo lo creado en WeProdu). Sin ninguno tildado = todos
 * los habilitados. Los que «Visibilidad por tipo de Contrato» deja sin vacaciones se ven, pero no se pueden tildar:
 * no se invitan nunca. Cada chip lleva, en chico, sus códigos de ARCA: son un dato, no lo que se elige (Plazo fijo
 * 6x6, Plazo fijo 5x7 y la práctica profesional comparten los tres códigos).
 *
 * `personas`: un número por tipo (quién lo cuenta lo dice `queCuenta`, en el tooltip); sin eso no se muestra.
 */
export const SelectorTiposContrato: React.FC<{
  tipos: TipoContratoVacaciones[];
  deshabilitados: string[];
  seleccion: string[];
  onChange: (seleccion: string[]) => void;
  personas?: Record<string, number>;
  queCuenta?: string;
  disabled?: boolean;
}> = ({ tipos, deshabilitados, seleccion, onChange, personas, queCuenta = "personas", disabled }) => {
  const alternar = (id: string) => onChange(seleccion.includes(id) ? seleccion.filter((x) => x !== id) : [...seleccion, id].sort());
  const chip = "px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-2 transition-colors disabled:cursor-not-allowed";
  const todos = seleccion.length === 0;
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={disabled} onClick={() => onChange([])} aria-pressed={todos} className={`${chip} ${todos ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"}`}>
        {todos && <FontAwesomeIcon icon={faCheck} />}
        Todos los habilitados
      </button>
      {tipos.map((t) => {
        const fuera = deshabilitados.includes(t.id);
        const tildado = !fuera && seleccion.includes(t.id);
        const codigos = codigosArca(t);
        const ayuda = [
          fuera ? "Este tipo de contrato no tiene vacaciones (Configuración › Vacaciones › Visibilidad por tipo de Contrato): no se invita." : "",
          !t.activo ? "Tipo inactivo en el catálogo: aparece porque todavía hay contratos vigentes de este tipo." : "",
          codigos ? `ARCA: modalidad ${t.arca.modalidad || "—"} · tipo de servicio ${t.arca.servicio || "—"} · liquidación ${t.arca.liquidacion || "—"}.` : "Sin códigos de ARCA (no se da de alta en ARCA).",
          personas ? `${personas[t.id] || 0} ${queCuenta}.` : "",
        ].filter(Boolean).join(" ");
        return (
          <button
            key={t.id}
            type="button"
            disabled={disabled || fuera}
            onClick={() => alternar(t.id)}
            aria-pressed={tildado}
            title={ayuda}
            className={`${chip} ${fuera ? "border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 opacity-70" : tildado ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"}`}
          >
            {fuera ? <FontAwesomeIcon icon={faBan} /> : tildado ? <FontAwesomeIcon icon={faCheck} /> : null}
            <span className={fuera ? "line-through" : ""}>{t.name}</span>
            {!t.activo && <span className="font-normal text-amber-600 dark:text-amber-400">inactivo</span>}
            {codigos && <span className="font-mono font-normal text-[10px] text-gray-400">{codigos}</span>}
            {personas && !fuera && <span className="font-normal text-gray-400">{personas[t.id] || 0}</span>}
          </button>
        );
      })}
    </div>
  );
};
