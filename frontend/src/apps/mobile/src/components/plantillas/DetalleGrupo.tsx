import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight, faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
import { plantillasEquipoAPI, Plantilla } from "../../../../../api/plantillasEquipo";
import { sweetAlert } from "../../utils/sweetAlert";
import { etiquetaProyecto } from "./useCatalogosContratacion";
import { usePlantilla, usePlantillas } from "./contexto";
import { AccionTexto, Pantalla, Seccion, Vacio } from "./Pantalla";
import { HojaInferior } from "./HojaInferior";
import { aContratacion, estadoDe, nombreRoles, nombreTurno, rutas } from "./equipoUtil";
import { ChipTurno, CLASE_CAMPO, fechaCorta, Pill, textoHorario } from "./comun";
import CampoConvenio from "./CampoConvenio";
import { ChipValoracion } from "../../../../../components/proyectos/ChipValoracion";

/*
  PANTALLA 2 · UN GRUPO DE PUESTOS: sus equipos (cada uno con su turno y cómo está), «Nuevo equipo»
  (nombre y turno en un solo paso) y «Editar puestos» (roles y cantidades, con + y −). Arriba, la
  empresa y el convenio, que definen qué categorías se ofrecen. Botón principal: «Contratar equipos».
*/
type Hoja = null | "equipo" | "puestos" | "nombre" | "proyecto";

