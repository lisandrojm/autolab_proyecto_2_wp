import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faXmark, faTriangleExclamation, faLock, faArrowUpRightFromSquare, faCircleInfo, faChevronDown, faChevronRight, faPenToSquare } from "@fortawesome/free-solid-svg-icons";
import { ContractOverviewRow } from "../../api/users";
import { AfipCatalogs, AfipRowResult, AfipFieldCheck, GrupoFaltante, TonoArca, resumenArca } from "./afipCompleteness";
import { describirRegistro, CampoRegistro } from "./afipTxt";
import { ObraSocialDelContrato } from "./ObraSocialDelContrato";

/**
 * Detalle de "Datos ARCA" de un contrato.
 *
 * Responde una sola pregunta: qué hay que ir a cargar, y dónde, para que esta persona entre en el
 * TXT. Por eso agrupa por ORIGEN y no por campo: el operador no arregla "modalidad de contrato",
 * arregla "los códigos ARCA del tipo de contrato", que resuelve tres campos de una.
 *
 * Y por eso lo pendiente se parte en tres bloques con distinto peso visual, en vez de una lista de
 * tarjetas todas iguales:
 *
 *   1. Configuración de ARCA — lo que hay que ir a cargar a otra pantalla. Numerado, es la tarea.
 *   2. Se elige en esta fila — empresa y sucursal. No es configuración: los selectores están a la
 *      vista en la grilla, dos columnas más allá. Van atenuados y NO entran en el "Faltan N".
 *   3. En espera — lo que se destraba solo. Colapsado: ocupaba media pantalla para decir "En espera".
 *
 * Tres estados de campo se distinguen a propósito:
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

/** Paleta por tono, compartida por el badge de la grilla y el encabezado del detalle. */
const TONO: Record<TonoArca, { icon: typeof faCheck; badge: string; panel: string; barra: string }> = {
  ok: {
    icon: faCheck,
    badge: "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/40",
    panel: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/70 text-green-800 dark:text-green-300",
    barra: "bg-green-500",
  },
  error: {
    icon: faTriangleExclamation,
    badge: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40",
    panel: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/70 text-red-800 dark:text-red-300",
    barra: "bg-red-500",
  },
  falta: {
    icon: faTriangleExclamation,
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40",
    panel: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/70 text-amber-800 dark:text-amber-300",
    barra: "bg-amber-500",
  },
  // Gris a propósito: no hay nada para configurar, solo elegir en un combo que ya está en pantalla.
  // En ámbar competía por atención con los faltantes reales.
  en_fila: {
    icon: faPenToSquare,
    badge: "bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700",
    panel: "bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200",
    barra: "bg-blue-500",
  },
};

/**
 * El badge de la columna ARCA. Vive junto al detalle que abre para que el texto y el color de los dos
 * salgan del mismo lugar: la grilla lo muestra en dos vistas distintas y antes cada una repetía el
 * ternario.
 */
