import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell, faCheckDouble } from "@fortawesome/free-solid-svg-icons";
import { useNotifications } from "../hooks/useNotifications";

/*
  «HAY N NUEVOS», ARRIBA DE LA PANTALLA DONDE SE RESUELVEN.

  El número de la tarjeta del inicio no se borra solo al entrar, a propósito: tocar una tarjeta sin
  tiempo de mirar nada no puede hacer desaparecer el aviso. Pero el lugar natural para decir «ya los
  vi» es esta pantalla, no la campanita: acá está la lista que se acaba de mirar.

  Si no hay nada sin leer no se dibuja: un cartel que dice «0 nuevos» sólo corre el contenido para abajo.
*/

interface AvisoNovedadesProps {
  /** Qué tipos de aviso cuenta y marca (ver `NOVEDAD_*` en `api/personnel.ts`). */
  tipos: string[];
  /** El texto, con el número ya resuelto. Ej.: `(n) => n === 1 ? "1 registro nuevo" : ...`. */
  texto: (cantidad: number) => string;
}

export default function AvisoNovedades({ tipos, texto }: AvisoNovedadesProps) {
  const { porTipo, markAllAsRead } = useNotifications();
  const cantidad = tipos.reduce((total, tipo) => total + (porTipo[tipo] || 0), 0);
  if (cantidad === 0) return null;

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-orange-300 bg-orange-50 px-3 py-2.5 dark:border-orange-900 dark:bg-orange-950/30">
      <p className="flex min-w-0 items-center gap-2 text-xs font-bold text-orange-700 dark:text-orange-300">
        <FontAwesomeIcon icon={faBell} className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{texto(cantidad)}</span>
      </p>
      <button type="button" onClick={() => void markAllAsRead(tipos)} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-orange-300 px-2 py-1 text-[11px] font-bold text-orange-700 active:scale-95 dark:border-orange-800 dark:text-orange-300">
        <FontAwesomeIcon icon={faCheckDouble} className="h-3 w-3" />
        Marcar leídos
      </button>
    </div>
  );
}
