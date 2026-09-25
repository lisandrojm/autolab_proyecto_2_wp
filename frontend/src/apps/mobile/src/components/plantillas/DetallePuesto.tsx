import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { plantillasEquipoAPI, Puesto } from "../../../../../api/plantillasEquipo";
import { sweetAlert } from "../../utils/sweetAlert";
import { usePlantilla, usePlantillas } from "./contexto";
import { AccionTexto, Pantalla, Seccion, Vacio } from "./Pantalla";
import { FilasCondiciones, HojaContratoYTurno } from "./Condiciones";
import { SelectorPersona } from "./SelectorPersona";
import { marcasParaSelector } from "./PantallaEquipo";
import { nombreRoles, nombreTurno, puestosDe, rutas } from "./equipoUtil";
import { CLASE_CAMPO, pesos, textoHorario } from "./comun";

/*
  PANTALLA 4 · UN PUESTO DE UN EQUIPO.

  - PERSONA: quién lo ocupa y «Cambiar persona». Cambiar a la persona NUNCA crea un reemplazo.
  - ¿REEMPLAZA A ALGUIEN?: el único lugar donde se carga un reemplazo: a quién (del equipo del
    proyecto) y el motivo (los de Novedades). Va a la solicitud como en el alta individual.
  - CONDICIONES: «Igual que el equipo» o lo distinto de este puesto, con «Volver a las del equipo».
  - Categoría e importe.
  - Abajo, con texto: «Quitar persona» y «Sacar este puesto del equipo»; y ‹ anterior / siguiente ›
    para recorrer los puestos sin volver a la lista.
*/
type Hoja = null | "persona" | "reemplazado" | "condiciones";

