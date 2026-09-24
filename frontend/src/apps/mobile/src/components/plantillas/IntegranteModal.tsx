import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faRotateLeft, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../Modal";
import { SelectorHora } from "../../../../../components/contratacion/SelectorHora";
import { Integrante, Plantilla } from "../../../../../api/plantillasEquipo";
import { Project } from "../../../../../api/projects";
import { CatalogosContratacion } from "./useCatalogosContratacion";
import { CLASE_CAMPO, CLASE_HORA, Rotulo } from "./comun";

/*
  LO PROPIO DE UN INTEGRANTE: roles, categoría y, si hace falta, un horario, un importe o un comentario
  distintos a los del equipo. Vacío = usa el valor del equipo; «Volver al del equipo» lo vacía.

  El importe fijado a mano se guarda junto con la escala de ese momento (lo hace el server): si la
  escala cambia después, la contratación lo avisa en vez de pagar de más o de menos sin que se note.
*/
interface Props {
  isOpen: boolean;
  onClose: () => void;
  plantilla: Plantilla;
  proyecto: Project | null;
  integrante: Integrante | null;
  catalogos: CatalogosContratacion;
  onGuardar: (cambios: Record<string, any>) => Promise<void>;
}

export default function IntegranteModal({ isOpen, onClose, plantilla, proyecto, integrante, catalogos, onGuardar }: Props) {
  const [roles, setRoles] = useState<string[]>([]);
  const [categoriaSatId, setCategoriaSatId] = useState("");
  const [inTime, setInTime] = useState("");
  const [outTime, setOutTime] = useState("");
  const [importe, setImporte] = useState("");
  const [comentarios, setComentarios] = useState("");
  const [buscaRol, setBuscaRol] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen || !integrante) return;
    setRoles(integrante.rolesFrame || []);
    setCategoriaSatId(integrante.categoriaSatId || "");
    setInTime(integrante.inTime || "");
    setOutTime(integrante.outTime || "");
    setImporte(integrante.dailyRateManual ? String(integrante.dailyRateManual) : "");
    setComentarios(integrante.comentarios || "");
    setBuscaRol("");
    setError("");
  }, [isOpen, integrante]);

  const esServicios = plantilla.tipoImpositivo === "constancia_cuit";
  const categorias = useMemo(() => catalogos.categoriasPara(proyecto, plantilla.empresaContratoId, plantilla.convenioId, roles).documentos, [catalogos, proyecto, plantilla.empresaContratoId, plantilla.convenioId, roles]);
  const categoriaFueraDeLista = !!categoriaSatId && !categorias.some((c) => c._id === categoriaSatId);
  const rolesFiltrados = useMemo(() => {
    const q = buscaRol.trim().toLowerCase();
    return [...catalogos.roleFrames].filter((r) => !q || r.name.toLowerCase().includes(q)).sort((a, b) => Number(roles.includes(b._id)) - Number(roles.includes(a._id)) || a.name.localeCompare(b.name));
  }, [catalogos.roleFrames, buscaRol, roles]);

  if (!integrante) return null;

  const guardar = async () => {
    if (roles.length === 0) {
      setError("Elegí al menos un rol empresa.");
      return;
    }
    setGuardando(true);
    setError("");
    try {
      await onGuardar({ rolesFrame: roles, categoriaSatId: categoriaSatId || null, inTime: inTime || null, outTime: outTime || null, dailyRateManual: Number(importe) > 0 ? Number(importe) : null, comentarios: comentarios.trim() || null });
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error || "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  const volver = (onClick: () => void, visible: boolean) =>
    visible ? (
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
        <FontAwesomeIcon icon={faRotateLeft} className="h-2.5 w-2.5" />
        Volver al del equipo
      </button>
    ) : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={integrante.nombre || `Puesto: ${integrante.rolesFrame.map((r) => catalogos.roleFrames.find((x) => x._id === r)?.name).filter(Boolean).join(", ") || "sin rol"}`}
      subtitle={integrante.userId ? "Lo que tenga distinto al resto del equipo" : "Puesto sin asignar: la persona se elige después"}
      size="lg"
      zIndex={80}
      footer={
        <div className="flex w-full gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-slate-700 py-3 text-sm font-bold text-white">
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={guardando} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-50">
            {guardando && <FontAwesomeIcon icon={faSpinner} spin />}
            Guardar
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <Rotulo obligatorio>Rol/es empresa</Rotulo>
          <input value={buscaRol} onChange={(e) => setBuscaRol(e.target.value)} placeholder="Buscar rol…" className={`${CLASE_CAMPO} mb-2 h-10`} />
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-1.5 dark:border-slate-700">
            {rolesFiltrados.slice(0, 80).map((r) => (
              <label key={r._id} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${roles.includes(r._id) ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-300" : "text-slate-700 dark:text-slate-300"}`}>
                <input type="checkbox" checked={roles.includes(r._id)} onChange={() => setRoles((p) => (p.includes(r._id) ? p.filter((x) => x !== r._id) : [...p, r._id]))} className="h-4 w-4 rounded" />
                {r.name}
              </label>
            ))}
          </div>
        </div>

        {!esServicios && (
          <div>
            <Rotulo obligatorio>Categoría</Rotulo>
            <select value={categoriaSatId} onChange={(e) => setCategoriaSatId(e.target.value)} className={CLASE_CAMPO}>
              <option value="">Elegí la categoría…</option>
              {categoriaFueraDeLista && <option value={categoriaSatId}>{catalogos.categoriasSat.find((c) => c._id === categoriaSatId)?.name || "Categoría anterior"} (a completar: no es del convenio o del rol)</option>}
              {categorias.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
            {categorias.length === 0 && <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">Sus roles no tienen categorías en el convenio de la plantilla.</p>}
            {categoriaFueraDeLista && <p className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400">La categoría guardada ya no corresponde al convenio o a sus roles: elegí otra.</p>}
          </div>
        )}

        <div>
          <Rotulo accion={volver(() => { setInTime(""); setOutTime(""); }, !!(inTime || outTime))}>Horario propio</Rotulo>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <SelectorHora valor={inTime} onCambio={setInTime} etiqueta="Entrada" placeholder={plantilla.inTime || "Entrada"} className={CLASE_HORA} zIndex={120} />
            </div>
            <FontAwesomeIcon icon={faArrowRight} className="text-xs text-slate-400" />
            <div className="flex-1">
              <SelectorHora valor={outTime} onCambio={setOutTime} etiqueta="Salida" placeholder={plantilla.outTime || "Salida"} desde={inTime || plantilla.inTime} className={CLASE_HORA} zIndex={120} />
            </div>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Vacío = el del equipo ({plantilla.inTime || "—"} a {plantilla.outTime || "—"}).</p>
        </div>

        <div>
          <Rotulo obligatorio={esServicios} accion={volver(() => setImporte(""), !!importe)}>
            Importe por jornada {esServicios ? "" : "fijado a mano"}
          </Rotulo>
          <input type="number" inputMode="decimal" min={0} step="0.01" value={importe} onChange={(e) => setImporte(e.target.value)} placeholder={esServicios ? "Es un servicio: cargalo" : "Vacío = el de la escala de su categoría"} className={CLASE_CAMPO} />
          {!esServicios && <p className="mt-1 text-[11px] text-slate-400">Si la escala cambia después, al contratar se avisa.</p>}
        </div>

        <div>
          <Rotulo accion={volver(() => setComentarios(""), !!comentarios)}>Comentario propio</Rotulo>
          <textarea rows={2} value={comentarios} onChange={(e) => setComentarios(e.target.value)} placeholder={plantilla.comentarios || "Vacío = el del equipo"} className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
        </div>

        {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Modal>
  );
}