export const BadgeArca: React.FC<{ result: AfipRowResult; onClick: () => void; prefijo?: string }> = ({ result, onClick, prefijo }) => {
  const { tono, texto } = resumenArca(result);
  const t = TONO[tono];
  return (
    <button type="button" onClick={onClick} title="Ver el detalle de los datos ARCA de este contrato" className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border whitespace-nowrap transition-colors ${t.badge}`}>
      <FontAwesomeIcon icon={t.icon} className="h-2.5 w-2.5" />
      {prefijo}
      {texto}
    </button>
  );
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

/**
 * Un origen con algo pendiente.
 *
 * `paso` numera la tarea cuando es configuración de ARCA: el operador tiene que hacer N cosas y verlas
 * numeradas dice cuántas son sin leer. Los grupos "en la fila" no se numeran —no son tareas de esta
 * pantalla— y van con borde punteado para que se lean como otra categoría de cosa.
 */
const Grupo: React.FC<{ g: GrupoFaltante; paso?: number; onNavegar?: () => void }> = ({ g, paso, onNavegar }) => {
  const bloqueado = !!g.bloqueadoPor;
  const borde = bloqueado ? "border-gray-200 dark:border-gray-700" : g.enFila ? "border-dashed border-gray-300 dark:border-gray-600" : g.tieneErrores ? "border-red-300 dark:border-red-800/70" : "border-amber-300 dark:border-amber-800/70";
  const fondo = bloqueado || g.enFila ? "bg-gray-50 dark:bg-gray-800/40" : g.tieneErrores ? "bg-red-50/70 dark:bg-red-950/20" : "bg-amber-50/70 dark:bg-amber-950/20";
  return (
    <div className={`rounded-lg border ${borde} overflow-hidden ${bloqueado ? "opacity-70" : ""}`}>
      <div className={`px-3 py-2 ${fondo}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex items-start gap-2">
            {paso !== undefined && <span className="shrink-0 mt-0.5 inline-flex items-center justify-center h-4 w-4 rounded-full bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 text-[10px] font-bold">{paso}</span>}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                {bloqueado && <FontAwesomeIcon icon={faLock} className="h-3 w-3 text-gray-400" />}
                {g.titulo}
              </p>
              <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">{bloqueado ? "Se destraba solo al resolver lo de arriba." : g.accion}</p>
            </div>
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
      {/*
       * Un grupo "en la fila" no lista los campos EN ESPERA: decir "la actividad espera a la
       * sucursal" al lado de "elegí la sucursal" es la misma frase dos veces. Los que faltan o están
       * mal sí se listan: traen el detalle concreto ("esta sucursal tiene 3 actividades declaradas").
       */}
      {(() => {
        const visibles = g.enFila ? g.checks.filter((c) => c.estado !== "bloqueado") : g.checks;
        if (visibles.length === 0) return null;
        return (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/60 bg-white dark:bg-gray-900/30">
            {visibles.map((c) => (
              <FilaCheck key={c.key} c={c} />
            ))}
          </ul>
        );
      })()}
    </div>
  );
};

/** Título de sección: separa las tres categorías de pendiente sin gastar una tarjeta en cada una. */
const Seccion: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <div className="space-y-2">
    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-0.5">{titulo}</p>
    {children}
  </div>
);

/**
 * Estado en una línea, con barra de avance.
 *
 * La barra cuenta CAMPOS del registro (es la medida de cuán lejos está el contrato); el título cuenta
 * CONFIGURACIONES (es la medida de cuánto trabajo falta). Son dos números distintos a propósito: un
 * tipo de contrato sin códigos es 1 sola cosa que cargar y mueve 3 campos.
 */
