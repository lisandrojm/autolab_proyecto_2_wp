import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBriefcase } from "@fortawesome/free-solid-svg-icons";

/**
 * UN COMENTARIO, POR SI HACE FALTA. El mismo campo del alta individual: opcional, y el único de texto
 * libre. Todo lo demás está tipificado porque se procesa del otro lado; pero siempre hay algo que no
 * entra en ningún campo («entra recién el 15», «lo pidió producción por WhatsApp»).
 */
export function CampoComentarios({ valor, onCambio, placeholder = "Algo que haga falta aclarar sobre esta contratación (opcional)…", rows = 3 }: { valor: string; onCambio: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
        <FontAwesomeIcon icon={faBriefcase} className="text-[10px] text-blue-500" />
        Comentarios
      </label>
      <textarea rows={rows} value={valor} onChange={(e) => onCambio(e.target.value)} className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-900 outline-none transition-all focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder={placeholder} />
    </div>
  );
}
