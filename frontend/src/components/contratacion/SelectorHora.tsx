import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClock, faXmark } from "@fortawesome/free-solid-svg-icons";
import { horasDelHorario, HORAS_DEL_DIA, mascaraHora, normalizarHora } from "../../utils/horario";

/*
  ELEGIR LA HORA DE ENTRADA O DE SALIDA, EN UNA VENTANA.

  Era un campo de texto con sugerencias: en el teléfono la lista del `datalist` aparece o no según el
  navegador, tapa el campo y se elige a ciegas: quedaba tipear la hora a mano. Acá se toca el campo, se
  abre esta ventana con las 24 horas del día —de a una hora, que es como se contrata— y se elige de un
  toque.

  LA HORA EXACTA SIGUE ESTANDO: abajo hay un campo para escribirla («08:30», «13:45»), con el mismo
  formato y la misma validación que antes. La lista cubre el caso común sin obligar a escribir; el campo
  cubre lo que no es hora entera sin obligar a buscar en una lista de 96 opciones.

  Cuando se elige la SALIDA se muestra cuánto dura la jornada con cada opción (`desde`): la pregunta
  real no es «¿a qué hora sale?» sino «¿cuántas horas trabaja?», y así se responde sin hacer la cuenta.

  Es la misma ventana en la app y en el panel: las clases del campo van por props, porque se ven
  distinto, pero elegir una hora tiene que ser lo mismo en los dos lados.
*/

interface SelectorHoraProps {
  valor: string;
  onCambio: (hora: string) => void;
  /** Qué hora se está eligiendo: es el título de la ventana. Ej.: «Entrada». */
  etiqueta: string;
  placeholder: string;
  /** Clases del campo (el botón que abre la ventana). */
  className: string;
  /** La hora de entrada, cuando este selector es el de salida: muestra la duración de cada opción. */
  desde?: string;
  disabled?: boolean;
  /**
   * Por encima del modal que ya está abierto (la solicitud, el alta).
   *
   * 100 por defecto: el formulario vive en 50 y sus propias ventanas —elegir persona, «¿no aparece?»—
   * llegan a 90. Más abajo que eso, la ventana de horas se abría detrás del formulario.
   */
  zIndex?: number;
}

export function SelectorHora({ valor, onCambio, etiqueta, placeholder, className, desde, disabled, zIndex = 100 }: SelectorHoraProps) {
  const [abierto, setAbierto] = useState(false);
  const [aMano, setAMano] = useState("");
  const [invalida, setInvalida] = useState(false);

  // Al abrir, el campo de la hora exacta arranca con lo que ya está elegido.
  useEffect(() => {
    if (abierto) {
      setAMano(valor || "");
      setInvalida(false);
    }
  }, [abierto, valor]);

  // Cerrar con Escape: en el escritorio es lo que se espera de cualquier ventana.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  const elegir = (hora: string) => {
    if (hora !== valor) onCambio(hora);
    setAbierto(false);
  };

  const confirmarAMano = () => {
    const hora = normalizarHora(aMano);
    if (hora === null || hora === "") {
      setInvalida(true);
      return;
    }
    elegir(hora);
  };

  /** Cuánto dura la jornada si se sale a esa hora. Sólo en el selector de salida. */
  const duracion = (hora: string) => {
    if (!desde) return "";
    const h = horasDelHorario(desde, hora);
    return h === null || h === 0 ? "" : `${h.toLocaleString("es-AR", { maximumFractionDigits: 2 })} h`;
  };

  return (
    <>
      <button type="button" onClick={() => !disabled && setAbierto(true)} disabled={disabled} aria-haspopup="dialog" className={`${className} flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60`}>
        <span className={valor ? "" : "text-slate-400 dark:text-slate-500"}>{valor || placeholder}</span>
        <FontAwesomeIcon icon={faClock} className="h-3 w-3 shrink-0 opacity-50" />
      </button>

      {abierto && (
        <div className="fixed inset-0 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" style={{ zIndex }} onClick={() => setAbierto(false)}>
          <div role="dialog" aria-modal="true" aria-label={`Elegí la hora de ${etiqueta.toLowerCase()}`} className="flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{etiqueta}</p>
              <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="flex h-8 w-8 items-center justify-center rounded text-slate-500">
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 overflow-y-auto p-4 sm:grid-cols-4">
              {HORAS_DEL_DIA.map((hora) => {
                const elegida = hora === valor;
                const dur = duracion(hora);
                return (
                  <button
                    key={hora}
                    type="button"
                    onClick={() => elegir(hora)}
                    aria-pressed={elegida}
                    className={`flex flex-col items-center rounded-lg border py-2 transition-colors active:scale-95 ${elegida ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-900/30 dark:text-blue-300" : "border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-300"}`}
                  >
                    <span className="text-sm font-bold">{hora}</span>
                    {dur && <span className="text-[10px] text-slate-400">{dur}</span>}
                  </button>
                );
              })}
            </div>

            <div className="border-t border-slate-200 p-4 dark:border-slate-700">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Otra hora</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  value={aMano}
                  placeholder="08:30"
                  onChange={(e) => {
                    setAMano(mascaraHora(e.target.value, aMano));
                    setInvalida(false);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && confirmarAMano()}
                  aria-invalid={invalida}
                  className={`w-24 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-100 ${invalida ? "border-red-400 dark:border-red-700" : "border-slate-200 dark:border-slate-700"}`}
                />
                <button type="button" onClick={confirmarAMano} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white active:scale-95">
                  Usar esta hora
                </button>
              </div>
              {invalida && <p className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400">Hora inválida: usá HH:MM, por ejemplo 08:30.</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
