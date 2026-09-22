import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRankingStar, faTriangleExclamation, faRotateLeft, faUsers } from "@fortawesome/free-solid-svg-icons";
import { Card } from "../ui/Card";
import { Modal } from "../ui/Modal";
import { projectsAPI, Project, ContratosDesalineados } from "../../api/projects";
import { sweetAlert } from "../../utils/sweetAlert";
import { formatearFechaCalendario } from "../../utils/fechas";
import { ChipValoracion, idValoracionDe, useValoraciones, useValoracionDelProyecto } from "./ChipValoracion";

/**
 * LA VALORACIÓN DEL PROYECTO, A LA VISTA.
 *
 * Estaba escondida: el margen se cargaba desde «Editar» —en medio de áreas, turnos y vacaciones— y
 * el nivel resultante sólo se veía abriendo la tarjeta de información. Para algo que decide qué
 * categorías se ofrecen al contratar, o sea cuánto cobra la gente, era demasiado fondo.
 *
 * Tarjeta propia en la ficha, con el nivel y cuántos contratos quedaron desalineados; adentro, el
 * margen, la fijación a mano y la lista de desalineados.
 *
 * La valoración la RESUELVE EL SERVER (`resolverValoracion`, en `server/src/utils`). Acá no se
 * calcula nada: se manda el margen y se muestra lo que el server guardó. Una segunda copia de la
 * regla en el front terminaría diciendo algo distinto el día que cambien los rangos.
 */

/** Filtra al escribir y normaliza la coma: «12,5» es como se escribe un decimal acá. */
const soloDecimal = (v: string) => {
  const crudo = v.replace(",", ".").replace(/(?!^-)[^0-9.]/g, "");
  const partes = crudo.split(".");
  return partes.length > 2 ? `${partes[0]}.${partes.slice(1).join("")}` : crudo;
};

