import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faSpinner, faPlus } from "@fortawesome/free-solid-svg-icons";
import { HistorialCalificaciones, NuevaCalificacion, TEXTO_ORIGEN } from "../../api/calificaciones";
import { CalificacionPromedio, EstrellasInput, EstrellasVista } from "./Estrellas";

/*
  LAS CALIFICACIONES DE UNA PERSONA: su promedio, todas las que tiene (quién, cuándo, desde dónde y el
  comentario) y el formulario para sumarle una.

  Lo usan la lista de Usuarios y las solicitudes de renovación del escritorio, y Equipos en el móvil.
  Cada pantalla le pasa cómo leer y cómo guardar, porque cada una tiene su propio permiso en el server.
*/
interface Props {
  isOpen: boolean;
  onClose: () => void;
  nombre: string;
  cargar: () => Promise<HistorialCalificaciones>;
  /** Sin esto se muestra sólo el historial. */
  calificar?: (c: NuevaCalificacion) => Promise<void>;
  /** Para que la pantalla actualice el promedio que muestra. */
  onCalificada?: () => void;
  /** Una línea sobre por qué se califica desde acá (ej. «Por una buena o mala actitud»). */
  ayuda?: string;
  /** Abre directo con el formulario a la vista. */
  empezarCalificando?: boolean;
}

const fechaYHora = (f: string) => {
  const d = new Date(f);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export const CalificacionesModal: React.FC<Props> = ({ isOpen, onClose, nombre, cargar, calificar, onCalificada, ayuda, empezarCalificando }) => {
  const [historial, setHistorial] = useState<HistorialCalificaciones | null>(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [formAbierto, setFormAbierto] = useState(false);
  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const recargar = () => {
    setErrorCarga("");
    cargar()
      .then(setHistorial)
      .catch((e: any) => setErrorCarga(e?.response?.data?.error || "No se pudieron cargar las calificaciones."));
  };

  useEffect(() => {
    if (!isOpen) return;
    setHistorial(null);
    setFormAbierto(!!empezarCalificando && !!calificar);
    setEstrellas(0);
    setComentario("");
    setError("");
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const guardar = async () => {
    if (!calificar || !estrellas) return;
    setGuardando(true);
    setError("");
    try {
      await calificar({ estrellas, comentario: comentario.trim() || undefined });
      setFormAbierto(false);
      setEstrellas(0);
      setComentario("");
      recargar();
      onCalificada?.();
    } catch (e: any) {
      setError(e?.response?.data?.error || "No se pudo guardar. Probá de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => !guardando && onClose()}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl dark:bg-slate-900 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5 dark:border-slate-800">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Calificaciones</p>
            <h3 className="truncate text-lg font-bold text-slate-900 dark:text-white">{nombre}</h3>
            <div className="mt-1">{historial ? <CalificacionPromedio promedio={historial.promedio} cantidad={historial.cantidad} /> : <span className="text-xs text-slate-400">Cargando…</span>}</div>
          </div>
          <button type="button" onClick={onClose} disabled={guardando} aria-label="Cerrar" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {calificar &&
            (formAbierto ? (
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                {ayuda && <p className="mb-2 text-center text-xs text-slate-500 dark:text-slate-400">{ayuda}</p>}
                <EstrellasInput valor={estrellas} onChange={setEstrellas} disabled={guardando} />
                <textarea
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  disabled={guardando}
                  placeholder="Comentario (opcional)"
                  className="mt-3 w-full resize-none rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                {error && <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => setFormAbierto(false)} disabled={guardando} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300">
                    Cancelar
                  </button>
                  <button type="button" onClick={guardar} disabled={guardando || !estrellas} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                    {guardando && <FontAwesomeIcon icon={faSpinner} spin />}
                    Guardar calificación
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setFormAbierto(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-amber-400 py-2.5 text-sm font-bold text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20">
                <FontAwesomeIcon icon={faPlus} />
                Calificar
              </button>
            ))}

          {errorCarga ? (
            <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{errorCarga}</p>
          ) : !historial ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : historial.calificaciones.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Todavía nadie la calificó.</p>
          ) : (
            <ul className="space-y-2">
              {historial.calificaciones.map((c) => (
                <li key={c._id} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <EstrellasVista valor={c.estrellas} className="text-sm" />
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">{fechaYHora(c.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-semibold">{c.calificadoPorNombre || "Alguien"}</span>
                    {" · "}
                    {TEXTO_ORIGEN[c.origen] || c.origen}
                    {c.origen === "fin_contrato" && c.decision ? ` (${c.decision === "renovar" ? "renovó" : "lo dejó vencer"})` : ""}
                    {c.proyectoNombre ? ` · ${c.proyectoNombre}` : ""}
                  </p>
                  {c.comentario && <p className="mt-1.5 whitespace-pre-line rounded bg-slate-50 p-2 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">{c.comentario}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
