import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronRight, faCircleExclamation, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { plantillasEquipoAPI, Preview } from "../../../../../api/plantillasEquipo";
import { usePlantilla, usePlantillas } from "./contexto";
import { Pantalla, Seccion } from "./Pantalla";
import { borrarEstado, EstadoContratar, guardarEstado, leerEstado, nuevaClave, pedidosDe } from "./estadoContratar";
import { nombreRoles, nombreTurno, proyectoDelEquipo, puestosDe, rutas } from "./equipoUtil";
import { etiquetaProyecto } from "./useCatalogosContratacion";
import { ChipTurno, CLASE_CAMPO, fechaCorta, pesos, Pill, textoHorario } from "./comun";
import { Pasos } from "./Pasos";

/*
  CONTRATAR · PASO 2 DE 2 · REVISIÓN. Es LA SOLICITUD MÚLTIPLE: lo que se ve es exactamente lo que se
  crea (el server arma este plan con las mismas reglas con que después crea las solicitudes).

  Arriba, el resumen y los ERRORES (bloquean) y AVISOS (no), cada uno con «Corregir»: lleva al puesto
  y Atrás vuelve acá. Por equipo, plegable: lo común una sola vez (empresa, convenio, contrato, área y
  turno, horario, fechas) y la lista de personas. «Enviar N solicitudes»: todas juntas o ninguna.
*/

interface Problema {
  tipo: "error" | "aviso";
  texto: string;
  equipo: string;
  corregir?: () => void;
}

