import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faPen, faUsers } from "@fortawesome/free-solid-svg-icons";
import { FilaPreview, plantillasEquipoAPI, Preview, Puntual } from "../../../../../api/plantillasEquipo";
import { ImportesDelContrato } from "../../../../../components/contratacion/ImportesDelContrato";
import { SelectorHora } from "../../../../../components/contratacion/SelectorHora";
import { CampoTipoContrato, ModalTipoContrato } from "../contratacion/SelectorTipoContrato";
import { CampoCategoria, ModalCategoria } from "../contratacion/SelectorCategoria";
import { BloqueReemplazo } from "../contratacion/BloqueReemplazo";
import { CampoComentarios } from "../contratacion/CampoComentarios";
import { AyudaImportes, diferenciaContraEscala, PROPS_IMPORTES_MOVIL } from "../contratacion/AyudaImportes";
import { importePorJornadaDeCategoria } from "../../../../../utils/seleccionConvenioCategoria";
import { CustomDatePicker } from "../CustomDatePicker";
import { mesesEquivalentes, periodoDeCalculo } from "../../../../../utils/jornadas";
import { CustomMultiDatePicker } from "../CustomMultiDatePicker";
import { usePlantilla, usePlantillas } from "./contexto";
import { Pantalla, Seccion, Vacio } from "./Pantalla";
import { HojaModal } from "./HojaModal";
import { SelectorPersona } from "./SelectorPersona";
import { clavePuntual, contratoDelPuesto, EstadoContratar, guardarEstado, leerEstado, pedidosDe, puntualLimpio } from "./estadoContratar";
import { estadoDe, nombreRoles, proyectoDelEquipo, PuestoDelEquipo, puestosDe, rutas } from "./equipoUtil";
import { porDiasSueltos } from "./Condiciones";
import { PASOS_CONTRATAR } from "./Pasos";
import { AIRE, MARGEN, Rotulo, pastillaDe } from "./piezas";
import { CLASE_HORA, fechaCorta, fechaDeHoy, pesos, Pill, textoHorario } from "./comun";
import { cambiosDeContrato } from "./Condiciones";

/*
  CONTRATAR · PASO 2 DE 3 · LAS PERSONAS, CADA UNA SÓLO PARA ESTA VEZ.

  Una fila por puesto de cada equipo incluido, con lo que el server ya calculó para esta contratación:
  quién va, con qué contrato, su categoría y su importe. El lápiz abre la hoja donde se ajusta lo de
  ESA persona —cambiarla, sacarla, reemplazo, contrato, horario, días, categoría, importe, comentario—
  y nada de eso toca la plantilla: viaja en el `Puntual` de la solicitud y muere al enviar.

  ESTA CAPA ES LA QUE FALTABA. El server la tenía desde el principio (`Puntual`), pero la app sólo
  mandaba el comentario: cualquier otro ajuste iba a parar a la plantilla como cambio permanente, y
  «Corregir» en la revisión te llevaba a editar el puesto. Contratar un fin de semana dejaba el equipo
  distinto de como estaba.

  SÓLO VIAJA LO DISTINTO. La hoja arranca con lo que rige (el equipo, el contrato general, las fechas
  del equipo) y al cerrar guarda únicamente lo que cambió respecto de eso. Lo que queda igual no
  existe como puntual, así que la fila no dice «distinto» por haber abierto y cerrado la hoja.

  LOS IMPORTES son los del alta individual —el mismo componente—: se escribe cualquiera de los cuatro
  (jornada, semana, mensual, total) y los otros se derivan. Lo que se guarda es la jornada.
*/
const esHora = (h?: string | null) => /^\d{2}:\d{2}$/.test(h || "");
/** «27/9/2026», como lo escribe el alta individual en su resumen de fechas. */
const fechaLarga = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("es-AR");

