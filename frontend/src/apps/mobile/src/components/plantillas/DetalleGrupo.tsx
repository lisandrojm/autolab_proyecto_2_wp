import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBriefcase, faChevronRight, faCopy, faEllipsis, faMinus, faPen, faPlus, faTrash, faUsers } from "@fortawesome/free-solid-svg-icons";
import { plantillasEquipoAPI, Plantilla } from "../../../../../api/plantillasEquipo";
import { sweetAlert } from "../../utils/sweetAlert";
import { usePlantilla, usePlantillas } from "./contexto";
import { AccionTexto, Pantalla, Seccion, Vacio } from "./Pantalla";
import { HojaModal } from "./HojaModal";
import { aContratacion, categoriasDelNivel, estadoDe, nombreRoles, nombreTurno, proyectoDelEquipo, rutas } from "./equipoUtil";
import { ChipTurno, CLASE_CAMPO, fechaCorta, Pill, textoHorario } from "./comun";
import { AIRE, AIRE_DOS_LINEAS, BadgeRolFijo, MARGEN, Rotulo, pastillaDe } from "./piezas";
import { textoDeDias } from "../../../../../utils/jerarquiaTurnos";
import { fuzzyMatch } from "../../../../../utils/searchHelpers";

/*
  PANTALLA 2 · UN GRUPO DE PUESTOS: sus equipos (cada uno con su turno y cómo está), «Nuevo equipo»
  (nombre y turno en un solo paso) y «Editar puestos» (roles y cantidades, con + y −). Arriba, la
  empresa y el convenio, que definen qué categorías se ofrecen. Botón principal: «Contratar equipos».
*/
type Hoja = null | "puestos" | "nombre";

