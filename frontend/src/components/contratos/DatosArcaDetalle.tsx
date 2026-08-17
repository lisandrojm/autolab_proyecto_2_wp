import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faXmark, faTriangleExclamation, faLock, faArrowUpRightFromSquare, faCircleInfo, faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { ContractOverviewRow } from "../../api/users";
import { AfipCatalogs, AfipRowResult, AfipFieldCheck, GrupoFaltante } from "./afipCompleteness";
import { describirRegistro, CampoRegistro } from "./afipTxt";

/**
 * Detalle de "Datos ARCA" de un contrato.
 *
 * Responde una sola pregunta: qué hay que ir a cargar, y dónde, para que esta persona entre en el
 * TXT. Por eso agrupa por ORIGEN y no por campo: el operador no arregla "modalidad de contrato",
 * arregla "los códigos ARCA del tipo de contrato", que resuelve tres campos de una.
 *
 * Tres estados se distinguen a propósito:
 *  - falta     (ámbar) se puede cargar ya
 *  - error     (rojo)  está cargado pero mal — más grave, porque hoy pasa desapercibido
 *  - bloqueado (gris)  no se puede resolver todavía; NO se cuenta como problema propio
 */

const ICONO: Record<AfipFieldCheck["estado"], { icon: typeof faCheck; clase: string }> = {
  ok: { icon: faCheck, clase: "text-green-500" },
  falta: { icon: faXmark, clase: "text-amber-500" },
  error: { icon: faTriangleExclamation, clase: "text-red-500" },
  bloqueado: { icon: faLock, clase: "text-gray-400" },
  // El aviso NO es un faltante: el dato está y el alta sale. Se marca en ámbar porque conviene
  // mirarlo —una obra social heredada de la ficha vieja puede estar vencida—, no porque falte algo.
  aviso: { icon: faTriangleExclamation, clase: "text-amber-500" },
};