export default function ContratarPersonas() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { catalogos, areasDe } = usePlantillas();
  const { plantilla: p } = usePlantilla(id);
  const [estado, setEstado] = useState<EstadoContratar | null>(() => leerEstado(id));
  const [previews, setPreviews] = useState<Record<string, Preview> | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [fallo, setFallo] = useState("");
  const [editando, setEditando] = useState<{ equipoId: string; puestoId: string } | null>(null);

  const pedidos = useMemo(() => (p && estado ? pedidosDe(p, estado, catalogos) : []), [p, estado, catalogos]);
  // Se recalcula cuando cambia algo que cambia el cálculo: los comentarios no.
  const firma = JSON.stringify(pedidos.map((x) => ({ ...x, puntuales: Object.fromEntries(Object.entries(x.puntuales).map(([k, v]) => [k, { ...v, comentarios: undefined }])) })));
  useEffect(() => {
    if (!p || pedidos.length === 0) return;
    let vigente = true;
    setCalculando(true);
    setFallo("");
    plantillasEquipoAPI
      .previewVarios(p._id, pedidos)
      .then((r) => vigente && setPreviews(Object.fromEntries(r.equipos.map((x) => [x.equipoId, x]))))
      .catch((e) => vigente && setFallo(e?.response?.data?.error || "No se pudo calcular. Probá de nuevo."))
      .finally(() => vigente && setCalculando(false));
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, firma]);

  if (!estado) return <Navigate to={rutas.contratar(id)} replace />;
  const atras = rutas.contratar(id);
  if (!p)
    return (
      <Pantalla titulo="Personas" atras={atras} listo={false} pasos={{ actual: 2, etiquetas: PASOS_CONTRATAR }}>
        <div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      </Pantalla>
    );

  const guardar = (nuevo: EstadoContratar) => {
    setEstado(nuevo);
    guardarEstado(id, nuevo);
  };
  /** Lo puntual de una fila, entero (null = volver a lo del equipo). Los nombres elegidos se recuerdan para mostrarlos. */
  const ponerPuntual = (equipoId: string, puestoId: string, puntual: Puntual | null, nombres: Record<string, string> = {}) => {
    const k = clavePuntual(equipoId, puestoId);
    const puntuales = { ...estado.puntuales };
    const limpio = puntualLimpio(puntual || undefined);
    if (Object.keys(limpio).length) puntuales[k] = limpio;
    else delete puntuales[k];
    guardar({ ...estado, puntuales, nombres: { ...estado.nombres, ...nombres } });
  };

  const equipos = p.equipos.filter((e) => estado.equipos[e._id]?.incluido);
  const solicitudes = equipos.reduce((s, e) => {
    const pv = previews?.[e._id];
    return s + (pv ? pv.totales.personas : estadoDe(p, e).total);
  }, 0);
  const errores = equipos.reduce((s, e) => s + (previews?.[e._id]?.totales.conErrores || 0), 0);
  const nombreContrato = (contratoId: string) => catalogos.contratos.find((c) => c._id === contratoId)?.name || "";

  const enEdicion = editando && (() => {
    const e = equipos.find((x) => x._id === editando.equipoId);
    const x = e && puestosDe(p, e).find((y) => y.puesto._id === editando.puestoId);
    const fila = previews?.[editando.equipoId]?.filas.find((f) => f.integranteId === editando.puestoId);
    return e && x ? { e, x, fila } : null;
  })();

  return (
    <Pantalla
      titulo="Personas"
      contexto={p.nombre}
      atras={atras}
      atrasPaso={() => navigate(atras)}
      pasos={{ actual: 2, etiquetas: PASOS_CONTRATAR }}
      boton={{
        texto: `Revisar ${solicitudes} ${solicitudes === 1 ? "solicitud" : "solicitudes"}`,
        onClick: () => navigate(rutas.revision(id)),
        deshabilitado: solicitudes === 0 || calculando,
        motivo: solicitudes === 0 ? "No hay nadie para contratar" : undefined,

      }}
      /* Los errores no frenan acá: se ven en la fila y se corrigen con el lápiz; la Revisión es la que no deja enviar. */
      notaBoton={errores > 0 ? `${errores === 1 ? "1 fila tiene" : `${errores} filas tienen`} algo para corregir` : undefined}
    >
      {fallo && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800 dark:bg-red-500/15 dark:text-red-200">{fallo}</p>}
      {equipos.length === 0 ? (
        <Vacio texto="No elegiste ningún equipo." accion="Volver a Contrato y fechas" onAccion={() => navigate(atras)} />
      ) : (
        equipos.map((e) => {
          const pv = previews?.[e._id];
          const f = estado.equipos[e._id];
          return (
            <Seccion key={e._id} titulo={<Rotulo icono={faUsers}>{e.nombre}</Rotulo>}>
              <div className={`divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800/70 ${calculando ? "opacity-70" : ""}`} aria-busy={calculando}>
                {puestosDe(p, e).map((x) => {
                  const k = clavePuntual(e._id, x.puesto._id);
                  const pt = estado.puntuales[k];
                  const fila = pv?.filas.find((f) => f.integranteId === x.puesto._id);
                  const contratoRige = contratoDelPuesto(estado, e._id, x.puesto._id, x.efectivo.contratoId);
                  const nombre = fila?.nombre || (pt?.userId ? estado.nombres[pt.userId] : x.asignacion?.userId ? x.asignacion.nombre : "");
                  const excluido = !!pt?.excluido;
                  const reemplazo = pt?.isReplacement ? { nombre: pt.replacedUserId ? estado.nombres[pt.replacedUserId] || "alguien" : "", motivo: pt.motivoReemplazoId } : x.asignacion?.reemplazo ? { nombre: x.asignacion.reemplazo.nombre, motivo: x.asignacion.reemplazo.motivoReemplazoId } : null;
                  const motivo = reemplazo?.motivo ? catalogos.motivos.find((m) => m._id === reemplazo.motivo)?.name : "";
                  const distinto = !!pt && Object.keys(puntualLimpio({ ...pt, comentarios: undefined, isReplacement: undefined })).length > 0;
                  // Lo que rige en cada posición: el puntual, si lo hay; si no, lo del server o lo del puesto.
                  const horaIn = pt?.inTime ?? fila?.inTime ?? x.efectivo.inTime ?? "";
                  const horaOut = pt?.outTime ?? fila?.outTime ?? x.efectivo.outTime ?? "";
                  const sueltos = porDiasSueltos(catalogos, contratoRige);
                  const fechasFila = pt?.fechas ?? f?.fechas ?? [];
                  const desdeFila = pt?.desde ?? f?.desde ?? "";
                  const hastaFila = pt?.hasta ?? f?.hasta ?? "";
                  const diasTexto = sueltos ? (fechasFila.length ? `${fechasFila.length} ${fechasFila.length === 1 ? "jornada" : "jornadas"}` : "—") : desdeFila ? `${fechaCorta(desdeFila)} → ${hastaFila ? fechaCorta(hastaFila) : "sin baja"}` : "—";
                  const porDia = fila && !excluido && fila.importes.jornada != null ? `${pesos(fila.importes.jornada)} / día` : "— / día";
                  const categoriaTexto = fila?.categoriaNombre || (fila?.origenImporte === "servicios" ? "Servicio" : catalogos.categoriasSat.find((c) => c._id === (pt?.categoriaSatId ?? x.efectivo.categoriaSatId))?.name) || "—";
                  return (
                    <div key={x.puesto._id} className={`flex items-start gap-2 px-3 py-2.5 ${excluido ? "opacity-50" : ""}`}>
                      <span className="mt-1 w-6 shrink-0 text-center text-sm font-bold tabular-nums text-slate-600 dark:text-slate-300">{x.n}</span>
                      <button type="button" onClick={() => setEditando({ equipoId: e._id, puestoId: x.puesto._id })} className="min-w-0 flex-1 space-y-1.5 text-left">
                        {/*
                          UN RESUMEN DE POSICIONES FIJAS: rol · persona · contrato, horario, días · categoría,
                          importe por día (y el reemplazo, sólo si lo es: «sin reemplazo» era decir que no pasa
                          nada, en catorce renglones). Siempre en el mismo orden y siempre presentes —con «—» donde falta—,
                          para que el ojo baje por la lista comparando lo mismo con lo mismo y decida en un
                          vistazo si vale la pena abrir la fila. Antes cada renglón mostraba lo que tenía, y
                          catorce renglones distintos no se comparan.
                        */}
                        <span className="block truncate text-xs font-semibold text-slate-600 dark:text-slate-300">{nombreRoles(catalogos.roleFrames, x.puesto.rolesFrame)}</span>
                        {/* La persona en verde: es un puesto cubierto. Sin persona, en ámbar: el server no la deja pasar. */}
                        <span className="flex flex-wrap items-center gap-1.5">
                          {nombre ? (
                            <span className={`max-w-full ${pastillaDe("verde")} ${AIRE} ${MARGEN}`}>
                              <span className="truncate">{nombre}</span>
                            </span>
                          ) : (
                            <span className={`${pastillaDe("neutro")} ${AIRE} ${MARGEN} text-amber-800 dark:text-amber-300`}>Sin asignar</span>
                          )}
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className={`${pastillaDe("neutro")} ${AIRE} ${MARGEN}`}>{nombreContrato(contratoRige) || "—"}</span>
                          <span className={`${pastillaDe("neutro")} ${AIRE} ${MARGEN} tabular-nums`}>{textoHorario(horaIn, horaOut)}</span>
                          <span className={`${pastillaDe("neutro")} ${AIRE} ${MARGEN} tabular-nums`}>{diasTexto}</span>
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className={`max-w-full ${pastillaDe("neutro")} ${AIRE} ${MARGEN}`}>
                            <span className="truncate">{categoriaTexto}</span>
                          </span>
                          <span className={`${pastillaDe("neutro")} ${AIRE} ${MARGEN} font-bold tabular-nums`}>{porDia}</span>
                          {reemplazo && <Pill tono={motivo ? "azul" : "ambar"}>{`Reemplaza a ${reemplazo.nombre}${motivo ? ` · ${motivo}` : " · falta el motivo"}`}</Pill>}
                        </span>
                        {(excluido || distinto || (fila && fila.errores.length > 0) || (fila && fila.advertencias.length > 0)) && (
                          <span className="flex flex-wrap gap-1.5">
                            {excluido && <Pill>Sacado esta vez</Pill>}
                            {distinto && !excluido && <Pill>Sólo esta vez</Pill>}
                            {fila && fila.errores.length > 0 && <Pill tono="rojo">{fila.errores.length === 1 ? fila.errores[0] : `${fila.errores.length} errores`}</Pill>}
                            {fila && fila.advertencias.length > 0 && <Pill tono={fila.superposicionHorario ? "rojo" : "ambar"}>Superposición a confirmar</Pill>}
                          </span>
                        )}
                      </button>
                      <button type="button" onClick={() => setEditando({ equipoId: e._id, puestoId: x.puesto._id })} aria-label={`Ajustar el puesto ${x.n} sólo esta vez`} className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-400 text-slate-600 hover:bg-slate-200 dark:border-slate-500 dark:text-slate-300 dark:hover:bg-slate-700">
                        <FontAwesomeIcon icon={faPen} className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </Seccion>
          );
        })
      )}

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

/* ─────────────────────────────────────────────────────────────────────────────────────────── */

interface HojaProps {
  equipo: { _id: string; nombre: string; projectId: string | null; empresaContratoId: string | null; convenioId: string | null };
  x: PuestoDelEquipo;
  fila: FilaPreview | undefined;
  estado: EstadoContratar;
  areasCargadas: boolean;
  onCerrar: () => void;
  onGuardar: (puntual: Puntual | null, nombres: Record<string, string>) => void;
}

/**
 * LA HOJA DE UNA PERSONA: lo que se cambia sólo esta vez.
 *
 * Trabaja sobre un borrador y guarda al tocar «Listo», no campo por campo: cada guardado dispara un
 * recálculo en el server, y recalcular mientras alguien escribe un importe es ver saltar los números
 * bajo el dedo. Al guardar, sólo viaja lo distinto de lo que rige (ver `soloLoDistinto`).
 */
/** Exportada: la Revisión abre la misma hoja con el lápiz de cada persona. */
export function HojaPuntual({ equipo, x, fila, estado, onCerrar, onGuardar }: HojaProps) {
  const { catalogos } = usePlantillas();
  const k = clavePuntual(equipo._id, x.puesto._id);
  const f = estado.equipos[equipo._id];
  const [d, setD] = useState<Puntual>(() => ({ ...(estado.puntuales[k] || {}) }));
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [hoja, setHoja] = useState<null | "persona" | "reemplazado" | "contrato" | "categoria">(null);
  const [verTodasDelConvenio, setVerTodasDelConvenio] = useState(false);
  const cambiar = (c: Partial<Puntual>) => setD((v) => ({ ...v, ...c }));

  /*
    LO QUE RIGE SIN ESTE PUNTUAL: el puesto en el equipo, el contrato general y las fechas del equipo.
    Es contra lo que se compara al guardar. Los importes no tienen base conocida acá (la escala la
    calcula el server), así que ahí manda si la persona TOCÓ el campo o no.
  */
  const { proyecto, empresaId, convenioId } = proyectoDelEquipo(catalogos, equipo);
  // Sin categoría en el puesto, rige la del nivel del proyecto (la misma que manda `pedidosDe`): ya viene elegida.
  const categoriaPorDefecto = x.efectivo.categoriaSatId ? "" : catalogos.categoriaPorDefectoPara(proyecto, empresaId, convenioId, x.puesto.rolesFrame, x.efectivo.contratoId);
  const base = {
    contratoId: estado.contratoId || x.efectivo.contratoId || "",
    inTime: x.efectivo.inTime || "",
    outTime: x.efectivo.outTime || "",
    categoriaSatId: x.efectivo.categoriaSatId || categoriaPorDefecto || "",
    fechas: f?.fechas || [],
  };
  const contratoRige = d.contratoId || base.contratoId;
  const sueltos = porDiasSueltos(catalogos, contratoRige);
  const contratoDoc = catalogos.contratos.find((c) => c._id === contratoRige) as any;
  const indeterminado = !!contratoDoc?.data?.esTiempoIndeterminado;
  const esServicios = (catalogos.tramitePorContrato.get(contratoRige) || "") === "constancia_cuit";
  const oferta = catalogos.categoriasPara(proyecto, empresaId, convenioId, x.puesto.rolesFrame, verTodasDelConvenio, false, x.efectivo.contratoId);
  const categoriaIdActual = d.categoriaSatId ?? base.categoriaSatId;
  const categoriaActual = catalogos.categoriasSat.find((c) => c._id === categoriaIdActual) || null;
  const cct = catalogos.cctDeConvenio(convenioId);

  const persona = d.userId ? { _id: d.userId, nombre: nombres[d.userId] || estado.nombres[d.userId] || fila?.nombre || "" } : x.asignacion?.userId ? { _id: x.asignacion.userId, nombre: x.asignacion.nombre } : null;
  const reemplazado = d.replacedUserId ? nombres[d.replacedUserId] || estado.nombres[d.replacedUserId] || "" : "";
  const inTime = d.inTime ?? base.inTime;
  const outTime = d.outTime ?? base.outTime;
  const fechas = d.fechas ?? base.fechas;
  /*
    LAS FECHAS DE ESTA PERSONA. Como en el alta individual, cada una puede tener las suyas; lo normal
    es que valgan las del equipo (paso 1) y esto sea la excepción de una: «el equipo va todo el mes y
    Beto entra el 15». Por jornada son sus días; por período, su desde/hasta.
  */
  const desdeDelEquipo = f?.desde || "";
  const hastaDelEquipo = f?.hasta || "";
  const desdePropio = d.desde ?? desdeDelEquipo;
  const hastaPropio = d.hasta ?? hastaDelEquipo;
  const fechasDistintas = sueltos ? JSON.stringify([...fechas].sort()) !== JSON.stringify([...base.fechas].sort()) : desdePropio !== desdeDelEquipo || hastaPropio !== hastaDelEquipo;

  // ── Los importes: jornadas del server, y la escala de la categoría calculada acá (la misma cuenta del individual) ──
  const desde = sueltos ? fechas[0] || "" : desdePropio;
  const hasta = sueltos ? fechas[fechas.length - 1] || "" : hastaPropio;
  const periodo = periodoDeCalculo(desde, hasta, indeterminado);
  const mult = Number(contratoDoc?.data?.multiplicadorDiario) > 0 ? Number(contratoDoc.data.multiplicadorDiario) : 1;
  const escalaBase = importePorJornadaDeCategoria(categoriaActual || undefined);
  const escala = importePorJornadaDeCategoria(categoriaActual || undefined, mult);
  const importesBloqueados = !esServicios && !categoriaIdActual;
  const diasDeSemana = sueltos ? [...new Set(fechas.map((s) => new Date(`${s}T12:00:00Z`).getUTCDay()))] : x.efectivo.diasSemana || [];
  const mesesEq = mesesEquivalentes(periodo.desde, periodo.hasta, diasDeSemana, sueltos ? fechas : undefined);
  const jornadas = fila?.jornadas || (sueltos ? fechas.length : 0);
  const tocoImporte = useRef(false);
  const [valorJornada, setValorJornada] = useState(() => (d.dailyRate ? String(d.dailyRate) : fila?.importes.jornada != null ? String(fila.importes.jornada) : ""));
  const diferencia = diferenciaContraEscala(escala, valorJornada);

  /** Sólo lo distinto de lo que rige. Lo igual se borra: no es un puntual, es lo de siempre. */
  const soloLoDistinto = (): Puntual | null => {
    const r: Puntual = { ...d };
    if (r.contratoId && r.contratoId === base.contratoId) delete r.contratoId;
    if (!r.contratoId) {
      delete r.nombreContrato;
      delete r.tipoImpositivo;
    }
    if (r.inTime === base.inTime) delete r.inTime;
    if (r.outTime === base.outTime) delete r.outTime;
    if (r.categoriaSatId === base.categoriaSatId) delete r.categoriaSatId;
    if (sueltos) {
      if (r.fechas && JSON.stringify([...r.fechas].sort()) === JSON.stringify([...base.fechas].sort())) delete r.fechas;
      delete r.desde;
      delete r.hasta;
    } else {
      delete r.fechas;
      // El período viaja entero o no viaja: el server toma «desde» como la señal de que hay uno propio.
      if (desdePropio === desdeDelEquipo && hastaPropio === hastaDelEquipo) {
        delete r.desde;
        delete r.hasta;
      } else {
        r.desde = desdePropio || undefined;
        r.hasta = indeterminado ? undefined : hastaPropio || undefined;
      }
    }
    if (r.userId && r.userId === x.asignacion?.userId) delete r.userId;
    if (!r.isReplacement) {
      delete r.replacedUserId;
      delete r.motivoReemplazoId;
      // Si la plantilla traía un reemplazo, `false` lo apaga esta vez; si no traía, no hace falta decir nada.
      if (!x.asignacion?.reemplazo) delete r.isReplacement;
    }
    if (tocoImporte.current) {
      const n = Number(valorJornada);
      r.dailyRate = n > 0 ? n : undefined;
    }
    return Object.keys(puntualLimpio(r)).length ? r : null;
  };

  const rol = nombreRoles(catalogos.roleFrames, x.puesto.rolesFrame);
  const claseBoton = (on: boolean) => `min-h-[44px] rounded-full px-4 text-sm font-semibold ${on ? "bg-blue-600 text-white" : "border border-slate-300 text-slate-800 dark:border-slate-600 dark:text-slate-100"}`;
  const marca = (on: boolean) => (on ? <span className="ml-1.5 rounded bg-amber-100 px-1 text-[11px] font-bold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">sólo esta vez</span> : null);

  return (
    <>
      <HojaModal
        abierta
        onCerrar={onCerrar}
        titulo={`Puesto ${x.n} · ${rol}`}
        subtitulo={`${equipo.nombre} · lo que cambies vale sólo para esta contratación`}
        pie={
          <div className="flex gap-2">
            <button type="button" onClick={() => onGuardar(null, {})} className="min-h-[48px] shrink-0 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-800 dark:border-slate-600 dark:text-slate-100">
              Como el equipo
            </button>
            <button type="button" onClick={() => onGuardar(soloLoDistinto(), nombres)} className="min-h-[48px] flex-1 rounded-xl bg-blue-600 text-sm font-bold text-white">
              Listo
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* ── Persona ── */}
          <section className="space-y-2">
            <Rotulo icono={faUsers}>Persona{marca(!!d.userId && d.userId !== x.asignacion?.userId)}</Rotulo>
            <div className="flex flex-wrap items-center gap-2">
              {persona ? (
                <span className={`max-w-full ${pastillaDe("verde")} ${AIRE}`}>
                  <span className="truncate">{persona.nombre}</span>
                </span>
              ) : (
                <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">Sin asignar</span>
              )}
              <button type="button" onClick={() => setHoja("persona")} className={claseBoton(false)}>
                {persona ? "Cambiar sólo esta vez" : "Elegir persona"}
              </button>
              <button type="button" aria-pressed={!!d.excluido} onClick={() => cambiar({ excluido: !d.excluido })} className={claseBoton(!!d.excluido)}>
                {d.excluido ? "Sacado esta vez · volver a incluir" : "Sacar de esta contratación"}
              </button>
            </div>
          </section>

          {!d.excluido && (
            <>
              {/*
                EN EL ORDEN DEL ALTA INDIVIDUAL: contrato, fechas, horario, categoría, importes, reemplazo,
                comentario. Es el orden en que se decide —primero bajo qué contrato, después cuándo, después
                cuánto— y es el que quien pide altas ya tiene en los dedos.
              */}

              {/* ── Contrato: el campo del alta individual, con el badge de trámite ── */}
              {catalogos.contratos.length > 0 && <CampoTipoContrato contratos={catalogos.contratos} contratoId={contratoRige} tramitePorContrato={catalogos.tramitePorContrato} estados={catalogos.estados} onAbrir={() => setHoja("contrato")} marca={marca(contratoRige !== base.contratoId)} />}

              {/* ── Fechas: las suyas si son distintas de las del equipo; los mismos campos del individual ── */}
              <section className="space-y-2">
                <Rotulo icono={faUsers}>Fechas{marca(fechasDistintas)}</Rotulo>
                {sueltos ? (
                  <div className="space-y-1">
                    <CustomMultiDatePicker label="Días que trabaja" value={fechas} onChange={(v: string | string[]) => cambiar({ fechas: [...new Set(Array.isArray(v) ? v : v ? [v] : [])].sort() })} minDate={fechaDeHoy()} />
                    <p className="text-[11px] text-slate-400">
                      {fechas.length > 0 ? (
                        <>
                          <span className="font-semibold text-slate-600 dark:text-slate-300">
                            {fechas.length} {fechas.length === 1 ? "jornada" : "jornadas"}
                          </span>
                          , entre el {fechaLarga(fechas[0])} y el {fechaLarga(fechas[fechas.length - 1])}.
                        </>
                      ) : (
                        <>«{contratoDoc?.name}» se contrata por día: marcá los días en el calendario. Cada uno es una jornada.</>
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <CustomDatePicker label="Desde" value={desdePropio} onChange={(v: string) => cambiar({ desde: v, hasta: hastaPropio })} />
                    </div>
                    {/* Tiempo indeterminado: no hay «hasta». No es opcional, es que no existe. */}
                    {indeterminado ? (
                      <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Hasta</p>
                        <p className="flex h-12 items-center rounded-xl bg-slate-100 px-4 text-sm font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">Sin fecha de baja</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <CustomDatePicker label="Hasta" value={hastaPropio} onChange={(v: string) => cambiar({ hasta: v, desde: desdePropio })} />
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* ── Horario ── */}
              <section className="space-y-2">
                <Rotulo icono={faUsers}>Horario{marca(inTime !== base.inTime || outTime !== base.outTime)}</Rotulo>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <SelectorHora valor={inTime} onCambio={(h) => cambiar({ inTime: esHora(h) ? h : "" })} etiqueta="Entrada" placeholder="Entrada" className={CLASE_HORA} zIndex={120} />
                  </div>
                  <FontAwesomeIcon icon={faArrowRight} className="text-xs text-slate-500" aria-hidden />
                  <div className="flex-1">
                    <SelectorHora valor={outTime} onCambio={(h) => cambiar({ outTime: esHora(h) ? h : "" })} etiqueta="Salida" placeholder="Salida" desde={inTime} className={CLASE_HORA} zIndex={120} />
                  </div>
                </div>
                <span className="sr-only">{textoHorario(inTime, outTime)}</span>
              </section>

              {/* ── Categoría: el campo y la ventana del alta individual (buscador, nivel, escala) ── */}
              {!esServicios && (
                <CampoCategoria
                  categoria={categoriaActual}
                  nivel={categoriaActual ? oferta.nivelPorId.get(categoriaActual._id) || null : null}
                  onAbrir={() => setHoja("categoria")}
                  deshabilitado={!empresaId}
                  motivoDeshabilitado="El equipo no tiene empresa"
                  marca={marca(categoriaIdActual !== base.categoriaSatId)}
                />
              )}

              {/* ── Importes: el mismo componente, las mismas clases y la misma ayuda que el alta individual ── */}
              <section className="space-y-2" onInputCapture={() => (tocoImporte.current = true)}>
                {fila ? (
                  <ImportesDelContrato
                    className="space-y-4"
                    valorJornada={valorJornada}
                    onValorJornada={setValorJornada}
                    mesesEq={mesesEq}
                    indeterminado={indeterminado}
                    jornadas={jornadas}
                    diasSemana={diasDeSemana.length}
                    bloqueado={importesBloqueados}
                    textoBloqueado="Se habilita al elegir la categoría."
                    ayudaJornada={<AyudaImportes bloqueado={importesBloqueados} esServicios={esServicios} categoria={categoriaActual?.name} cct={cct} multiplicador={mult} contrato={contratoDoc?.name} escalaBase={escalaBase} diferencia={diferencia} />}
                    {...PROPS_IMPORTES_MOVIL}
                  />
                ) : (
                  <p className="text-xs text-slate-600 dark:text-slate-300">Los importes aparecen cuando el server termina de calcular la fila.</p>
                )}
              </section>

              {/* ── Reemplazo: el bloque del alta individual (motivo primero, después a quién) ── */}
              <BloqueReemplazo
                activo={!!d.isReplacement}
                onActivo={(v) => cambiar({ isReplacement: v, ...(v ? {} : { replacedUserId: undefined, motivoReemplazoId: undefined }) })}
                motivos={catalogos.motivos}
                motivoId={d.motivoReemplazoId || ""}
                onMotivo={(id) => cambiar({ motivoReemplazoId: id || undefined })}
                nombreReemplazado={reemplazado}
                onElegirPersona={() => setHoja("reemplazado")}
                onQuitarPersona={() => cambiar({ replacedUserId: undefined })}
              />

              {/* ── Comentario: el campo del alta individual ── */}
              <CampoComentarios valor={d.comentarios || ""} onCambio={(v) => cambiar({ comentarios: v })} />
            </>
          )}
        </div>
      </HojaModal>

      <SelectorPersona
        abierta={hoja === "persona"}
        onCerrar={() => setHoja(null)}
        titulo={`Puesto ${x.n} · ${rol}`}
        subtitulo={`${equipo.nombre} · sólo esta vez`}
        projectId={equipo.projectId}
        rol={catalogos.roleFrames.find((y) => y._id === x.puesto.rolesFrame[0])?.name}
        onElegir={(pe) => {
          setNombres((n) => ({ ...n, [pe._id]: pe.nombre }));
          cambiar({ userId: pe._id });
        }}
      />
      <ModalTipoContrato abierto={hoja === "contrato"} onCerrar={() => setHoja(null)} contratos={catalogos.contratos} contratoId={contratoRige} tramitePorContrato={catalogos.tramitePorContrato} estados={catalogos.estados} onElegir={(id) => cambiar({ contratoId: id, nombreContrato: cambiosDeContrato(catalogos, id).nombreContrato || undefined, tipoImpositivo: cambiosDeContrato(catalogos, id).tipoImpositivo || undefined })} />
      <ModalCategoria
        abierto={hoja === "categoria"}
        onCerrar={() => setHoja(null)}
        subtitulo={cct ? `Del convenio ${cct}` : undefined}
        oferta={{ documentos: oferta.documentos, nivelDe: (c) => oferta.nivelPorId.get(c._id) || null, rolNoTieneCategoriasDelConvenio: oferta.rolNoTieneCategoriasDelConvenio, rolNoTieneCategoriasDeLaValoracion: oferta.rolNoTieneCategoriasDeLaValoracion, ocultasPorValoracion: oferta.ocultasPorValoracion }}
        verTodasDelConvenio={verTodasDelConvenio}
        onVerTodasDelConvenio={() => setVerTodasDelConvenio(true)}
        categoriaId={categoriaIdActual}
        onElegir={(id) => cambiar({ categoriaSatId: id })}
      />
      <SelectorPersona
        abierta={hoja === "reemplazado"}
        onCerrar={() => setHoja(null)}
        titulo="¿A quién reemplaza?"
        subtitulo="Del equipo del proyecto"
        projectId={equipo.projectId}
        soloProyecto
        onElegir={(pe) => {
          setNombres((n) => ({ ...n, [pe._id]: pe.nombre }));
          cambiar({ replacedUserId: pe._id, isReplacement: true });
        }}
      />
    </>
  );
}
