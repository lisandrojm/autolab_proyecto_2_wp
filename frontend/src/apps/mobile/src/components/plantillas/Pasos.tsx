/** Los dos de Contratar, en un solo lugar para que las tres pantallas que los dibujan no se despeguen. */
export const PASOS_CONTRATAR = ["Fechas", "Revisión"];

/**
 * Los cuatro del alta de un equipo: una decisión por pantalla.
 *
 * Empezaron siendo tres, con el convenio y el grupo juntos en el primero. Pero son dos preguntas
 * distintas —BAJO QUÉ CONDICIONES se contrata y QUÉ ROLES hacen falta— y la primera casi siempre
 * viene contestada sola: el proyecto trae su empresa y la empresa su convenio. Juntas obligaban a
 * scrollear por encima de tres campos ya resueltos para llegar al único que se completa.
 *
 *   1. PROYECTO Y CONVENIO — bajo qué condiciones. Casi siempre ya está.
 *   2. GRUPO — qué roles hacen falta. Es lo reusable: sirve en cualquier proyecto.
 *   3. ÁREA Y TURNO — dónde y cuándo; de ahí sale el nombre del equipo.
 *   4. PERSONAS — quiénes lo cubren. Opcional: se pueden asignar después.
 *
 * Los nombres son para el lector de pantalla: en la pantalla se ven sólo los números.
 */
export const PASOS_EQUIPO = ["Proyecto y convenio", "Grupo", "Área y turno", "Personas"];

/**
 * DÓNDE SE ESTÁ, EN UN FORMULARIO PARTIDO EN PASOS.
 *
 * Estaba fijo en «1 Fechas · 2 Revisión», que eran los dos de Contratar. Ahora recibe las etiquetas,
 * así que el alta de un equipo puede usar los suyos sin copiar el componente — y sin que los dos se
 * despeguen el día que alguien retoque uno.
 *
 * `actual` es 1-based, como se lee. Los anteriores van en verde con su tilde: lo hecho se distingue
 * de lo que falta sin leer el número.
 *
 * SÓLO LOS NÚMEROS, sin el nombre al lado. El nombre del paso ya está arriba —es el título de la
 * pantalla y lo que dicen sus propios campos— así que repetirlo acá agregaba tres palabras a un
 * renglón que sólo tiene que contestar «cuántos son y en cuál voy». Con los nombres puestos, en un
 * teléfono los círculos quedaban apretados contra el borde y las rayas que los unen casi no se
 * veían; sin ellos, las rayas se estiran y el recorrido se lee de un vistazo.
 *
 * El nombre sigue estando para quien usa lector de pantalla, que no tiene el título a mano.
 */
export function Pasos({ actual, pasos, className = "mb-4" }: { actual: number; pasos: string[]; className?: string }) {
  return (
    <nav aria-label="Pasos" className={`flex items-center gap-3 ${className}`}>
      {pasos.map((texto, i) => {
        const n = i + 1;
        const hecho = actual > n;
        return (
          <span key={texto} className="contents">
            {i > 0 && <span className="h-px flex-1 bg-slate-300 dark:bg-slate-600" aria-hidden />}
            <span
              aria-current={actual === n ? "step" : undefined}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${actual === n ? "bg-blue-600 text-white" : hecho ? "bg-emerald-600 text-white" : "bg-slate-300 text-slate-800 dark:bg-slate-600 dark:text-slate-100"}`}
            >
              {hecho ? "✓" : n}
              <span className="sr-only">{texto}</span>
            </span>
          </span>
        );
      })}
    </nav>
  );
}
