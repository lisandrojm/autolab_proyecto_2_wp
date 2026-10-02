import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleExclamation, faCircleInfo, faPen, faTriangleExclamation, faUsers } from "@fortawesome/free-solid-svg-icons";
import { plantillasEquipoAPI, Preview, Puntual } from "../../../../../api/plantillasEquipo";
import { usePlantilla, usePlantillas } from "./contexto";
import { Pantalla } from "./Pantalla";
import { borrarEstado, clavePuntual, EstadoContratar, guardarEstado, leerEstado, nuevaClave, pedidosDe, puntualLimpio } from "./estadoContratar";
import { HojaPuntual } from "./ContratarPersonas";
import { sweetAlert } from "../../utils/sweetAlert";
import { nombreRoles, nombreTurno, proyectoDelEquipo, puestosDe, rutas } from "./equipoUtil";
import { etiquetaProyecto } from "./useCatalogosContratacion";
import { ChipTurno, fechaCorta, pesos, Pill, textoHorario } from "./comun";
import { PASOS_CONTRATAR } from "./Pasos";
import { Rotulo } from "./piezas";
import { ModalInfo } from "../ModalInfo";

/*
  CONTRATAR · PASO 2 DE 2 · REVISIÓN. Es LA SOLICITUD MÚLTIPLE: lo que se ve es exactamente lo que se
  crea (el server arma este plan con las mismas reglas con que después crea las solicitudes).

  Arriba, el resumen y los ERRORES (bloquean) y AVISOS (no), cada uno con «Corregir», que abre la hoja
  de esa persona acá mismo. Por equipo: el nombre con una «i» que muestra lo común (proyecto, empresa,
  convenio, contrato, área y turno, horario, fechas) y una tarjeta por persona con su lápiz. «Enviar N
  solicitudes» pregunta antes, y el cartel explica qué va a pasar: todas juntas o ninguna.
*/

interface Problema {
  tipo: "error" | "aviso";
  texto: string;
  equipo: string;
  corregir?: () => void;
}

