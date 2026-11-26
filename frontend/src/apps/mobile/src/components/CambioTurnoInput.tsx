import { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faTriangleExclamation, faCircleCheck, faCircle, faArrowRight, faLocationDot, faClock } from "@fortawesome/free-solid-svg-icons";
import { CustomDatePicker } from "./CustomDatePicker";
import { cambioTurnoAPI, type ContextoCambioTurno, type FilaParaPedir, type TurnoParaPedir } from "../../../../api/cambioTurno";
import type { ErrorCambioTurno, PedidoCambioTurno } from "@compartido/cambioDeTurno";
import { textoDeDias } from "../../../../utils/jerarquiaTurnos";

/**
 * EL FORMULARIO DEL PEDIDO «CAMBIO DE TURNO» (tipo de sistema, 26/11/2026).
 *
 * No calcula nada: el server dice en qué proyectos y áreas tiene turno hoy la persona, cuál es, a cuáles
 * puede pasar y desde qué fecha (`GET /orders/cambio-turno/contexto`). Acá sólo se elige: proyecto y área
 * (si hay más de uno), el turno nuevo, la fecha desde, si es temporal (y hasta cuándo) y el motivo.
 *
 * LOS ERRORES SE ANTICIPAN: cuando el pedido está completo se le pide al server la misma lista que daría
 * al enviar (`POST /orders/validate-cambio-turno`) y se muestra acá, antes del botón. Igual el envío
 * vuelve a validar: lo de acá es para no mandar a ciegas.
 *
 * Emite `dynamicValue` con la forma de `PedidoCambioTurno`; `fechaHasta` null = permanente.
 */
interface CambioTurnoInputProps {
  value: Partial<PedidoCambioTurno> | null | undefined;
  onChange: (value: Partial<PedidoCambioTurno>) => void;
}

const claveFila = (f: FilaParaPedir) => `${f.areaId}::${f.sedeId ?? ""}`;
const fechaCorta = (iso: string): string => {
  const [y, m, d] = String(iso || "").split("-");
  return y && m && d ? `${Number(d)}/${Number(m)}/${y}` : iso;
};