const Cabecera: React.FC<{ result: AfipRowResult; resueltos: number }> = ({ result, resueltos }) => {
  const { tono } = resumenArca(result);
  const t = TONO[tono];
  const total = result.checks.length;
  const pct = total ? Math.round((resueltos / total) * 100) : 0;
  const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

  const titulo = result.completo
    ? "Listo para la carga masiva"
    : result.errores > 0
      ? plural(result.errores, "dato cargado mal", "datos cargados mal")
      : result.configuracionesPendientes > 0
        ? plural(result.configuracionesPendientes, "configuración de ARCA pendiente", "configuraciones de ARCA pendientes")
        : "Solo falta elegirlo en la grilla";

  const chips: Array<{ texto: string; clase: string }> = [];
  if (!result.completo && result.errores > 0 && result.configuracionesPendientes > 0) chips.push({ texto: plural(result.configuracionesPendientes, "configuración pendiente", "configuraciones pendientes"), clase: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" });
  if (result.pendientesEnFila > 0) chips.push({ texto: `${plural(result.pendientesEnFila, "dato", "datos")} a elegir en la fila`, clase: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200" });
  if (result.avisos > 0) chips.push({ texto: plural(result.avisos, "aviso", "avisos"), clase: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" });

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${t.panel}`}>
      <div className="flex items-start gap-2">
        <FontAwesomeIcon icon={t.icon} className="mt-1 shrink-0 h-3.5 w-3.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{titulo}</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
              <div className={`h-full rounded-full ${t.barra} transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] font-semibold tabular-nums shrink-0 opacity-80">
              {resueltos}/{total} campos
            </span>
          </div>
          {chips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <span key={c.texto} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${c.clase}`}>
                  {c.texto}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
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

export const DatosArcaDetalle: React.FC<{
  row: ContractOverviewRow;
  result: AfipRowResult;
  cat: AfipCatalogs;
  onNavegar?: () => void;
  /** Se llama al fijar o quitar la obra social del contrato, para refrescar la fila sin recargar. */
  onGuardado?: (patch?: Partial<ContractOverviewRow>) => void;
}> = ({ row, result, cat, onNavegar, onGuardado }) => {
  const { campos, valores } = useMemo(() => describirRegistro(row, cat), [row, cat]);
  const resueltos = result.checks.filter((c) => c.estado === "ok").length;
  const avisos = result.checks.filter((c) => c.estado === "aviso");

  // Los tres bloques de pendientes. `configuracion` son los únicos que cuentan como "Faltan N".
  const configuracion = result.grupos.filter((g) => !g.bloqueadoPor && !g.enFila);
  const enFila = result.grupos.filter((g) => !g.bloqueadoPor && g.enFila);
  const enEspera = result.grupos.filter((g) => !!g.bloqueadoPor);

  // El origen de la obra social ya viene redactado en el label del check; acá solo se le saca el
  // prefijo del campo, que en la tarjeta lo dice el título.
  const origenObraSocial = result.checks.find((c) => c.key === "rnos")?.label.replace(/^Código RNOS\s*—\s*/, "") || "";

  return (
    <div className="space-y-4">
      <Cabecera result={result} resueltos={resueltos} />

      {configuracion.length > 0 && (
        <Seccion titulo="Para cargar en ARCA">
          {configuracion.map((g, i) => (
            <Grupo key={g.origen} g={g} paso={i + 1} onNavegar={onNavegar} />
          ))}
        </Seccion>
      )}

      {/*
       * La obra social tiene su propia tarjeta, siempre visible.
       *
       * Es el único dato del checklist que se CARGA acá y no en otra pantalla: los demás se arreglan
       * en la ficha de la empresa, en el tipo de contrato o en la categoría. Y es el único que hay que
       * ir a buscar afuera —al padrón de la SSS—, así que necesita las instrucciones al lado.
       */}
      {onGuardado && <ObraSocialDelContrato row={row} valores={valores} etiquetaOrigen={origenObraSocial} onGuardado={onGuardado} />}

      {/* Los avisos van VISIBLES aunque el contrato esté completo: no bloquean el alta, pero si
          quedaran colapsados con los campos resueltos nadie se enteraría de que hay una obra social
          sin constatar, que es justo lo que hay que ir limpiando. */}
      {avisos.length > 0 && (
        <ul className="rounded-lg border border-amber-300 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/20 divide-y divide-amber-200/60 dark:divide-amber-800/40">
          {avisos.map((c) => (
            <FilaCheck key={c.key} c={c} />
          ))}
        </ul>
      )}

      {/*
       * Lo que se elige en la grilla va DESPUÉS de la configuración y atenuado. No es una tarea de
       * esta pantalla: el combo está a dos columnas de acá, en ámbar, pidiendo lo mismo. Se muestra
       * igual porque frena el TXT y hay que saber por qué.
       */}
      {enFila.length > 0 && (
        <Seccion titulo="Se elige en la fila, no acá">
          {enFila.map((g) => (
            <Grupo key={g.origen} g={g} onNavegar={onNavegar} />
          ))}
        </Seccion>
      )}

      {/* En espera: se destraba solo. Colapsado, porque ocupaba media pantalla para no pedir nada. */}
      {enEspera.length > 0 && (
        <details className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <summary className="px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40 flex items-center gap-2">
            <FontAwesomeIcon icon={faLock} className="h-3 w-3 text-gray-400" />
            En espera ({enEspera.length}) — se resuelven solos al completar lo de arriba
          </summary>
          <div className="border-t border-gray-200 dark:border-gray-700 p-2 space-y-2">
            {enEspera.map((g) => (
              <Grupo key={g.origen} g={g} onNavegar={onNavegar} />
            ))}
          </div>
        </details>
      )}

      {/* Los campos ya resueltos van al final y colapsados: lo que importa es lo que falta. */}
      <details className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <summary className="px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40 flex items-center gap-2">
          <FontAwesomeIcon icon={faCheck} className="h-3 w-3 text-green-500" />
          Campos resueltos ({resueltos})
        </summary>
        <ul className="divide-y divide-gray-100 dark:divide-gray-700/60 border-t border-gray-200 dark:border-gray-700">
          {result.checks
            .filter((c) => c.estado === "ok")
            .map((c) => (
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
