import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight, faUserPlus } from "@fortawesome/free-solid-svg-icons";
import { plantillasEquipoAPI } from "../../../../../api/plantillasEquipo";
import { sweetAlert } from "../../utils/sweetAlert";
import { etiquetaProyecto } from "./useCatalogosContratacion";
import { usePlantilla, usePlantillas } from "./contexto";
import { AccionTexto, Pantalla, Seccion, Vacio } from "./Pantalla";
import { FilasCondiciones, HojaContratoYTurno } from "./Condiciones";
import { SelectorPersona } from "./SelectorPersona";
import { HojaNombre } from "./DetalleGrupo";
import { categoriasDelNivel, estadoDe, nombreRoles, proyectoDelEquipo, PuestoDelEquipo, puestosDe, rutas, sacadosDe } from "./equipoUtil";
import { HojaInferior } from "./HojaInferior";
import CampoConvenio from "./CampoConvenio";
import { ChipValoracionDelProyecto } from "../../../../../components/proyectos/ChipValoracion";
import { CLASE_CAMPO, Pill } from "./comun";

/*
  PANTALLA 3 · UN EQUIPO. Arriba, «Condiciones del equipo»: contrato, área y turno, horario y días, UNA
  vez para todos sus puestos. Debajo, sus puestos: número, rol, persona y lo que haya que saber en
  pills (reemplazo, algo distinto del equipo, superposición). Tocar una fila abre el puesto; un puesto
  vacío tiene «Asignar persona» en la misma fila. Nada se abre solo.
*/

/** Avisos por persona para el selector: quién ya está en este equipo o en otro del mismo turno. */
export function marcasParaSelector(plantilla: { equipos: any[] }, equipoId: string, puestoIdActual?: string) {
  const m = new Map<string, string>();
  const este = plantilla.equipos.find((e) => e._id === equipoId);
  for (const e of plantilla.equipos) {
    for (const a of e.asignaciones) {
      if (!a.userId || a.excluido || a.puestoId === puestoIdActual) continue;
      if (e._id === equipoId) m.set(a.userId, "Ya está en este equipo");
      else if (este?.condiciones?.shiftId && e.condiciones?.shiftId === este.condiciones.shiftId && !m.has(a.userId)) m.set(a.userId, `Ya está en «${e.nombre}» (mismo turno)`);
    }
  }
  return m;
}

