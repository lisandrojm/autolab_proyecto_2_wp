/** Los dos de Contratar, en un solo lugar para que las tres pantallas que los dibujan no se despeguen. */
export const PASOS_CONTRATAR = ["Fechas", "Revisión"];

/**
 * DÓNDE SE ESTÁ, EN UN FORMULARIO PARTIDO EN PASOS.
 *
 * Estaba fijo en «1 Fechas · 2 Revisión», que eran los dos de Contratar. Ahora recibe las etiquetas,
 * así que el alta de un equipo puede usar los suyos sin copiar el componente — y sin que los dos se
 * despeguen el día que alguien retoque uno.
 *
 * `actual` es 1-based, como se lee. Los anteriores van en verde con su tilde: lo hecho se distingue
 * de lo que falta sin leer el número.
 */
export function Pasos({ actual, pasos }: { actual: number; pasos: string[] }) {
  return (
    <nav aria-label="Pasos" className="mb-4 flex items-center gap-3">
      {pasos.map((texto, i) => {
        const n = i + 1;
        const hecho = actual > n;
        return (
          <span key={texto} className="contents">
            {i > 0 && <span className="h-px flex-1 bg-slate-300 dark:bg-slate-600" aria-hidden />}
            <span className={`flex items-center gap-1.5 text-sm font-semibold ${actual === n ? "text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-300"}`} aria-current={actual === n ? "step" : undefined}>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${actual === n ? "bg-blue-600 text-white" : hecho ? "bg-emerald-600 text-white" : "bg-slate-300 text-slate-800 dark:bg-slate-600 dark:text-slate-100"}`}>{hecho ? "✓" : n}</span>
              {texto}
            </span>
          </span>
        );
      })}
    </nav>
  );
}
