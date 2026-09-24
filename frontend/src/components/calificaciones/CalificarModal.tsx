import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { NuevaCalificacion } from "../../api/calificaciones";
import { EstrellasInput } from "./Estrellas";

/*
  PEDIR UNA CALIFICACIÓN: estrellas (obligatorias) y comentario (opcional).

  Es un paso de otra cosa —renovar, dejar vencer— o una calificación suelta; por eso el texto del botón
  lo pone quien lo abre («Dejar vencer», «Seguir con la renovación», «Guardar»). Si guardar falla, el
  modal queda abierto con el error: lo elegido no se pierde.
*/
interface Props {
  isOpen: boolean;
  onClose: () => void;
  titulo: string;
  /** A quién se califica. */
  nombre: string;
  /** Qué más se está decidiendo, en una línea (ej. «El contrato termina el 30/09 y no se renueva»). */
  detalle?: string;
  textoConfirmar: string;
  /** Tira error para dejar el modal abierto y mostrar el motivo. */
  onConfirmar: (c: NuevaCalificacion) => Promise<void>;
  /** Pinta el botón en rojo: dejar vencer no es lo mismo que renovar. */
  peligro?: boolean;
}

export const CalificarModal: React.FC<Props> = ({ isOpen, onClose, titulo, nombre, detalle, textoConfirmar, onConfirmar, peligro }) => {
  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  // Cada vez que se abre, en blanco: es una calificación nueva, no la de la persona anterior.
  useEffect(() => {
    if (isOpen) {
      setEstrellas(0);
      setComentario("");
      setError("");
      setGuardando(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const confirmar = async () => {
    if (!estrellas) {
      setError("Elegí cuántas estrellas.");
      return;
    }
    setGuardando(true);
    setError("");
    try {
      await onConfirmar({ estrellas, comentario: comentario.trim() || undefined });
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "No se pudo guardar. Probá de nuevo.");
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => !guardando && onClose()}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl dark:bg-slate-900 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{titulo}</h3>
            <p className="truncate text-sm font-semibold text-slate-600 dark:text-slate-300">{nombre}</p>
            {detalle && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detalle}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={guardando} aria-label="Cerrar" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">¿Cómo fue su actuación?</p>
        <EstrellasInput valor={estrellas} onChange={setEstrellas} disabled={guardando} />

        <label className="mt-4 block text-xs font-semibold text-slate-600 dark:text-slate-300">
          Comentario <span className="font-normal text-slate-400">(opcional)</span>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            maxLength={1000}
            rows={3}
            disabled={guardando}
            placeholder="Algo que valga la pena dejar anotado"
            className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>

        {error && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} disabled={guardando} className="rounded-lg border border-slate-200 py-2.5 text-sm font-bold text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300">
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={guardando || !estrellas}
            className={`inline-flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-50 ${peligro ? "bg-red-600 active:bg-red-700 hover:bg-red-700" : "bg-emerald-600 active:bg-emerald-700 hover:bg-emerald-700"}`}
          >
            {guardando && <FontAwesomeIcon icon={faSpinner} spin />}
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
};
