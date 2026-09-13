import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalculator, faPen, faRotateLeft, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { diasCorridos, ErroresJornadas, MOTIVOS_AJUSTE_JORNADAS, NOTA_MINIMA_OTRO } from "../../../../utils/jornadas";

/**
 * LA CANTIDAD DE JORNADAS DE LA SOLICITUD. La regla vive en `utils/jornadas.ts`; esto la muestra.
 *
 *   Días fijos, sin ajuste   el número calculado, de sólo lectura. No parece un input a propósito:
 *                            no se escribe, se deduce.
 *   Días fijos, con ajuste   el input habilitado, la diferencia contra el calendario siempre a la vista
 *                            y el motivo, obligatorio mientras haya diferencia.
 *   Días rotativos           el input es la fuente de verdad, con tope en los días del período.
 */

interface Props {
  desde: string;
  hasta: string;
  rotativos: boolean;
  calculadas: number | null;
  valor: string;
  onValor: (v: string) => void;
  ajustado: boolean;
  motivo: string;
  nota: string;
  onEditarManual: () => void;
  onCancelarAjuste: () => void;
  onMotivo: (m: string) => void;
  onNota: (n: string) => void;
  errores: ErroresJornadas;
  /** Los errores de campo se muestran recién al intentar enviar; la diferencia, siempre. */
  mostrarErrores: boolean;
  /** Algo que pasó sin que la persona lo pidiera (se descartó un ajuste), dicho una vez. */
  aviso?: string;
}

const etiqueta = "text-xs font-bold text-slate-500 uppercase tracking-wider";
const input = "w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium";
const error = "text-[11px] font-medium text-red-600 dark:text-red-400";

export function JornadasSolicitud({ desde, hasta, rotativos, calculadas, valor, onValor, ajustado, motivo, nota, onEditarManual, onCancelarAjuste, onMotivo, onNota, errores, mostrarErrores, aviso }: Props) {
  const corridos = diasCorridos(desde, hasta);
  const cargado = Number(valor);
  const diferencia = calculadas !== null && valor !== "" ? cargado - calculadas : 0;
  const hayDiferencia = !rotativos && ajustado && diferencia !== 0;
  const errorJornadas = mostrarErrores ? errores.jornadas : undefined;

  return (
    <div id="bloque-jornadas" className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className={etiqueta}>Cantidad de jornadas</label>
        {!rotativos &&
          (ajustado ? (
            <button type="button" onClick={onCancelarAjuste} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
              <FontAwesomeIcon icon={faRotateLeft} className="h-3 w-3" /> Volver al calculado
            </button>
          ) : (
            <button type="button" onClick={onEditarManual} disabled={calculadas === null} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-blue-400">
              <FontAwesomeIcon icon={faPen} className="h-3 w-3" /> Editar manualmente
            </button>
          ))}
      </div>

      {aviso && <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">{aviso}</p>}

      {rotativos ? (
        /* ROTATIVOS: se carga a mano, con tope en los días corridos del período. */
        <>
          <input
            type="number"
            name="workdaysCount"
            min={1}
            max={corridos ?? undefined}
            step={1}
            value={valor}
            disabled={corridos === null}
            onChange={(e) => onValor(e.target.value === "" ? "" : String(Math.max(0, Math.trunc(Number(e.target.value)) || 0)))}
            className={`${input} ${errorJornadas ? "border-red-400 dark:border-red-700" : ""} disabled:cursor-not-allowed disabled:opacity-50`}
            placeholder={corridos === null ? "—" : `Entre 1 y ${corridos}`}
            aria-invalid={!!errorJornadas}
          />
          {errorJornadas ? <p className={error}>{errorJornadas}</p> : <p className="text-[11px] text-slate-400">{corridos === null ? "Cargá las fechas del período para poder cargar las jornadas." : `Con días rotativos se cargan a mano: entre 1 y ${corridos} (los días del período).`}</p>}
        </>
      ) : ajustado ? (
        /* FIJOS CON AJUSTE: editable, con la diferencia a la vista. */
        <>
          <input
            type="number"
            name="workdaysCount"
            min={1}
            step={1}
            value={valor}
            onChange={(e) => onValor(e.target.value === "" ? "" : String(Math.max(0, Math.trunc(Number(e.target.value)) || 0)))}
            className={`${input} ${errorJornadas ? "border-red-400 dark:border-red-700" : ""}`}
            aria-invalid={!!errorJornadas}
            autoFocus
          />
          {errorJornadas && <p className={error}>{errorJornadas}</p>}
        </>
      ) : (
        /* FIJOS: calculado, de sólo lectura, con otro aspecto que un input. */
        <>
          <div className={`flex items-center gap-3 rounded-xl border border-dashed px-4 py-3 ${errorJornadas ? "border-red-400 dark:border-red-700" : "border-slate-300 dark:border-slate-600"}`} aria-readonly="true">
            <FontAwesomeIcon icon={faCalculator} className="h-4 w-4 text-slate-400" />
            <span className="text-lg font-bold text-slate-900 dark:text-slate-100">{calculadas === null ? "—" : calculadas}</span>
            <input type="hidden" name="workdaysCount" value={valor} readOnly />
          </div>
          {errorJornadas ? <p className={error}>{errorJornadas}</p> : <p className="text-[11px] text-slate-400">{calculadas === null ? "Se calcula cuando haya fechas y días marcados." : "Calculado según fechas y días marcados."}</p>}
        </>
      )}

      {/* LA DIFERENCIA Y EL MOTIVO: persistentes mientras lo cargado no coincida con el calendario. */}
      {hayDiferencia && calculadas !== null && (
        <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
            <FontAwesomeIcon icon={faTriangleExclamation} />
            Calculado: {calculadas} · Cargado: {cargado} · Diferencia: {diferencia > 0 ? "+" : "−"}
            {Math.abs(diferencia)} jornada{Math.abs(diferencia) === 1 ? "" : "s"}
          </p>

          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Motivo del ajuste*</label>
            <select value={motivo} onChange={(e) => onMotivo(e.target.value)} className={`${input} ${mostrarErrores && errores.motivo ? "border-red-400 dark:border-red-700" : ""}`} aria-invalid={mostrarErrores && !!errores.motivo}>
              <option value="">Elegí un motivo</option>
              {MOTIVOS_AJUSTE_JORNADAS.map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.label}
                </option>
              ))}
            </select>
            {mostrarErrores && errores.motivo && <p className={error}>{errores.motivo}</p>}
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{motivo === "otro" ? "Contá el motivo*" : "Aclaración (opcional)"}</label>
            <textarea
              value={nota}
              onChange={(e) => onNota(e.target.value)}
              rows={2}
              className={`${input} resize-none ${mostrarErrores && errores.nota ? "border-red-400 dark:border-red-700" : ""}`}
              placeholder={motivo === "otro" ? `Al menos ${NOTA_MINIMA_OTRO} caracteres` : "Ej: se agregó el sábado 26 por extensión"}
              aria-invalid={mostrarErrores && !!errores.nota}
            />
            {mostrarErrores && errores.nota ? <p className={error}>{errores.nota}</p> : motivo === "otro" && <p className="text-[11px] text-slate-500">{nota.trim().length}/{NOTA_MINIMA_OTRO} caracteres mínimos.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
