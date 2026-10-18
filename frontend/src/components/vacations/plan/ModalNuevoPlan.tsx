import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faUsers } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../../ui/Modal";
import { sweetAlert } from "../../../utils/sweetAlert";
import { planVacacionesAPI, errorDe, type PlanVacaciones, type EquipoParaPlan } from "../../../api/planVacaciones";
import { mesesDeVentana } from "@compartido/planVacaciones/fechas";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Proyectos para elegir (si no viene `projectIdFijo`). */
  proyectos?: Array<{ _id: string; name: string }>;
  projectIdFijo?: string;
  /** Con un plan, el modal edita (nombre, ventana, tope, año de saldo). */
  plan?: PlanVacaciones | null;
  onListo: (plan: PlanVacaciones) => void;
}

const hoyISO = () => new Date().toISOString().slice(0, 10);

/**
 * NUEVO PLAN / EDITAR PLAN. La ventana es la temporada (p. ej. 1/12 → 31/3); el año de saldo es de
 * dónde se descuentan los días (por defecto el año en que empieza la ventana: la temporada 2026/27
 * gasta los días de 2026 aunque un bloque caiga en enero); el tope es el máximo por persona aunque le
 * correspondan más (pedido del 17/10/2026: 15). Al crear, muestra en vivo cuánta gente entra.
 */
