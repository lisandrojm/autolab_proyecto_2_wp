import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faPen, faPlus, faRightLeft, faSpinner, faTrash, faUsers } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../Modal";
import { SelectorHora } from "../../../../../components/contratacion/SelectorHora";
import { Integrante, Plantilla, plantillasEquipoAPI } from "../../../../../api/plantillasEquipo";
import { Project } from "../../../../../api/projects";
import { sweetAlert } from "../../utils/sweetAlert";
import { CatalogosContratacion, etiquetaProyecto, useAreasDelProyecto } from "./useCatalogosContratacion";
import PersonaPickerModal from "./PersonaPickerModal";
import IntegranteModal from "./IntegranteModal";
import { Badge, CLASE_CAMPO, CLASE_HORA, DIAS, Rotulo, textoDias } from "./comun";

/*
  CREAR O EDITAR UNA PLANTILLA DE EQUIPO.

  Arriba, lo que comparte todo el equipo: empresa (y con ella el convenio), tipo de contrato, área y
  turno, horario, días y comentario. Abajo, los integrantes: cada uno con sus roles y su categoría, y
  —marcado «personalizado»— lo que tenga distinto al equipo.

  REEMPLAZAR a un integrante cambia a la persona PARA SIEMPRE en la plantilla, conservando su rol y lo
  propio (se puede editar después). No es el «¿Reemplazo?» de una solicitud, que se marca al contratar.

  Las fechas y los importes NO se guardan acá: se eligen y se calculan en cada contratación.
*/
interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** `null` = plantilla nueva. */
  plantillaId: string | null;
  proyecto: Project | null;
  catalogos: CatalogosContratacion;
  onCambio: () => void;
}

interface Comunes {
  nombre: string;
  empresaContratoId: string;
  convenioId: string;
  contratoId: string;
  areaId: string;
  shiftId: string;
  inTime: string;
  outTime: string;
  diasSemana: number[];
  diasPorSemana: string;
  diasRotativos: boolean;
  comentarios: string;
}

const vacio: Comunes = { nombre: "", empresaContratoId: "", convenioId: "", contratoId: "", areaId: "", shiftId: "", inTime: "", outTime: "", diasSemana: [], diasPorSemana: "", diasRotativos: false, comentarios: "" };

