import { useLocation, useNavigate, useParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import { Pantalla } from "./Pantalla";
import { aContratacion, rutas } from "./equipoUtil";
import { pesos, Pill } from "./comun";

/*
  CONTRATAR · ENVIADO. Lo que salió, por equipo, y que queda pendiente de aprobación. Desde acá: ver
  las solicitudes en Historial o volver al grupo. Atrás no vuelve a la revisión (ya se envió).
*/
export default function ContratarEnviado() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const estado = (useLocation().state || {}) as { lotes?: { nombrePlantilla: string; solicitudIds: string[]; totales: { importe: number } }[]; repetido?: boolean; grupo?: string };
  const lotes = estado.lotes || [];
  const total = lotes.reduce((s, l) => s + l.solicitudIds.length, 0);
  const historial = aContratacion("historial");

  return (
    <Pantalla titulo="Enviado" contexto={estado.grupo} atras={rutas.grupo(id)} atrasFijo boton={{ texto: "Ver en Historial", onClick: () => navigate(historial.pathname, { state: historial.state }) }}>
      <div className="flex flex-col items-center py-6 text-center">
        <FontAwesomeIcon icon={faCircleCheck} className="h-14 w-14 text-emerald-600" />
        <h2 className="mt-3 text-xl font-bold text-slate-900 dark:text-white">{estado.repetido ? "Ya se habían enviado" : lotes.length ? `${total} ${total === 1 ? "solicitud enviada" : "solicitudes enviadas"}` : "Solicitudes enviadas"}</h2>
        <p className="mt-1"><Pill tono="ambar">Pendiente de aprobación</Pill></p>
      </div>
      {lotes.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800/70">
          {lotes.map((l) => (
            <li key={l.nombrePlantilla} className="flex min-h-[56px] items-center justify-between gap-2 px-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{l.nombrePlantilla}</span>
                <span className="block text-xs text-slate-600 dark:text-slate-300">{l.solicitudIds.length} solicitudes</span>
              </span>
              <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">{pesos(l.totales.importe)}</span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => navigate(rutas.grupo(id), { replace: true })} className="mt-4 min-h-[48px] w-full rounded-xl border border-slate-300 text-sm font-bold text-slate-800 dark:border-slate-600 dark:text-slate-100">
        Volver al grupo
      </button>
    </Pantalla>
  );
}