export const ModalNuevoPlan: React.FC<Props> = ({ isOpen, onClose, proyectos = [], projectIdFijo, plan, onListo }) => {
  const editando = !!plan;
  const [projectId, setProjectId] = useState(projectIdFijo || plan?.projectId || "");
  const [nombre, setNombre] = useState(plan?.nombre || "");
  const [desde, setDesde] = useState(plan?.ventanaDesde || "");
  const [hasta, setHasta] = useState(plan?.ventanaHasta || "");
  const [anio, setAnio] = useState<number>(plan?.anioDeSaldo || new Date().getFullYear());
  const [anioTocado, setAnioTocado] = useState(editando);
  const [tope, setTope] = useState<number>(plan?.topeDiasPorPersona || 15);
  const [guardando, setGuardando] = useState(false);
  const [equipo, setEquipo] = useState<EquipoParaPlan | null | "cargando">(null);

  useEffect(() => {
    if (!isOpen) return;
    setProjectId(projectIdFijo || plan?.projectId || "");
    setNombre(plan?.nombre || "");
    setDesde(plan?.ventanaDesde || "");
    setHasta(plan?.ventanaHasta || "");
    setAnio(plan?.anioDeSaldo || new Date().getFullYear());
    setAnioTocado(!!plan);
    setTope(plan?.topeDiasPorPersona || 15);
    setEquipo(null);
  }, [isOpen, plan, projectIdFijo]);

  // El año de saldo sigue al inicio de la ventana mientras nadie lo toque a mano.
  useEffect(() => {
    if (!anioTocado && /^\d{4}-/.test(desde)) setAnio(Number(desde.slice(0, 4)));
  }, [desde, anioTocado]);

  const meses = useMemo(() => (desde && hasta ? mesesDeVentana(desde, hasta) : []), [desde, hasta]);
  const problema = !projectId ? "Elegí el proyecto." : !desde || !hasta ? "Completá la ventana." : hasta < desde ? "La fecha hasta es anterior a la desde." : meses.length > 12 ? "La ventana no puede pasar de 12 meses." : tope < 1 || tope > 60 ? "El tope tiene que estar entre 1 y 60." : "";

  // Vista previa del equipo (sólo al crear): cuánta gente entra y en cuántos grupos.
  useEffect(() => {
    if (!isOpen || editando || !projectId || !anio) return;
    let vivo = true;
    setEquipo("cargando");
    const t = setTimeout(() => {
      planVacacionesAPI
        .equipoParaPlan(projectId, anio)
        .then((e) => vivo && setEquipo(e))
        .catch(() => vivo && setEquipo(null));
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [isOpen, editando, projectId, anio]);

  const guardar = async () => {
    if (problema) return sweetAlert.warning("Falta algo", problema);
    setGuardando(true);
    try {
      const r = editando ? await planVacacionesAPI.actualizar(plan!._id, { nombre, ventanaDesde: desde, ventanaHasta: hasta, anioDeSaldo: anio, topeDiasPorPersona: tope }) : await planVacacionesAPI.crear({ projectId, nombre: nombre || undefined, ventanaDesde: desde, ventanaHasta: hasta, anioDeSaldo: anio, topeDiasPorPersona: tope });
      if (editando && r.quitados) sweetAlert.info("Ventana cambiada", `${r.quitados} bloque(s) quedaron fuera de la ventana nueva y se quitaron.`);
      onListo(r);
      onClose();
    } catch (err: any) {
      sweetAlert.error(editando ? "No se pudo guardar" : "No se pudo crear el plan", errorDe(err));
    } finally {
      setGuardando(false);
    }
  };

  const input = "input-field text-sm w-full";
  const label = "block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1";
  const aniosPosibles = useMemo(() => {
    const base = /^\d{4}-/.test(desde) ? Number(desde.slice(0, 4)) : new Date().getFullYear();
    return [base - 1, base, base + 1];
  }, [desde]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editando ? "Editar plan de vacaciones" : "Nuevo plan de vacaciones"}
      subtitle={editando ? "Sólo mientras el plan está en borrador." : "La temporada del equipo de un proyecto: después se reparte cada mes por área, turno y rol."}
      size="lg"
      zIndex={60}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={guardando || !!problema} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2">
            {guardando && <FontAwesomeIcon icon={faSpinner} spin />}
            {editando ? "Guardar" : "Crear plan"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {!projectIdFijo && !editando && (
          <div>
            <label className={label}>Proyecto</label>
            <select className={input} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Elegí un proyecto…</option>
              {proyectos.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className={label}>Nombre</label>
          <input className={input} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={desde ? `Temporada ${desde.slice(0, 4)}${hasta && hasta.slice(0, 4) !== desde.slice(0, 4) ? `/${hasta.slice(2, 4)}` : ""}` : "Temporada 2026/27"} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Desde</label>
            <input type="date" className={input} value={desde} min={editando ? undefined : hoyISO()} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <label className={label}>Hasta</label>
            <input type="date" className={input} value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
          </div>
        </div>
        {meses.length > 0 && <p className="text-xs text-gray-500">{meses.length} mes{meses.length === 1 ? "" : "es"} para repartir.</p>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Año de saldo</label>
            <select
              className={input}
              value={anio}
              onChange={(e) => {
                setAnio(Number(e.target.value));
                setAnioTocado(true);
              }}
            >
              {aniosPosibles.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-500 mt-1">De qué año se descuentan los días. La temporada que empieza en diciembre gasta los días de ese año, aunque el bloque caiga en enero.</p>
          </div>
          <div>
            <label className={label}>Tope de días por persona</label>
            <input type="number" min={1} max={60} className={input} value={tope} onChange={(e) => setTope(Number(e.target.value))} />
            <p className="text-[11px] text-gray-500 mt-1">Máximo por bloque aunque a la persona le correspondan más; el resto le queda para después.</p>
          </div>
        </div>
        {!editando && projectId && (
          <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-sm text-blue-800 dark:text-blue-200 flex items-start gap-2">
            <FontAwesomeIcon icon={equipo === "cargando" ? faSpinner : faUsers} spin={equipo === "cargando"} className="mt-0.5" />
            {equipo === "cargando" || !equipo ? (
              <span>Mirando el equipo del proyecto…</span>
            ) : (
              <span>
                Entran <strong>{equipo.equipo.length}</strong> persona{equipo.equipo.length === 1 ? "" : "s"} con contrato vigente en <strong>{equipo.grupos.length}</strong> grupo{equipo.grupos.length === 1 ? "" : "s"} (área › turno › rol).
                {equipo.sinGrupo.length > 0 && <> {equipo.sinGrupo.length} sin área ni turno asignado no entran: asignalos desde Jerarquía.</>}
              </span>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
