import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faMinus, faPen, faPeopleGroup, faPlus, faSearch, faSpinner, faTrash, faXmark } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { Modal } from "../components/ui/Modal";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { sweetAlert } from "../utils/sweetAlert";
import { Plantilla, PlantillaResumen, plantillasGeneralesAPI } from "../api/plantillasEquipo";
import { roleFrameAPI, RoleFrameItem } from "../api/roleFrames";
import { contratosAPI, ContratoItem } from "../api/contratos";
import { contratoFrameAPI, ContratoFrameItem } from "../api/contratosFrame";
import { infoAPI, InfoItem } from "../api/info";
import { tipoImpositivoDeContrato } from "../utils/tramiteImpositivo";

/*
  PLANTILLAS GENERALES DE EQUIPO (Contratación → Plantillas, escritorio).

  Son la ESTRUCTURA de un equipo que se repite en muchos proyectos: los puestos por rol empresa
  («1 director, 1 playout, 2 cámaras, 1 microfonista…») y, si se quiere, el tipo de contrato de cada
  puesto (cada persona contratada puede ir con uno distinto). No tienen
  proyecto, áreas, horarios ni personas, y no se contratan desde acá: cada supervisor, en el móvil, la
  «Usa» y queda una copia PROPIA en su proyecto, donde completa el área, el turno y el horario de cada
  puesto y arma sus equipos.
  Cambiar una general después no toca las copias ya hechas.
*/
const CAMPO = "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100";

interface Comunes {
  nombre: string;
  comentarios: string;
}
const vacio: Comunes = { nombre: "", comentarios: "" };