/*
  LOS AVISOS, POR PERSONA Y SIN REPETIR.

  El server manda cada aviso como una oración larga («Nombre: Tiene un contrato vigente en … del … al …
  (hh a hh): las fechas se cruzan, en otro horario. No se pudo confirmar: sin días cargados.») y la
  lista los mostraba uno por uno: la misma persona dos o tres veces, el mismo texto repetido, y un
  «Corregir» apretado al costado que angostaba todo. Se leía como un muro.

  Ahora: una frase arriba que dice si esto frena o no el envío, y una tarjeta por persona con su
  nombre, el equipo, cada conflicto UNA vez (lo que no se pudo verificar, aparte y en gris) y un solo
  «Corregir» abajo.
*/
function ListaProblemas({ errores, avisos }: { errores: Problema[]; avisos: Problema[] }) {
  type Grupo = { clave: string; tipo: Problema["tipo"]; persona: string; equipo: string; detalles: { texto: string; nota: string }[]; corregir?: () => void };
  const grupos: Grupo[] = [];
  for (const x of [...errores, ...avisos]) {
    const i = x.texto.indexOf(": ");
    const persona = i > 0 ? x.texto.slice(0, i) : "";
    const resto = i > 0 ? x.texto.slice(i + 2) : x.texto;
    // «No se pudo confirmar: …» es una salvedad del chequeo, no otro problema: va aparte y en gris.
    const [crudo, nota = ""] = resto.split(/\s*No se pudo confirmar:\s*/);
    const texto = crudo.trim();
    const clave = `${x.tipo}|${x.equipo}|${persona}`;
    let g = grupos.find((y) => y.clave === clave);
    if (!g) grupos.push((g = { clave, tipo: x.tipo, persona, equipo: x.equipo, detalles: [], corregir: x.corregir }));
    if (!g.detalles.some((d) => d.texto === texto)) g.detalles.push({ texto, nota: nota.replace(/\.$/, "").trim() });
  }
  const personasConError = new Set(grupos.filter((g) => g.tipo === "error").map((g) => g.persona)).size;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-700 dark:text-slate-300">
        {errores.length
          ? `Hay que corregir ${personasConError === 1 ? "1 persona" : `${personasConError} personas`} antes de enviar.`
          : "Esto no frena el envío. Son personas que ya tienen otro contrato o solicitud en esas fechas: revisá que no queden en dos lugares a la vez."}
      </p>
      {grupos.map((g) => {
        const error = g.tipo === "error";
        return (
          <div key={g.clave} className={`rounded-xl border p-3 ${error ? "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10" : "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10"}`}>
            <div className="flex items-start gap-2">
              <FontAwesomeIcon icon={error ? faCircleExclamation : faTriangleExclamation} className={`mt-1 h-3.5 w-3.5 shrink-0 ${error ? "text-red-600 dark:text-red-300" : "text-amber-600 dark:text-amber-300"}`} />
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white">{g.persona || g.equipo}</p>
                {g.persona && <p className="text-xs text-slate-500 dark:text-slate-400">{g.equipo}</p>}
              </div>
            </div>
            <ul className="mt-2 space-y-2 pl-5">
              {g.detalles.map((d, k) => (
                <li key={k} className="text-[13px] leading-snug text-slate-700 dark:text-slate-200">
                  {d.texto}
                  {d.nota && <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">No se pudo verificar: {d.nota}.</span>}
                </li>
              ))}
            </ul>
            {g.corregir && (
              <button type="button" onClick={g.corregir} className="mt-3 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white text-sm font-semibold text-blue-700 dark:border-slate-600 dark:bg-slate-900 dark:text-blue-300">
                Corregir
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
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
  const [editando, setEditando] = useState<{ equipoId: string; puestoId: string } | null>(null);
  const [verProblemas, setVerProblemas] = useState(false);
  const [datosDe, setDatosDe] = useState<string | null>(null);

  const pedidos = useMemo(() => (p && estado ? pedidosDe(p, estado, catalogos) : []), [p, estado, catalogos]);
  // Se recalcula cuando cambia algo que cambia el cálculo: los puntuales sí, los comentarios no.
  const firma = JSON.stringify(pedidos.map((x) => ({ ...x, puntuales: Object.fromEntries(Object.entries(x.puntuales).map(([k, v]) => [k, { ...v, comentarios: undefined }])) })));
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
  const atras = rutas.personas(id);
  if (!p || (!previews && !fallo)) {
    return (
      <Pantalla titulo="Revisión" contexto={p?.nombre} atras={atras} listo={false} pasos={{ actual: 3, etiquetas: PASOS_CONTRATAR }}>
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
      // A corregir se abre la hoja de esa persona —lo suyo, sólo esta vez—, acá mismo. No se edita la plantilla.
      const ir = n
        ? () => {
            setVerProblemas(false);
            setEditando({ equipoId: e._id, puestoId: f.integranteId });
          }
        : undefined;
      for (const t of f.errores) problemas.push({ tipo: "error", equipo: e.nombre, texto: `${n ? `Puesto ${n} · ` : ""}${f.nombre}: ${t}`, corregir: /fecha|día/i.test(t) ? () => navigate(rutas.contratar(p._id)) : ir });
      for (const t of f.advertencias) problemas.push({ tipo: "aviso", equipo: e.nombre, texto: `${f.nombre}: ${t}`, corregir: ir });
    }
    reemplazos += puestosDe(p, e).filter((x) => x.asignacion?.reemplazo).length;
  }
  const errores = problemas.filter((x) => x.tipo === "error");
  const avisos = problemas.filter((x) => x.tipo === "aviso");

  /*
    ANTES DE MANDAR, QUÉ VA A PASAR. Era una nota fija debajo del botón («si una falla, no sale
    ninguna») que se leía siempre y no explicaba el resto. Ahora es un cartel al tocar Enviar, con
    todo lo que conviene saber una sola vez, justo cuando importa.
  */
  const confirmarYEnviar = async () => {
    const puntos = [
      `Se crean ${solicitudes === 1 ? "1 solicitud de alta" : `${solicitudes} solicitudes de alta`}, una por persona${equipos.length > 1 ? `, en ${equipos.length} equipos` : ""}. Son iguales a las del alta individual.`,
      "Se envían todas juntas: si alguna falla, no se crea ninguna y volvés acá a ver por qué.",
      `Total estimado: ${pesos(total)}.`,
      ...(avisos.length ? [`${avisos.length === 1 ? "Hay 1 aviso" : `Hay ${avisos.length} avisos`} (personas con otro contrato en esas fechas). No frenan el envío.`] : []),
      "Quedan pendientes hasta que las aprueben. Las seguís en Contratación → Historial, cada una con su estado.",
    ];
    const r: any = await sweetAlert.confirmEnvio(solicitudes === 1 ? "¿Enviar la solicitud?" : `¿Enviar ${solicitudes} solicitudes?`, puntos, "Enviar", "Volver");
    if (r?.isConfirmed) void enviar();
  };

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

  /** Lo que se cambió en la hoja de una persona: mismo guardado que en el paso 2. */
  const ponerPuntual = (equipoId: string, puestoId: string, puntual: Puntual | null, nombres: Record<string, string> = {}) => {
    const k = clavePuntual(equipoId, puestoId);
    const puntuales = { ...estado.puntuales };
    const limpio = puntualLimpio(puntual || undefined);
    if (Object.keys(limpio).length) puntuales[k] = limpio;
    else delete puntuales[k];
    const nuevo: EstadoContratar = { ...estado, puntuales, nombres: { ...estado.nombres, ...nombres } };
    setEstado(nuevo);
    guardarEstado(p._id, nuevo);
  };

  const enEdicion = editando && (() => {
    const e = equipos.find((x) => x._id === editando.equipoId);
    const x = e && puestosDe(p, e).find((y) => y.puesto._id === editando.puestoId);
    const fila = previews?.[editando.equipoId]?.filas.find((f) => f.integranteId === editando.puestoId);
    return e && x ? { e, x, fila } : null;
  })();

  return (
    <Pantalla
      titulo="Revisión"
      contexto={p.nombre}
      atras={atras}
      boton={{
        texto: `Enviar ${solicitudes} ${solicitudes === 1 ? "solicitud" : "solicitudes"}`,
        onClick: () => void confirmarYEnviar(),
        deshabilitado: errores.length > 0 || solicitudes === 0,
        motivo: errores.length ? `Corregí ${errores.length === 1 ? "1 error" : `${errores.length} errores`} para enviar` : "No hay nada para enviar",
        onMotivo: () => setVerProblemas(true),
        cargando: enviando,

      }}
      pasos={{ actual: 3, etiquetas: PASOS_CONTRATAR }}
      atrasPaso={() => navigate(atras)}
    >
      <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-800/70">
        <Dato titulo="Solicitudes" valor={String(solicitudes)} />
        <Dato titulo="Equipos" valor={String(equipos.length)} />
        <Dato titulo="Jornadas" valor={String(jornadas)} />
        <Dato titulo="Total estimado" valor={pesos(total)} />
        <Dato titulo="Reemplazos" valor={String(reemplazos)} />
        <Dato titulo="Errores / avisos" valor={`${errores.length} / ${avisos.length}`} alerta={errores.length > 0} />
      </div>

      {fallo && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800 dark:bg-red-500/15 dark:text-red-200">{fallo}</p>}

      {/*
        LOS AVISOS Y ERRORES, DETRÁS DE UNA «i»: en amarillo si son avisos, en rojo si hay errores. La
        lista completa —con su «Corregir»— vive en el modal. Antes ocupaba media pantalla arriba de las
        solicitudes, y tres avisos de superposición son tres párrafos que se leen una vez y estorban las
        catorce veces siguientes. El rótulo dice cuántos; el color dice si frenan.
      */}
      {problemas.length > 0 && (
        <div id="problemas" className="mb-5 flex scroll-mt-20 items-center gap-1">
          <Rotulo icono={errores.length ? faCircleExclamation : faTriangleExclamation}>{errores.length ? `Para corregir · ${errores.length}` : `Avisos · ${avisos.length}`}</Rotulo>
          <button type="button" onClick={() => setVerProblemas(true)} aria-label={errores.length ? "Ver lo que hay que corregir" : "Ver los avisos"} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${errores.length ? "text-red-500" : "text-amber-500"}`}>
            <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/*
        POR EQUIPO: el nombre como título y lo común detrás de su «i»; debajo, una tarjeta por persona.
        Lo común (proyecto, empresa, convenio…) es lo mismo para las catorce: se mira una vez, no ocupa
        media pantalla arriba de la gente, que es lo que se revisa de verdad.
      */}
      {equipos.map((e) => {
        const pv = previews?.[e._id];
        const filas = (pv?.filas || []).filter((x) => !x.excluido);
        const porPuesto = new Map(puestosDe(p, e).map((x) => [x.puesto._id, x]));
        const c = e.condiciones || {};
        return (
          <section key={e._id} className="mb-6">
            <div className="mb-3 flex items-start gap-1.5">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                  <FontAwesomeIcon icon={faUsers} className="h-3.5 w-3.5 text-blue-500" />
                  <span className="truncate">{e.nombre}</span>
                </h2>
                {pv && <p className="text-xs text-slate-600 dark:text-slate-300">{`${pv.totales.personas} ${pv.totales.personas === 1 ? "solicitud" : "solicitudes"} · ${pesos(pv.totales.importe)}`}</p>}
              </div>
              <button type="button" onClick={() => setDatosDe(e._id)} aria-label={`Ver los datos de ${e.nombre}`} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-2">
              {filas.map((x) => {
                const pe = porPuesto.get(x.integranteId);
                const k = `${e._id}:${x.integranteId}`;
                const pt = estado.puntuales[k];
                // El reemplazo que rige: el puntual manda —incluso para apagar el de la plantilla—; si no dice nada, el de la plantilla.
                const r = pt?.isReplacement !== undefined ? (pt.isReplacement ? { nombre: (pt.replacedUserId && estado.nombres[pt.replacedUserId]) || "alguien", motivoReemplazoId: pt.motivoReemplazoId } : null) : pe?.asignacion?.reemplazo;
                const motivo = r?.motivoReemplazoId ? catalogos.motivos.find((m) => m._id === r.motivoReemplazoId)?.name : "";
                const horarioDistinto = (x.inTime || null) !== (c.inTime || null) || (x.outTime || null) !== (c.outTime || null);
                const comentario = pt?.comentarios;
                return (
                  <div key={x.integranteId} className={`rounded-xl border bg-white p-3 dark:bg-slate-800/70 ${x.errores.length ? "border-red-300 dark:border-red-500/40" : "border-slate-200 dark:border-slate-700"}`}>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className={`truncate text-sm font-bold ${x.errores.length ? "text-red-800 dark:text-red-200" : "text-slate-900 dark:text-white"}`}>{x.nombre}</p>
                          <span className="shrink-0 text-sm font-bold tabular-nums text-slate-900 dark:text-white">{pesos(x.importes.total)}</span>
                        </div>
                        <p className="truncate text-xs text-slate-600 dark:text-slate-300">{pe ? nombreRoles(catalogos.roleFrames, pe.puesto.rolesFrame) : ""}</p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {x.categoriaNombre || (x.origenImporte === "servicios" ? "Servicio" : "Sin categoría")} · {x.jornadas} × {pesos(x.importes.jornada)}
                        </p>
                        {(r || horarioDistinto || x.advertencias.length > 0 || x.errores.length > 0) && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {r && <Pill tono={motivo ? "azul" : "ambar"}>{`Reemplaza a ${r.nombre}${motivo ? ` · ${motivo}` : " · falta el motivo"}`}</Pill>}
                            {horarioDistinto && <Pill>{`Horario ${textoHorario(x.inTime, x.outTime)}`}</Pill>}
                            {x.advertencias.length > 0 && <Pill tono={x.superposicionHorario ? "rojo" : "ambar"}>Superposición a confirmar</Pill>}
                            {x.errores.length > 0 && <Pill tono="rojo">{x.errores.length === 1 ? "1 error" : `${x.errores.length} errores`}</Pill>}
                          </div>
                        )}
                        {comentario && <p className="mt-2 line-clamp-2 text-xs italic text-slate-500 dark:text-slate-400">«{comentario}»</p>}
                      </div>
                      {/* El lápiz, último: abre la misma hoja del paso 2 —lo de esta persona, sólo esta vez—, acá mismo. */}
                      {pe && (
                        <button type="button" onClick={() => setEditando({ equipoId: e._id, puestoId: x.integranteId })} aria-label={`Editar la solicitud de ${x.nombre}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">
                          <FontAwesomeIcon icon={faPen} className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Lo común de un equipo: lo mismo para todas sus solicitudes. */}
      {(() => {
        const e = datosDe ? equipos.find((x) => x._id === datosDe) : null;
        if (!e) return null;
        const c = e.condiciones || {};
        const f = estado.equipos[e._id];
        const filas = (previews?.[e._id]?.filas || []).filter((x) => !x.excluido);
        const contratos = [...new Set(filas.map((x) => x.nombreContrato).filter(Boolean))];
        const fechas = f.fechas.length ? `${f.fechas.length} ${f.fechas.length === 1 ? "jornada" : "jornadas"}: ${f.fechas.map(fechaCorta).join(" · ")}` : f.desde ? `${fechaCorta(f.desde)} → ${f.hasta ? fechaCorta(f.hasta) : "sin baja"}` : "";
        const { proyecto, empresaId, convenioId } = proyectoDelEquipo(catalogos, e);
        const empresa = catalogos.companies.find((x) => x._id === empresaId) as any;
        const convenio = catalogos.convenios.find((x) => x._id === convenioId);
        return (
          <ModalInfo
            icono={faUsers}
            titulo={e.nombre}
            onCerrar={() => setDatosDe(null)}
            texto={
              <dl className="grid grid-cols-1 gap-2.5 text-sm">
                <Fila titulo="Proyecto" valor={proyecto ? etiquetaProyecto(proyecto) : "—"} />
                <Fila titulo="Empresa" valor={empresa?.razonSocial || "—"} />
                <Fila titulo="Convenio" valor={convenio ? `${convenio.externalId || ""} ${convenio.name || ""}`.trim() : "—"} />
                <Fila titulo={contratos.length > 1 ? "Contratos" : "Contrato"} valor={contratos.join(" · ") || "—"} />
                <Fila titulo="Área y turno" valor={<ChipTurno inicio={c.inTime} texto={nombreTurno(areasDe(e.projectId), c.areaId, c.shiftId) || undefined} />} />
                <Fila titulo="Horario" valor={textoHorario(c.inTime, c.outTime)} />
                <Fila titulo="Fechas" valor={fechas || "—"} />
              </dl>
            }
          />
        );
      })()}

      {verProblemas && problemas.length > 0 && <ModalInfo icono={errores.length ? faCircleExclamation : faTriangleExclamation} titulo={errores.length ? "Para corregir" : "Avisos"} texto={<ListaProblemas errores={errores} avisos={avisos} />} onCerrar={() => setVerProblemas(false)} />}

      {enEdicion && (
        <HojaPuntual
          key={clavePuntual(enEdicion.e._id, enEdicion.x.puesto._id)}
          equipo={enEdicion.e}
          x={enEdicion.x}
          fila={enEdicion.fila}
          estado={estado}
          areasCargadas={areasDe(enEdicion.e.projectId) !== null}
          onCerrar={() => setEditando(null)}
          onGuardar={(puntual, nombres) => {
            ponerPuntual(enEdicion.e._id, enEdicion.x.puesto._id, puntual, nombres);
            setEditando(null);
          }}
        />
      )}
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
