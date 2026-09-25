import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClock, faCopy, faFileSignature, faLayerGroup, faPen, faPlus, faSliders, faTrash, faTriangleExclamation, faUsers } from "@fortawesome/free-solid-svg-icons";
import { Plantilla, PlantillaResumen, plantillasEquipoAPI } from "../../../../../api/plantillasEquipo";
import { sweetAlert } from "../../utils/sweetAlert";
import { etiquetaProyecto, useCatalogosContratacion } from "./useCatalogosContratacion";
import PlantillaEditor from "./PlantillaEditor";
import ContratarEquipoModal from "./ContratarEquipoModal";
import ContratarTodosModal from "./ContratarTodosModal";
import { CLASE_CAMPO, fechaCorta } from "./comun";

/*
  LA PESTAÑA «PLANTILLAS» DE CONTRATACIÓN, en dos niveles:

   - La PLANTILLA DE PUESTOS (la tarjeta): los roles con sus condiciones, para reutilizar. El lápiz la
     edita; lo que cambia ahí llega a todos sus equipos.
   - Sus EQUIPOS (las filas de la tarjeta): quién ocupa cada puesto y, si hace falta, con condiciones
     propias. Cada uno se edita y se contrata por separado; «Nuevo equipo» arma otro sobre los mismos
     puestos.
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
  /** Las generales del escritorio: se copian a las propias con «Usar». */
  const [generales, setGenerales] = useState<PlantillaResumen[]>([]);
  const [verGenerales, setVerGenerales] = useState(false);
  const [editando, setEditando] = useState<{ id: string | null; equipoId?: string } | null>(null);
  const [contratando, setContratando] = useState<{ plantilla: Plantilla; equipoId?: string } | null>(null);
  /** «Contratar todos»: los equipos de la plantilla de una vez. */
  const [contratandoTodos, setContratandoTodos] = useState<Plantilla | null>(null);

  const proyectos = catalogos.proyectos;
  // El recordado, si sigue siendo suyo; si no, el primero.
  useEffect(() => {
    if (!proyectos) return;
    if (!proyectos.some((p) => p._id === projectId) && proyectos.length > 0) setProjectId(proyectos[0]._id);
  }, [proyectos, projectId]);
  const proyecto = useMemo(() => proyectos?.find((p) => p._id === projectId) || null, [proyectos, projectId]);

  useEffect(() => {
    plantillasEquipoAPI.listarGenerales().then(setGenerales).catch(() => setGenerales([]));
  }, []);

  const usar = async (g: PlantillaResumen) => {
    if (!proyecto) return;
    try {
      const copia = await plantillasEquipoAPI.usarGeneral(g._id, proyecto._id);
      sweetAlert.success("Plantilla copiada", `«${copia.nombre}» ya es tuya: completá la empresa, el área y el turno, y asigná a tu gente.`);
      setVerGenerales(false);
      cargar();
      setEditando({ id: copia._id });
    } catch (e: any) {
      sweetAlert.error("No se pudo usar", e?.response?.data?.error || "Probá de nuevo.");
    }
  };

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

  const abrirContratar = async (p: PlantillaResumen, equipoId?: string) => {
    try {
      setContratando({ plantilla: await plantillasEquipoAPI.obtener(p._id), equipoId });
    } catch {
      sweetAlert.error("No se pudo abrir la plantilla");
    }
  };

  const abrirContratarTodos = async (p: PlantillaResumen) => {
    try {
      setContratandoTodos(await plantillasEquipoAPI.obtener(p._id));
    } catch {
      sweetAlert.error("No se pudo abrir la plantilla");
    }
  };

  /** Copia de un equipo (personas y condiciones propias) con un nombre libre: «Semana A (copia)», «… (copia 2)». */
  const duplicarEquipo = async (p: PlantillaResumen, e: PlantillaResumen["equipos"][number]) => {
    const usados = new Set(p.equipos.map((x) => x.nombre.toLowerCase()));
    let nombre = `${e.nombre} (copia)`;
    for (let n = 2; usados.has(nombre.toLowerCase()); n++) nombre = `${e.nombre} (copia ${n})`;
    try {
      await plantillasEquipoAPI.crearEquipo(p._id, nombre, e._id);
      sweetAlert.success("Equipo duplicado", `Se creó «${nombre}» con la misma gente y condiciones.`);
      cargar();
    } catch (err: any) {
      sweetAlert.error("No se pudo duplicar", err?.response?.data?.error || "Probá de nuevo.");
    }
  };

  const eliminarEquipo = async (p: PlantillaResumen, e: PlantillaResumen["equipos"][number]) => {
    const r: any = await sweetAlert.confirm("¿Eliminar el equipo?", `«${e.nombre}» deja de estar en «${p.nombre}». Los puestos no cambian y las solicitudes ya pedidas tampoco.`, "Eliminar", "Cancelar");
    if (!(r === true || r?.isConfirmed)) return;
    try {
      await plantillasEquipoAPI.borrarEquipo(p._id, e._id);
      cargar();
    } catch (err: any) {
      sweetAlert.error("No se pudo eliminar", err?.response?.data?.error || "Probá de nuevo.");
    }
  };

  /** Otro equipo sobre los mismos puestos: se crea vacío y se abre para asignar gente (y renombrarlo). */
  const nuevoEquipo = async (p: PlantillaResumen) => {
    try {
      const pl = await plantillasEquipoAPI.crearEquipo(p._id, "");
      cargar();
      setEditando({ id: p._id, equipoId: pl.equipos[pl.equipos.length - 1]?._id });
    } catch (e: any) {
      sweetAlert.error("No se pudo crear el equipo", e?.response?.data?.error || "Probá de nuevo.");
    }
  };

  return (
    <div className="space-y-3">
      {/* El proyecto donde se contratan los equipos de esta lista (una plantilla se puede pasar a otro en su hoja General). */}
      {proyectos && proyectos.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Proyecto donde se contrata</p>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={proyectos.length < 2} className={`${CLASE_CAMPO} disabled:opacity-80`} aria-label="Proyecto">
            {proyectos.map((p) => (
              <option key={p._id} value={p._id}>
                {etiquetaProyecto(p)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setEditando({ id: null })} disabled={!proyecto} className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-blue-400 py-3 text-sm font-bold text-blue-600 disabled:opacity-40 dark:text-blue-400">
          <FontAwesomeIcon icon={faPlus} />
          Nueva
        </button>
        <button type="button" onClick={() => setVerGenerales((v) => !v)} disabled={!proyecto || generales.length === 0} className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 py-3 text-sm font-bold text-slate-600 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300">
          <FontAwesomeIcon icon={faLayerGroup} />
          Generales ({generales.length})
        </button>
      </div>

      {/*
        LAS GENERALES (del escritorio): armadas por puestos, sin proyecto ni personas. «Usar» crea una
        copia PROPIA en el proyecto elegido; la general no cambia y las demás personas no ven la copia.
      */}
      {verGenerales && (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Plantillas generales: elegí una para copiarla a las tuyas en este proyecto.</p>
          {generales.map((g) => (
            <div key={g._id} className="flex items-center justify-between gap-2 rounded-lg bg-white p-2.5 dark:bg-slate-900/70">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{g.nombre}</p>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {g.puestos} {g.puestos === 1 ? "puesto" : "puestos"} · {g.nombreContrato || "Sin tipo de contrato"}
                </p>
              </div>
              <button type="button" onClick={() => void usar(g)} className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">
                Usar
              </button>
            </div>
          ))}
        </div>
      )}

      {lista === null ? (
        [1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-xl border bg-white dark:border-slate-800 dark:bg-slate-900/70" />)
      ) : lista.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-800/50">
          <FontAwesomeIcon icon={faUsers} className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Todavía no tenés plantillas en este proyecto</p>
          <p className="mt-1 text-xs text-slate-400">Armá tu equipo por puestos —o partí de una general— y contratalo entero de una vez, en vez de persona por persona. Tus plantillas las ves sólo vos.</p>
        </div>
      ) : (
        lista.map((p) => (
          <div key={p._id} className="rounded-xl border bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
            {/* LA PLANTILLA DE PUESTOS */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Plantilla de puestos</p>
                <h4 className="truncate font-bold text-slate-900 dark:text-slate-100">{p.nombre}</h4>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {p.puestos} {p.puestos === 1 ? "puesto" : "puestos"} · {p.nombreContrato || "Sin tipo de contrato"}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" onClick={() => setEditando({ id: p._id })} aria-label={`Editar los puestos de ${p.nombre}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 dark:border-slate-700">
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

            {/* SUS EQUIPOS: cada uno con su gente y sus condiciones, y su propio «Contratar». */}
            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              {p.equipos.map((e) => (
                <div key={e._id} className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/60">
                  <div className="flex items-center justify-between gap-2">
                    <button type="button" onClick={() => setEditando({ id: p._id, equipoId: e._id })} className="min-w-0 flex-1 text-left">
                      <p className="flex items-center gap-1.5 truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                        <FontAwesomeIcon icon={faUsers} className="h-3 w-3 text-slate-400" />
                        {e.nombre}
                        {e.avisos > 0 && <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3 text-amber-500" title="Hay puestos que se pisan" />}
                      </p>
                      <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {e.asignados}/{e.puestos ?? p.puestos} asignados
                        {e.puestos != null && e.puestos < p.puestos ? ` · usa ${e.puestos} de ${p.puestos} puestos` : ""}
                        {e.propias > 0 && (
                          <>
                            {" · "}
                            <FontAwesomeIcon icon={faSliders} className="h-2.5 w-2.5" /> {e.propias} con condiciones propias
                          </>
                        )}
                        {e.avisos > 0 ? ` · ${e.avisos} ${e.avisos === 1 ? "puesto se pisa" : "puestos se pisan"}` : ""}
                      </p>
                      <p className="flex items-center gap-1 text-[10px] text-slate-400">
                        <FontAwesomeIcon icon={faClock} className="h-2.5 w-2.5" />
                        {e.ultimaContratacionEl ? `Contratado el ${fechaCorta(e.ultimaContratacionEl)}` : "Nunca contratado"}
                      </p>
                    </button>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <div className="flex gap-1">
                        <button type="button" onClick={() => setEditando({ id: p._id, equipoId: e._id })} aria-label={`Editar el equipo ${e.nombre}`} className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 dark:border-slate-700">
                          <FontAwesomeIcon icon={faPen} className="h-3 w-3" />
                        </button>
                        <button type="button" onClick={() => void duplicarEquipo(p, e)} aria-label={`Duplicar el equipo ${e.nombre}`} className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 dark:border-slate-700">
                          <FontAwesomeIcon icon={faCopy} className="h-3 w-3" />
                        </button>
                        <button type="button" onClick={() => void eliminarEquipo(p, e)} aria-label={`Eliminar el equipo ${e.nombre}`} className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-red-500 dark:border-slate-700">
                          <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                        </button>
                      </div>
                      <button type="button" onClick={() => void abrirContratar(p, e._id)} disabled={p.puestos === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
                        <FontAwesomeIcon icon={faFileSignature} />
                        Contratar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => void nuevoEquipo(p)} disabled={p.puestos === 0} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-2 text-xs font-bold text-slate-500 disabled:opacity-40 dark:border-slate-700">
                <FontAwesomeIcon icon={faPlus} />
                Nuevo equipo con estos puestos
              </button>
              {/* Con más de un equipo: todos juntos, cada uno con sus fechas, en un solo envío. */}
              {p.equipos.length > 1 && (
                <button type="button" onClick={() => void abrirContratarTodos(p)} disabled={p.puestos === 0} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white disabled:opacity-40">
                  <FontAwesomeIcon icon={faFileSignature} />
                  Contratar todos los equipos ({p.equipos.length})
                </button>
              )}
            </div>
          </div>
        ))
      )}

      <PlantillaEditor isOpen={!!editando} onClose={() => setEditando(null)} plantillaId={editando?.id ?? null} equipoInicial={editando?.equipoId ?? null} proyecto={proyecto} catalogos={catalogos} onCambio={cargar} onProyecto={setProjectId} />
      <ContratarTodosModal
        isOpen={!!contratandoTodos}
        onClose={() => setContratandoTodos(null)}
        plantilla={contratandoTodos}
        proyecto={proyecto}
        catalogos={catalogos}
        onAjustar={(equipoId) => contratandoTodos && setContratando({ plantilla: contratandoTodos, equipoId })}
        onContratada={() => {
          cargar();
          onContratado();
        }}
      />
      <ContratarEquipoModal
        isOpen={!!contratando}
        onClose={() => setContratando(null)}
        plantilla={contratando?.plantilla ?? null}
        equipoInicial={contratando?.equipoId ?? null}
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