export default function DetalleGrupo() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { catalogos, guardar, areasDe } = usePlantillas();
  const { plantilla: p, noEsta } = usePlantilla(id);
  const [hoja, setHoja] = useState<Hoja>(null);

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

  const nombreProyecto = (id: string | null) => catalogos.proyectos?.find((x) => x._id === id)?.name || "Sin proyecto";

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
      contexto="Grupo de puestos · para cualquier proyecto"
      atras={rutas.lista}
      boton={{
        texto: p.equipos.length > 1 ? `Contratar equipos (${p.equipos.length})` : "Contratar equipo",
        onClick: () => navigate(rutas.contratar(p._id)),
        deshabilitado: p.equipos.length === 0 || p.integrantes.length === 0,
        motivo: p.integrantes.length === 0 ? "Primero elegí los puestos" : "Primero creá un equipo",
        onMotivo: () => (p.integrantes.length === 0 ? setHoja("puestos") : navigate(rutas.nuevo({ grupo: p._id }))),
        tono: "verde",
      }}
    >
      {/*
        LA MISMA UI QUE EL ALTA, porque es la misma información.

        Esta pantalla mostraba lo que el alta acababa de cargar, pero dibujado de otra manera: los
        títulos sin el ícono que los distingue, los puestos como un párrafo de texto corrido y las
        pastillas de estado cuadradas al lado de chips redondos. Quien venía de armar el equipo
        llegaba acá y tenía que volver a aprender dónde mira cada cosa.

        Ahora el rótulo, la pastilla y el «+» son los mismos de los cuatro pasos. Lo único propio de
        esta pantalla es que acá NO se edita en el lugar: cada bloque tiene su acción —«Nuevo
        equipo», «Editar puestos»— y lo que se ve es de sólo lectura.
      */}
      <Seccion
        titulo={<Rotulo icono={faUsers}>Equipos</Rotulo>}
        accion={
          <button type="button" onClick={() => navigate(rutas.nuevo({ grupo: p._id }))} disabled={p.integrantes.length === 0} aria-label="Nuevo equipo" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white disabled:opacity-40">
            <FontAwesomeIcon icon={faPlus} />
          </button>
        }
      >
        {p.equipos.length === 0 ? (
          p.integrantes.length === 0 ? <Vacio texto="Todavía no hay puestos." accion="Elegir puestos" onAccion={() => setHoja("puestos")} /> : <Vacio texto="Todavía no hay equipos." accion="Crear equipo" onAccion={() => navigate(rutas.nuevo({ grupo: p._id }))} />
        ) : (
          <div className="space-y-2">
            {p.equipos.map((e) => {
              const est = estadoDe(p, e);
              const c = e.condiciones || {};
              return (
                <button key={e._id} type="button" onClick={() => navigate(rutas.equipo(p._id, e._id))} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-blue-400 dark:border-slate-700 dark:bg-slate-800/70">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="truncate text-base font-bold text-slate-900 dark:text-white">{e.nombre}</p>
                    {/*
                      DÓNDE Y CUÁNDO, EN UNA PASTILLA COMO LA DEL ALTA: el área y el turno arriba, y
                      debajo el horario con los días. Eran tres cosas sueltas en un renglón —el
                      proyecto en negrita, el chip del turno y el horario en gris— que se leían como
                      tres datos sin relación entre sí, cuando son uno solo: cuándo trabaja el equipo.
                    */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`${pastillaDe("neutro")} ${AIRE} ${MARGEN}`}>{nombreProyecto(e.projectId)}</span>
                      <span className={`${pastillaDe("azul")} ${AIRE_DOS_LINEAS} ${MARGEN} min-w-0`}>
                        <span className="min-w-0">
                          <span className="block truncate uppercase tracking-wide">{nombreTurno(areasDe(e.projectId), c.areaId, c.shiftId) || "Sin turno"}</span>
                          <span className="block truncate text-[10px] font-normal opacity-80">{[textoHorario(c.inTime, c.outTime), textoDeDias(c.diasSemana)].filter(Boolean).join(" · ")}</span>
                        </span>
                      </span>
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

      <Seccion
        titulo={<Rotulo icono={faBriefcase}>Puestos · {p.integrantes.length}</Rotulo>}
        accion={
          <button type="button" onClick={() => setHoja("puestos")} aria-label="Editar los puestos" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
            <FontAwesomeIcon icon={faPen} className="h-3.5 w-3.5" />
          </button>
        }
      >
        {/*
          Cada oficio con su cantidad, como en el alta, y UNO DEBAJO DEL OTRO. El párrafo de antes eran
          cinco renglones donde nada se distinguía de nada; los badges en fila corrida arreglaban eso
          pero armaban un mosaico —dos por renglón acá, uno allá— donde el ojo no encuentra el segundo
          «1» debajo del primero. En columna, las cantidades quedan alineadas y la lista se recorre de
          arriba abajo, como una lista. Que sea larga no importa: es lo que hay.
        */}
        {p.integrantes.length === 0 ? (
          <p className="text-sm text-slate-700 dark:text-slate-200">Sin puestos</p>
        ) : (
          <div className="flex flex-col items-start gap-2.5">
            {cuentaDeRoles(p, catalogos.roleFrames).map(([nombre, cantidad]) => (
              <BadgeRolFijo key={nombre} nombre={nombre} cantidad={cantidad} />
            ))}
          </div>
        )}
      </Seccion>

      <Seccion titulo={<Rotulo icono={faEllipsis}>Más</Rotulo>}>
        {/*
          CADA ACCIÓN CON SU ÍCONO. Eran tres renglones de texto azul, dos iguales y el tercero rojo:
          el color era lo único que decía cuál no tiene vuelta atrás. El ícono lo dice antes de leer.
        */}
        <div className="rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800/70">
          <AccionTexto icono={faPen} onClick={() => setHoja("nombre")}>
            Cambiar el nombre
          </AccionTexto>
          <AccionTexto icono={faCopy} onClick={() => void duplicar()}>
            Duplicar el grupo
          </AccionTexto>
          <AccionTexto icono={faTrash} peligro onClick={() => void eliminar()}>
            Eliminar el grupo
          </AccionTexto>
        </div>
      </Seccion>

      <HojaPuestos abierta={hoja === "puestos"} onCerrar={() => setHoja(null)} plantilla={p} />
      <HojaNombre abierta={hoja === "nombre"} onCerrar={() => setHoja(null)} actual={p.nombre} onGuardar={(nombre) => void cambiarDatos({ nombre })} />
    </Pantalla>
  );
}

/** Cada oficio y cuántos hay, en el orden de los puestos: [«Camarógrafo», 2]. */
function cuentaDeRoles(p: Plantilla, roleFrames: { _id: string; name: string }[]) {
  const cuenta = new Map<string, number>();
  for (const i of p.integrantes) {
    const n = nombreRoles(roleFrames, i.rolesFrame.slice(0, 1));
    cuenta.set(n, (cuenta.get(n) || 0) + 1);
  }
  return [...cuenta.entries()];
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
function HojaPuestos({ abierta, onCerrar, plantilla: p }: { abierta: boolean; onCerrar: () => void; plantilla: Plantilla }) {
  const { catalogos, guardar } = usePlantillas();
  const [busca, setBusca] = useState("");
  const cuenta = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of p.integrantes) if (i.rolesFrame[0]) m.set(i.rolesFrame[0], (m.get(i.rolesFrame[0]) || 0) + 1);
    return m;
  }, [p.integrantes]);
  const roles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return [...catalogos.roleFrames].filter((r) => (q ? fuzzyMatch(r.name, busca) : cuenta.has(r._id))).sort((a, b) => a.name.localeCompare(b.name));
  }, [catalogos.roleFrames, busca, cuenta]);

  // El puesto nuevo, y en cada equipo la categoría del nivel de SU proyecto (el grupo es de cualquier proyecto).
  const sumar = (rolId: string) =>
    void guardar(async () => {
      let r = await plantillasEquipoAPI.agregarPuestos(p._id, [{ rolesFrame: [rolId] }]);
      const nuevo = r.integrantes[r.integrantes.length - 1];
      for (const e of r.equipos) {
        const { proyecto, empresaId, convenioId } = proyectoDelEquipo(catalogos, e);
        const categorias = categoriasDelNivel(catalogos, proyecto, empresaId, convenioId, [nuevo]);
        if (Object.keys(categorias).length) r = await plantillasEquipoAPI.actualizarEquipo(r._id, e._id, { categorias });
      }
      return r;
    });
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
    <HojaModal abierta={abierta} onCerrar={onCerrar} titulo="Puestos" subtitulo={`${p.integrantes.length} en total`} pie={<button type="button" onClick={onCerrar} className="min-h-[48px] w-full rounded-xl bg-blue-600 text-sm font-bold text-white">Listo</button>}>
      <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Agregar un rol: buscalo acá" aria-label="Buscar rol" className={`${CLASE_CAMPO} mb-3`} />
      {roles.length === 0 && <p className="py-4 text-center text-sm text-slate-700 dark:text-slate-200">{catalogos.roleFrames.length === 0 ? "Cargando los roles…" : busca ? "Ningún rol coincide." : "Buscá un rol para agregar puestos."}</p>}
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
    </HojaModal>
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
    <HojaModal abierta={abierta} onCerrar={onCerrar} titulo={titulo} pie={<button type="button" onClick={listo} disabled={!nombre.trim()} className="min-h-[48px] w-full rounded-xl bg-blue-600 text-sm font-bold text-white disabled:opacity-40">Guardar</button>}>
      <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === "Enter" && listo()} maxLength={120} className={CLASE_CAMPO} aria-label={titulo} />
    </HojaModal>
  );
}

export { HojaNombre };
