import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faSpinner, faUmbrellaBeach } from "@fortawesome/free-solid-svg-icons";
import { projectsAPI, type Project } from "../../../api/projects";
import { planVacacionesAPI, errorDe, type PlanResumen, type PlanVacaciones } from "../../../api/planVacaciones";
import { sweetAlert } from "../../../utils/sweetAlert";
import { BotonOrden, useOrdenTabla } from "../../ui/OrdenTabla";
import { TEXTO_ESTADO_PLAN } from "@compartido/planVacaciones/estado";
import { fechaCorta } from "@compartido/planVacaciones/fechas";
import { ModalNuevoPlan } from "./ModalNuevoPlan";
import { PlanVacacionesProyecto } from "./PlanVacacionesProyecto";
import { CLASE_ESTADO_PLAN } from "./estilos";

interface Props {
  /** Dentro de un proyecto: sólo sus planes, sin selector. */
  projectIdFijo?: string;
}

/**
 * «PLAN POR PROYECTO»: la lista de planes (de un proyecto o de todos) y, al abrir uno, su pantalla.
 * El plan abierto va en la URL (`?planId=`) para que el aviso al coordinador y el botón «atrás» lleguen
 * al mismo lugar. La misma pestaña vive en Vacaciones y en Proyecto › Equipo.
 */
export const PlanesPorProyectoTab: React.FC<Props> = ({ projectIdFijo }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const planIdEnUrl = new URLSearchParams(location.search).get("planId") || "";
  const [proyectos, setProyectos] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(projectIdFijo || "");
  const [planes, setPlanes] = useState<PlanResumen[] | null>(null);
  const [nuevo, setNuevo] = useState(false);

  useEffect(() => {
    if (projectIdFijo) return;
    projectsAPI
      .listAll({ limit: 500, slim: true })
      .then((p) => setProyectos([...p].sort((a, b) => String(a.name).localeCompare(String(b.name), "es"))))
      .catch(() => setProyectos([]));
  }, [projectIdFijo]);

  const cargar = useCallback(async () => {
    try {
      setPlanes(await planVacacionesAPI.listar(projectId ? { projectId } : {}));
    } catch (err: any) {
      sweetAlert.error("No se pudieron cargar los planes", errorDe(err));
      setPlanes([]);
    }
  }, [projectId]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const abrir = (id: string) => {
    const q = new URLSearchParams(location.search);
    q.set("planId", id);
    navigate({ search: `?${q.toString()}` });
  };
  const volver = useCallback(() => {
    const q = new URLSearchParams(location.search);
    q.delete("planId");
    navigate({ search: q.toString() ? `?${q.toString()}` : "" });
  }, [location.search, navigate]);

  const filas = useMemo(() => planes || [], [planes]);
  const { ordenados, orden, alternar } = useOrdenTabla(
    filas,
    { nombre: (p) => p.nombre, proyecto: (p) => p.proyecto, ventana: (p) => p.ventanaDesde, anio: (p) => p.anioDeSaldo, estado: (p) => p.estado, bloques: (p) => p.contadores.total, actualizado: (p) => p.updatedAt },
    { columna: "ventana", direccion: "desc" },
  );

  if (planIdEnUrl) {
    return <PlanVacacionesProyecto planId={planIdEnUrl} onVolver={volver} onCambio={() => void cargar()} />;
  }

  const th = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400";
  const td = "px-4 py-3 text-sm text-gray-700 dark:text-gray-300";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {!projectIdFijo && (
            <select className="input-field text-sm min-w-[260px]" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Todos los proyectos</option>
              {proyectos.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <p className="text-xs text-gray-500 max-w-xl">Una temporada por proyecto: el equipo agrupado por área › turno › rol, un mes para cada rol repartido en bloques (máximo {15} días por persona), y el coordinador aprueba antes de que sean solicitudes reales.</p>
        </div>
        <button type="button" onClick={() => setNuevo(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
          <FontAwesomeIcon icon={faPlus} /> Nuevo plan
        </button>
      </div>

      {planes === null ? (
        <div className="flex justify-center py-10 text-gray-500">
          <FontAwesomeIcon icon={faSpinner} spin className="mr-2" /> Cargando planes…
        </div>
      ) : ordenados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 px-6 py-12 text-center text-sm text-gray-500">
          <FontAwesomeIcon icon={faUmbrellaBeach} className="text-3xl text-blue-300 mb-3" />
          <p>Todavía no hay planes{projectId ? " para este proyecto" : ""}. Creá uno con la ventana de la temporada y repartí cada mes por rol.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr>
                <th className={th}>
                  <BotonOrden columna="nombre" orden={orden} onAlternar={alternar}>
                    Plan
                  </BotonOrden>
                </th>
                {!projectIdFijo && (
                  <th className={th}>
                    <BotonOrden columna="proyecto" orden={orden} onAlternar={alternar}>
                      Proyecto
                    </BotonOrden>
                  </th>
                )}
                <th className={th}>
                  <BotonOrden columna="ventana" orden={orden} onAlternar={alternar}>
                    Ventana
                  </BotonOrden>
                </th>
                <th className={th}>
                  <BotonOrden columna="anio" orden={orden} onAlternar={alternar}>
                    Saldo
                  </BotonOrden>
                </th>
                <th className={th}>
                  <BotonOrden columna="estado" orden={orden} onAlternar={alternar}>
                    Estado
                  </BotonOrden>
                </th>
                <th className={th}>
                  <BotonOrden columna="bloques" orden={orden} onAlternar={alternar}>
                    Bloques
                  </BotonOrden>
                </th>
                <th className={th}>
                  <BotonOrden columna="actualizado" orden={orden} onAlternar={alternar}>
                    Actualizado
                  </BotonOrden>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {ordenados.map((p) => (
                <tr key={p._id} onClick={() => abrir(p._id)} className="cursor-pointer hover:bg-blue-50/60 dark:hover:bg-blue-900/10">
                  <td className={`${td} font-semibold text-gray-900 dark:text-white`}>{p.nombre}</td>
                  {!projectIdFijo && <td className={td}>{p.proyecto}</td>}
                  <td className={`${td} whitespace-nowrap`}>
                    {fechaCorta(p.ventanaDesde)} → {fechaCorta(p.ventanaHasta)}
                  </td>
                  <td className={td}>
                    {p.anioDeSaldo} · tope {p.topeDiasPorPersona}
                  </td>
                  <td className={td}>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${CLASE_ESTADO_PLAN[p.estado]}`}>{TEXTO_ESTADO_PLAN[p.estado]}</span>
                  </td>
                  <td className={`${td} text-xs`}>
                    {p.contadores.total} · <span title="propuestos">{p.contadores.propuestos} prop.</span> · <span className="text-amber-700" title="esperando al coordinador">{p.contadores.enviados} env.</span> · <span className="text-green-700" title="aprobados">{p.contadores.aprobados} aprob.</span>
                    {p.contadores.rechazados > 0 && <span className="text-red-700"> · {p.contadores.rechazados} rech.</span>}
                    {p.contadores.reemplazos > 0 && <span className="text-violet-700"> · {p.contadores.reemplazos} reempl.</span>}
                  </td>
                  <td className={`${td} text-xs whitespace-nowrap`}>{new Date(p.updatedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalNuevoPlan
        isOpen={nuevo}
        onClose={() => setNuevo(false)}
        proyectos={proyectos}
        projectIdFijo={projectIdFijo || projectId || undefined}
        onListo={(p: PlanVacaciones) => {
          void cargar();
          abrir(p._id);
        }}
      />
    </div>
  );
};
