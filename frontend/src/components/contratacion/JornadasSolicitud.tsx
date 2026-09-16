import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalculator, faCircleInfo, faPen, faRotateLeft, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { diasCorridos, ErroresJornadas, MOTIVOS_AJUSTE_JORNADAS, NOTA_MINIMA_OTRO } from "../../utils/jornadas";
import { textoDeDias } from "../../utils/jerarquiaTurnos";

/**
 * LA CANTIDAD DE JORNADAS DEL CONTRATO. La usan la solicitud de la app y el alta del panel: es la misma
 * cuenta y la misma explicación, así que vive una sola vez. La regla vive en `utils/jornadas.ts`; esto la muestra.
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
  /** Los días de la semana marcados (0 = domingo). Sólo para explicar la cuenta en el info. */
  dias?: number[];
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

const NOMBRE_DIA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const aUtc = (fecha: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha || "");
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const ddmm = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** Las fechas que cuenta el calendario: la misma cuenta que `jornadasDelCalendario` (extremos inclusive). */
const fechasContadas = (desde: string, hasta: string, dias: number[]): Date[] => {
  const inicio = aUtc(desde);
  const total = diasCorridos(desde, hasta);
  if (inicio === null || total === null || dias.length === 0) return [];
  const marcados = new Set(dias);
  const fechas: Date[] = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(inicio + i * 86400000);
    if (marcados.has(d.getUTCDay())) fechas.push(d);
  }
  return fechas;
};

export function JornadasSolicitud({ desde, hasta, rotativos, calculadas, dias = [], valor, onValor, ajustado, motivo, nota, onEditarManual, onCancelarAjuste, onMotivo, onNota, errores, mostrarErrores, aviso }: Props) {
  const [verCuenta, setVerCuenta] = useState(false);
  const fechas = useMemo(() => (rotativos ? [] : fechasContadas(desde, hasta, dias)), [rotativos, desde, hasta, dias]);
  const corridos = diasCorridos(desde, hasta);
  const cargado = Number(valor);
  const diferencia = calculadas !== null && valor !== "" ? cargado - calculadas : 0;
  const hayDiferencia = !rotativos && ajustado && diferencia !== 0;
  const errorJornadas = mostrarErrores ? errores.jornadas : undefined;

  return (
    <div id="bloque-jornadas" className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <label className={etiqueta}>Cantidad de jornadas</label>
          <button type="button" onClick={() => setVerCuenta((v) => !v)} aria-expanded={verCuenta} title="¿De dónde sale este número?" aria-label="De dónde sale la cantidad de jornadas" className="text-slate-400 transition-colors hover:text-blue-500">
            <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
          </button>
        </div>
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

      {/*
        DE DÓNDE SALE EL NÚMERO, con los datos de ESTA solicitud: el período, los días marcados y las
        fechas que se contaron. Sin eso, un 9 donde se esperaba un 10 parece un error y no lo es (la
        semana arrancó un martes, o hay un feriado que no se descuenta).
      */}
      {verCuenta && (
        <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-slate-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-slate-300">
          {rotativos ? (
            <p>
              Con <b>días rotativos</b> no se puede calcular: los días que trabaja cambian de una semana a otra. Las jornadas se cargan a mano{corridos !== null ? `, entre 1 y ${corridos} (los días del período)` : ""}.
            </p>
          ) : calculadas === null ? (
            <p>
              Se cuentan los días entre <b>Desde</b> y <b>Hasta</b>, los dos inclusive, que caen en los <b>días que trabaja</b>. {corridos === null ? "Falta cargar las fechas." : "Falta marcar los días."}
            </p>
          ) : (
            <>
              <p>
                Del <b>{ddmm(new Date(aUtc(desde)!))}</b> al <b>{ddmm(new Date(aUtc(hasta)!))}</b> hay <b>{corridos}</b> días corridos, contando los dos. De esos, <b>{calculadas}</b> caen en los días que trabaja (<b>{textoDeDias(dias)}</b>): esas son las jornadas.
              </p>
              {fechas.length <= 31 ? (
                <div className="flex flex-wrap gap-1">
                  {fechas.map((d) => (
                    <span key={d.getTime()} className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {NOMBRE_DIA[d.getUTCDay()]} {ddmm(d)}
                    </span>
                  ))}
                </div>
              ) : (
                <ul className="space-y-0.5">
                  {Object.entries(
                    fechas.reduce<Record<string, number>>((acc, d) => {
                      const clave = `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
                      acc[clave] = (acc[clave] || 0) + 1;
                      return acc;
                    }, {}),
                  ).map(([mes, n]) => (
                    <li key={mes}>
                      <span className="capitalize">{mes}</span>: <b>{n}</b> jornada{n === 1 ? "" : "s"}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-slate-500 dark:text-slate-400">No descuenta feriados ni francos: si hay alguno en el período, usá «Editar manualmente» y elegí el motivo.</p>
              <p className="text-slate-500 dark:text-slate-400">«Días por semana» no entra en esta cuenta: se usa para el importe por semana y el mensual.</p>
              {ajustado && valor !== "" && <p className="font-semibold text-amber-700 dark:text-amber-400">Ahora hay {cargado} cargadas a mano; el calendario da {calculadas}.</p>}
            </>
          )}
        </div>
      )}

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