export default function DetalleGrupo() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { catalogos, guardar, areasDe } = usePlantillas();
  const { plantilla: p, noEsta } = usePlantilla(id);
  const [hoja, setHoja] = useState<Hoja>(null);
  const proyecto = catalogos.proyectos?.find((x) => x._id === p?.projectId) || null;
  const areas = areasDe(p?.projectId);

  // Recién creado: se abre «Editar puestos» (lo pidió el usuario con «Crear y elegir puestos»).
  useEffect(() => {
    if ((location.state as any)?.editarPuestos && p) {
      setHoja("puestos");
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?._id]);

  if (noEsta) return <Pantalla titulo="Grupo de puestos" atras={rutas.lista}><Vacio texto="Este grupo ya no está." accion="Ver los grupos" onAccion={() => navigate(rutas.lista)} /></Pantalla>;
  if (!p) return <Pantalla titulo="Grupo de puestos" atras={rutas.lista} listo={false}><div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /></Pantalla>;

  const empresas = catalogos.empresasDelProyecto(proyecto);
  const valoracion = catalogos.valoracionDe(proyecto);
  const convenioId = p.convenioId || catalogos.convenioUnico(proyecto, p.empresaContratoId)?._id || "";

  const cambiarDatos = (datos: Partial<Plantilla>) => guardar(() => plantillasEquipoAPI.actualizar(p._id, datos as any));

  const duplicar = async () => {
    try {
      const copia = await plantillasEquipoAPI.duplicar(p._id);
      navigate(rutas.grupo(copia._id));
    } catch (e: any) {
      sweetAlert.error("No se pudo duplicar", e?.response?.data?.error || "Probá de nuevo.");
    }
  };
  const eliminar = async () => {
    const r: any = await sweetAlert.confirm(`¿Eliminar «${p.nombre}»?`, "Se borran el grupo y sus equipos. Las solicitudes ya enviadas no cambian.", "Eliminar", "Cancelar");
    if (!(r === true || r?.isConfirmed)) return;
    try {
      await plantillasEquipoAPI.borrar(p._id);
      navigate(aContratacion().pathname, { replace: true, state: aContratacion().state });
    } catch (e: any) {
      sweetAlert.error("No se pudo eliminar", e?.response?.data?.error || "Probá de nuevo.");
    }
  };

  return (
    <Pantalla
      titulo={p.nombre}
      contexto={proyecto ? etiquetaProyecto(proyecto) : undefined}
      atras={rutas.lista}
      boton={{
        texto: p.equipos.length > 1 ? `Contratar equipos (${p.equipos.length})` : "Contratar equipo",
        onClick: () => navigate(rutas.contratar(p._id)),
        deshabilitado: p.equipos.length === 0 || p.integrantes.length === 0,
        motivo: p.integrantes.length === 0 ? "Primero elegí los puestos" : "Primero creá un equipo",
        onMotivo: () => setHoja(p.integrantes.length === 0 ? "puestos" : "equipo"),
        tono: "verde",
      }}
    >
      <Seccion titulo="Equipos" accion={<button type="button" onClick={() => setHoja("equipo")} disabled={p.integrantes.length === 0} className="min-h-[44px] rounded-xl px-3 text-sm font-bold text-blue-700 disabled:opacity-40 dark:text-blue-300"><FontAwesomeIcon icon={faPlus} className="mr-1.5" />Nuevo equipo</button>}>
        {p.equipos.length === 0 ? (
          p.integrantes.length === 0 ? <Vacio texto="Todavía no hay puestos." accion="Elegir puestos" onAccion={() => setHoja("puestos")} /> : <Vacio texto="Todavía no hay equipos." accion="Crear equipo" onAccion={() => setHoja("equipo")} />
        ) : (
          <div className="space-y-2">
            {p.equipos.map((e) => {
              const est = estadoDe(p, e);
              const c = e.condiciones || {};
              return (
                <button key={e._id} type="button" onClick={() => navigate(rutas.equipo(p._id, e._id))} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-blue-400 dark:border-slate-700 dark:bg-slate-800/70">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-base font-bold text-slate-900 dark:text-white">{e.nombre}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ChipTurno inicio={c.inTime} texto={nombreTurno(areas, c.areaId, c.shiftId) || undefined} />
                      <span className="text-xs text-slate-600 dark:text-slate-300">{textoHorario(c.inTime, c.outTime)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {est.faltan === 0 ? <Pill tono="verde">{`${est.asignados}/${est.total} listos`}</Pill> : <Pill tono="ambar">{`${est.asignados}/${est.total} · faltan ${est.faltan}`}</Pill>}
                      {est.reemplazos > 0 && <Pill tono="azul">{est.reemplazos === 1 ? "1 reemplazo" : `${est.reemplazos} reemplazos`}</Pill>}
                      {est.revisar > 0 && <Pill tono="ambar">Revisar motivo</Pill>}
                      {est.avisos > 0 && <Pill tono="rojo">{est.avisos === 1 ? "1 se superpone" : `${est.avisos} se superponen`}</Pill>}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">{e.ultimaContratacionEl ? `Contratado el ${fechaCorta(e.ultimaContratacionEl)}` : "Nunca contratado"}</p>
                  </div>
                  <FontAwesomeIcon icon={faChevronRight} className="shrink-0 text-slate-500" />
                </button>
              );
            })}
          </div>
        )}
      </Seccion>

      <Seccion titulo={`Puestos · ${p.integrantes.length}`} accion={<button type="button" onClick={() => setHoja("puestos")} className="min-h-[44px] rounded-xl px-3 text-sm font-bold text-blue-700 dark:text-blue-300">Editar puestos</button>}>
        <p className="text-sm text-slate-700 dark:text-slate-200">{resumenRoles(p, catalogos.roleFrames) || "Sin puestos"}</p>
      </Seccion>

      <Seccion titulo="Empresa">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/70">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-800 dark:text-slate-100">Empresa que contrata</span>
            <select value={p.empresaContratoId || ""} onChange={(ev) => void cambiarDatos({ empresaContratoId: ev.target.value || null, convenioId: null })} className={CLASE_CAMPO}>
              <option value="">Elegí la empresa</option>
              {empresas.map((x) => (
                <option key={x._id} value={x._id}>
                  {(x as any).razonSocial || (x as any).name}
                </option>
              ))}
            </select>
          </label>
          <CampoConvenio proyecto={proyecto} empresaId={p.empresaContratoId || ""} convenioId={p.convenioId || ""} catalogos={catalogos} onChange={(cid) => (cid !== (p.convenioId || "") ? void cambiarDatos({ convenioId: cid || null }) : undefined)} />
          {valoracion && (
            <p className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
              Valoración del proyecto <ChipValoracion nombre={valoracion.nombre} color={valoracion.color} />
            </p>
          )}
          {!convenioId && p.empresaContratoId && <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Elegí el convenio.</p>}
        </div>
      </Seccion>

      <Seccion titulo="Más">
        <div className="rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800/70">
          <AccionTexto onClick={() => setHoja("nombre")}>Cambiar el nombre</AccionTexto>
          {(catalogos.proyectos?.length || 0) > 1 && <AccionTexto onClick={() => setHoja("proyecto")}>Pasar a otro proyecto</AccionTexto>}
          <AccionTexto onClick={() => void duplicar()}>Duplicar el grupo</AccionTexto>
          <AccionTexto peligro onClick={() => void eliminar()}>Eliminar el grupo</AccionTexto>
        </div>
      </Seccion>

      <HojaNuevoEquipo abierta={hoja === "equipo"} onCerrar={() => setHoja(null)} plantilla={p} />
      <HojaPuestos abierta={hoja === "puestos"} onCerrar={() => setHoja(null)} plantilla={p} convenioId={convenioId} />
      <HojaNombre abierta={hoja === "nombre"} onCerrar={() => setHoja(null)} actual={p.nombre} onGuardar={(nombre) => void cambiarDatos({ nombre })} />
      <HojaInferior abierta={hoja === "proyecto"} onCerrar={() => setHoja(null)} titulo="Pasar a otro proyecto" subtitulo="Los equipos quedan sin área y turno: son de cada proyecto">
        <div className="space-y-2">
          {(catalogos.proyectos || [])
            .filter((x) => x._id !== p.projectId)
            .map((x) => (
              <button
                key={x._id}
                type="button"
                onClick={async () => {
                  setHoja(null);
                  const r = await cambiarDatos({ projectId: x._id });
                  if (r) {
                    try {
                      localStorage.setItem("plantillas:proyecto", x._id);
                    } catch {
                      /* sin storage */
                    }
                  }
                }}
                className="flex min-h-[48px] w-full items-center rounded-xl border border-slate-200 px-3 text-left text-sm font-semibold text-slate-900 dark:border-slate-700 dark:text-white"
              >
                {etiquetaProyecto(x)}
              </button>
            ))}
        </div>
      </HojaInferior>
    </Pantalla>
  );
}

/** «2 Camarógrafo · 1 Director · …», en el orden de los puestos. */
function resumenRoles(p: Plantilla, roleFrames: { _id: string; name: string }[]) {
  const cuenta = new Map<string, number>();
  for (const i of p.integrantes) {
    const n = nombreRoles(roleFrames, i.rolesFrame.slice(0, 1));
    cuenta.set(n, (cuenta.get(n) || 0) + 1);
  }
  return [...cuenta.entries()].map(([n, c]) => `${c} ${n}`).join(" · ");
}

/** NUEVO EQUIPO: nombre y turno en el mismo paso; opcional, copiar las personas de otro equipo. */
function HojaNuevoEquipo({ abierta, onCerrar, plantilla: p }: { abierta: boolean; onCerrar: () => void; plantilla: Plantilla }) {
  const navigate = useNavigate();
  const { guardar, areasDe } = usePlantillas();
  const areas = areasDe(p.projectId);
  const [nombre, setNombre] = useState("");
  const [turno, setTurno] = useState("");
  const [copiarDe, setCopiarDe] = useState("");
  useEffect(() => {
    if (!abierta) return;
    setNombre("");
    setTurno("");
    setCopiarDe("");
  }, [abierta]);
  const t = (areas || []).find((o) => `${o.areaId}::${o.shiftId}` === turno);

  const crear = async () => {
    const origen = p.equipos.find((e) => e._id === copiarDe);
    const condiciones = { ...(origen?.condiciones || {}), ...(t ? { areaId: t.areaId, shiftId: t.shiftId, inTime: t.inicio || null, outTime: t.fin || null, diasSemana: t.dias, diasPorSemana: t.dias.length || null } : {}) };
    const r = await guardar(() => plantillasEquipoAPI.crearEquipo(p._id, nombre.trim() || (t ? t.turnoNombre : ""), copiarDe || undefined, condiciones));
    if (!r) return;
    onCerrar();
    const nuevo = r.equipos[r.equipos.length - 1];
    if (nuevo) navigate(rutas.equipo(p._id, nuevo._id));
  };

  return (
    <HojaInferior
      abierta={abierta}
      onCerrar={onCerrar}
      titulo="Nuevo equipo"
      pie={
        <button type="button" onClick={() => void crear()} disabled={!nombre.trim() && !t} className="min-h-[48px] w-full rounded-xl bg-blue-600 text-sm font-bold text-white disabled:opacity-40">
          Crear equipo
        </button>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-800 dark:text-slate-100">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Sábado noche" maxLength={80} className={CLASE_CAMPO} />
        </label>
        <div>
          <span className="mb-1 block text-sm font-semibold text-slate-800 dark:text-slate-100">Turno</span>
          <ListaTurnos areas={areas} valor={turno} onElegir={setTurno} />
        </div>
        {p.equipos.length > 0 && (
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-800 dark:text-slate-100">Copiar personas de</span>
            <select value={copiarDe} onChange={(e) => setCopiarDe(e.target.value)} className={CLASE_CAMPO}>
              <option value="">Nadie (vacío)</option>
              {p.equipos.map((e) => (
                <option key={e._id} value={e._id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </HojaInferior>
  );
}

/** Las áreas y turnos del proyecto como opciones grandes, agrupadas por área. */
export function ListaTurnos({ areas, valor, onElegir }: { areas: ReturnType<ReturnType<typeof usePlantillas>["areasDe"]>; valor: string; onElegir: (v: string) => void }) {
  const grupos = useMemo(() => {
    const m = new Map<string, { nombre: string; turnos: NonNullable<typeof areas> }>();
    for (const o of areas || []) {
      const g = m.get(o.areaId) || { nombre: o.areaNombre, turnos: [] };
      g.turnos.push(o);
      m.set(o.areaId, g);
    }
    return [...m.values()];
  }, [areas]);
  if (areas === null) return <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />;
  if (!areas.length) return <p className="text-sm text-slate-700 dark:text-slate-200">El proyecto no tiene áreas y turnos cargados.</p>;
  return (
    <div className="space-y-3">
      {grupos.map((g) => (
        <div key={g.nombre} className="space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{g.nombre}</p>
          {g.turnos.map((o) => {
            const v = `${o.areaId}::${o.shiftId}`;
            const on = v === valor;
            return (
              <button key={v} type="button" onClick={() => onElegir(v)} aria-pressed={on} className={`flex min-h-[48px] w-full items-center justify-between gap-2 rounded-xl border px-3 text-left ${on ? "border-blue-600 bg-blue-50 dark:bg-blue-500/15" : "border-slate-200 dark:border-slate-700"}`}>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{o.turnoNombre}</span>
                  <span className="block truncate text-xs text-slate-600 dark:text-slate-300">
                    {textoHorario(o.inicio, o.fin)}
                    {o.diasTexto ? ` · ${o.diasTexto}` : ""}
                  </span>
                </span>
                <ChipTurno inicio={o.inicio} />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * EDITAR PUESTOS: roles y cantidades con + y −. Sumar agrega puestos con la categoría del nivel del
 * proyecto; restar saca primero un puesto que nadie ocupa en ningún equipo (si todos están ocupados,
 * pregunta).
 */
function HojaPuestos({ abierta, onCerrar, plantilla: p, convenioId }: { abierta: boolean; onCerrar: () => void; plantilla: Plantilla; convenioId: string }) {
  const { catalogos, guardar } = usePlantillas();
  const [busca, setBusca] = useState("");
  const proyecto = catalogos.proyectos?.find((x) => x._id === p.projectId) || null;
  const cuenta = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of p.integrantes) if (i.rolesFrame[0]) m.set(i.rolesFrame[0], (m.get(i.rolesFrame[0]) || 0) + 1);
    return m;
  }, [p.integrantes]);
  const roles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return [...catalogos.roleFrames].filter((r) => (q ? r.name.toLowerCase().includes(q) : cuenta.has(r._id))).sort((a, b) => a.name.localeCompare(b.name));
  }, [catalogos.roleFrames, busca, cuenta]);

  const sumar = (rolId: string) => {
    const categoria = catalogos.categoriaPorDefectoPara(proyecto, p.empresaContratoId, convenioId, [rolId]);
    void guardar(() => plantillasEquipoAPI.agregarPuestos(p._id, [{ rolesFrame: [rolId], ...(categoria ? { categoriaSatId: categoria } : {}) }]));
  };
  const restar = async (rolId: string) => {
    const delRol = p.integrantes.filter((i) => i.rolesFrame[0] === rolId);
    const ocupado = (puestoId: string) => p.equipos.find((e) => e.asignaciones.some((a) => a.puestoId === puestoId && a.userId));
    const libre = [...delRol].reverse().find((i) => !ocupado(i._id));
    const sacar = libre || delRol[delRol.length - 1];
    if (!sacar) return;
    if (!libre) {
      const e = ocupado(sacar._id)!;
      const quien = e.asignaciones.find((a) => a.puestoId === sacar._id)?.nombre;
      const r: any = await sweetAlert.confirm("¿Sacar un puesto ocupado?", `${quien || "Alguien"} lo ocupa en «${e.nombre}». Se saca de todos los equipos.`, "Sacar", "Cancelar");
      if (!(r === true || r?.isConfirmed)) return;
    }
    void guardar(() => plantillasEquipoAPI.quitarPuesto(p._id, sacar._id));
  };

  return (
    <HojaInferior abierta={abierta} onCerrar={onCerrar} titulo="Puestos" subtitulo={`${p.integrantes.length} en total`} pie={<button type="button" onClick={onCerrar} className="min-h-[48px] w-full rounded-xl bg-blue-600 text-sm font-bold text-white">Listo</button>}>
      <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Agregar un rol: buscalo acá" aria-label="Buscar rol" className={`${CLASE_CAMPO} mb-3`} />
      {roles.length === 0 && <p className="py-4 text-center text-sm text-slate-700 dark:text-slate-200">{busca ? "Ningún rol coincide." : "Buscá un rol para agregar puestos."}</p>}
      <div className="space-y-1.5">
        {roles.map((r) => {
          const n = cuenta.get(r._id) || 0;
          return (
            <div key={r._id} className="flex min-h-[52px] items-center gap-2 rounded-xl border border-slate-200 px-3 dark:border-slate-700">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white">{r.name}</span>
              <button type="button" onClick={() => void restar(r._id)} disabled={n === 0} aria-label={`Un ${r.name} menos`} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300 text-slate-700 disabled:opacity-30 dark:border-slate-600 dark:text-slate-200">
                <FontAwesomeIcon icon={faMinus} />
              </button>
              <span className="w-6 text-center text-base font-bold tabular-nums text-slate-900 dark:text-white" aria-live="polite">{n}</span>
              <button type="button" onClick={() => sumar(r._id)} aria-label={`Un ${r.name} más`} className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white">
                <FontAwesomeIcon icon={faPlus} />
              </button>
            </div>
          );
        })}
      </div>
    </HojaInferior>
  );
}

function HojaNombre({ abierta, onCerrar, actual, onGuardar, titulo = "Nombre del grupo" }: { abierta: boolean; onCerrar: () => void; actual: string; onGuardar: (n: string) => void; titulo?: string }) {
  const [nombre, setNombre] = useState(actual);
  useEffect(() => {
    if (abierta) setNombre(actual);
  }, [abierta, actual]);
  const listo = () => {
    if (nombre.trim() && nombre.trim() !== actual) onGuardar(nombre.trim());
    onCerrar();
  };
  return (
    <HojaInferior abierta={abierta} onCerrar={onCerrar} titulo={titulo} pie={<button type="button" onClick={listo} disabled={!nombre.trim()} className="min-h-[48px] w-full rounded-xl bg-blue-600 text-sm font-bold text-white disabled:opacity-40">Guardar</button>}>
      <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === "Enter" && listo()} maxLength={120} className={CLASE_CAMPO} aria-label={titulo} />
    </HojaInferior>
  );
}

export { HojaNombre };