export default function PlantillaEditor({ isOpen, onClose, plantillaId, proyecto, catalogos, onCambio }: Props) {
  const [plantilla, setPlantilla] = useState<Plantilla | null>(null);
  const [c, setC] = useState<Comunes>(vacio);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [sucio, setSucio] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [reemplazando, setReemplazando] = useState<Integrante | null>(null);
  const [editando, setEditando] = useState<Integrante | null>(null);
  const areas = useAreasDelProyecto(isOpen ? proyecto?._id : null);

  const aplicar = (p: Plantilla) => {
    setPlantilla(p);
    const a = p.areaShiftAssignments?.[0];
    setC({
      nombre: p.nombre,
      empresaContratoId: p.empresaContratoId || "",
      convenioId: p.convenioId || "",
      contratoId: p.contratoId || "",
      areaId: a?.areaId || "",
      shiftId: a?.shiftIds?.[0] || "",
      inTime: p.inTime || "",
      outTime: p.outTime || "",
      diasSemana: p.diasSemana || [],
      diasPorSemana: p.diasPorSemana ? String(p.diasPorSemana) : "",
      diasRotativos: !!p.diasRotativos,
      comentarios: p.comentarios || "",
    });
    setSucio(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    setPlantilla(null);
    setC(vacio);
    setSucio(false);
    if (!plantillaId) return;
    setCargando(true);
    plantillasEquipoAPI
      .obtener(plantillaId)
      .then(aplicar)
      .catch(() => sweetAlert.error("No se pudo abrir la plantilla"))
      .finally(() => setCargando(false));
  }, [isOpen, plantillaId]);

  const cambiar = (x: Partial<Comunes>) => {
    setC((p) => ({ ...p, ...x }));
    setSucio(true);
  };

  // La cadena del alta individual: empresa del proyecto → convenio. Con una sola opción, se elige sola.
  const empresas = catalogos.empresasDelProyecto(proyecto);
  useEffect(() => {
    if (!isOpen || cargando) return;
    if (!c.empresaContratoId && empresas.length === 1) cambiar({ empresaContratoId: empresas[0]._id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, cargando, empresas.length]);
  const convenios = catalogos.conveniosDisponibles(proyecto, c.empresaContratoId, c.convenioId);
  useEffect(() => {
    if (!isOpen || cargando) return;
    const valido = convenios.some((x) => catalogos.convenioPorCct(x.externalId)?._id === c.convenioId);
    if (!valido && convenios.length === 1) {
      const id = catalogos.convenioPorCct(convenios[0].externalId)?._id || "";
      if (id && id !== c.convenioId) cambiar({ convenioId: id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, cargando, c.empresaContratoId, convenios.length]);

  const contrato = catalogos.contratos.find((x) => x._id === c.contratoId);
  const tramite = c.contratoId ? catalogos.tramitePorContrato.get(c.contratoId) || "" : "";
  const esServicios = tramite === "constancia_cuit";
  const porDiasSueltos = (contrato as any)?.data?.modoFechas === "dias";

  const elegirTurno = (valor: string) => {
    const [areaId, shiftId] = valor.split("::");
    const t = (areas || []).find((o) => o.areaId === areaId && o.shiftId === shiftId);
    // El horario y los días salen del turno, igual que en el alta: se pueden cambiar después.
    cambiar({ areaId, shiftId, inTime: t?.inicio || c.inTime, outTime: t?.fin || c.outTime, ...(t?.dias.length ? { diasSemana: t.dias, diasPorSemana: String(t.dias.length) } : {}) });
  };

  const guardarComunes = async (): Promise<Plantilla | null> => {
    if (!c.nombre.trim()) {
      sweetAlert.warning("Falta el nombre", "Poné un nombre a la plantilla (ej. «Equipo cámara noche»).");
      return null;
    }
    if (!proyecto) return null;
    const datos = {
      nombre: c.nombre.trim(),
      empresaContratoId: c.empresaContratoId || null,
      convenioId: esServicios ? null : c.convenioId || null,
      contratoId: c.contratoId || null,
      nombreContrato: contrato?.name || "",
      tipoImpositivo: tramite,
      areaShiftAssignments: c.areaId && c.shiftId ? [{ areaId: c.areaId, shiftIds: [c.shiftId] }] : [],
      inTime: c.inTime,
      outTime: c.outTime,
      diasSemana: c.diasSemana,
      diasPorSemana: Number(c.diasPorSemana) || c.diasSemana.length || null,
      diasRotativos: c.diasRotativos,
      comentarios: c.comentarios,
    };
    setGuardando(true);
    try {
      const p = plantilla ? await plantillasEquipoAPI.actualizar(plantilla._id, datos) : await plantillasEquipoAPI.crear({ ...datos, projectId: proyecto._id });
      aplicar(p);
      onCambio();
      return p;
    } catch (e: any) {
      sweetAlert.error("No se pudo guardar", e?.response?.data?.error || "Probá de nuevo.");
      return null;
    } finally {
      setGuardando(false);
    }
  };

  /**
   * Una operación sobre los integrantes. Si hay valores comunes sin guardar se guardan antes: la respuesta
   * del server trae la plantilla entera y, si no, pisaría lo que se estaba editando arriba.
   */
  const conPlantilla = async (fn: (p: Plantilla) => Promise<Plantilla>, tirar = false) => {
    const p = !plantilla || sucio ? await guardarComunes() : plantilla;
    if (!p) return;
    try {
      aplicar(await fn(p));
      onCambio();
    } catch (e: any) {
      if (tirar) throw e;
      sweetAlert.error("No se pudo guardar", e?.response?.data?.error || "Probá de nuevo.");
    }
  };

  const quitar = async (i: Integrante) => {
    const r: any = await sweetAlert.confirm("¿Sacar de la plantilla?", `${i.nombre} deja de estar en «${plantilla?.nombre}». Las solicitudes ya pedidas no cambian.`, "Sacar", "Cancelar");
    if (!(r === true || r?.isConfirmed)) return;
    await conPlantilla((p) => plantillasEquipoAPI.quitarIntegrante(p._id, i._id));
  };

  const nombreRol = useMemo(() => new Map(catalogos.roleFrames.map((r) => [r._id, r.name])), [catalogos.roleFrames]);
  const nombreCategoria = useMemo(() => new Map(catalogos.categoriasSat.map((x) => [x._id, x.name])), [catalogos.categoriasSat]);
  const categoriaValida = (i: Integrante) => esServicios || (!!i.categoriaSatId && catalogos.categoriasPara(proyecto, c.empresaContratoId, c.convenioId, i.rolesFrame).documentos.some((x) => x._id === i.categoriaSatId));

  const areasAgrupadas = useMemo(() => {
    const m = new Map<string, { nombre: string; turnos: typeof areas }>();
    for (const o of areas || []) {
      const g = m.get(o.areaId) || { nombre: o.areaNombre, turnos: [] as any };
      g.turnos!.push(o);
      m.set(o.areaId, g);
    }
    return [...m.entries()];
  }, [areas]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={plantilla ? plantilla.nombre : "Nueva plantilla"}
      subtitle={proyecto ? etiquetaProyecto(proyecto) : undefined}
      size="fullscreen"
      zIndex={60}
      footer={
        <div className="flex w-full gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-slate-700 py-3 text-sm font-bold text-white">
            {sucio ? "Cerrar sin guardar" : "Cerrar"}
          </button>
          <button type="button" onClick={() => void guardarComunes()} disabled={guardando || (!sucio && !!plantilla)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-50">
            {guardando && <FontAwesomeIcon icon={faSpinner} spin />}
            {plantilla ? "Guardar cambios" : "Crear plantilla"}
          </button>
        </div>
      }
    >
      {cargando ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── VALORES COMUNES ── */}
          <section className="space-y-4">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Valores del equipo</h4>
            <div>
              <Rotulo obligatorio>Nombre</Rotulo>
              <input value={c.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} placeholder="Ej. Equipo cámara noche" className={CLASE_CAMPO} maxLength={120} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Rotulo>Empresa que contrata</Rotulo>
                <select value={c.empresaContratoId} onChange={(e) => cambiar({ empresaContratoId: e.target.value, convenioId: "" })} className={CLASE_CAMPO}>
                  <option value="">Elegí la empresa…</option>
                  {empresas.map((e) => (
                    <option key={e._id} value={e._id}>
                      {(e as any).razonSocial || (e as any).name}
                    </option>
                  ))}
                </select>
              </div>
              {!esServicios && (
                <div>
                  <Rotulo>Convenio</Rotulo>
                  <select value={c.convenioId} onChange={(e) => cambiar({ convenioId: e.target.value })} className={CLASE_CAMPO} disabled={convenios.length <= 1}>
                    <option value="">{convenios.length ? "Elegí el convenio…" : "Sale de la empresa"}</option>
                    {convenios.map((x) => {
                      const doc = catalogos.convenioPorCct(x.externalId);
                      return doc ? (
                        <option key={doc._id} value={doc._id}>
                          {x.externalId} {doc.name ? `· ${doc.name}` : ""}
                        </option>
                      ) : null;
                    })}
                  </select>
                  {c.convenioId && plantilla && sucio && plantilla.convenioId !== c.convenioId && <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">Cambió el convenio: las categorías que no sean de él quedan «a completar».</p>}
                </div>
              )}
            </div>

            <div>
              <Rotulo obligatorio>Tipo de contrato</Rotulo>
              <select value={c.contratoId} onChange={(e) => cambiar({ contratoId: e.target.value })} className={CLASE_CAMPO}>
                <option value="">Elegí el tipo de contrato…</option>
                {catalogos.contratos.map((x) => (
                  <option key={x._id} value={x._id}>
                    {x.name} {catalogos.tramitePorContrato.get(x._id) === "constancia_cuit" ? "· PEDIDO DE SERVICIOS" : catalogos.tramitePorContrato.get(x._id) ? "· PEDIDO DE ARCA" : ""}
                  </option>
                ))}
              </select>
              {porDiasSueltos && <p className="mt-1 text-[11px] text-slate-400">Se pide por días sueltos: los días se eligen en cada contratación, uno por jornada.</p>}
            </div>

            <div>
              <Rotulo obligatorio>Área y turno</Rotulo>
              {areas === null ? (
                <div className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
              ) : (
                <select value={c.areaId && c.shiftId ? `${c.areaId}::${c.shiftId}` : ""} onChange={(e) => elegirTurno(e.target.value)} className={CLASE_CAMPO}>
                  <option value="">Elegí el área y el turno…</option>
                  {areasAgrupadas.map(([areaId, g]) => (
                    <optgroup key={areaId} label={g.nombre}>
                      {(g.turnos || []).map((t) => (
                        <option key={t.shiftId} value={`${t.areaId}::${t.shiftId}`}>
                          {t.turnoNombre} {t.inicio && t.fin ? `· ${t.inicio} a ${t.fin}` : ""} {t.diasTexto ? `· ${t.diasTexto}` : ""}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
            </div>

            <div>
              <Rotulo obligatorio>Horario (entrada - salida)</Rotulo>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <SelectorHora valor={c.inTime} onCambio={(h) => cambiar({ inTime: h })} etiqueta="Entrada" placeholder="Entrada" className={CLASE_HORA} zIndex={110} />
                </div>
                <FontAwesomeIcon icon={faArrowRight} className="text-xs text-slate-400" />
                <div className="flex-1">
                  <SelectorHora valor={c.outTime} onCambio={(h) => cambiar({ outTime: h })} etiqueta="Salida" placeholder="Salida" desde={c.inTime} className={CLASE_HORA} zIndex={110} />
                </div>
              </div>
            </div>

            {!porDiasSueltos && (
              <div>
                <Rotulo
                  obligatorio
                  accion={
                    <label className="flex items-center gap-2 text-xs text-slate-500">
                      Días rotativos
                      <input type="checkbox" checked={c.diasRotativos} onChange={(e) => cambiar({ diasRotativos: e.target.checked })} className="h-4 w-4" />
                    </label>
                  }
                >
                  Días que trabaja
                </Rotulo>
                <div className="flex flex-wrap gap-1.5">
                  {DIAS.map((d) => {
                    const on = c.diasSemana.includes(d.i);
                    return (
                      <button
                        key={d.i}
                        type="button"
                        onClick={() => {
                          const dias = on ? c.diasSemana.filter((x) => x !== d.i) : [...c.diasSemana, d.i].sort();
                          cambiar({ diasSemana: dias, diasPorSemana: c.diasRotativos ? c.diasPorSemana : String(dias.length) });
                        }}
                        className={`h-10 w-11 rounded-lg text-xs font-bold ${on ? "bg-blue-700 text-white" : "border border-slate-200 text-slate-500 dark:border-slate-700"}`}
                      >
                        {d.corto}
                      </button>
                    );
                  })}
                </div>
                {c.diasRotativos && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-slate-500">Días por semana</span>
                    <input type="number" min={1} max={7} value={c.diasPorSemana} onChange={(e) => cambiar({ diasPorSemana: e.target.value })} className={`${CLASE_CAMPO} h-10 w-20`} />
                  </div>
                )}
              </div>
            )}

            <div>
              <Rotulo>Comentario (para cada solicitud)</Rotulo>
              <textarea rows={2} value={c.comentarios} onChange={(e) => cambiar({ comentarios: e.target.value })} placeholder="Opcional" className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
            </div>
          </section>

          {/* ── INTEGRANTES ── */}
          <section className="space-y-3 border-t border-slate-200 pt-5 dark:border-slate-700">
            <div className="flex items-center justify-between gap-2">
              <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <FontAwesomeIcon icon={faUsers} className="text-blue-500" />
                Integrantes {plantilla ? `(${plantilla.integrantes.length})` : ""}
              </h4>
              <button type="button" onClick={() => setAgregando(true)} disabled={!plantilla && !c.nombre.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
                <FontAwesomeIcon icon={faPlus} />
                Agregar
              </button>
            </div>
            {!plantilla && <p className="text-[11px] text-slate-500">Al agregar la primera persona se crea la plantilla con estos valores.</p>}
            {plantilla && plantilla.integrantes.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">Todavía no hay nadie. Con «Agregar» sumás a varias personas de una vez.</p>}
            {plantilla?.integrantes.map((i) => {
              const personalizado = !!(i.inTime || i.outTime || i.dailyRateManual || i.comentarios);
              const catOk = categoriaValida(i);
              return (
                <div key={i._id} className={`rounded-xl border p-3 ${!i.activo || !catOk ? "border-red-300 dark:border-red-900/60" : "border-slate-200 dark:border-slate-700"} bg-white dark:bg-slate-900/60`}>
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => setEditando(i)} className="min-w-0 flex-1 text-left">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-bold text-slate-900 dark:text-white">{i.nombre}</span>
                        {personalizado && <Badge tono="azul">Personalizado</Badge>}
                        {!i.activo && <Badge tono="rojo">Inactiva</Badge>}
                        {!catOk && <Badge tono="rojo">Categoría a completar</Badge>}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {i.rolesFrame.map((r) => nombreRol.get(r) || "Rol").join(", ") || "Sin rol"}
                        {!esServicios && ` · ${i.categoriaSatId ? nombreCategoria.get(i.categoriaSatId) || "Categoría" : "Sin categoría"}`}
                      </p>
                      <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {(i.inTime || c.inTime || "—") + " a " + (i.outTime || c.outTime || "—")}
                        {i.dailyRateManual ? ` · $ ${i.dailyRateManual.toLocaleString("es-AR")} fijado` : ""}
                      </p>
                      {i.reemplazadoDeNombre && <p className="text-[10px] text-slate-400">Entró en lugar de {i.reemplazadoDeNombre}</p>}
                    </button>
                    <div className="flex shrink-0 gap-1">
                      <button type="button" onClick={() => setEditando(i)} aria-label={`Editar a ${i.nombre}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 dark:border-slate-700">
                        <FontAwesomeIcon icon={faPen} className="h-3 w-3" />
                      </button>
                      <button type="button" onClick={() => setReemplazando(i)} aria-label={`Reemplazar a ${i.nombre}`} title="Reemplazar por otra persona" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 dark:border-slate-700">
                        <FontAwesomeIcon icon={faRightLeft} className="h-3 w-3" />
                      </button>
                      <button type="button" onClick={() => void quitar(i)} aria-label={`Sacar a ${i.nombre}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-red-500 dark:border-slate-700">
                        <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {plantilla && plantilla.integrantes.length > 0 && <p className="text-[11px] text-slate-500">Días del equipo: {porDiasSueltos ? "se eligen al contratar" : textoDias(c.diasSemana)}.</p>}
          </section>
        </div>
      )}

      <PersonaPickerModal
        isOpen={agregando}
        onClose={() => setAgregando(false)}
        titulo="Agregar al equipo"
        multiple
        excluir={plantilla?.integrantes.map((i) => i.userId) || []}
        roleFrames={catalogos.roleFrames}
        onElegir={(ps) => void conPlantilla((p) => plantillasEquipoAPI.agregarIntegrantes(p._id, ps.map((x) => ({ userId: x._id, rolesFrame: x.rolesFrame }))))}
      />
      <PersonaPickerModal
        isOpen={!!reemplazando}
        onClose={() => setReemplazando(null)}
        titulo={reemplazando ? `¿Quién entra en lugar de ${reemplazando.nombre}?` : ""}
        excluir={plantilla?.integrantes.map((i) => i.userId) || []}
        roleFrames={catalogos.roleFrames}
        onElegir={(ps) => {
          const i = reemplazando;
          if (!i || !ps[0]) return;
          void conPlantilla((p) => plantillasEquipoAPI.reemplazarIntegrante(p._id, i._id, ps[0]._id));
        }}
      />
      {plantilla && (
        <IntegranteModal
          isOpen={!!editando}
          onClose={() => setEditando(null)}
          plantilla={{ ...plantilla, empresaContratoId: c.empresaContratoId || null, convenioId: c.convenioId || null, tipoImpositivo: tramite, inTime: c.inTime, outTime: c.outTime, comentarios: c.comentarios }}
          proyecto={proyecto}
          integrante={editando}
          catalogos={catalogos}
          onGuardar={(cambios) => conPlantilla((p) => plantillasEquipoAPI.actualizarIntegrante(p._id, editando!._id, cambios), true)}
        />
      )}
    </Modal>
  );
}