export default function PantallaEquipo() {
  const { id = "", equipoId = "" } = useParams();
  const navigate = useNavigate();
  const { catalogos, guardar, areasDe } = usePlantillas();
  const { plantilla: p, noEsta } = usePlantilla(id);
  const [hoja, setHoja] = useState<null | "condiciones" | "nombre" | "proyecto" | { asignar: PuestoDelEquipo }>(null);
  const equipo = p?.equipos.find((e) => e._id === equipoId);
  // El proyecto es del EQUIPO (el grupo sirve en cualquiera): de él salen áreas, empresa, convenio y categorías.
  const { proyecto, empresaId } = proyectoDelEquipo(catalogos, equipo);
  const areas = areasDe(equipo?.projectId);
  const marcas = useMemo(() => (p && hoja && typeof hoja === "object" ? marcasParaSelector(p, equipoId, hoja.asignar.puesto._id) : undefined), [p, equipoId, hoja]);

  if (noEsta || (p && !equipo)) return <Pantalla titulo="Equipo" atras={rutas.grupo(id)}><Vacio texto="Este equipo ya no está." accion="Volver al grupo" onAccion={() => navigate(rutas.grupo(id))} /></Pantalla>;
  if (!p || !equipo) return <Pantalla titulo="Equipo" atras={rutas.grupo(id)} listo={false}><div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /></Pantalla>;

  const puestos = puestosDe(p, equipo);
  const sacados = sacadosDe(p, equipo);
  const est = estadoDe(p, equipo);
  const c = equipo.condiciones || {};
  const cambiar = (cambios: Record<string, any>) => void guardar(() => plantillasEquipoAPI.condicionesEquipo(p._id, equipo._id, cambios));

  /** Otro proyecto, empresa o convenio: la empresa y el convenio únicos se eligen solos y las categorías se recalculan. */
  const cambiarProyecto = (datos: { projectId?: string; empresaContratoId?: string | null; convenioId?: string | null }) => {
    const nuevo = catalogos.proyectos?.find((x) => x._id === (datos.projectId ?? equipo.projectId)) || null;
    const empresas = catalogos.empresasDelProyecto(nuevo);
    const empresa = datos.empresaContratoId !== undefined ? datos.empresaContratoId : datos.projectId !== undefined ? (empresas.length === 1 ? empresas[0]._id : null) : equipo.empresaContratoId;
    const convenio = datos.convenioId !== undefined ? datos.convenioId : catalogos.convenioUnico(nuevo, empresa)?._id || null;
    const categorias = categoriasDelNivel(catalogos, nuevo, empresa, convenio, p.integrantes);
    void guardar(() => plantillasEquipoAPI.actualizarEquipo(p._id, equipo._id, { projectId: nuevo?._id || null, empresaContratoId: empresa || null, convenioId: convenio || null, categorias }));
  };
  const empresas = catalogos.empresasDelProyecto(proyecto);

  const duplicar = async () => {
    const usados = new Set(p.equipos.map((x) => x.nombre.toLowerCase()));
    let nombre = `${equipo.nombre} (copia)`;
    for (let n = 2; usados.has(nombre.toLowerCase()); n++) nombre = `${equipo.nombre} (copia ${n})`;
    const r = await guardar(() => plantillasEquipoAPI.crearEquipo(p._id, nombre, equipo._id));
    const nuevo = r?.equipos[r.equipos.length - 1];
    if (nuevo) navigate(rutas.equipo(p._id, nuevo._id), { replace: true });
  };
  const eliminar = async () => {
    const r: any = await sweetAlert.confirm(`¿Eliminar «${equipo.nombre}»?`, "Los puestos del grupo no cambian.", "Eliminar", "Cancelar");
    if (!(r === true || r?.isConfirmed)) return;
    const ok = await guardar(() => plantillasEquipoAPI.borrarEquipo(p._id, equipo._id));
    if (ok) navigate(rutas.grupo(p._id), { replace: true });
  };

  return (
    <Pantalla
      titulo={equipo.nombre}
      contexto={`${p.nombre}${proyecto ? ` · ${etiquetaProyecto(proyecto)}` : " · sin proyecto"}`}
      atras={rutas.grupo(p._id)}
      boton={{ texto: "Contratar este equipo", onClick: () => navigate(rutas.contratar(p._id, [equipo._id])), deshabilitado: puestos.length === 0, motivo: "El equipo no usa ningún puesto", tono: "verde" }}
    >
      <Seccion titulo="Proyecto">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/70">
          <button type="button" onClick={() => setHoja("proyecto")} className="flex min-h-[48px] w-full items-center gap-3 text-left">
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Cliente | Proyecto</span>
              <span className={`block truncate text-sm font-semibold ${proyecto ? "text-slate-900 dark:text-white" : "text-amber-800 dark:text-amber-300"}`}>{proyecto ? etiquetaProyecto(proyecto) : "Elegí el proyecto"}</span>
            </span>
            {proyecto && <ChipValoracionDelProyecto project={proyecto} valoraciones={catalogos.valoraciones} mostrarSinValorar className="shrink-0" />}
            <FontAwesomeIcon icon={faChevronRight} className="shrink-0 text-slate-500" />
          </button>
          {proyecto && (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Empresa que contrata</span>
                {empresas.length === 1 ? (
                  <p className="flex h-12 items-center rounded-xl bg-slate-100 px-4 text-sm font-medium text-slate-900 dark:bg-slate-900 dark:text-white">{(empresas[0] as any).razonSocial}</p>
                ) : (
                  <select value={equipo.empresaContratoId || ""} onChange={(e) => cambiarProyecto({ empresaContratoId: e.target.value || null, convenioId: undefined })} className={CLASE_CAMPO}>
                    <option value="">Elegí la empresa</option>
                    {empresas.map((c) => (
                      <option key={c._id} value={c._id}>
                        {(c as any).razonSocial}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              {empresaId && <CampoConvenio proyecto={proyecto} empresaId={empresaId} convenioId={equipo.convenioId || ""} catalogos={catalogos} onChange={(id) => id !== (equipo.convenioId || "") && cambiarProyecto({ empresaContratoId: empresaId, convenioId: id || null })} />}
            </>
          )}
        </div>
      </Seccion>

      <Seccion titulo="Condiciones del equipo">
        <FilasCondiciones valores={c} areas={areas} catalogos={catalogos} onAbrirContratoYTurno={() => setHoja("condiciones")} onCambio={cambiar} />
      </Seccion>

      <Seccion titulo={`Puestos · ${est.asignados}/${est.total}`} id="puestos">
        {puestos.length === 0 ? (
          <Vacio texto="Este equipo no usa ningún puesto." />
        ) : (
          <div className="space-y-2">
            {puestos.map((x) => {
              const a = x.asignacion;
              const persona = a?.userId ? a : null;
              const avisos = equipo.avisos?.[x.puesto._id] || [];
              const motivo = a?.reemplazo?.motivoReemplazoId ? catalogos.motivos.find((m) => m._id === a.reemplazo!.motivoReemplazoId)?.name : "";
              return (
                <div key={x.puesto._id} className={`flex items-center gap-2 rounded-xl border bg-white pr-2 dark:bg-slate-800/70 ${!persona ? "border-dashed border-amber-500" : persona.activo ? "border-slate-200 dark:border-slate-700" : "border-red-400"}`}>
                  <button type="button" onClick={() => navigate(rutas.puesto(p._id, equipo._id, x.n))} className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3 py-2 pl-3 text-left">
                    <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-slate-600 dark:text-slate-300">{x.n}</span>
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block truncate text-xs font-semibold text-slate-600 dark:text-slate-300">{nombreRoles(catalogos.roleFrames, x.puesto.rolesFrame)}</span>
                      <span className={`block truncate text-base font-semibold ${persona ? "text-slate-900 dark:text-white" : "text-amber-800 dark:text-amber-300"}`}>{persona ? persona.nombre : "Sin asignar"}</span>
                      {(a?.reemplazo || x.diferencias.length > 0 || avisos.length > 0 || (persona && !persona.activo)) && (
                        <span className="flex flex-wrap gap-1.5">
                          {persona && !persona.activo && <Pill tono="rojo">Inactiva</Pill>}
                          {a?.reemplazo && <Pill tono={a.reemplazo.revisarMotivo || !motivo ? "ambar" : "azul"}>{`Reemplaza a ${a.reemplazo.nombre}${motivo ? ` · ${motivo}` : " · Revisar motivo"}`}</Pill>}
                          {x.diferencias.map((d) => (
                            <Pill key={d}>{d}</Pill>
                          ))}
                          {avisos.length > 0 && <Pill tono="rojo">Se superpone</Pill>}
                        </span>
                      )}
                    </span>
                    {persona && <FontAwesomeIcon icon={faChevronRight} className="shrink-0 text-slate-500" />}
                  </button>
                  {!persona && (
                    <button type="button" onClick={() => setHoja({ asignar: x })} className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-sm font-bold text-white">
                      <FontAwesomeIcon icon={faUserPlus} />
                      Asignar persona
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Seccion>

      {sacados.length > 0 && (
        <Seccion titulo={`No se usan en este equipo · ${sacados.length}`}>
          <div className="space-y-1.5">
            {sacados.map(({ puesto, n }) => (
              <div key={puesto._id} className="flex min-h-[52px] items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 dark:border-slate-700">
                <span className="truncate text-sm text-slate-700 dark:text-slate-200">
                  {n}. {nombreRoles(catalogos.roleFrames, puesto.rolesFrame)}
                </span>
                <button type="button" onClick={() => void guardar(() => plantillasEquipoAPI.usoDelPuesto(p._id, equipo._id, puesto._id, false))} className="min-h-[44px] shrink-0 rounded-xl px-3 text-sm font-bold text-blue-700 dark:text-blue-300">
                  Volver a usar
                </button>
              </div>
            ))}
          </div>
        </Seccion>
      )}

      <Seccion titulo="Más">
        <div className="rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800/70">
          <AccionTexto onClick={() => setHoja("nombre")}>Cambiar el nombre</AccionTexto>
          <AccionTexto onClick={() => void duplicar()}>Duplicar el equipo</AccionTexto>
          <AccionTexto peligro onClick={() => void eliminar()}>Eliminar el equipo</AccionTexto>
        </div>
      </Seccion>

      <HojaContratoYTurno abierta={hoja === "condiciones"} onCerrar={() => setHoja(null)} titulo="Condiciones del equipo" areas={areas} catalogos={catalogos} valores={c} onCambio={cambiar} />
      <HojaInferior abierta={hoja === "proyecto"} onCerrar={() => setHoja(null)} titulo="Cliente | Proyecto" subtitulo="El área y turno se eligen de nuevo; las categorías se recalculan">
        <div className="space-y-2">
          {(catalogos.proyectos || []).map((x) => (
            <button key={x._id} type="button" onClick={() => { setHoja(null); if (x._id !== equipo.projectId) cambiarProyecto({ projectId: x._id }); }} className={`flex min-h-[48px] w-full items-center rounded-xl border px-3 text-left text-sm font-semibold ${x._id === equipo.projectId ? "border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200" : "border-slate-200 text-slate-900 dark:border-slate-700 dark:text-white"}`}>
              {etiquetaProyecto(x)}
            </button>
          ))}
        </div>
      </HojaInferior>
      <HojaNombre abierta={hoja === "nombre"} onCerrar={() => setHoja(null)} actual={equipo.nombre} titulo="Nombre del equipo" onGuardar={(nombre) => void guardar(() => plantillasEquipoAPI.renombrarEquipo(p._id, equipo._id, nombre))} />
      <SelectorPersona
        abierta={!!hoja && typeof hoja === "object"}
        onCerrar={() => setHoja(null)}
        titulo={hoja && typeof hoja === "object" ? `Puesto ${hoja.asignar.n} · ${nombreRoles(catalogos.roleFrames, hoja.asignar.puesto.rolesFrame)}` : ""}
        subtitulo={equipo.nombre}
        projectId={equipo.projectId}
        rol={hoja && typeof hoja === "object" ? catalogos.roleFrames.find((r) => r._id === hoja.asignar.puesto.rolesFrame[0])?.name : undefined}
        marcas={marcas}
        onElegir={(persona) => {
          if (!hoja || typeof hoja !== "object") return;
          const puestoId = hoja.asignar.puesto._id;
          void guardar(() => plantillasEquipoAPI.asignar(p._id, equipo._id, puestoId, persona._id));
        }}
      />
    </Pantalla>
  );
}