const Turno = ({ t }: { t: TurnoParaPedir }) => (
  <span className="flex flex-wrap items-baseline gap-x-2">
    <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{t.nombre}</span>
    {t.horario && <span className="text-[11px] text-slate-500 dark:text-slate-400">{t.horario}</span>}
    {t.dias?.length > 0 && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">{textoDeDias(t.dias)}</span>}
  </span>
);

export const CambioTurnoInput = ({ value, onChange }: CambioTurnoInputProps) => {
  const [contexto, setContexto] = useState<ContextoCambioTurno | null>(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [proyectoId, setProyectoId] = useState(String(value?.projectId || ""));
  const [fila, setFila] = useState("");
  const [shiftActualId, setShiftActualId] = useState(String(value?.shiftActualId || ""));
  const [shiftSolicitadoId, setShiftSolicitadoId] = useState(String(value?.shiftSolicitadoId || ""));
  const [fechaDesde, setFechaDesde] = useState(String(value?.fechaDesde || ""));
  const [temporal, setTemporal] = useState(!!value?.fechaHasta);
  const [fechaHasta, setFechaHasta] = useState(String(value?.fechaHasta || ""));
  const [motivo, setMotivo] = useState(String(value?.motivo || ""));
  const [validacion, setValidacion] = useState<{ estado: "nada" | "validando" | "ok" | "errores"; errores: ErrorCambioTurno[] }>({ estado: "nada", errores: [] });

  // `onChange` por ref: lo que emite este formulario no depende de la identidad del callback del padre.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let vigente = true;
    cambioTurnoAPI
      .contexto()
      .then((c) => {
        if (!vigente) return;
        setContexto(c);
        // Con un solo proyecto no hay nada que elegir.
        if (c.proyectos.length === 1) setProyectoId(c.proyectos[0].projectId);
      })
      .catch((e: any) => vigente && setErrorCarga(e?.response?.data?.error || "No se pudo cargar tu situación en los proyectos. Probá de nuevo en un momento."));
    return () => {
      vigente = false;
    };
  }, []);

  const proyecto = useMemo(() => contexto?.proyectos.find((p) => p.projectId === proyectoId) || null, [contexto, proyectoId]);
  const filaElegida = useMemo(() => proyecto?.filas.find((f) => claveFila(f) === fila) || null, [proyecto, fila]);

  // Al cambiar de proyecto: una sola fila se elige sola; si no, se vuelve a pedir.
  useEffect(() => {
    setFila(proyecto?.filas.length === 1 ? claveFila(proyecto.filas[0]) : "");
  }, [proyecto]);
  // Al cambiar de fila: el turno actual (uno solo, casi siempre) y se limpia el destino.
  useEffect(() => {
    setShiftActualId(filaElegida?.turnosActuales.length === 1 ? filaElegida.turnosActuales[0].id : "");
    setShiftSolicitadoId("");
  }, [filaElegida]);

  const pedido: Partial<PedidoCambioTurno> = useMemo(
    () => ({
      projectId: proyectoId,
      areaId: filaElegida?.areaId || "",
      sedeId: filaElegida?.sedeId ?? null,
      shiftActualId,
      shiftSolicitadoId,
      fechaDesde,
      fechaHasta: temporal && fechaHasta ? fechaHasta : null,
      motivo,
    }),
    [proyectoId, filaElegida, shiftActualId, shiftSolicitadoId, fechaDesde, temporal, fechaHasta, motivo],
  );
  useEffect(() => {
    onChangeRef.current(pedido);
  }, [pedido]);

  // Validar con el server cuando está completo, esperando a que la persona deje de tocar.
  const completo = !!(pedido.projectId && pedido.areaId && pedido.shiftActualId && pedido.shiftSolicitadoId && pedido.fechaDesde && String(pedido.motivo || "").trim());
  const pedidoJson = JSON.stringify(pedido);
  useEffect(() => {
    if (!completo) {
      setValidacion({ estado: "nada", errores: [] });
      return;
    }
    let vigente = true;
    const t = setTimeout(async () => {
      setValidacion((v) => ({ ...v, estado: "validando" }));
      try {
        const r = await cambioTurnoAPI.validar(JSON.parse(pedidoJson));
        if (vigente) setValidacion({ estado: r.ok ? "ok" : "errores", errores: r.errores });
      } catch {
        if (vigente) setValidacion({ estado: "nada", errores: [] });
      }
    }, 600);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [completo, pedidoJson]);

  if (errorCarga) return <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{errorCarga}</p>;
  if (!contexto)
    return (
      <p className="flex items-center gap-2 py-4 text-sm text-slate-500">
        <FontAwesomeIcon icon={faSpinner} className="animate-spin" /> Buscando tu turno…
      </p>
    );
  if (contexto.proyectos.length === 0)
    return <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">Hoy no tenés turno asignado en ningún proyecto, así que no hay de dónde cambiarte. Si creés que es un error, hablá con tu supervisor.</p>;

  const reglas = contexto.reglas;
  const campo = "w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white";
  const etiqueta = "mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400";

  return (
    <div className="space-y-4">
      {/* Proyecto */}
      <div>
        <label className={etiqueta}>Proyecto</label>
        {contexto.proyectos.length > 1 ? (
          <select value={proyectoId} onChange={(e) => setProyectoId(e.target.value)} className={campo}>
            <option value="">Elegí el proyecto</option>
            {contexto.proyectos.map((p) => (
              <option key={p.projectId} value={p.projectId}>
                {p.nombre}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{proyecto?.nombre}</p>
        )}
      </div>

      {/* Área (y sede) */}
      {proyecto && (
        <div>
          <label className={etiqueta}>Área</label>
          {proyecto.filas.length > 1 ? (
            <select value={fila} onChange={(e) => setFila(e.target.value)} className={campo}>
              <option value="">Elegí el área</option>
              {proyecto.filas.map((f) => (
                <option key={claveFila(f)} value={claveFila(f)}>
                  {f.areaNombre}
                  {f.sedeNombre ? ` · ${f.sedeNombre}` : ""}
                </option>
              ))}
            </select>
          ) : (
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-900 dark:text-slate-100">
              {filaElegida?.areaNombre}
              {filaElegida?.sedeNombre && (
                <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-orange-700 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-300">
                  <FontAwesomeIcon icon={faLocationDot} className="h-2.5 w-2.5" />
                  {filaElegida.sedeNombre}
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {/* Turno actual */}
      {filaElegida && (
        <div>
          <label className={etiqueta}>Tu turno actual</label>
          {filaElegida.turnosActuales.length > 1 ? (
            <select value={shiftActualId} onChange={(e) => setShiftActualId(e.target.value)} className={campo}>
              <option value="">¿Desde cuál te cambiás?</option>
              {filaElegida.turnosActuales.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                  {t.horario ? ` · ${t.horario}` : ""}
                </option>
              ))}
            </select>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">{filaElegida.turnosActuales[0] && <Turno t={filaElegida.turnosActuales[0]} />}</div>
          )}
        </div>
      )}

      {/* Turno nuevo */}
      {filaElegida && (
        <div>
          <label className={etiqueta}>
            Turno nuevo <FontAwesomeIcon icon={faArrowRight} className="mx-1 h-2.5 w-2.5" /> elegí uno
          </label>
          {filaElegida.turnosPosibles.length === 0 ? (
            <p className="text-sm italic text-slate-500 dark:text-slate-400">Esta área tiene un solo turno: no hay a dónde cambiarte.</p>
          ) : (
            <div className="space-y-2">
              {filaElegida.turnosPosibles.map((t) => {
                const activo = t.id === shiftSolicitadoId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setShiftSolicitadoId(t.id)}
                    aria-pressed={activo}
                    className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${activo ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20" : "border-slate-200 bg-white active:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:active:bg-slate-800"}`}
                  >
                    <FontAwesomeIcon icon={activo ? faCircleCheck : faCircle} className={`mt-0.5 h-4 w-4 shrink-0 ${activo ? "text-blue-600 dark:text-blue-400" : "text-slate-300 dark:text-slate-600"}`} />
                    <Turno t={t} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Fechas */}
      <div>
        <CustomDatePicker label="Desde" value={fechaDesde} onChange={setFechaDesde} minDate={contexto.fechaMinima} />
        <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
          <FontAwesomeIcon icon={faClock} className="h-2.5 w-2.5" />
          {reglas.diasAnticipacion > 0 ? `Se pide con ${reglas.diasAnticipacion} ${reglas.diasAnticipacion === 1 ? "día" : "días"} de anticipación: desde el ${fechaCorta(contexto.fechaMinima)}.` : "Puede ser desde hoy."}
        </p>
      </div>
      {reglas.permitirTemporal && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={temporal}
              onChange={(e) => {
                setTemporal(e.target.checked);
                if (!e.target.checked) setFechaHasta("");
              }}
              className="h-4 w-4"
            />
            Es por un tiempo: después vuelvo a mi turno
          </label>
          {temporal && <CustomDatePicker label="Hasta" value={fechaHasta} onChange={setFechaHasta} minDate={fechaDesde || contexto.fechaMinima} />}
        </div>
      )}

      {/* Motivo */}
      <div>
        <label className={etiqueta}>Motivo</label>
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={1000} placeholder="Contá por qué pedís el cambio" className={campo} />
      </div>

      {/* Lo que diría el server al enviar */}
      {validacion.estado === "validando" && (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <FontAwesomeIcon icon={faSpinner} className="animate-spin" /> Revisando el pedido…
        </p>
      )}
      {validacion.estado === "ok" && (
        <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
          <FontAwesomeIcon icon={faCircleCheck} /> Todo en orden: podés enviar el pedido.
        </p>
      )}
      {validacion.estado === "errores" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          <p className="mb-1 flex items-center gap-2 font-bold">
            <FontAwesomeIcon icon={faTriangleExclamation} /> Así no se puede enviar:
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            {validacion.errores.map((e) => (
              <li key={e.codigo}>{e.mensaje}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