export const ValoracionProyecto: React.FC<{ project: Project; onGuardado: () => void | Promise<void> }> = ({ project, onGuardado }) => {
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const valoraciones = useValoraciones();
  const [desalineados, setDesalineados] = useState<ContratosDesalineados | null>(null);
  const [guardando, setGuardando] = useState(false);

  // El formulario arranca con lo guardado, como texto: el vacío tiene que poder viajar como `null`.
  const [margen, setMargen] = useState("");
  const [presupuesto, setPresupuesto] = useState("");

  /*
    Los desalineados se piden al montar y no al abrir: el número va en la TARJETA, que es donde tiene
    que verse que hay algo para revisar. Si sólo se contara adentro del modal, nadie lo abriría.
  */
  const cargarDesalineados = async () => {
    try {
      setDesalineados(await projectsAPI.contratosDesalineados(project._id));
    } catch {
      setDesalineados(null);
    }
  };
  // Se recarga cuando cambia la valoración: es lo que mueve qué contratos quedan desalineados.
  const valoracionActualId = idValoracionDe(project.valoracionId);
  useEffect(() => {
    void cargarDesalineados();
  }, [project._id, valoracionActualId]);

  const abrir = () => {
    setMargen(project.margen == null ? "" : String(project.margen));
    setPresupuesto(project.presupuesto == null ? "" : String(project.presupuesto));
    setAbierto(true);
  };

  const actual = useValoracionDelProyecto(project, valoraciones);

  /* Sólo las activas para FIJAR: una apagada no se ofrece en altas nuevas, así que elegirla a mano
     sería contradecir esa decisión. La que ya tiene el proyecto se muestra aunque esté apagada. */
  const elegibles = valoraciones.filter((v) => v.activo !== false || v._id === actual?.id);

  const guardar = async (cambios: Parameters<typeof projectsAPI.updateProject>[1], ok: string) => {
    setGuardando(true);
    try {
      await projectsAPI.updateProject(project._id, cambios);
      await onGuardado();
      sweetAlert.success("Listo", ok);
    } catch (e) {
      const delServer = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      sweetAlert.error("No se pudo guardar", delServer || "Intentá de nuevo en un momento.");
    } finally {
      setGuardando(false);
    }
  };

  const guardarMargen = () =>
    guardar(
      {
        margen: margen.trim() === "" ? null : Number(margen),
        presupuesto: presupuesto.trim() === "" ? null : Number(presupuesto),
      },
      project.valoracionManual ? "Se guardó el margen. La valoración sigue fijada a mano." : "Se guardó el margen y se recalculó la valoración.",
    );

  const fijar = (valoracionId: string) => guardar({ valoracionId }, "La valoración quedó fijada a mano: cambiar el margen no la va a mover.");
  const volverAlAutomatico = () => guardar({ valoracionManual: false }, "La valoración vuelve a calcularse según el margen.");

  const pendientes = (desalineados?.total || 0) - (desalineados?.conOverride || 0);

  return (
    <>
      <Card
        onClick={abrir}
        className="cursor-pointer hover:scale-[1.02] hover:shadow-lg transition-all duration-300"
        header={{
          title: "Valoración del Proyecto",
          subtitle: "Define qué categorías se ofrecen al contratar",
          icon: faRankingStar,
        }}
        footer={{
          leftContent: (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {actual ? <ChipValoracion nombre={actual.nombre} color={actual.color} manual={project.valoracionManual} /> : <span className="text-gray-400 dark:text-gray-500">Sin valorar</span>}
              <span className="text-gray-500 dark:text-gray-400">{project.margen == null ? "sin margen cargado" : `${project.margen}% de margen`}</span>
              {pendientes > 0 && (
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                  <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
                  {pendientes} contrato{pendientes === 1 ? "" : "s"} desalineado{pendientes === 1 ? "" : "s"}
                </span>
              )}
            </div>
          ),
        }}
      />

      {abierto && (
        <Modal isOpen onClose={() => setAbierto(false)} title="Valoración del proyecto" subtitle={project.name} size="lg" zIndex={90}>
          <div className="space-y-5">
            {/* ── EL MARGEN ── */}
            <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Nivel actual</span>
                {actual ? <ChipValoracion nombre={actual.nombre} color={actual.color} manual={project.valoracionManual} /> : <span className="text-sm text-gray-400">Sin valorar</span>}
                <span className="text-[11px] text-gray-500 dark:text-gray-400">{project.valoracionManual ? "Fijada a mano: el margen no la mueve." : "Calculada según el margen."}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Margen (%)</label>
                  <input type="text" inputMode="decimal" value={margen} onChange={(e) => setMargen(soloDecimal(e.target.value))} placeholder="Sin margen cargado" className="input-field" />
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">Es lo que define el nivel. Por ahora se carga a mano; más adelante lo va a traer el presupuestador.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Presupuesto</label>
                  <input type="text" inputMode="numeric" value={presupuesto} onChange={(e) => setPresupuesto(e.target.value.replace(/\D/g, ""))} placeholder="Sin presupuesto" className="input-field" />
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">Contexto: NO define el nivel.</p>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <button type="button" onClick={guardarMargen} disabled={guardando} className="btn-primary">
                  Guardar margen
                </button>
              </div>
            </section>

            {/* ── FIJAR A MANO ── */}
            <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Fijar a mano</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
                Para cuando el nivel no sale del margen —un acuerdo comercial puntual—. Queda fijado: cambiar el margen después no lo mueve, hasta que se vuelva al cálculo automático.
              </p>
              {elegibles.length === 0 ? (
                <p className="text-sm text-gray-400">No hay valoraciones cargadas. Se crean en Configuración → Valoraciones.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {elegibles.map((v) => {
                    const esActual = v._id === actual?.id;
                    return (
                      <button
                        key={v._id}
                        type="button"
                        disabled={guardando || (esActual && !!project.valoracionManual)}
                        onClick={() => fijar(v._id)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-60 ${esActual ? "ring-2 ring-blue-500/40" : "hover:bg-gray-50 dark:hover:bg-gray-800"}`}
                        style={v.color ? { color: String(v.color), borderColor: String(v.color) } : undefined}
                      >
                        {String(v.name)}
                      </button>
                    );
                  })}
                </div>
              )}
              {project.valoracionManual && (
                <button type="button" onClick={volverAlAutomatico} disabled={guardando} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400">
                  <FontAwesomeIcon icon={faRotateLeft} className="h-3 w-3" />
                  Volver al cálculo automático
                </button>
              )}
            </section>

            {/* ── DESALINEADOS ── */}
            <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between gap-3 mb-1">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Contratos desalineados</p>
                <button type="button" onClick={() => navigate(`/projects/${project._id}/team`)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400">
                  <FontAwesomeIcon icon={faUsers} className="h-3 w-3" />
                  Ir al equipo
                </button>
              </div>
              {/*
                Se LISTAN y no se corrigen solos: un contrato ya firmado tiene una categoría y un sueldo
                que alguien pactó. Reescribirlo porque cambió el margen le movería la plata a gente ya
                contratada, que es el peor resultado posible de una corrección de presupuesto.
              */}
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
                Contratos cuya categoría es de otra valoración que la del proyecto. No se corrigen solos — cambiarían el sueldo de gente ya contratada —: se revisan uno por uno.
              </p>

              {!desalineados ? (
                <p className="text-sm text-gray-400">No se pudo consultar.</p>
              ) : desalineados.sinValorar ? (
                <p className="text-sm text-gray-400">El proyecto no está valorado: no hay contra qué comparar.</p>
              ) : desalineados.contratos.length === 0 ? (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">Todos los contratos están alineados con la valoración del proyecto.</p>
              ) : (
                <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase">Persona</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase">Función · Categoría</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase">Contrato</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase">Proyecto</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase">Vigencia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {desalineados.contratos.map((c) => (
                        <tr key={`${c.userProjectId}-${c.contratoIndex}`} className={c.conOverride ? "opacity-70" : ""}>
                          <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">{c.persona || "—"}</td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                            {c.funcion || "—"} · {c.categoria || "—"}
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-semibold text-gray-800 dark:text-gray-100">{c.valoracionContrato || "—"}</span>
                            {/* El salteo con motivo no es un problema: es una decisión auditada. */}
                            {c.conOverride && (
                              <span className="block text-[10px] text-gray-500 dark:text-gray-400" title={c.motivoOverride || ""}>
                                elegida a mano: {c.motivoOverride}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{c.valoracionProyecto || "—"}</td>
                          <td className="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {formatearFechaCalendario(c.desde)}
                            {c.hasta ? ` → ${formatearFechaCalendario(c.hasta)}` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </Modal>
      )}
    </>
  );
};
