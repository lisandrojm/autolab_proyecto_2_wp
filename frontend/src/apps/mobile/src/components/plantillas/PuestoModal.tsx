import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../Modal";
import { SelectorHora } from "../../../../../components/contratacion/SelectorHora";
import { NuevoPuesto, Plantilla, Puesto } from "../../../../../api/plantillasEquipo";
import { Project } from "../../../../../api/projects";
import { CatalogosContratacion, OpcionAreaTurno } from "./useCatalogosContratacion";
import { CLASE_CAMPO, CLASE_HORA, DIAS, Rotulo } from "./comun";
import { ChipValoracion } from "../../../../../components/proyectos/ChipValoracion";

/*
  UN PUESTO, uno por uno: su rol, su TIPO DE CONTRATO (cada persona contratada puede ir con uno
  distinto: uno por jornada, otro a plazo fijo, otro de servicios), su ÁREA Y TURNO, su HORARIO y sus DÍAS (al elegir el turno se
  completan con los del turno, y se pueden cambiar), su categoría y, si hace falta, un importe fijado a
  mano y un comentario. Quién lo ocupa se elige en los equipos, no acá.

  LA CATEGORÍA viene por defecto la del nivel del proyecto (proyecto Plata → la Plata de su función),
  con la misma regla del alta individual. Se puede cambiar por una de otra valoración.

  El importe fijado se guarda con la escala de ese momento (lo hace el server): si la escala cambia
  después, la contratación lo avisa en vez de pagar de más o de menos sin que se note.
*/
interface Props {
  isOpen: boolean;
  onClose: () => void;
  plantilla: Plantilla;
  proyecto: Project | null;
  puesto: Puesto | null;
  numero: number;
  areas: OpcionAreaTurno[] | null;
  catalogos: CatalogosContratacion;
  /** Sin proyecto (plantilla general): no hay áreas ni categorías que elegir. */
  general?: boolean;
  onGuardar: (cambios: NuevoPuesto) => Promise<void>;
}