const FilaCheck: React.FC<{ c: AfipFieldCheck }> = ({ c }) => {
  const { icon, clase } = ICONO[c.estado];
  const atenuado = c.estado === "bloqueado";
  return (
    <li className={`px-3 py-2 ${atenuado ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200 min-w-0">
          <FontAwesomeIcon icon={icon} className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${clase}`} />
          <span className="min-w-0">
            <span className="block">{c.label}</span>
            {c.detalle && <span className={`block text-[11px] mt-0.5 ${c.estado === "error" ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}`}>{c.detalle}</span>}
          </span>
        </span>
        <span className="shrink-0 text-right">
          {c.estado === "ok" && <span className="text-sm font-mono text-gray-600 dark:text-gray-300">{c.value || "—"}</span>}
          {c.estado === "falta" && <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">Falta</span>}
          {c.estado === "error" && <span className="text-[11px] font-semibold text-red-600 dark:text-red-400">Mal cargado</span>}
          {c.estado === "bloqueado" && <span className="text-[11px] font-semibold text-gray-500">En espera</span>}
          {c.estado === "aviso" && <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">Sin constatar</span>}
        </span>
      </div>
    </li>
  );
};

const Grupo: React.FC<{ g: GrupoFaltante; onNavegar?: () => void }> = ({ g, onNavegar }) => {
  const bloqueado = !!g.bloqueadoPor;
  const borde = bloqueado ? "border-gray-200 dark:border-gray-700" : g.tieneErrores ? "border-red-300 dark:border-red-800/70" : "border-amber-300 dark:border-amber-800/70";
  return (
    <div className={`rounded-lg border ${borde} overflow-hidden ${bloqueado ? "opacity-70" : ""}`}>
      <div className={`px-3 py-2 ${bloqueado ? "bg-gray-50 dark:bg-gray-800/40" : g.tieneErrores ? "bg-red-50/70 dark:bg-red-950/20" : "bg-amber-50/70 dark:bg-amber-950/20"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              {bloqueado && <FontAwesomeIcon icon={faLock} className="h-3 w-3 text-gray-400" />}
              {g.titulo}
            </p>
            <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">{bloqueado ? "Se destraba solo al resolver lo de arriba." : g.accion}</p>
          </div>
          {!bloqueado && g.link && "to" in g.link && (
            <Link to={g.link.to} target="_blank" onClick={onNavegar} className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
              {g.link.label}
              <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2.5 w-2.5" />
            </Link>
          )}
          {!bloqueado && g.link && "enFila" in g.link && <span className="shrink-0 text-[11px] text-gray-500 dark:text-gray-400 max-w-[12rem] text-right">{g.link.enFila}</span>}
        </div>
      </div>
      <ul className="divide-y divide-gray-100 dark:divide-gray-700/60 bg-white dark:bg-gray-900/30">
        {g.checks.map((c) => (
          <FilaCheck key={c.key} c={c} />
        ))}
      </ul>
    </div>
  );
};

/**
 * Vista previa del registro tal como va a salir en el archivo. Sirve para dos cosas: auditar los
 * valores formateados (por ejemplo si la retribución sale en pesos o en centavos, que todavía está
 * sin confirmar contra ARCA) y ver EN QUÉ POSICIÓN queda el hueco cuando falta un dato.
 */
const VistaPrevia: React.FC<{ campos: CampoRegistro[] }> = ({ campos }) => {
  const [abierto, setAbierto] = useState(false);
  const linea = campos.map((c) => c.contenido ?? c.placeholder).join("");
  const incompleto = campos.some((c) => c.contenido === null);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button type="button" onClick={() => setAbierto((v) => !v)} className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
          <FontAwesomeIcon icon={abierto ? faChevronDown : faChevronRight} className="h-3 w-3" />
          Cómo queda en el archivo ({linea.length} caracteres)
        </span>
        {incompleto && <span className="text-[11px] text-amber-600 dark:text-amber-400 shrink-0">con huecos</span>}
      </button>

      {abierto && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-3 space-y-3 bg-gray-50/60 dark:bg-gray-900/30">
          {/* La línea entera, con los huecos visibles en su posición exacta. */}
          <pre className="text-[10px] leading-relaxed font-mono whitespace-pre-wrap break-all text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-950/50 rounded p-2 border border-gray-200 dark:border-gray-700">{linea.replace(/ /g, "␣")}</pre>

          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-gray-500 dark:text-gray-400 text-left">
                  <th className="py-1 pr-3 font-semibold whitespace-nowrap">Pos.</th>
                  <th className="py-1 pr-3 font-semibold">Campo</th>
                  <th className="py-1 font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {campos.map((c) => {
                  const falta = c.contenido === null;
                  const noAplica = c.clase === "no_aplica";
                  return (
                    <tr key={`${c.desde}-${c.hasta}`} className={falta ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}>
                      <td className="py-1 pr-3 font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {c.desde}
                        {c.hasta !== c.desde ? `-${c.hasta}` : ""}
                      </td>
                      <td className={`py-1 pr-3 ${noAplica || c.clase === "constante" ? "text-gray-400 dark:text-gray-500" : "text-gray-700 dark:text-gray-200"}`}>
                        {c.nombre}
                        {c.clase === "constante" && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-gray-400">fijo</span>}
                        {noAplica && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-gray-400">no aplica</span>}
                      </td>
                      <td className="py-1 font-mono">
                        {falta ? <span className="text-amber-600 dark:text-amber-400">{c.placeholder}</span> : <span className={noAplica || c.clase === "constante" ? "text-gray-400 dark:text-gray-500" : "text-gray-800 dark:text-gray-100"}>{(c.contenido || "").replace(/ /g, "␣") || "—"}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
            La retribución se manda con <strong>2 decimales implícitos</strong> (importe × 100). Está pendiente de confirmar contra un alta real: si ARCA esperara pesos enteros, este campo tendría que salir sin el × 100.
          </p>
        </div>
      )}
    </div>
  );
};

export const DatosArcaDetalle: React.FC<{ row: ContractOverviewRow; result: AfipRowResult; cat: AfipCatalogs; onNavegar?: () => void }> = ({ row, result, cat, onNavegar }) => {
  const { campos } = useMemo(() => describirRegistro(row, cat), [row, cat]);
  const resueltos = result.checks.filter((c) => c.estado === "ok").length;

  // El encabezado cuenta CONFIGURACIONES, no campos: "Faltan 6 datos" mezclaba un tipo de contrato
  // sin códigos (1 cosa que cargar) con los 3 campos que dependen de él y con los 2 que estaban
  // bloqueados esperando la empresa. Eran 2 acciones, no 6 problemas.
  const encabezado = result.completo
    ? { clase: "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400", icon: faCheck, texto: "Listo para la carga masiva: todos los datos están resueltos." }
    : result.errores > 0
      ? {
          clase: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400",
          icon: faTriangleExclamation,
          texto: `${result.errores} dato(s) cargado(s) mal${result.configuracionesPendientes > result.errores ? ` y ${result.configuracionesPendientes} configuración(es) pendiente(s)` : ""}.`,
        }
      : {
          clase: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
          icon: faTriangleExclamation,
          texto: `${result.configuracionesPendientes} configuración(es) pendiente(s) · ${resueltos} de ${result.checks.length} campos resueltos.`,
        };

  return (
    <div className="space-y-3">
      <div className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${encabezado.clase}`}>
        <FontAwesomeIcon icon={encabezado.icon} className="mt-0.5 shrink-0" />
        <span>{encabezado.texto}</span>
      </div>

      {result.grupos.length > 0 && (
        <div className="space-y-2">
          {result.grupos.map((g) => (
            <Grupo key={g.origen} g={g} onNavegar={onNavegar} />
          ))}
        </div>
      )}

      {/* Los avisos van VISIBLES aunque el contrato esté completo: no bloquean el alta, pero si
          quedaran colapsados con los campos resueltos nadie se enteraría de que hay una obra social
          sin constatar, que es justo lo que hay que ir limpiando. */}
      {result.checks.some((c) => c.estado === "aviso") && (
        <ul className="rounded-lg border border-amber-300 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/20 divide-y divide-amber-200/60 dark:divide-amber-800/40">
          {result.checks
            .filter((c) => c.estado === "aviso")
            .map((c) => (
              <FilaCheck key={c.key} c={c} />
            ))}
        </ul>
      )}

      {/* Los campos ya resueltos van al final y colapsados: lo que importa es lo que falta. */}
      <details className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <summary className="px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40">
          Campos resueltos ({resueltos})
        </summary>
        <ul className="divide-y divide-gray-100 dark:divide-gray-700/60 border-t border-gray-200 dark:border-gray-700">
          {result.checks.filter((c) => c.estado === "ok").map((c) => (
            <FilaCheck key={c.key} c={c} />
          ))}
        </ul>
      </details>

      <VistaPrevia campos={campos} />

      <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-start gap-1.5">
        <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3 mt-0.5 shrink-0" />
        <span>Puesto desempeñado, convenio colectivo y situación de revista no se chequean: van en blanco en el registro de 130 posiciones.</span>
      </p>
    </div>
  );
};
