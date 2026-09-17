import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBuilding, faCalendarAlt, faLayerGroup, faMapMarkerAlt, faUserShield, faWallet } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "./Modal";
import { Project } from "../../../../api/projects";
import { companiesAPI, Company } from "../../../../api/companies";
import { nombreCentroCosto } from "../../../../utils/centroCosto";

/**
 * ═══════════════════════════════════════════════════════════════════════
 * LA FICHA DEL PROYECTO, EN SÓLO LECTURA
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Lo mismo que «Detalles del Proyecto» del escritorio, para quien coordina desde el celular: de qué
 * cliente es, quién lo coordina, en qué sede, con qué centro de costo y bajo qué empresas se contrata.
 * Son los datos que hay que tener a mano cuando alguien pregunta por el proyecto y no se está frente
 * a una computadora.
 *
 * Las EMPRESAS se piden recién al abrir: el proyecto guarda ids y resolverlos cuesta una consulta que
 * no tiene sentido hacer para mirar la jerarquía. Si falla, esas dos filas no se muestran; el resto sí.
 */

interface Props {
  isOpen: boolean;
  onClose: () => void;
  proyecto: Project | null;
  /** Ya resuelto por la pantalla: es el mismo que se muestra arriba de las áreas. */
  supervisorNombre: string;
  /** Las áreas del proyecto con sus turnos, con los nombres ya resueltos. */
  areas: { nombre: string; turnos: string[] }[];
  /**
   * Lo que la persona tiene EN ESTE proyecto (su contrato, su área y turno, lo que supervisa).
   *
   * Lo arma la pantalla porque depende de quién mira, y va arriba de los datos del proyecto: quien
   * abre la ficha de un proyecto en el que trabaja busca primero lo suyo. Sin nada que decir —un
   * proyecto donde no tiene nada— no se pasa y la ficha queda igual que antes.
   */
  asignacion?: React.ReactNode;
}

const ESTADOS: Record<string, { label: string; cls: string }> = {
  active: { label: "Activo", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  completed: { label: "Terminado", cls: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
  on_hold: { label: "En pausa", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  archived: { label: "Archivado", cls: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
};

const Dato = ({ icono, label, children }: { icono: any; label: string; children: React.ReactNode }) => (
  <div className="border-b border-slate-100 py-2.5 last:border-0 dark:border-slate-800">
    <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
      <FontAwesomeIcon icon={icono} className="h-2.5 w-2.5" />
      {label}
    </p>
    <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{children}</div>
  </div>
);

const chips = (valores: string[], clase: string) => (
  <div className="flex flex-wrap gap-1.5">
    {valores.map((v, i) => (
      <span key={i} className={`inline-flex items-center rounded-lg px-2 py-1 text-[11px] font-bold ${clase}`}>
        {v}
      </span>
    ))}
  </div>
);

export default function ProyectoInfoModal({ isOpen, onClose, proyecto, supervisorNombre, areas, asignacion }: Props) {
  const [empresas, setEmpresas] = useState<Company[] | null>(null);

  useEffect(() => {
    if (!isOpen || empresas) return;
    let cancelado = false;
    companiesAPI
      .list()
      .then((cs) => !cancelado && setEmpresas(cs))
      .catch(() => !cancelado && setEmpresas([]));
    return () => {
      cancelado = true;
    };
  }, [isOpen, empresas]);

  if (!proyecto) return null;

  const cliente = typeof proyecto.clientId === "object" ? proyecto.clientId?.name || "" : "";
  const estado = ESTADOS[proyecto.status] || ESTADOS.active;
  const meta: any = proyecto.metadata || {};
  const sede = proyecto.metadataResolutions?.sede?.name || proyecto.metadataResolutions?.sede?.data?.nombre || (meta.sedeId ? `ID: ${meta.sedeId}` : "");
  // Sin el catálogo de centros (no se carga en el móvil): lo que resolvió el server, o su id.
  const centroCosto = nombreCentroCosto(proyecto as any);
  const fechaAlta = meta.fechaAlta ? new Date(meta.fechaAlta).toLocaleDateString("es-AR") : "";
  const nombreEmpresa = (id: string) => empresas?.find((e) => String(e._id) === String(id))?.razonSocial || "";
  const contrato = (proyecto.contratoEmpresas || []).map(nombreEmpresa).filter(Boolean);
  const release = (proyecto.releaseEmpresas || []).map(nombreEmpresa).filter(Boolean);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={proyecto.name} subtitle={cliente ? `Cliente: ${cliente}` : undefined} size="md" zIndex={90}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${estado.cls}`}>{estado.label}</span>
          {cliente && <span className="rounded bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">{cliente}</span>}
        </div>

        {asignacion}

        {proyecto.description && <p className="rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">{proyecto.description}</p>}

        <div className="rounded-xl border border-slate-200 px-3 dark:border-slate-700">
          <Dato icono={faUserShield} label="Coordinador del proyecto">
            {supervisorNombre || <span className="font-normal italic text-slate-400">Sin responsable asignado</span>}
          </Dato>
          <Dato icono={faMapMarkerAlt} label="Sede / Ubicación">{sede ? chips([sede], "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400") : "—"}</Dato>
          <Dato icono={faWallet} label="Centro de costo">{centroCosto ? chips([centroCosto], "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400") : "—"}</Dato>
          <Dato icono={faCalendarAlt} label="Fecha de alta">{fechaAlta || "—"}</Dato>
          {/* Mientras cargan las empresas no se dice «—»: sería afirmar que no tiene. */}
          <Dato icono={faBuilding} label="Empresa del contrato">{empresas === null ? <span className="font-normal text-slate-400">Cargando…</span> : contrato.length ? chips(contrato, "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400") : "—"}</Dato>
          <Dato icono={faBuilding} label="Empresa del release">{empresas === null ? <span className="font-normal text-slate-400">Cargando…</span> : release.length ? chips(release, "bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-400") : "—"}</Dato>
        </div>

        {/* Las áreas del proyecto ENTERAS, no sólo las que uno tiene a cargo: es la ficha del proyecto. */}
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
            <FontAwesomeIcon icon={faLayerGroup} className="h-2.5 w-2.5" />
            Áreas y turnos ({areas.length})
          </p>
          {areas.length === 0 ? (
            <p className="text-xs italic text-slate-400">El proyecto no tiene áreas configuradas.</p>
          ) : (
            <div className="space-y-2">
              {areas.map((a) => (
                <div key={a.nombre} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-900 dark:text-slate-100">{a.nombre}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {a.turnos.length === 0 ? (
                      <span className="text-[11px] italic text-slate-400">Sin turnos</span>
                    ) : (
                      a.turnos.map((t) => (
                        <span key={t} className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                          {t}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
