import React, { useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faXmark, faTriangleExclamation, faLock, faCircleInfo, faChevronDown, faChevronRight, faPenToSquare, faLandmark } from "@fortawesome/free-solid-svg-icons";
import { ContractOverviewRow } from "../../api/users";
import { AfipCatalogs, AfipRowResult, AfipFieldCheck, TonoArca, resumenArca, esResuelto } from "./afipCompleteness";
import { describirRegistro, CampoRegistro } from "./afipTxt";
import { InfoModal } from "../ui/InfoModal";
import { EXPLICACIONES, ExplicacionCampo } from "./explicacionesArca";
import { BandaEmpleador } from "./BandaEmpleador";
import { FormularioArca } from "./FormularioArca";
import { Company } from "../../api/companies";
import { useResaltadoTramo } from "./useResaltadoTramo";

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
 *   2. Solo hay que elegirlo — empresa y sucursal/actividad. No es configuración: los selectores ya
 *      están en pantalla (la empresa en su columna de la grilla; la sucursal y la actividad, acá
 *      abajo en este mismo formulario). Van atenuados y NO entran en el "Faltan N".
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
/** `texto` es el color suelto del encabezado, que ya no tiene panel: sin fondo, el tono lo da la tipografía. */
const TONO: Record<TonoArca, { icon: typeof faCheck; badge: string; panel: string; barra: string; texto: string }> = {
  ok: {
    icon: faCheck,
    badge: "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/40",
    panel: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/70 text-green-800 dark:text-green-300",
    barra: "bg-green-500",
    texto: "text-green-700 dark:text-green-400",
  },
  error: {
    icon: faTriangleExclamation,
    badge: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40",
    panel: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/70 text-red-800 dark:text-red-300",
    barra: "bg-red-500",
    texto: "text-red-700 dark:text-red-400",
  },
  falta: {
    icon: faTriangleExclamation,
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40",
    panel: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/70 text-amber-800 dark:text-amber-300",
    barra: "bg-amber-500",
    texto: "text-amber-700 dark:text-amber-400",
  },
  // Gris a propósito: no hay nada para configurar, solo elegir en un combo que ya está en pantalla.
  // En ámbar competía por atención con los faltantes reales.
  en_fila: {
    icon: faPenToSquare,
    badge: "bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700",
    panel: "bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200",
    barra: "bg-blue-500",
    texto: "text-gray-700 dark:text-gray-200",
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
  // El ícono del ORGANISMO, el mismo con el que ARCA se identifica en el menú: la columna se llama
  // "Datos ARCA" y esto es lo que la representa. Era una tuerca —que decía "configuración"— y ese es
  // otro concepto: acá no se configura nada, se completan los datos de un trámite.
  //
  // Y no una alerta: el badge ABRE el formulario, no reporta un problema. El color ya dice la
  // gravedad (rojo si hay algo mal cargado, ámbar si falta). En el encabezado del detalle sí va la
  // alerta, porque ahí no hay nada que clickear: es un estado.
  const icono = result.completo ? t.icon : faLandmark;
  return (
    <button type="button" onClick={onClick} title="Ver el detalle de los datos ARCA de este contrato" className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border whitespace-nowrap transition-colors ${t.badge}`}>
      <FontAwesomeIcon icon={icono} className="h-2.5 w-2.5" />
      {prefijo}
      {texto}
    </button>
  );
};

/** Colores del recuadro de "qué pasa acá", por estado del campo. */
const CAJA_SITUACION: Record<string, string> = {
  falta: "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800/70 text-amber-800 dark:text-amber-300",
  error: "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800/70 text-red-800 dark:text-red-300",
  bloqueado: "bg-gray-50 dark:bg-gray-800/60 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300",
  aviso: "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800/70 text-amber-800 dark:text-amber-300",
  ok: "bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-800/70 text-green-800 dark:text-green-300",
};

/**
 * Ícono de ayuda de un campo. Abre el InfoModal con DOS cosas:
 *
 *   1. Qué pasa con este contrato puntual (`situacion`) — lo que antes iba como segunda línea de
 *      cada fila del checklist.
 *   2. Qué es el campo, de dónde sale y por qué frena el TXT (la explicación fija).
 *
 * Todo eso vive acá y no en el cuerpo del checklist a propósito: con trece campos, dos renglones por
 * cada uno convierten el modal en un documento y tapan lo único que se viene a mirar, que es qué
 * falta. La lista queda en un renglón por campo; el porqué está a un click.
 */
export const InfoCampo: React.FC<{ campo: string; situacion?: string; estado?: string; zIndex?: number }> = ({ campo, situacion, estado, zIndex = 90 }) => {
  const [abierto, setAbierto] = useState(false);
  const exp: ExplicacionCampo | undefined = EXPLICACIONES[campo];
  // Sin explicación fija pero con situación, el ícono se muestra igual: el texto de la fila se movió
  // acá adentro, así que si el campo no estuviera en el diccionario desaparecería sin dejar rastro.
  if (!exp && !situacion) return null;
  const titulo = exp?.titulo || "Qué pasa con este campo";
  const subtitulo = exp ? [exp.posicion ? `Posiciones ${exp.posicion} del registro` : "No es un campo del archivo", exp.origen].filter(Boolean).join(" · ") : undefined;
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAbierto(true);
        }}
        title={`Qué es "${titulo}"`}
        aria-label={`Qué es "${titulo}"`}
        className="shrink-0 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
      >
        <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
      </button>
      {abierto && (
        <InfoModal
          isOpen={abierto}
          onClose={() => setAbierto(false)}
          title={titulo}
          subtitle={subtitulo}
          size="md"
          zIndex={zIndex}
        >
          <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {/* Primero lo de ESTE contrato: es la razón por la que se abrió el ícono. */}
            {situacion && <div className={`rounded-lg border px-3 py-2 text-[13px] ${CAJA_SITUACION[estado || "falta"] || CAJA_SITUACION.falta}`}>{situacion}</div>}
            {exp?.cuerpo}
          </div>
        </InfoModal>
      )}
    </>
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
            <span className="flex items-center gap-1.5">
              <span>{c.label}</span>
              <InfoCampo campo={c.key} situacion={c.detalle} estado={c.estado} />
            </span>
          </span>
        </span>
        <span className="shrink-0 text-right">
          {c.estado === "ok" && <span className="text-sm font-mono text-gray-600 dark:text-gray-300">{c.value || "—"}</span>}
          {/* La obra social no "falta" como un campo que alguien olvidó tipear: es un trámite que
              todavía no se hizo, y el remedio es validar, no cargar. Decirle Falta la iguala a
              Modalidad o Tipo de Servicio, que se resuelven en un click del formulario. */}
          {c.estado === "falta" && <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">{c.key === "rnos" ? "Sin validar" : "Falta"}</span>}
          {c.estado === "error" && <span className="text-[11px] font-semibold text-red-600 dark:text-red-400">Mal cargado</span>}
          {c.estado === "bloqueado" && <span className="text-[11px] font-semibold text-gray-500">En espera</span>}
          {/* "Sin constatar" solo para el aviso que HABLA de constatar. Puesto en todos los avisos,
              etiquetaba "Obra social sin verificar contra ARCA" como "Sin constatar" y esa fila se
              leía como un duplicado del estado que ya muestra la tarjeta de obra social. */}
          {c.estado === "aviso" && <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">{c.key === "rnosSinConstatar" ? "Sin constatar" : "Aviso"}</span>}
        </span>
      </div>
    </li>
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
                    <tr key={`${c.desde}-${c.hasta}`} data-tramo={c.hasta !== c.desde ? `${c.desde}-${c.hasta}` : String(c.desde)} className={falta ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}>
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

/**
 * Avance del alta: barra + fracción + el desglose detrás del ⓘ.
 *
 * Vive en el PIE del modal, al lado del botón de descargar, y no arriba. Dos razones:
 *
 *  - Arriba se comía dos renglones de una pantalla que ya scrollea, empujando el formulario —que es
 *    lo que se viene a completar— fuera de la vista.
 *  - Al lado del botón está donde importa: la barra dice cuánto falta para que ese botón se
 *    habilite, y el pie es lo único que queda fijo mientras se scrollea la grilla de campos.
 *
 * El desglose no es decorativo: sus renglones más los resueltos SIEMPRE suman el total, así el 14 se
 * puede reconstruir y se entiende por qué faltando "3 por cargar" el avance no está al 80%.
 */
/**
 * Los chequeos que se completan EN EL FORMULARIO de Datos ARCA. Son los que mide la barra.
 *
 * Los otros nueve de `result.checks` se resuelven en otro lado y por eso no entran acá:
 *
 *   modalidadContrato · tipoServicio · modalidadLiq     en el TIPO DE CONTRATO (Zona 2, solo lectura)
 *   empresa · cuil · categoriaProf · convenioCategoria  en las bandas de arriba del modal
 *   rnos · obraSocialRegistrada                         idem, con su propio trámite
 *
 * Escrito a mano y no derivado del JSX a propósito: así, agregar un campo al formulario obliga a
 * decidir si entra en la cuenta, en vez de moverla sin que nadie lo note.
 */
const CLAVES_FORMULARIO = new Set(["sucursal", "actividad", "fechaInicio", "fechaFin", "retribucion"]);
/** Los que viven en el tipo de contrato. Se nombran en el segundo renglón del pie. */
const CLAVES_DEL_TIPO = new Set(["modalidadContrato", "tipoServicio", "modalidadLiq"]);

export const ProgresoArca: React.FC<{ result: AfipRowResult }> = ({ result }) => {
  // Misma regla que el badge de la grilla: un aviso no es un faltante (ver `esResuelto`).
  const [verDesglose, setVerDesglose] = useState(false);
  const { tono } = resumenArca(result);
  const t = TONO[tono];

  /*
    LA BARRA MIDE LOS CINCO DEL FORMULARIO. Lo demás se dice, no se esconde.

    El «13/13 campos» de antes contaba `result.checks`, que no son los campos de esta pantalla: son
    catorce chequeos repartidos entre este formulario, el tipo de contrato y las bandas de arriba. Que
    diera trece era casualidad — los cuatro valores fijos y el filtro de grupo nunca estuvieron en esa
    cuenta—, y medir sobre catorce hacía que la barra no correspondiera con lo que uno completa.

    EL DENOMINADOR ES DINÁMICO. Con una modalidad por tiempo indeterminado la fecha de fin no
    corresponde y sale de la cuenta (`noAplica`): ahí el formulario tiene cuatro campos, no cinco con
    uno regalado.

    Pero medir SOLO estos cinco y callar el resto sería peor: entre los que quedan afuera están el
    CUIL con dígito verificador inválido, la categoría de un convenio que la empleadora no registró y
    los códigos sin cargar en el tipo — lo que el desglose llama «mal cargados», que hoy pasan
    desapercibidos. Y como el botón de descargar sigue atado a los catorce, esconderlos daría la
    combinación peor: barra al 100%, «Listo para la carga masiva», y el botón gris sin explicación.

    Por eso el verde sigue saliendo de `result.completo` —que exige estos cinco, los tres del tipo y
    todo lo demás— y el segundo renglón nombra lo que falta y dónde.
  */
  const resueltosTodos = result.checks.filter(esResuelto).length;
  const delForm = result.checks.filter((c) => CLAVES_FORMULARIO.has(c.key) && !c.noAplica);
  const resueltos = delForm.filter(esResuelto).length;
  const total = delForm.length;
  const pct = total ? Math.round((resueltos / total) * 100) : 0;
  /** Cuántos códigos del tipo de contrato faltan. Se arreglan en `/contratos`, no acá. */
  const faltanDelTipo = result.checks.filter((c) => CLAVES_DEL_TIPO.has(c.key) && !esResuelto(c)).length;
  /** Lo pendiente de las bandas de arriba: empleadora, convenio, categoría, obra social, CUIL. */
  const faltanArriba = result.checks.filter((c) => !CLAVES_FORMULARIO.has(c.key) && !CLAVES_DEL_TIPO.has(c.key) && !esResuelto(c)).length;

  const titulo = result.completo ? "Listo para la carga masiva" : result.errores > 0 ? "Hay datos cargados mal" : result.configuracionesPendientes > 0 ? "Faltan datos para el alta" : "Solo falta elegirlo";

  // Se cuenta sobre `checks` —no sobre los grupos— para que la suma cierre: resueltos + chips = total.
  const clavesEnFila = new Set(result.grupos.filter((g) => g.enFila).flatMap((g) => g.checks.map((c) => c.key)));
  const cuenta = { porCargar: 0, malCargados: 0, aElegir: 0, enEspera: 0, avisos: 0 };
  for (const c of result.checks) {
    if (c.estado === "ok") continue;
    if (c.estado === "aviso") cuenta.avisos++;
    else if (c.estado === "bloqueado") cuenta.enEspera++;
    else if (clavesEnFila.has(c.key)) cuenta.aElegir++;
    else if (c.estado === "error") cuenta.malCargados++;
    else cuenta.porCargar++;
  }

  // Cada renglón del desglose, con qué significa. Los chips sueltos daban el número pero no el
  // sentido: "4 en espera" no dice que esos se resuelven solos, que es lo único que hace falta saber
  // para no salir a buscarlos.
  // Singular y plural explícitos: "por cargar", "a elegir" y "en espera" son invariables, así que
  // pegarles una "s" al final daba "3 por cargars".
  const desglose: Array<{ n: number; uno: string; varios: string; que: string; punto: string }> = [
    { n: cuenta.malCargados, uno: "mal cargado", varios: "mal cargados", que: "El dato está, pero es inconsistente y ARCA lo va a rechazar. Es lo más grave: hoy pasa desapercibido.", punto: "bg-red-500" },
    { n: cuenta.porCargar, uno: "por cargar", varios: "por cargar", que: "Falta el dato. Se carga en este mismo formulario.", punto: "bg-amber-500" },
    { n: cuenta.aElegir, uno: "a elegir", varios: "a elegir", que: "La opción ya está en pantalla, solo falta elegirla.", punto: "bg-blue-500" },
    { n: cuenta.enEspera, uno: "en espera", varios: "en espera", que: "No se puede resolver todavía porque depende de otro campo. Se destraba solo al completarlo.", punto: "bg-gray-400" },
    { n: cuenta.avisos, uno: "aviso", varios: "avisos", que: "No bloquea el alta: el archivo se genera igual. Conviene revisarlo.", punto: "bg-amber-500" },
  ].filter((d) => d.n > 0);

  return (
    <div className="min-w-0 flex-1 flex items-center gap-2.5">
      <FontAwesomeIcon icon={t.icon} className={`shrink-0 h-3.5 w-3.5 ${t.texto}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-[12px] font-bold flex items-center gap-1.5 ${t.texto}`}>
          <span className="truncate">{titulo}</span>
          {desglose.length > 0 && (
            <button type="button" onClick={() => setVerDesglose(true)} title="Qué son los campos que faltan" aria-label="Qué son los campos que faltan" className="shrink-0 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors">
              <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
            </button>
          )}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-1.5 flex-1 min-w-[6rem] max-w-[16rem] rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div className={`h-full rounded-full ${t.barra} transition-all`} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[11px] font-semibold tabular-nums shrink-0 text-gray-500 dark:text-gray-400">
            {resueltos} de {total} completos
          </span>
        </div>

        {/* El segundo renglón: lo que la barra NO mide. Primero lo que falta y dónde se arregla,
            después lo que no hay que tocar, que es la parte que tranquiliza. */}
        <p className="mt-0.5 text-[10.5px] text-gray-500 dark:text-gray-400 truncate">
          {faltanArriba > 0 && <span className="text-amber-600 dark:text-amber-400 font-semibold">{faltanArriba === 1 ? "1 dato sin resolver más arriba" : `${faltanArriba} datos sin resolver más arriba`} · </span>}
          <span className={faltanDelTipo > 0 ? "text-amber-600 dark:text-amber-400 font-semibold" : undefined}>
            {faltanDelTipo > 0 ? `${faltanDelTipo} de 3 sin cargar en el tipo de contrato` : "3 del tipo de contrato"}
          </span>
          {" · 4 valores fijos"}
        </p>
      </div>

      {verDesglose && (
        <InfoModal isOpen={verDesglose} onClose={() => setVerDesglose(false)} title={`${resueltosTodos} de ${result.checks.length} chequeos resueltos`} subtitle="En qué estado están los que faltan" size="md" zIndex={90}>
          <div className="space-y-3">
            <ul className="space-y-2.5">
              {desglose.map((d) => (
                <li key={d.uno} className="flex items-start gap-2.5">
                  <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${d.punto}`} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">
                      {d.n} {d.n === 1 ? d.uno : d.varios}
                    </span>
                    <span className="block text-[12px] text-gray-600 dark:text-gray-400 leading-relaxed">{d.que}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-2.5">
              Estos {result.checks.length - resueltosTodos} más los {resueltosTodos} resueltos son los {result.checks.length} chequeos del alta: los del formulario, los tres del tipo de contrato y los de las bandas de arriba. El archivo se genera cuando no queda ninguno por cargar, mal cargado ni a elegir — los avisos no lo frenan.
            </p>
          </div>
        </InfoModal>
      )}
    </div>
  );
};