export default function DetallePuesto() {
  const { id = "", equipoId = "", n = "1" } = useParams();
  const navigate = useNavigate();
  const { catalogos, guardar, areasDe } = usePlantillas();
  const { plantilla: p, noEsta } = usePlantilla(id);
  const [hoja, setHoja] = useState<Hoja>(null);
  const [editando, setEditando] = useState(false);
  const [reemplazoAbierto, setReemplazoAbierto] = useState(false);
  const [verAvisos, setVerAvisos] = useState(false);
  const equipo = p?.equipos.find((e) => e._id === equipoId);
  const numero = Number(n);
  const puesto: Puesto | undefined = p?.integrantes[numero - 1];
  const areas = areasDe(p?.projectId);
  const proyecto = catalogos.proyectos?.find((x) => x._id === p?.projectId) || null;
  const lista = useMemo(() => (p && equipo ? puestosDe(p, equipo) : []), [p, equipo]);
  const x = lista.find((y) => y.n === numero);
  const marcas = useMemo(() => (p && puesto ? marcasParaSelector(p, equipoId, puesto._id) : undefined), [p, equipoId, puesto]);
  const [importe, setImporte] = useState("");

  const a = x?.asignacion;
  useEffect(() => {
    setEditando(false);
    setVerAvisos(false);
    setReemplazoAbierto(!!a?.reemplazo);
    setImporte(x?.efectivo.dailyRateManual ? String(x.efectivo.dailyRateManual) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numero, equipoId, !!a?.reemplazo, x?.efectivo.dailyRateManual]);

  const atras = rutas.equipo(id, equipoId);
  if (noEsta || (p && (!equipo || !puesto))) return <Pantalla titulo="Puesto" atras={atras}><Vacio texto="Este puesto ya no está." accion="Volver al equipo" onAccion={() => navigate(atras)} /></Pantalla>;
  if (!p || !equipo || !puesto) return <Pantalla titulo="Puesto" atras={atras} listo={false}><div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /></Pantalla>;

  const rol = nombreRoles(catalogos.roleFrames, puesto.rolesFrame);
  const contexto = `${equipo.nombre} · ${p.nombre}`;

  // Sacado de este equipo: sólo se puede volver a usar.
  if (!x) {
    return (
      <Pantalla titulo={`Puesto ${numero} · ${rol}`} contexto={contexto} atras={atras}>
        <Vacio texto="Este puesto no se usa en este equipo." accion="Volver a usarlo" onAccion={() => void guardar(() => plantillasEquipoAPI.usoDelPuesto(p._id, equipo._id, puesto._id, false))} />
      </Pantalla>
    );
  }

  const persona = a?.userId ? a : null;
  const avisos = equipo.avisos?.[puesto._id] || [];
  const r = a?.reemplazo || null;
  const efectivo = x.efectivo;
  const base = x.base;
  const distintas = new Set<string>([...(x.diferencias.includes("Otra área o turno") || x.diferencias.includes("Otro contrato") ? ["turno"] : []), ...(x.diferencias.includes("Horario distinto") ? ["horario"] : []), ...(x.diferencias.includes("Otros días") ? ["dias"] : [])]);
  const idx = lista.findIndex((y) => y.n === numero);
  const anterior = lista[idx - 1];
  const siguiente = lista[idx + 1];
  const irA = (m: number) => navigate(rutas.puesto(p._id, equipo._id, m), { replace: true });

  /** El puesto como debería quedar en este equipo; el server guarda sólo lo distinto del equipo. */
  const cambiar = (cambios: Record<string, any>) => {
    const cuerpo = { areaId: efectivo.areaId, shiftId: efectivo.shiftId, inTime: efectivo.inTime, outTime: efectivo.outTime, diasSemana: efectivo.diasSemana, diasPorSemana: efectivo.diasPorSemana, diasRotativos: efectivo.diasRotativos, contratoId: efectivo.contratoId, nombreContrato: efectivo.nombreContrato, tipoImpositivo: efectivo.tipoImpositivo, categoriaSatId: efectivo.categoriaSatId, dailyRateManual: efectivo.dailyRateManual, ...cambios };
    return guardar(() => plantillasEquipoAPI.condiciones(p._id, equipo._id, puesto._id, cuerpo as any));
  };
  const volverAlEquipo = () => void cambiar({ areaId: base.areaId, shiftId: base.shiftId, inTime: base.inTime, outTime: base.outTime, diasSemana: base.diasSemana, diasPorSemana: base.diasPorSemana, diasRotativos: base.diasRotativos, contratoId: base.contratoId, nombreContrato: base.nombreContrato, tipoImpositivo: base.tipoImpositivo }).then(() => setEditando(false));

  const quitarReemplazo = () => void guardar(() => plantillasEquipoAPI.reemplazo(p._id, equipo._id, puesto._id, { quitar: true }));
  const esServicios = efectivo.tipoImpositivo === "constancia_cuit";
  const empresa = p.empresaContratoId;
  const convenio = p.convenioId || catalogos.convenioUnico(proyecto, empresa)?._id || "";
  const categorias = catalogos.categoriasPara(proyecto, empresa, convenio, puesto.rolesFrame, false, true);
  const resumenEquipo = [nombreTurno(areas, base.areaId, base.shiftId), textoHorario(base.inTime, base.outTime), base.nombreContrato].filter(Boolean).join(" · ");

  return (
    <Pantalla
      titulo={`Puesto ${numero} · ${rol}`}
      contexto={contexto}
      atras={atras}
      pie={
        <div className="flex gap-2">
          <button type="button" onClick={() => anterior && irA(anterior.n)} disabled={!anterior} className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 text-sm font-bold text-slate-800 disabled:opacity-30 dark:border-slate-600 dark:text-slate-100">
            <FontAwesomeIcon icon={faChevronLeft} />
            Puesto anterior
          </button>
          <button type="button" onClick={() => siguiente && irA(siguiente.n)} disabled={!siguiente} className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 text-sm font-bold text-slate-800 disabled:opacity-30 dark:border-slate-600 dark:text-slate-100">
            Puesto siguiente
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
        </div>
      }
    >
      <Seccion titulo="Persona">
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/70">
          <p className={`text-lg font-bold ${persona ? "text-slate-900 dark:text-white" : "text-amber-800 dark:text-amber-300"}`}>{persona ? persona.nombre : "Sin asignar"}</p>
          {persona && !persona.activo && <p className="text-sm font-semibold text-red-700 dark:text-red-300">Está inactiva: no se puede contratar.</p>}
          <button type="button" onClick={() => setHoja("persona")} className="mt-2 min-h-[44px] w-full rounded-xl bg-blue-600 text-sm font-bold text-white">
            {persona ? "Cambiar persona" : "Asignar persona"}
          </button>
          {avisos.length > 0 && (
            <div className="mt-3 rounded-xl bg-red-50 p-2 dark:bg-red-500/10">
              <button type="button" onClick={() => setVerAvisos((v) => !v)} aria-expanded={verAvisos} className="flex min-h-[40px] w-full items-center gap-2 text-left text-sm font-semibold text-red-800 dark:text-red-200">
                <FontAwesomeIcon icon={faTriangleExclamation} />
                <span className="flex-1">{avisos.length === 1 ? "Se superpone con otro compromiso" : `Se superpone con ${avisos.length} compromisos`}</span>
                <span className="text-xs underline">{verAvisos ? "Ocultar" : "Ver"}</span>
              </button>
              {verAvisos && (
                <ul className="mt-1 list-disc space-y-1 pl-6 text-xs text-red-900 dark:text-red-100">
                  {avisos.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </Seccion>

      <Seccion titulo="Reemplazo">
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/70">
          <label className="flex min-h-[44px] items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">¿Reemplaza a alguien?</span>
            <input
              type="checkbox"
              role="switch"
              checked={reemplazoAbierto}
              onChange={(e) => {
                setReemplazoAbierto(e.target.checked);
                if (!e.target.checked && r) quitarReemplazo();
              }}
              className="h-6 w-11 cursor-pointer appearance-none rounded-full bg-slate-300 transition before:ml-0.5 before:mt-0.5 before:block before:h-5 before:w-5 before:rounded-full before:bg-white before:transition checked:bg-blue-600 checked:before:translate-x-5 dark:bg-slate-600"
            />
          </label>
          {reemplazoAbierto && (
            <div className="mt-2 space-y-3">
              <button type="button" onClick={() => setHoja("reemplazado")} className="flex min-h-[48px] w-full items-center justify-between rounded-xl border border-slate-300 px-3 text-left dark:border-slate-600">
                <span>
                  <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Reemplaza a</span>
                  <span className={`block text-sm font-semibold ${r ? "text-slate-900 dark:text-white" : "text-amber-800 dark:text-amber-300"}`}>{r ? r.nombre : "Elegí a quién"}</span>
                </span>
                <FontAwesomeIcon icon={faChevronRight} className="text-slate-500" />
              </button>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">Motivo{r?.revisarMotivo ? " · venía sin motivo, elegilo" : ""}</p>
                <div className="flex flex-wrap gap-2">
                  {catalogos.motivos.map((m) => {
                    const on = r?.motivoReemplazoId === m._id;
                    return (
                      <button key={m._id} type="button" aria-pressed={on} disabled={!r} onClick={() => r && void guardar(() => plantillasEquipoAPI.reemplazo(p._id, equipo._id, puesto._id, { replacedUserId: r.replacedUserId, motivoReemplazoId: m._id }))} className={`min-h-[44px] rounded-full px-4 text-sm font-semibold disabled:opacity-40 ${on ? "bg-blue-600 text-white" : "border border-slate-300 text-slate-800 dark:border-slate-600 dark:text-slate-100"}`}>
                        {m.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </Seccion>

      <Seccion titulo="Condiciones">
        {x.diferencias.length === 0 && !editando ? (
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/70">
            <p className="text-sm text-slate-800 dark:text-slate-100">
              <span className="font-semibold">Igual que el equipo</span>
              {resumenEquipo ? ` (${resumenEquipo})` : ""}
            </p>
            <button type="button" onClick={() => setEditando(true)} className="mt-1 min-h-[44px] text-sm font-bold text-blue-700 dark:text-blue-300">
              Cambiar solo para este puesto
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <FilasCondiciones valores={efectivo} areas={areas} catalogos={catalogos} onAbrirContratoYTurno={() => setHoja("condiciones")} onCambio={(c) => void cambiar(c)} distintas={distintas} />
            <button type="button" onClick={volverAlEquipo} className="min-h-[44px] text-sm font-bold text-blue-700 dark:text-blue-300">
              Volver a las del equipo
            </button>
          </div>
        )}
      </Seccion>

      {!esServicios && (
        <Seccion titulo="Categoría e importe">
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/70">
            <select value={efectivo.categoriaSatId || ""} onChange={(e) => void cambiar({ categoriaSatId: e.target.value || null })} className={CLASE_CAMPO} aria-label="Categoría">
              <option value="">{empresa ? "Elegí la categoría" : "Elegí la empresa en el grupo"}</option>
              {efectivo.categoriaSatId && !categorias.documentos.some((c) => c._id === efectivo.categoriaSatId) && <option value={efectivo.categoriaSatId}>{catalogos.categoriasSat.find((c) => c._id === efectivo.categoriaSatId)?.name || "Categoría anterior"}</option>}
              {categorias.documentos.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                  {categorias.nivelPorId.get(c._id) ? ` · ${categorias.nivelPorId.get(c._id)!.nombre}` : ""}
                </option>
              ))}
            </select>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Importe por jornada (opcional)</span>
              <input type="text" inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))} onBlur={() => { const v = Number(importe) > 0 ? Number(importe) : null; if (v !== (efectivo.dailyRateManual ?? null)) void cambiar({ dailyRateManual: v }); }} placeholder="Vacío = el de la escala" className={CLASE_CAMPO} />
              {efectivo.dailyRateManual ? <span className="mt-1 block text-xs text-slate-600 dark:text-slate-300">Fijado: {pesos(efectivo.dailyRateManual)}</span> : null}
            </label>
          </div>
        </Seccion>
      )}

      <Seccion titulo="Más">
        <div className="rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800/70">
          {persona && <AccionTexto onClick={() => void guardar(() => plantillasEquipoAPI.asignar(p._id, equipo._id, puesto._id, null))}>Quitar persona</AccionTexto>}
          <AccionTexto
            peligro
            onClick={async () => {
              const ok: any = await sweetAlert.confirm("¿Sacar este puesto del equipo?", "Sigue en el grupo y se puede volver a usar.", "Sacar", "Cancelar");
              if (!(ok === true || ok?.isConfirmed)) return;
              const r2 = await guardar(() => plantillasEquipoAPI.usoDelPuesto(p._id, equipo._id, puesto._id, true));
              if (r2) navigate(atras, { replace: true });
            }}
          >
            Sacar este puesto del equipo
          </AccionTexto>
        </div>
      </Seccion>

      <SelectorPersona
        abierta={hoja === "persona"}
        onCerrar={() => setHoja(null)}
        titulo={`Puesto ${numero} · ${rol}`}
        subtitulo={equipo.nombre}
        projectId={p.projectId}
        rol={catalogos.roleFrames.find((y) => y._id === puesto.rolesFrame[0])?.name}
        marcas={marcas}
        onElegir={(pe) => void guardar(() => plantillasEquipoAPI.asignar(p._id, equipo._id, puesto._id, pe._id))}
      />
      <SelectorPersona
        abierta={hoja === "reemplazado"}
        onCerrar={() => setHoja(null)}
        titulo="¿A quién reemplaza?"
        subtitulo="Del equipo del proyecto"
        projectId={p.projectId}
        soloProyecto
        onElegir={(pe) => void guardar(() => plantillasEquipoAPI.reemplazo(p._id, equipo._id, puesto._id, { replacedUserId: pe._id, motivoReemplazoId: r?.motivoReemplazoId ?? null }))}
      />
      <HojaContratoYTurno abierta={hoja === "condiciones"} onCerrar={() => setHoja(null)} titulo={`Puesto ${numero}: contrato y turno`} areas={areas} catalogos={catalogos} valores={efectivo} onCambio={(c) => void cambiar(c)} />
    </Pantalla>
  );
}