export default function ContratarRevision() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { catalogos, areasDe, cargar } = usePlantillas();
  const { plantilla: p } = usePlantilla(id);
  const [estado, setEstado] = useState<EstadoContratar | null>(() => leerEstado(id));
  const [previews, setPreviews] = useState<Record<string, Preview> | null>(null);
  const [fallo, setFallo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [comentando, setComentando] = useState<string | null>(null);

  const pedidos = useMemo(() => (p && estado ? pedidosDe(p, estado, catalogos) : []), [p, estado, catalogos]);
  // Se recalcula al entrar (también al volver de corregir un puesto). Los comentarios no cambian el cálculo.
  const firma = JSON.stringify(pedidos.map(({ puntuales, ...x }) => x));
  useEffect(() => {
    if (!p || pedidos.length === 0) return;
    let vigente = true;
    setPreviews(null);
    setFallo("");
    plantillasEquipoAPI
      .previewVarios(p._id, pedidos)
      .then((r) => vigente && setPreviews(Object.fromEntries(r.equipos.map((x) => [x.equipoId, x]))))
      .catch((e) => vigente && setFallo(e?.response?.data?.error || "No se pudo calcular. Probá de nuevo."));
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, firma]);

  if (!estado) return <Navigate to={rutas.contratar(id)} replace />;
  const atras = rutas.contratar(id);
  if (!p || (!previews && !fallo)) {
    return (
      <Pantalla titulo="Revisión" contexto={p?.nombre} atras={atras} listo={false}>
        <Pasos actual={2} />
        <div className="space-y-3" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      </Pantalla>
    );
  }

  const equipos = p.equipos.filter((e) => estado.equipos[e._id]?.incluido);

  // Los problemas, con a dónde ir a corregirlos.
  const problemas: Problema[] = [];
  let solicitudes = 0;
  let jornadas = 0;
  let total = 0;
  let reemplazos = 0;
  for (const e of equipos) {
    const pv = previews?.[e._id];
    if (!pv) continue;
    solicitudes += pv.totales.personas;
    jornadas += pv.totales.jornadas;
    total += pv.totales.importe;
    const numero = new Map(p.integrantes.map((i, k) => [i._id, k + 1]));
    for (const f of pv.filas.filter((x) => !x.excluido)) {
      const n = numero.get(f.integranteId);
      const ir = n ? () => navigate(rutas.puesto(p._id, e._id, n)) : undefined;
      for (const t of f.errores) problemas.push({ tipo: "error", equipo: e.nombre, texto: `${n ? `Puesto ${n} · ` : ""}${f.nombre}: ${t}`, corregir: /fecha|día/i.test(t) ? () => navigate(rutas.contratar(p._id)) : ir });
      for (const t of f.advertencias) problemas.push({ tipo: "aviso", equipo: e.nombre, texto: `${f.nombre}: ${t}`, corregir: ir });
    }
    reemplazos += puestosDe(p, e).filter((x) => x.asignacion?.reemplazo).length;
  }
  const errores = problemas.filter((x) => x.tipo === "error");
  const avisos = problemas.filter((x) => x.tipo === "aviso");

  const enviar = async () => {
    setEnviando(true);
    try {
      const r = await plantillasEquipoAPI.contratarVarios(p._id, pedidos, estado.clave);
      borrarEstado(p._id);
      void cargar(p._id);
      navigate(rutas.enviado(p._id), { replace: true, state: { lotes: r.lotes, repetido: r.repetido, grupo: p.nombre } });
    } catch (e: any) {
      // Nada se creó (es todo o nada): se muestra el porqué con el detalle por equipo.
      const datos = e?.response?.data;
      if (Array.isArray(datos?.plan?.equipos)) setPreviews(Object.fromEntries(datos.plan.equipos.map((x: any) => [x.equipoId, x])));
      setFallo(datos?.error || "No se envió ninguna solicitud. Probá de nuevo.");
      // Otra clave para el próximo intento: éste no creó nada.
      const nuevo = { ...estado, clave: nuevaClave() };
      setEstado(nuevo);
      guardarEstado(p._id, nuevo);
    } finally {
      setEnviando(false);
    }
  };

  const ponerComentario = (k: string, v: string) => {
    const nuevo = { ...estado, comentarios: { ...estado.comentarios, [k]: v } };
    setEstado(nuevo);
    guardarEstado(p._id, nuevo);
  };

  return (
    <Pantalla
      titulo="Revisión"
      contexto={p.nombre}
      atras={atras}
      boton={{
        texto: `Enviar ${solicitudes} ${solicitudes === 1 ? "solicitud" : "solicitudes"}`,
        onClick: () => void enviar(),
        deshabilitado: errores.length > 0 || solicitudes === 0,
        motivo: errores.length ? `Corregí ${errores.length === 1 ? "1 error" : `${errores.length} errores`} para enviar` : "No hay nada para enviar",
        onMotivo: () => document.getElementById("problemas")?.scrollIntoView({ behavior: "smooth", block: "start" }),
        cargando: enviando,
        tono: "verde",
      }}
      notaBoton="Se envían todas juntas: si una falla, no sale ninguna."
    >
      <Pasos actual={2} />

      <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-800/70">
        <Dato titulo="Solicitudes" valor={String(solicitudes)} />
        <Dato titulo="Equipos" valor={String(equipos.length)} />
        <Dato titulo="Jornadas" valor={String(jornadas)} />
        <Dato titulo="Total estimado" valor={pesos(total)} />
        <Dato titulo="Reemplazos" valor={String(reemplazos)} />
        <Dato titulo="Errores / avisos" valor={`${errores.length} / ${avisos.length}`} alerta={errores.length > 0} />
      </div>

      {fallo && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800 dark:bg-red-500/15 dark:text-red-200">{fallo}</p>}

      {problemas.length > 0 && (
        <Seccion titulo={errores.length ? "Para corregir" : "Avisos"} id="problemas">
          <div className="space-y-2">
            {[...errores, ...avisos].map((x, k) => (
              <div key={k} className={`flex items-start gap-2 rounded-xl p-3 ${x.tipo === "error" ? "bg-red-50 dark:bg-red-500/15" : "bg-amber-50 dark:bg-amber-500/15"}`}>
                <FontAwesomeIcon icon={x.tipo === "error" ? faCircleExclamation : faTriangleExclamation} className={`mt-0.5 ${x.tipo === "error" ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`} />
                <p className={`min-w-0 flex-1 text-sm ${x.tipo === "error" ? "text-red-900 dark:text-red-100" : "text-amber-900 dark:text-amber-100"}`}>
                  <span className="font-semibold">{x.equipo}</span> · {x.texto}
                </p>
                {x.corregir && (
                  <button type="button" onClick={x.corregir} className="min-h-[36px] shrink-0 rounded-lg px-2 text-sm font-bold text-blue-700 underline dark:text-blue-300">
                    Corregir
                  </button>
                )}
              </div>
            ))}
          </div>
        </Seccion>
      )}

      {equipos.map((e) => {
        const pv = previews?.[e._id];
        const c = e.condiciones || {};
        const f = estado.equipos[e._id];
        const abierto = abiertos[e._id] ?? true;
        const filas = (pv?.filas || []).filter((x) => !x.excluido);
        const contratos = [...new Set(filas.map((x) => x.nombreContrato).filter(Boolean))].join(" · ");
        const fechas = f.fechas.length ? `${f.fechas.length} ${f.fechas.length === 1 ? "jornada" : "jornadas"}: ${f.fechas.map(fechaCorta).join(" · ")}` : f.desde ? `${fechaCorta(f.desde)} → ${f.hasta ? fechaCorta(f.hasta) : "sin baja"}` : "";
        const porPuesto = new Map(puestosDe(p, e).map((x) => [x.puesto._id, x]));
        // Cada equipo va a SU proyecto, con su empresa y su convenio.
        const { proyecto, empresaId, convenioId } = proyectoDelEquipo(catalogos, e);
        const empresa = catalogos.companies.find((c) => c._id === empresaId) as any;
        const convenio = catalogos.convenios.find((c) => c._id === convenioId);
        const areas = areasDe(e.projectId);
        return (
          <section key={e._id} className="mb-4 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/70">
            <button type="button" onClick={() => setAbiertos((a) => ({ ...a, [e._id]: !abierto }))} aria-expanded={abierto} className="flex min-h-[56px] w-full items-center gap-3 px-3 text-left">
              <FontAwesomeIcon icon={abierto ? faChevronDown : faChevronRight} className="text-slate-500" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-bold text-slate-900 dark:text-white">{e.nombre}</span>
                <span className="block text-xs text-slate-600 dark:text-slate-300">{pv ? `${pv.totales.personas} solicitudes · ${pesos(pv.totales.importe)}` : ""}</span>
              </span>
            </button>
            {abierto && (
              <div className="space-y-3 border-t border-slate-200 px-3 py-3 dark:border-slate-700">
                <dl className="grid grid-cols-1 gap-1.5 text-sm">
                  <Fila titulo="Proyecto" valor={proyecto ? etiquetaProyecto(proyecto) : "—"} />
                  <Fila titulo="Empresa" valor={empresa?.razonSocial || "—"} />
                  <Fila titulo="Convenio" valor={convenio ? `${convenio.externalId || ""} ${convenio.name || ""}`.trim() : "—"} />
                  <Fila titulo="Contrato" valor={contratos || "—"} />
                  <Fila titulo="Área y turno" valor={<ChipTurno inicio={c.inTime} texto={nombreTurno(areas, c.areaId, c.shiftId) || undefined} />} />
                  <Fila titulo="Horario" valor={textoHorario(c.inTime, c.outTime)} />
                  <Fila titulo="Fechas" valor={fechas || "—"} />
                </dl>
                <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                  {filas.map((x) => {
                    const pe = porPuesto.get(x.integranteId);
                    const r = pe?.asignacion?.reemplazo;
                    const motivo = r?.motivoReemplazoId ? catalogos.motivos.find((m) => m._id === r.motivoReemplazoId)?.name : "";
                    const k = `${e._id}:${x.integranteId}`;
                    const horarioDistinto = (x.inTime || null) !== (c.inTime || null) || (x.outTime || null) !== (c.outTime || null);
                    return (
                      <li key={x.integranteId} className="py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className={`truncate text-sm font-semibold ${x.errores.length ? "text-red-800 dark:text-red-200" : "text-slate-900 dark:text-white"}`}>{x.nombre}</p>
                            <p className="truncate text-xs text-slate-600 dark:text-slate-300">
                              {pe ? nombreRoles(catalogos.roleFrames, pe.puesto.rolesFrame) : ""} · {x.categoriaNombre || (x.origenImporte === "servicios" ? "Servicio" : "Sin categoría")} · {x.jornadas} × {pesos(x.importes.jornada)}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-bold tabular-nums text-slate-900 dark:text-white">{pesos(x.importes.total)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {r && <Pill tono={motivo ? "azul" : "ambar"}>{`Reemplaza a ${r.nombre}${motivo ? ` · ${motivo}` : " · falta el motivo"}`}</Pill>}
                          {horarioDistinto && <Pill>{`Horario ${textoHorario(x.inTime, x.outTime)}`}</Pill>}
                          {x.advertencias.length > 0 && <Pill tono={x.superposicionHorario ? "rojo" : "ambar"}>Se superpone</Pill>}
                          {x.errores.length > 0 && <Pill tono="rojo">{x.errores.length === 1 ? "1 error" : `${x.errores.length} errores`}</Pill>}
                        </div>
                        {comentando === k || estado.comentarios[k] ? (
                          <textarea
                            rows={2}
                            autoFocus={comentando === k}
                            value={estado.comentarios[k] || ""}
                            onChange={(ev) => ponerComentario(k, ev.target.value)}
                            onBlur={() => setComentando(null)}
                            placeholder="Comentario para esta solicitud"
                            aria-label={`Comentario para ${x.nombre}`}
                            className={`${CLASE_CAMPO} mt-2 h-auto py-2`}
                          />
                        ) : (
                          <button type="button" onClick={() => setComentando(k)} className="mt-1 min-h-[36px] text-xs font-semibold text-blue-700 dark:text-blue-300">
                            Agregar comentario
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        );
      })}
    </Pantalla>
  );
}

function Dato({ titulo, valor, alerta }: { titulo: string; valor: string; alerta?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-600 dark:text-slate-300">{titulo}</p>
      <p className={`text-base font-bold tabular-nums ${alerta ? "text-red-700 dark:text-red-300" : "text-slate-900 dark:text-white"}`}>{valor}</p>
    </div>
  );
}

function Fila({ titulo, valor }: { titulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="w-24 shrink-0 text-slate-600 dark:text-slate-300">{titulo}</dt>
      <dd className="min-w-0 flex-1 text-slate-900 dark:text-white">{valor}</dd>
    </div>
  );
}