export const DatosArcaDetalle: React.FC<{
  row: ContractOverviewRow;
  result: AfipRowResult;
  cat: AfipCatalogs;
  /** Empresas del ABM, para la banda de empleador (razón social + CUIT). */
  empresas?: Company[];
  /** Algo del TIPO DE CONTRATO cambió: no vive en la fila, hay que recargar el listado. */
  onCambioNivel?: () => void;
  /**
   * Abre la pantalla de validación de obras sociales con esta persona sola.
   *
   * Viaja desde la grilla, que es la única que sabe abrir el modal. Sin esto, `CampoObraSocial`
   * despliega su propio panel adentro del formulario y desplaza el resto de los campos.
   */
  onValidarObraSocial?: () => void;
  /** Se llama al fijar o quitar la obra social del contrato, para refrescar la fila sin recargar. */
  onGuardado?: (patch?: Partial<ContractOverviewRow>) => void;
}> = ({ row, result, cat, onGuardado, empresas = [], onCambioNivel, onValidarObraSocial }) => {
  const { campos, valores } = useMemo(() => describirRegistro(row, cat), [row, cat]);
  const avisos = result.checks.filter((c) => c.estado === "aviso");

  /*
    Envuelve al FORMULARIO Y A LA VISTA PREVIA, que son hermanos.

    El resaltado va de un campo (su badge «58–72») a su renglón en la tabla del archivo, así que el
    contenedor que escucha tiene que contener a los dos. Puesto adentro del formulario no llegaría
    a la tabla.
  */
  const detalleRef = useRef<HTMLDivElement>(null);
  useResaltadoTramo(detalleRef);


  const empresaSel = cat.empresas?.find((e) => e._id === row.empresaContratoId);

  return (
    <div className="space-y-4" ref={detalleRef}>
      {/* La empleadora es el CONTEXTO de todo lo de abajo, no un campo más: define qué sucursales,
          qué convenios y qué obras sociales son elegibles. Por eso va como banda, igual que en ARCA. */}
      {onGuardado && <BandaEmpleador row={row} empresas={empresas} convenios={(empresaSel?.convenioIds || []).length} domicilios={(empresaSel?.sucursalIds || []).length} onGuardado={onGuardado} />}

      {/* El formulario con la forma de ARCA. Todo se resuelve acá adentro: ya no hay "Ir a ↗". */}
      {onGuardado && <FormularioArca row={row} valores={valores} cat={cat} onGuardado={onGuardado} onCambioNivel={onCambioNivel} onValidarObraSocial={onValidarObraSocial} />}

      {/* Los avisos van visibles aunque el contrato esté completo: no bloquean el alta, pero son lo
          que hay que ir limpiando. */}
      {avisos.length > 0 && (
        <ul className="rounded-lg border border-amber-300 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/20 divide-y divide-amber-200/60 dark:divide-amber-800/40">
          {avisos.map((c) => (
            <FilaCheck key={c.key} c={c} />
          ))}
        </ul>
      )}

      <VistaPrevia campos={campos} />

      {/* Acá había una nota al pie diciendo que puesto desempeñado y situación de revista van en
          blanco. Se fue con el plegable «Valores fijos» del formulario, que lo dice donde se pregunta
          —al lado de los campos— y no al final de todo lo que hay que scrollear. */}
    </div>
  );
};
