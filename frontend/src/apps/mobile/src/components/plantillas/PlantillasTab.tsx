import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClock, faCopy, faFileSignature, faPen, faPlus, faTrash, faUsers } from "@fortawesome/free-solid-svg-icons";
import { Plantilla, PlantillaResumen, plantillasEquipoAPI } from "../../../../../api/plantillasEquipo";
import { sweetAlert } from "../../utils/sweetAlert";
import { etiquetaProyecto, useAreasDelProyecto, useCatalogosContratacion } from "./useCatalogosContratacion";
import PlantillaEditor from "./PlantillaEditor";
import ContratarEquipoModal from "./ContratarEquipoModal";
import { CLASE_CAMPO, fechaCorta } from "./comun";

/*
  LA PESTAÑA «PLANTILLAS» DE CONTRATACIÓN: los equipos fijos del proyecto, para contratarlos de una vez.

  Cada plantilla muestra cuántos integrantes tiene, con qué contrato y turno, y cuándo se contrató por
  última vez. «Contratar» abre el alta del equipo entero; «Editar», los valores y los integrantes.
  El proyecto elegido se recuerda en este teléfono (con muchos proyectos, se vuelve siempre al mismo).
*/
const CLAVE_PROYECTO = "plantillas:proyecto";

export default function PlantillasTab({ onContratado }: { onContratado: () => void }) {
  const catalogos = useCatalogosContratacion();
  const [projectId, setProjectId] = useState<string>(() => {
    try {
      return localStorage.getItem(CLAVE_PROYECTO) || "";
    } catch {
      return "";
    }
  });
  const [lista, setLista] = useState<PlantillaResumen[] | null>(null);
  const [editando, setEditando] = useState<{ id: string | null } | null>(null);
  const [contratando, setContratando] = useState<Plantilla | null>(null);

  const proyectos = catalogos.proyectos;
  // El recordado, si sigue siendo suyo; si no, el primero.
  useEffect(() => {
    if (!proyectos) return;
    if (!proyectos.some((p) => p._id === projectId) && proyectos.length > 0) setProjectId(proyectos[0]._id);
  }, [proyectos, projectId]);
  const proyecto = useMemo(() => proyectos?.find((p) => p._id === projectId) || null, [proyectos, projectId]);
  const areas = useAreasDelProyecto(projectId);

  const cargar = () => {
    if (!projectId) return;
    setLista(null);
    plantillasEquipoAPI
      .listar(projectId)
      .then(setLista)
      .catch(() => setLista([]));
  };
  useEffect(() => {
    cargar();
    try {
      if (projectId) localStorage.setItem(CLAVE_PROYECTO, projectId);
    } catch {
      /* sin storage, no se recuerda */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const turnoDe = (p: PlantillaResumen) => {
    const a = p.areaShiftAssignments?.[0];
    const t = (areas || []).find((o) => o.areaId === a?.areaId && o.shiftId === a?.shiftIds?.[0]);
    return t ? `${t.areaNombre} · ${t.turnoNombre}` : "Sin área y turno";
  };

  const duplicar = async (p: PlantillaResumen) => {
    try {
      await plantillasEquipoAPI.duplicar(p._id);
      sweetAlert.success("Plantilla duplicada", `Se creó una copia de «${p.nombre}».`);
      cargar();
    } catch (e: any) {
      sweetAlert.error("No se pudo duplicar", e?.response?.data?.error || "Probá de nuevo.");
    }
  };

  const eliminar = async (p: PlantillaResumen) => {
    const r: any = await sweetAlert.confirm("¿Eliminar la plantilla?", `«${p.nombre}» deja de estar disponible. Las solicitudes que ya se pidieron con ella no cambian.`, "Eliminar", "Cancelar");
    if (!(r === true || r?.isConfirmed)) return;
    try {
      await plantillasEquipoAPI.borrar(p._id);
      cargar();
    } catch (e: any) {
      sweetAlert.error("No se pudo eliminar", e?.response?.data?.error || "Probá de nuevo.");
    }
  };

  const abrirContratar = async (p: PlantillaResumen) => {
    try {
      setContratando(await plantillasEquipoAPI.obtener(p._id));
    } catch {
      sweetAlert.error("No se pudo abrir la plantilla");
    }
  };

  return (
    <div className="space-y-3">
      {proyectos && proyectos.length > 1 && (
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={CLASE_CAMPO} aria-label="Proyecto">
          {proyectos.map((p) => (
            <option key={p._id} value={p._id}>
              {etiquetaProyecto(p)}
            </option>
          ))}
        </select>
      )}
      {proyectos && proyectos.length === 1 && proyecto && <p className="text-xs font-semibold text-slate-500">{etiquetaProyecto(proyecto)}</p>}

      <button type="button" onClick={() => setEditando({ id: null })} disabled={!proyecto} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-blue-400 py-3 text-sm font-bold text-blue-600 disabled:opacity-40 dark:text-blue-400">
        <FontAwesomeIcon icon={faPlus} />
        Nueva plantilla
      </button>

      {lista === null ? (
        [1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-xl border bg-white dark:border-slate-800 dark:bg-slate-900/70" />)
      ) : lista.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-800/50">
          <FontAwesomeIcon icon={faUsers} className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Todavía no hay plantillas en este proyecto</p>
          <p className="mt-1 text-xs text-slate-400">Armá un equipo fijo con sus valores y contratalo entero de una vez, en vez de persona por persona.</p>
        </div>
      ) : (
        lista.map((p) => (
          <div key={p._id} className="rounded-xl border bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="truncate font-bold text-slate-900 dark:text-slate-100">{p.nombre}</h4>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {p.integrantes} {p.integrantes === 1 ? "integrante" : "integrantes"} · {p.nombreContrato || "Sin tipo de contrato"}
                </p>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {turnoDe(p)} · {p.inTime || "—"} a {p.outTime || "—"}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" onClick={() => setEditando({ id: p._id })} aria-label={`Editar ${p.nombre}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 dark:border-slate-700">
                  <FontAwesomeIcon icon={faPen} className="h-3 w-3" />
                </button>
                <button type="button" onClick={() => void duplicar(p)} aria-label={`Duplicar ${p.nombre}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 dark:border-slate-700">
                  <FontAwesomeIcon icon={faCopy} className="h-3 w-3" />
                </button>
                <button type="button" onClick={() => void eliminar(p)} aria-label={`Eliminar ${p.nombre}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-red-500 dark:border-slate-700">
                  <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <span className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <FontAwesomeIcon icon={faClock} className="h-3 w-3" />
                {p.ultimaContratacionEl ? `Última contratación: ${fechaCorta(p.ultimaContratacionEl)}` : "Nunca contratada"}
              </span>
              <button type="button" onClick={() => void abrirContratar(p)} disabled={p.integrantes === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
                <FontAwesomeIcon icon={faFileSignature} />
                Contratar
              </button>
            </div>
          </div>
        ))
      )}

      <PlantillaEditor isOpen={!!editando} onClose={() => setEditando(null)} plantillaId={editando?.id ?? null} proyecto={proyecto} catalogos={catalogos} onCambio={cargar} />
      <ContratarEquipoModal
        isOpen={!!contratando}
        onClose={() => setContratando(null)}
        plantilla={contratando}
        proyecto={proyecto}
        catalogos={catalogos}
        onContratada={() => {
          cargar();
          onContratado();
        }}
      />
    </div>
  );
}