export const PlantillasGeneralesPage: React.FC = () => {
  const [lista, setLista] = useState<PlantillaResumen[] | null>(null);
  const [roles, setRoles] = useState<RoleFrameItem[]>([]);
  const [contratos, setContratos] = useState<ContratoItem[]>([]);
  const [contratoFrames, setContratoFrames] = useState<ContratoFrameItem[]>([]);
  const [estados, setEstados] = useState<InfoItem[]>([]);
  const [editando, setEditando] = useState<{ id: string | null } | null>(null);
  const [ayuda, setAyuda] = useState(false);

  const cargar = () => {
    setLista(null);
    plantillasGeneralesAPI
      .listar("")
      .then(setLista)
      .catch(() => setLista([]));
  };
  useEffect(() => {
    cargar();
    roleFrameAPI.list().then(setRoles).catch(() => undefined);
    contratosAPI
      .list()
      .then((cs) => setContratos(cs.filter((c) => c.isActive !== false)))
      .catch(() => undefined);
    contratoFrameAPI.list().then(setContratoFrames).catch(() => undefined);
    infoAPI.listByType("estado-empleado").then(setEstados).catch(() => undefined);
  }, []);

  const duplicar = async (p: PlantillaResumen) => {
    try {
      await plantillasGeneralesAPI.duplicar(p._id);
      cargar();
    } catch (e: any) {
      sweetAlert.error("No se pudo duplicar", e?.response?.data?.error || "Probá de nuevo.");
    }
  };
  const eliminar = async (p: PlantillaResumen) => {
    const r: any = await sweetAlert.confirm("¿Eliminar la plantilla general?", `«${p.nombre}» deja de ofrecerse en el móvil. Las copias que ya hicieron los supervisores no cambian.`, "Eliminar", "Cancelar");
    if (!(r === true || r?.isConfirmed)) return;
    try {
      await plantillasGeneralesAPI.borrar(p._id);
      cargar();
    } catch (e: any) {
      sweetAlert.error("No se pudo eliminar", e?.response?.data?.error || "Probá de nuevo.");
    }
  };

  return (
    <PageLayout
      title="Plantillas de equipo"
      subtitle="Generales: la estructura de un equipo por puestos, para que cada supervisor la copie en su proyecto."
      faIcon={{ icon: faPeopleGroup }}
      itemCount={lista?.length ?? 0}
      infoModal={{
        isOpen: ayuda,
        onOpen: () => setAyuda(true),
        onClose: () => setAyuda(false),
        title: "Plantillas de equipo",
        content: (
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <p>Una plantilla general es un equipo armado por puestos: «1 director, 1 playout, 2 cámaras, 1 microfonista…», con el tipo de contrato de cada puesto si se quiere fijar.</p>
            <p>No tiene proyecto ni personas. En el móvil, cada supervisor la ve en Contratación → Plantillas → Generales y con «Usar» se hace una copia propia en su proyecto, donde asigna a su gente, la empresa y el área y turno.</p>
            <p>Las plantillas de cada supervisor son personales: sólo las ve quien las creó.</p>
          </div>
        ),
      }}
      shouldShowInfo
    >
      <div className="space-y-3">
        <button type="button" onClick={() => setEditando({ id: null })} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          <FontAwesomeIcon icon={faPlus} />
          Nueva plantilla general
        </button>
        {lista === null ? (
          <LoadingSpinner />
        ) : lista.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-800">
            <FontAwesomeIcon icon={faPeopleGroup} className="mb-3 h-10 w-10 opacity-10" />
            <p className="text-sm font-medium">Todavía no hay plantillas generales</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {lista.map((p) => (
              <div key={p._id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-start justify-between gap-2">
                  <button type="button" onClick={() => setEditando({ id: p._id })} className="min-w-0 text-left">
                    <p className="truncate font-bold text-gray-900 dark:text-gray-100">{p.nombre}</p>
                    <p className="text-xs text-gray-500">
                      {p.puestos} {p.puestos === 1 ? "puesto" : "puestos"} · {p.nombreContrato || "Sin tipo de contrato"}
                    </p>
                  </button>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => setEditando({ id: p._id })} title="Editar" className="p-2 text-gray-400 hover:text-blue-600">
                      <FontAwesomeIcon icon={faPen} />
                    </button>
                    <button type="button" onClick={() => void duplicar(p)} title="Duplicar" className="p-2 text-gray-400 hover:text-blue-600">
                      <FontAwesomeIcon icon={faCopy} />
                    </button>
                    <button type="button" onClick={() => void eliminar(p)} title="Eliminar" className="p-2 text-gray-400 hover:text-red-500">
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editando && (
        <EditorGeneral
          id={editando.id}
          roles={roles}
          contratos={contratos}
          tramiteDe={(id) => tipoImpositivoDeContrato(id, contratoFrames, estados) || ""}
          onClose={() => setEditando(null)}
          onCambio={cargar}
        />
      )}
    </PageLayout>
  );
};

function EditorGeneral({ id, roles, contratos, tramiteDe, onClose, onCambio }: { id: string | null; roles: RoleFrameItem[]; contratos: ContratoItem[]; tramiteDe: (id: string) => string; onClose: () => void; onCambio: () => void }) {
  const [plantilla, setPlantilla] = useState<Plantilla | null>(null);
  const [c, setC] = useState<Comunes>(vacio);
  const [cargando, setCargando] = useState(!!id);
  const [guardando, setGuardando] = useState(false);
  const [busca, setBusca] = useState("");
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [contratoNuevos, setContratoNuevos] = useState("");

  const aplicar = (p: Plantilla) => {
    setPlantilla(p);
    setC({ nombre: p.nombre, comentarios: p.comentarios || "" });
  };
  useEffect(() => {
    if (!id) return;
    plantillasGeneralesAPI
      .obtener(id)
      .then(aplicar)
      .catch(() => sweetAlert.error("No se pudo abrir la plantilla"))
      .finally(() => setCargando(false));
  }, [id]);

  const nombreRol = useMemo(() => new Map(roles.map((r) => [r._id, r.name])), [roles]);
  const rolesFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? roles.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 30) : [];
  }, [roles, busca]);
  const totalNuevos = Object.values(cantidades).reduce((s, n) => s + n, 0);

  const datos = () => ({ nombre: c.nombre.trim(), comentarios: c.comentarios });
  /** El tipo de contrato de un puesto, con su nombre y su trámite (lo que guarda el server). `""` = lo elige cada supervisor. */
  const contratoPuesto = (contratoId: string) => ({ contratoId: contratoId || null, nombreContrato: contratos.find((x) => x._id === contratoId)?.name || null, tipoImpositivo: contratoId ? tramiteDe(contratoId) || null : null });

  /** Guarda los valores (creando la plantilla si es nueva) y devuelve su id. */
  const guardar = async (): Promise<string | null> => {
    if (!c.nombre.trim()) {
      sweetAlert.warning("Falta el nombre", "Poné un nombre a la plantilla (ej. «Estudio noticiero»).");
      return null;
    }
    setGuardando(true);
    try {
      const p = plantilla ? await plantillasGeneralesAPI.actualizar(plantilla._id, datos()) : await plantillasGeneralesAPI.crear(datos());
      aplicar(p);
      onCambio();
      return p._id;
    } catch (e: any) {
      sweetAlert.error("No se pudo guardar", e?.response?.data?.error || "Probá de nuevo.");
      return null;
    } finally {
      setGuardando(false);
    }
  };

  const agregarPuestos = async () => {
    const pid = await guardar();
    if (!pid) return;
    try {
      const orden = Object.keys(cantidades);
      aplicar(await plantillasGeneralesAPI.agregarPuestos(pid, orden.map((rolId) => ({ rolesFrame: [rolId], cantidad: cantidades[rolId], ...contratoPuesto(contratoNuevos) }))));
      setCantidades({});
      setBusca("");
      onCambio();
    } catch (e: any) {
      sweetAlert.error("No se pudieron agregar", e?.response?.data?.error || "Probá de nuevo.");
    }
  };
  const cambiarContrato = async (integranteId: string, contratoId: string) => {
    if (!plantilla) return;
    try {
      aplicar(await plantillasGeneralesAPI.actualizarPuesto(plantilla._id, integranteId, contratoPuesto(contratoId)));
      onCambio();
    } catch (e: any) {
      sweetAlert.error("No se pudo cambiar", e?.response?.data?.error || "Probá de nuevo.");
    }
  };
  const quitarPuesto = async (integranteId: string) => {
    if (!plantilla) return;
    try {
      aplicar(await plantillasGeneralesAPI.quitarPuesto(plantilla._id, integranteId));
      onCambio();
    } catch (e: any) {
      sweetAlert.error("No se pudo quitar", e?.response?.data?.error || "Probá de nuevo.");
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={plantilla ? plantilla.nombre : "Nueva plantilla general"}
      subtitle="Puestos por rol. Sin proyecto, áreas, horarios ni personas: eso lo completa cada supervisor en su copia."
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cerrar
          </button>
          <button type="button" onClick={() => void guardar()} disabled={guardando} className="btn-primary inline-flex items-center gap-2">
            {guardando && <FontAwesomeIcon icon={faSpinner} spin />}
            {plantilla ? "Guardar cambios" : "Crear"}
          </button>
        </>
      }
    >
      {cargando ? (
        <LoadingSpinner />
      ) : (
        <div className="space-y-5">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">Nombre *</label>
            <input value={c.nombre} onChange={(e) => setC({ ...c, nombre: e.target.value })} placeholder="Ej. Estudio noticiero" className={CAMPO} maxLength={120} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">Comentario</label>
            <textarea rows={2} value={c.comentarios} onChange={(e) => setC({ ...c, comentarios: e.target.value })} className={CAMPO} placeholder="Opcional: va en cada solicitud" />
          </div>

          <div className="space-y-2 border-t border-gray-100 pt-4 dark:border-gray-800">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Puestos {plantilla ? `(${plantilla.integrantes.length})` : ""}</p>
            {plantilla?.integrantes.length ? (
              <ol className="space-y-1">
                {plantilla.integrantes.map((i, n) => (
                  <li key={i._id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-gray-800">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="mr-2 text-xs font-bold text-gray-400">{n + 1}.</span>
                      {i.rolesFrame.map((r) => nombreRol.get(r) || "Rol").join(", ")}
                    </span>
                    <select value={i.contratoId || ""} onChange={(e) => void cambiarContrato(i._id, e.target.value)} aria-label={`Tipo de contrato del puesto ${n + 1}`} className="w-48 shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                      <option value="">Contrato: lo elige el supervisor</option>
                      {contratos.map((x) => (
                        <option key={x._id} value={x._id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => void quitarPuesto(i._id)} title="Quitar el puesto" className="p-1 text-gray-400 hover:text-red-500">
                      <FontAwesomeIcon icon={faXmark} />
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-gray-500">Todavía no hay puestos. Buscá cada rol y elegí cuántos.</p>
            )}

            <div className="rounded-lg border border-dashed border-gray-300 p-3 dark:border-gray-700">
              <div className="relative">
                <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Agregar puestos: buscá el rol (Director, Cámara, Microfonista…)" className={`${CAMPO} pl-9`} />
              </div>
              {rolesFiltrados.length > 0 && (
                <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                  {rolesFiltrados.map((r) => {
                    const n = cantidades[r._id] || 0;
                    const cambiar = (d: number) =>
                      setCantidades((p) => {
                        const v = Math.max(0, Math.min(20, n + d));
                        const x = { ...p };
                        if (v) x[r._id] = v;
                        else delete x[r._id];
                        return x;
                      });
                    return (
                      <div key={r._id} className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm ${n ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}>
                        <span className="text-gray-800 dark:text-gray-200">{r.name}</span>
                        <span className="flex items-center gap-1">
                          <button type="button" onClick={() => cambiar(-1)} disabled={!n} className="h-7 w-7 rounded border border-gray-200 text-gray-500 disabled:opacity-30 dark:border-gray-700">
                            <FontAwesomeIcon icon={faMinus} className="h-3 w-3" />
                          </button>
                          <span className="w-6 text-center font-bold">{n}</span>
                          <button type="button" onClick={() => cambiar(1)} className="h-7 w-7 rounded bg-blue-600 text-white">
                            <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {totalNuevos > 0 && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <select value={contratoNuevos} onChange={(e) => setContratoNuevos(e.target.value)} aria-label="Tipo de contrato de los puestos nuevos" className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                    <option value="">Contrato: lo elige el supervisor</option>
                    {contratos.map((x) => (
                      <option key={x._id} value={x._id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                  <span className="flex-1 text-xs text-gray-600 dark:text-gray-300">{Object.entries(cantidades).map(([id, n]) => `${n} ${nombreRol.get(id)}`).join(", ")}</span>
                  <button type="button" onClick={() => void agregarPuestos()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">
                    Agregar {totalNuevos} {totalNuevos === 1 ? "puesto" : "puestos"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default PlantillasGeneralesPage;
