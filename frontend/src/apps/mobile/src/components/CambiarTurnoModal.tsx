import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faCircle, faUserTie, faSpinner, faLocationDot } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "./Modal";
import type { AreaACargo, TurnoACargo } from "../views/MyTeams";

/**
 * CAMBIAR DE TURNO A UNA PERSONA (Equipos, 26/11/2026).
 *
 * Pedido: «tendría que poder cambiarlos de turno desde la plataforma mobile; una vez cambiados ya le
 * pertenecen a otro supervisor; esto sólo lo puede hacer el coordinador».
 *
 * Se elige entre LOS OTROS TURNOS DE LA MISMA ÁREA (misma fila: área + sede). Cada opción dice quién lo
 * supervisa —es lo que cambia para la persona— y cuántos hay hoy, para no mandar a alguien a un turno sin
 * supervisor sin darse cuenta. Cambiar de área sigue siendo de la Jerarquía del panel.
 *
 * Es una elección y un botón: nada se guarda hasta tocar «Cambiar a…». Quien lo monta decide qué hacer
 * después (recargar la lista, abrir el turno de destino).
 */
interface CambiarTurnoModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** El nombre de la persona que se mueve. */
  persona: string;
  area: AreaACargo;
  turnoActual: TurnoACargo;
  /** Cuántos suman y cuántos hay en un turno (por su clave), para mostrarlo en cada opción. */
  cuentaDe: (clave: string) => { suman: number; total: number };
  onConfirmar: (destino: TurnoACargo) => Promise<void>;
}

export default function CambiarTurnoModal({ isOpen, onClose, persona, area, turnoActual, cuentaDe, onConfirmar }: CambiarTurnoModalProps) {
  const [elegido, setElegido] = useState<string>("");
  const [guardando, setGuardando] = useState(false);
  const opciones = area.turnos.filter((t) => t.shiftId !== turnoActual.shiftId);
  const destino = opciones.find((t) => t.shiftId === elegido) || null;

  const confirmar = async () => {
    if (!destino || guardando) return;
    setGuardando(true);
    try {
      await onConfirmar(destino);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={guardando ? () => undefined : onClose}
      size="sm"
      title="Cambiar de turno"
      subtitle={
        <div className="text-sm text-gray-600 dark:text-gray-400">
          <p className="font-semibold text-gray-900 dark:text-white">{persona}</p>
          <p className="flex flex-wrap items-center gap-x-1.5">
            <span className="font-semibold uppercase tracking-wide">{area.nombre}</span>
            {area.sedeEtiqueta && (
              <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-300">
                <FontAwesomeIcon icon={faLocationDot} className="h-2.5 w-2.5" />
                {area.sedeEtiqueta}
              </span>
            )}
            <span>
              · hoy en <strong>{turnoActual.nombre}</strong>
            </span>
          </p>
        </div>
      }
      footer={
        <>
          <button type="button" onClick={onClose} disabled={guardando} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 active:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:active:bg-slate-800">
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={!destino || guardando}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white active:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {guardando && <FontAwesomeIcon icon={faSpinner} className="animate-spin" />}
            {destino ? `Cambiar a ${destino.nombre}` : "Cambiar"}
          </button>
        </>
      }
    >
      {opciones.length === 0 ? (
        <p className="text-sm italic text-slate-500 dark:text-slate-400">Esta área tiene un solo turno: no hay a dónde cambiar.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">Elegí el turno nuevo. La persona pasa a estar a cargo de quien supervisa ese turno.</p>
          {opciones.map((t) => {
            const activo = t.shiftId === elegido;
            const { suman, total } = cuentaDe(t.clave);
            return (
              <button
                key={t.clave}
                type="button"
                onClick={() => setElegido(t.shiftId)}
                aria-pressed={activo}
                className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${activo ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20" : "border-slate-200 bg-white active:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:active:bg-slate-800"}`}
              >
                <FontAwesomeIcon icon={activo ? faCircleCheck : faCircle} className={`mt-0.5 h-4 w-4 shrink-0 ${activo ? "text-blue-600 dark:text-blue-400" : "text-slate-300 dark:text-slate-600"}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{t.nombre}</span>
                    {t.horario && <span className="text-[11px] text-slate-500 dark:text-slate-400">{t.horario}</span>}
                    {t.dias && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">{t.dias}</span>}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
                    <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                      <FontAwesomeIcon icon={faUserTie} className="h-2.5 w-2.5" />
                      {t.coordinadorNombre || "Sin supervisor"}
                    </span>
                    <span className="rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
                      {suman} {suman === 1 ? "suma" : "suman"}
                      {total !== suman ? ` / ${total}` : ""}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
