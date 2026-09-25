import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight, faLayerGroup, faPlus } from "@fortawesome/free-solid-svg-icons";
import { PlantillaResumen, plantillasEquipoAPI } from "../../../../../api/plantillasEquipo";
import { sweetAlert } from "../../utils/sweetAlert";
import { etiquetaProyecto } from "./useCatalogosContratacion";
import { usePlantillas } from "./contexto";
import { Pantalla, Vacio } from "./Pantalla";
import { HojaInferior } from "./HojaInferior";
import { aContratacion, nombreTurno, rutas } from "./equipoUtil";
import { ChipTurno, CLASE_CAMPO, Pill } from "./comun";

/*
  PANTALLA 1 · LOS GRUPOS DE PUESTOS DEL PROYECTO. Una tarjeta por grupo: cuántos puestos, sus equipos
  con el turno de cada uno y cómo están (listos, faltan, reemplazos). Tocarla lleva al grupo.

  Se muestra como pantalla propia (`/mobile/plantillas`) y dentro de la pestaña Plantillas de
  Contratación (`embebida`, sin cabecera propia).
*/
const CLAVE_PROYECTO = "plantillas:proyecto";

export default function ListaGrupos({ embebida }: { embebida?: boolean }) {
  const navigate = useNavigate();
  const { catalogos, areasDe } = usePlantillas();
  const [projectId, setProjectId] = useState<string>(() => {
    try {
      return localStorage.getItem(CLAVE_PROYECTO) || "";
    } catch {
      return "";
    }
  });
  const [lista, setLista] = useState<PlantillaResumen[] | null>(null);
  const [generales, setGenerales] = useState<PlantillaResumen[]>([]);
  const [hoja, setHoja] = useState<null | "nuevo" | "generales">(null);
  const [nombre, setNombre] = useState("");
  const [creando, setCreando] = useState(false);

  const proyectos = catalogos.proyectos;
  useEffect(() => {
    if (!proyectos) return;
    if (!proyectos.some((p) => p._id === projectId) && proyectos.length > 0) setProjectId(proyectos[0]._id);
  }, [proyectos, projectId]);
  const proyecto = useMemo(() => proyectos?.find((p) => p._id === projectId) || null, [proyectos, projectId]);
  const areas = areasDe(projectId);

  useEffect(() => {
    if (!projectId) return;
    setLista(null);
    plantillasEquipoAPI.listar(projectId).then(setLista).catch(() => setLista([]));
    try {
      localStorage.setItem(CLAVE_PROYECTO, projectId);
    } catch {
      /* sin storage, no se recuerda */
    }
  }, [projectId]);
  useEffect(() => {
    plantillasEquipoAPI.listarGenerales().then(setGenerales).catch(() => setGenerales([]));
  }, []);

  const crear = async () => {
    if (!proyecto || !nombre.trim()) return;
    setCreando(true);
    try {
      // La empresa, si el proyecto tiene una sola, ya viene elegida: sin ella no hay categorías.
      const empresas = catalogos.empresasDelProyecto(proyecto);
      const empresa = empresas.length === 1 ? empresas[0]._id : null;
      const convenio = empresa ? catalogos.convenioUnico(proyecto, empresa)?._id || null : null;
      const p = await plantillasEquipoAPI.crear({ projectId: proyecto._id, nombre: nombre.trim(), empresaContratoId: empresa, convenioId: convenio, sinEquipos: true });
      setHoja(null);
      navigate(rutas.grupo(p._id), { state: { editarPuestos: true } });
    } catch (e: any) {
      sweetAlert.error("No se pudo crear", e?.response?.data?.error || "Probá de nuevo.");
    } finally {
      setCreando(false);
    }
  };

  const usar = async (g: PlantillaResumen) => {
    if (!proyecto) return;
    try {
      const copia = await plantillasEquipoAPI.usarGeneral(g._id, proyecto._id);
      setHoja(null);
      navigate(rutas.grupo(copia._id));
    } catch (e: any) {
      sweetAlert.error("No se pudo usar", e?.response?.data?.error || "Probá de nuevo.");
    }
  };

  const contenido = (
    <div className="space-y-3">
      {proyectos && proyectos.length > 0 && (
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Proyecto</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={proyectos.length < 2} className={`${CLASE_CAMPO} disabled:opacity-90`}>
            {proyectos.map((p) => (
              <option key={p._id} value={p._id}>
                {etiquetaProyecto(p)}
              </option>
            ))}
          </select>
        </label>
      )}

      {lista === null ? (
        [1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />)
      ) : lista.length === 0 ? (
        // Como pantalla, la acción es el botón de abajo; dentro de la pestaña, va en el cartel.
        <Vacio texto="Todavía no hay grupos de puestos en este proyecto." accion={embebida ? "Nuevo grupo de puestos" : undefined} onAccion={() => setHoja("nuevo")} />
      ) : (
        lista.map((p) => {
          const asignados = p.equipos.reduce((s, e) => s + e.asignados, 0);
          const total = p.equipos.reduce((s, e) => s + e.puestos, 0);
          const reemplazos = p.equipos.reduce((s, e) => s + (e.reemplazos || 0), 0);
          return (
            <button key={p._id} type="button" onClick={() => navigate(rutas.grupo(p._id))} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-blue-400 dark:border-slate-700 dark:bg-slate-800/70">
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="truncate text-base font-bold text-slate-900 dark:text-white">{p.nombre}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {p.puestos} {p.puestos === 1 ? "puesto" : "puestos"} · {p.equipos.length} {p.equipos.length === 1 ? "equipo" : "equipos"}
                </p>
                {p.equipos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {p.equipos.map((e) => (
                      <ChipTurno key={e._id} inicio={e.condiciones?.inTime} texto={e.nombre || nombreTurno(areas, e.condiciones?.areaId, e.condiciones?.shiftId)} />
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {total > 0 && (asignados === total ? <Pill tono="verde">{`${asignados}/${total} listos`}</Pill> : <Pill tono="ambar">{`Faltan ${total - asignados}`}</Pill>)}
                  {reemplazos > 0 && <Pill tono="azul">{reemplazos === 1 ? "1 reemplazo" : `${reemplazos} reemplazos`}</Pill>}
                </div>
              </div>
              <FontAwesomeIcon icon={faChevronRight} className="shrink-0 text-slate-500" />
            </button>
          );
        })
      )}

      {embebida && lista && lista.length > 0 && (
        <button type="button" onClick={() => setHoja("nuevo")} disabled={!proyecto} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-dashed border-blue-500 text-sm font-bold text-blue-700 disabled:opacity-40 dark:text-blue-300">
          <FontAwesomeIcon icon={faPlus} />
          Nuevo grupo de puestos
        </button>
      )}
      {generales.length > 0 && (
        <button type="button" onClick={() => setHoja("generales")} disabled={!proyecto} className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-slate-700 disabled:opacity-40 dark:text-slate-200">
          <FontAwesomeIcon icon={faLayerGroup} />
          Partir de un grupo general ({generales.length})
        </button>
      )}

      <HojaInferior
        abierta={hoja === "nuevo"}
        onCerrar={() => setHoja(null)}
        titulo="Nuevo grupo de puestos"
        subtitulo={proyecto ? etiquetaProyecto(proyecto) : undefined}
        pie={
          <button type="button" onClick={() => void crear()} disabled={!nombre.trim() || creando} className="min-h-[48px] w-full rounded-xl bg-blue-600 text-sm font-bold text-white disabled:opacity-40">
            Crear y elegir puestos
          </button>
        }
      >
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-800 dark:text-slate-100">Nombre</span>
          <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void crear()} placeholder="Ej. Equipo Técnica" maxLength={120} className={CLASE_CAMPO} />
        </label>
      </HojaInferior>

      <HojaInferior abierta={hoja === "generales"} onCerrar={() => setHoja(null)} titulo="Partir de un grupo general" subtitulo="Se copia a este proyecto; el general no cambia">
        <div className="space-y-2">
          {generales.map((g) => (
            <button key={g._id} type="button" onClick={() => void usar(g)} className="flex min-h-[52px] w-full items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 text-left dark:border-slate-700">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{g.nombre}</span>
                <span className="block text-xs text-slate-600 dark:text-slate-300">{g.puestos} puestos</span>
              </span>
              <FontAwesomeIcon icon={faChevronRight} className="text-slate-500" />
            </button>
          ))}
        </div>
      </HojaInferior>
    </div>
  );

  if (embebida) return contenido;
  return (
    <Pantalla titulo="Plantillas" contexto={proyecto ? etiquetaProyecto(proyecto) : undefined} atras={aContratacion()} listo={lista !== null} boton={{ texto: "Nuevo grupo de puestos", onClick: () => setHoja("nuevo"), deshabilitado: !proyecto }}>
      {contenido}
    </Pantalla>
  );
}