export default function PuestoModal({ isOpen, onClose, plantilla, proyecto, puesto, numero, areas, catalogos, general, onGuardar }: Props) {
  const [roles, setRoles] = useState<string[]>([]);
  const [contratoId, setContratoId] = useState("");
  const [turno, setTurno] = useState("");
  const [inTime, setInTime] = useState("");
  const [outTime, setOutTime] = useState("");
  const [dias, setDias] = useState<number[]>([]);
  const [rotativos, setRotativos] = useState(false);
  const [porSemana, setPorSemana] = useState("");
  const [categoriaSatId, setCategoriaSatId] = useState("");
  const [otrasValoraciones, setOtrasValoraciones] = useState(false);
  const [importe, setImporte] = useState("");
  const [comentarios, setComentarios] = useState("");
  const [buscaRol, setBuscaRol] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen || !puesto) return;
    setRoles(puesto.rolesFrame || []);
    setContratoId(puesto.contratoId || "");
    setTurno(puesto.areaId && puesto.shiftId ? `${puesto.areaId}::${puesto.shiftId}` : "");
    setInTime(puesto.inTime || "");
    setOutTime(puesto.outTime || "");
    setDias(puesto.diasSemana || []);
    setRotativos(!!puesto.diasRotativos);
    setPorSemana(puesto.diasPorSemana ? String(puesto.diasPorSemana) : "");
    setCategoriaSatId(puesto.categoriaSatId || "");
    setOtrasValoraciones(false);
    setImporte(puesto.dailyRateManual ? String(puesto.dailyRateManual) : "");
    setComentarios(puesto.comentarios || "");
    setBuscaRol("");
    setError("");
  }, [isOpen, puesto]);

  const tramite = contratoId ? catalogos.tramitePorContrato.get(contratoId) || "" : "";
  const esServicios = tramite === "constancia_cuit";
  const porDiasSueltos = (catalogos.contratos.find((c) => c._id === contratoId) as any)?.data?.modoFechas === "dias";
  const ofrecidas = useMemo(() => (general ? null : catalogos.categoriasPara(proyecto, plantilla.empresaContratoId, plantilla.convenioId, roles, false, otrasValoraciones)), [general, catalogos, proyecto, plantilla.empresaContratoId, plantilla.convenioId, roles, otrasValoraciones]);
  const categorias = ofrecidas?.documentos || [];
  const categoriaFueraDeLista = !!categoriaSatId && !categorias.some((c) => c._id === categoriaSatId);
  const valoracion = catalogos.valoracionDe(proyecto);
  const porDefecto = general ? "" : catalogos.categoriaPorDefectoPara(proyecto, plantilla.empresaContratoId, plantilla.convenioId, roles);

  // Sin categoría elegida, viene la del nivel del proyecto (también al cambiar los roles). Nunca pisa una elegida.
  useEffect(() => {
    if (!isOpen || categoriaSatId || !porDefecto) return;
    setCategoriaSatId(porDefecto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, porDefecto]);
  const rolesFiltrados = useMemo(() => {
    const q = buscaRol.trim().toLowerCase();
    return [...catalogos.roleFrames].filter((r) => !q || r.name.toLowerCase().includes(q)).sort((a, b) => Number(roles.includes(b._id)) - Number(roles.includes(a._id)) || a.name.localeCompare(b.name));
  }, [catalogos.roleFrames, buscaRol, roles]);
  const areasAgrupadas = useMemo(() => {
    const m = new Map<string, { nombre: string; turnos: OpcionAreaTurno[] }>();
    for (const o of areas || []) {
      const g = m.get(o.areaId) || { nombre: o.areaNombre, turnos: [] };
      g.turnos.push(o);
      m.set(o.areaId, g);
    }
    return [...m.entries()];
  }, [areas]);

  if (!puesto) return null;

  // Elegir el turno trae su horario y sus días: es lo normal, y se cambian si este puesto es distinto.
  const elegirTurno = (valor: string) => {
    setTurno(valor);
    const [areaId, shiftId] = valor.split("::");
    const t = (areas || []).find((o) => o.areaId === areaId && o.shiftId === shiftId);
    if (!t) return;
    if (t.inicio) setInTime(t.inicio);
    if (t.fin) setOutTime(t.fin);
    if (t.dias.length) {
      setDias(t.dias);
      setPorSemana(String(t.dias.length));
    }
  };

  const guardar = async () => {
    if (roles.length === 0) {
      setError("Elegí al menos un rol empresa.");
      return;
    }
    if (!contratoId && catalogos.contratos.length > 0) {
      setError("Elegí el tipo de contrato.");
      return;
    }
    const [areaId, shiftId] = turno ? turno.split("::") : [null, null];
    setGuardando(true);
    setError("");
    try {
      await onGuardar({
        rolesFrame: roles,
        contratoId: contratoId || null,
        nombreContrato: catalogos.contratos.find((c) => c._id === contratoId)?.name || null,
        tipoImpositivo: tramite || null,
        ...(general ? {} : { areaId, shiftId }),
        inTime: inTime || null,
        outTime: outTime || null,
        diasSemana: dias,
        diasRotativos: rotativos,
        diasPorSemana: rotativos ? Number(porSemana) || null : dias.length || null,
        categoriaSatId: categoriaSatId || null,
        dailyRateManual: Number(importe) > 0 ? Number(importe) : null,
        comentarios: comentarios.trim() || null,
      });
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error || "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Puesto ${numero}`}
      subtitle={roles.map((r) => catalogos.roleFrames.find((x) => x._id === r)?.name).filter(Boolean).join(", ") || "Sin rol"}
      size="lg"
      zIndex={80}
      footer={
        <div className="flex w-full gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-slate-700 py-3 text-sm font-bold text-white">
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={guardando} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-50">
            {guardando && <FontAwesomeIcon icon={faSpinner} spin />}
            Guardar puesto
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <Rotulo obligatorio>Rol/es empresa</Rotulo>
          <input value={buscaRol} onChange={(e) => setBuscaRol(e.target.value)} placeholder="Buscar rol…" className={`${CLASE_CAMPO} mb-2 h-10`} />
          <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-1.5 dark:border-slate-700">
            {rolesFiltrados.slice(0, 80).map((r) => (
              <label key={r._id} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${roles.includes(r._id) ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-300" : "text-slate-700 dark:text-slate-300"}`}>
                <input type="checkbox" checked={roles.includes(r._id)} onChange={() => setRoles((p) => (p.includes(r._id) ? p.filter((x) => x !== r._id) : [...p, r._id]))} className="h-4 w-4 rounded" />
                {r.name}
              </label>
            ))}
          </div>
        </div>

        <div>
          <Rotulo obligatorio>Tipo de contrato</Rotulo>
          <select value={contratoId} onChange={(e) => setContratoId(e.target.value)} className={CLASE_CAMPO}>
            <option value="">Elegí el tipo de contrato…</option>
            {contratoId && !catalogos.contratos.some((c) => c._id === contratoId) && <option value={contratoId}>{puesto.nombreContrato || "Contrato anterior"} (ya no existe)</option>}
            {catalogos.contratos.map((x) => (
              <option key={x._id} value={x._id}>
                {x.name} {catalogos.tramitePorContrato.get(x._id) === "constancia_cuit" ? "· PEDIDO DE SERVICIOS" : catalogos.tramitePorContrato.get(x._id) ? "· PEDIDO DE ARCA" : ""}
              </option>
            ))}
          </select>
        </div>

        {!general && (
          <div>
            <Rotulo obligatorio>Área y turno</Rotulo>
            {areas === null ? (
              <div className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            ) : (
              <select value={turno} onChange={(e) => elegirTurno(e.target.value)} className={CLASE_CAMPO}>
                <option value="">Elegí el área y el turno…</option>
                {areasAgrupadas.map(([areaId, g]) => (
                  <optgroup key={areaId} label={g.nombre}>
                    {g.turnos.map((t) => (
                      <option key={t.shiftId} value={`${t.areaId}::${t.shiftId}`}>
                        {t.turnoNombre} {t.inicio && t.fin ? `· ${t.inicio} a ${t.fin}` : ""} {t.diasTexto ? `· ${t.diasTexto}` : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
          </div>
        )}

        <div>
          <Rotulo obligatorio={!general}>Horario (entrada - salida)</Rotulo>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <SelectorHora valor={inTime} onCambio={setInTime} etiqueta="Entrada" placeholder="Entrada" className={CLASE_HORA} zIndex={120} />
            </div>
            <FontAwesomeIcon icon={faArrowRight} className="text-xs text-slate-400" />
            <div className="flex-1">
              <SelectorHora valor={outTime} onCambio={setOutTime} etiqueta="Salida" placeholder="Salida" desde={inTime} className={CLASE_HORA} zIndex={120} />
            </div>
          </div>
          {!general && <p className="mt-1 text-[11px] text-slate-400">Sale del turno; cambialo si este puesto entra o sale a otra hora.</p>}
        </div>

        {!porDiasSueltos && (
          <div>
            <Rotulo
              accion={
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  Días rotativos
                  <input type="checkbox" checked={rotativos} onChange={(e) => setRotativos(e.target.checked)} className="h-4 w-4" />
                </label>
              }
            >
              Días que trabaja
            </Rotulo>
            <div className="flex flex-wrap gap-1.5">
              {DIAS.map((d) => {
                const on = dias.includes(d.i);
                return (
                  <button key={d.i} type="button" onClick={() => setDias((p) => (on ? p.filter((x) => x !== d.i) : [...p, d.i].sort()))} className={`h-10 w-11 rounded-lg text-xs font-bold ${on ? "bg-blue-700 text-white" : "border border-slate-200 text-slate-500 dark:border-slate-700"}`}>
                    {d.corto}
                  </button>
                );
              })}
            </div>
            {rotativos && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-slate-500">Días por semana</span>
                <input type="number" min={1} max={7} value={porSemana} onChange={(e) => setPorSemana(e.target.value)} className={`${CLASE_CAMPO} h-10 w-20`} />
              </div>
            )}
          </div>
        )}
        {porDiasSueltos && <p className="text-[11px] text-slate-400">El contrato es por días sueltos: los días se eligen en cada contratación.</p>}

        {!general && !esServicios && (
          <div>
            <Rotulo
              accion={
                valoracion ? (
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    Ver otras valoraciones
                    <input type="checkbox" checked={otrasValoraciones} onChange={(e) => setOtrasValoraciones(e.target.checked)} className="h-4 w-4" />
                  </label>
                ) : undefined
              }
            >
              Categoría
            </Rotulo>
            <select value={categoriaSatId} onChange={(e) => setCategoriaSatId(e.target.value)} className={CLASE_CAMPO}>
              <option value="">Elegí la categoría…</option>
              {categoriaFueraDeLista && <option value={categoriaSatId}>{catalogos.categoriasSat.find((c) => c._id === categoriaSatId)?.name || "Categoría anterior"} {otrasValoraciones ? "(a completar)" : "(otra valoración)"}</option>}
              {categorias.map((c) => {
                const nivel = ofrecidas?.nivelPorId.get(c._id);
                return (
                  <option key={c._id} value={c._id}>
                    {c.name}
                    {nivel ? ` · ${nivel.nombre}` : ""}
                  </option>
                );
              })}
            </select>
            {valoracion && (
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                El proyecto es <ChipValoracion nombre={valoracion.nombre} color={valoracion.color} />
                {categoriaSatId && categoriaSatId === porDefecto ? "· viene la categoría de ese nivel; la podés cambiar." : categoriaSatId && porDefecto ? (
                  <button type="button" onClick={() => setCategoriaSatId(porDefecto)} className="font-semibold text-blue-600 dark:text-blue-400">
                    Volver a la de {valoracion.nombre}
                  </button>
                ) : null}
              </p>
            )}
            {categorias.length === 0 && <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">{plantilla.empresaContratoId ? "Sus roles no tienen categorías en el convenio de la plantilla." : "Elegí la empresa en la hoja general para ver las categorías."}</p>}
          </div>
        )}

        {!general && (
          <div>
            <Rotulo obligatorio={esServicios}>Importe por jornada {esServicios ? "" : "fijado a mano"}</Rotulo>
            <input type="number" inputMode="decimal" min={0} step="0.01" value={importe} onChange={(e) => setImporte(e.target.value)} placeholder={esServicios ? "Es un servicio: cargalo" : "Vacío = el de la escala de su categoría"} className={CLASE_CAMPO} />
          </div>
        )}

        <div>
          <Rotulo>Comentario del puesto</Rotulo>
          <textarea rows={2} value={comentarios} onChange={(e) => setComentarios(e.target.value)} placeholder={plantilla.comentarios || "Opcional"} className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
        </div>

        {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Modal>
  );
}
