import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRightArrowLeft, faChevronLeft, faChevronRight, faTriangleExclamation, faUserPlus } from "@fortawesome/free-solid-svg-icons";
import { plantillasEquipoAPI, Puesto } from "../../../../../api/plantillasEquipo";
import { sweetAlert } from "../../utils/sweetAlert";
import { usePlantilla, usePlantillas } from "./contexto";
import { Pantalla, Seccion, Vacio } from "./Pantalla";
import { AIRE, MARGEN, pastillaDe } from "./piezas";
import { FilasCondiciones, HojaCondicion, HojasCondiciones } from "./Condiciones";
import { SelectorPersona } from "./SelectorPersona";
import { CampoCategoria, ModalCategoria } from "../contratacion/SelectorCategoria";
import { BloqueReemplazo } from "../contratacion/BloqueReemplazo";
import { AyudaImportes, diferenciaContraEscala, PROPS_IMPORTES_MOVIL } from "../contratacion/AyudaImportes";
import { ImportesDelContrato } from "../../../../../components/contratacion/ImportesDelContrato";
import { importePorJornadaDeCategoria } from "../../../../../utils/seleccionConvenioCategoria";
import { jornadasCalculadasDelPedido, mesesEquivalentes, periodoDeCalculo } from "../../../../../utils/jornadas";
import { marcasParaSelector } from "./PantallaEquipo";
import { nombreRoles, nombreTurno, proyectoDelEquipo, puestosDe, rutas } from "./equipoUtil";
import { textoHorario } from "./comun";

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
type Hoja = HojaCondicion | "persona" | "reemplazado" | "categoria";

export default function DetallePuesto() {
  const { id = "", equipoId = "", n = "1" } = useParams();
  const navigate = useNavigate();
  const { catalogos, guardar, areasDe } = usePlantillas();
  const { plantilla: p, noEsta } = usePlantilla(id);
  const [hoja, setHoja] = useState<Hoja>(null);
  const [editando, setEditando] = useState(false);
  const [reemplazoAbierto, setReemplazoAbierto] = useState(false);
  // El motivo elegido antes que la persona: el server lo guarda junto con ella (ver BloqueReemplazo: el motivo va primero).
  const [motivoPendiente, setMotivoPendiente] = useState("");
  const [verTodasDelConvenio, setVerTodasDelConvenio] = useState(false);
  const [verAvisos, setVerAvisos] = useState(false);
  const equipo = p?.equipos.find((e) => e._id === equipoId);
  const numero = Number(n);
  const puesto: Puesto | undefined = p?.integrantes[numero - 1];
  // El proyecto, la empresa y el convenio son del EQUIPO: de ahí salen áreas y categorías.
  const { proyecto, empresaId: empresaDelEquipo, convenioId: convenioDelEquipo } = proyectoDelEquipo(catalogos, equipo);
  const areas = areasDe(equipo?.projectId);
  const lista = useMemo(() => (p && equipo ? puestosDe(p, equipo) : []), [p, equipo]);
  const x = lista.find((y) => y.n === numero);
  const marcas = useMemo(() => (p && puesto ? marcasParaSelector(p, equipoId, puesto._id) : undefined), [p, equipoId, puesto]);
  const [importe, setImporte] = useState("");
  /*
    LA ESCALA DEL PUESTO: la de su categoría, con el multiplicador de su contrato. Es la misma cuenta
    del alta individual, y es lo que muestra el campo cuando nadie fijó un importe a mano.
  */
  const contratoDelPuesto = catalogos.contratos.find((c) => c._id === x?.efectivo.contratoId) as any;
  const multDelPuesto = Number(contratoDelPuesto?.data?.multiplicadorDiario) > 0 ? Number(contratoDelPuesto.data.multiplicadorDiario) : 1;
  const categoriaDelPuesto = catalogos.categoriasSat.find((c) => c._id === x?.efectivo.categoriaSatId);
  const escalaBase = importePorJornadaDeCategoria(categoriaDelPuesto);
  const escala = importePorJornadaDeCategoria(categoriaDelPuesto, multDelPuesto);
  /** Si la persona escribió en los importes: lo que emite el componente al montarse no cuenta. */
  const tocoImporte = useRef(false);
  /*
    LA CATEGORÍA POR DEFECTO, GUARDADA SOLA. Un puesto sin categoría —agregado después, o creado antes
    de que cargaran las categorías— toma la del nivel del proyecto (o la más cercana), con la misma
    regla del alta individual, sin que nadie la elija. Se guarda porque acá se edita la base del
    puesto; al contratar, la misma regla se aplica al vuelo (ver `pedidosDe`).
  */
  const categoriaPorDefecto = x && !x.efectivo.categoriaSatId && catalogos.categoriasCargadas ? catalogos.categoriaPorDefectoPara(proyecto, empresaDelEquipo, convenioDelEquipo, puesto?.rolesFrame || []) : "";
  useEffect(() => {
    if (categoriaPorDefecto) void cambiar({ categoriaSatId: categoriaPorDefecto });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriaPorDefecto, numero, equipoId]);

  const a = x?.asignacion;
  useEffect(() => {
    setEditando(false);
    setVerAvisos(false);
    setReemplazoAbierto(!!a?.reemplazo);
    tocoImporte.current = false;
    setImporte(x?.efectivo.dailyRateManual ? String(x.efectivo.dailyRateManual) : escala ? String(escala) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numero, equipoId, !!a?.reemplazo, x?.efectivo.dailyRateManual, escala]);
  /*
    Se guarda un rato después de dejar de escribir, no por tecla: cada guardado va al server y vuelve
    la plantilla entera, y ver saltar la pantalla mientras se tipea un importe es insoportable. Igual a
    la escala = sin fijar: el importe fijado a mano es sólo el que se aparta de ella.
  */
  useEffect(() => {
    if (!tocoImporte.current || !x) return;
    const t = setTimeout(() => {
      const n = Number(importe) > 0 ? Number(importe) : null;
      const nuevo = n !== null && Math.abs(n - escala) < 0.005 ? null : n;
      if (nuevo !== (x.efectivo.dailyRateManual ?? null)) void cambiar({ dailyRateManual: nuevo });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importe]);

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
  const distintas = new Set<string>([...(x.diferencias.includes("Otro contrato") ? ["contrato"] : []), ...(x.diferencias.includes("Otra área o turno") ? ["turno"] : []), ...(x.diferencias.includes("Horario distinto") ? ["horario"] : []), ...(x.diferencias.includes("Otros días") ? ["dias"] : [])]);
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
  const empresa = empresaDelEquipo;
  const convenio = convenioDelEquipo;
  // La oferta de categorías con la misma regla del alta individual: las del nivel del proyecto, y «ver todas» si no está la que se busca.
  const oferta = catalogos.categoriasPara(proyecto, empresa, convenio, puesto.rolesFrame, verTodasDelConvenio, false);
  const categoriaActual = categoriaDelPuesto || null;
  const diferencia = diferenciaContraEscala(escala, importe);
  /*
    UN MES DE REFERENCIA, para que los cuatro importes se editen y se muevan juntos también acá.

    El puesto no tiene fechas —son de cada contratación— y sin jornadas el componente apaga los
    cuatro campos: escribir uno recalcula los otros tres, y sin jornadas la cuenta no cierra. Se
    calcula sobre ESTE mes con los días del turno, que es el número que va a dar el primer mes
    completo de un contrato con esos días. Sin días cargados, de lunes a viernes, y se dice. Lo que
    se guarda sigue siendo la jornada; el resto es cómo se lee.
  */
  const hoy = new Date();
  const periodoRef = periodoDeCalculo(`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`, "", true);
  const diasRef = efectivo.diasSemana?.length ? efectivo.diasSemana : [1, 2, 3, 4, 5];
  const jornadasRef = jornadasCalculadasDelPedido({ porDiasSueltos: false, fechas: [], rotativos: false, desde: periodoRef.desde, hasta: periodoRef.hasta, dias: diasRef }) || 0;
  const mesesEqRef = mesesEquivalentes(periodoRef.desde, periodoRef.hasta, diasRef);
  const cct = catalogos.cctDeConvenio(convenio);

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
          {/*
            EL NOMBRE Y, A SU DERECHA, UN BOTÓN CHICO PARA CAMBIARLA. Era un botón azul de ancho
            completo debajo del nombre: el más grande de la pantalla para algo que pasa cada tanto. Un
            ícono de intercambio al lado del nombre dice lo mismo sin robarle el lugar a lo que sí se
            mira. Sin persona, el botón es azul y lleva el «+»: ahí sí es lo que hay que hacer.
          */}
          <div className="flex items-center gap-2">
            <p className={`min-w-0 flex-1 truncate text-lg font-bold ${persona ? "text-slate-900 dark:text-white" : "text-amber-800 dark:text-amber-300"}`}>{persona ? persona.nombre : "Sin asignar"}</p>
            <button type="button" onClick={() => setHoja("persona")} aria-label={persona ? "Cambiar persona" : "Asignar persona"} title={persona ? "Cambiar persona" : "Asignar persona"} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${persona ? "border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200" : "bg-blue-600 text-white"}`}>
              <FontAwesomeIcon icon={persona ? faArrowRightArrowLeft : faUserPlus} />
            </button>
          </div>
          {persona && !persona.activo && <p className="text-sm font-semibold text-red-700 dark:text-red-300">Está inactiva: no se puede contratar.</p>}
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

      <Seccion titulo="Condiciones">
        {x.diferencias.length === 0 && !editando ? (
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/70">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Igual que el equipo</p>
            {/* Lo del equipo, como pastillas: el área y turno en azul (es lo elegido), el horario y el contrato en neutro. */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {nombreTurno(areas, base.areaId, base.shiftId) && <span className={`${pastillaDe("azul")} ${AIRE} ${MARGEN}`}>{nombreTurno(areas, base.areaId, base.shiftId)}</span>}
              <span className={`${pastillaDe("neutro")} ${AIRE} ${MARGEN}`}>{textoHorario(base.inTime, base.outTime)}</span>
              {base.nombreContrato && <span className={`${pastillaDe("neutro")} ${AIRE} ${MARGEN}`}>{base.nombreContrato}</span>}
            </div>
            <button type="button" onClick={() => setEditando(true)} className="mt-1 min-h-[44px] text-sm font-bold text-blue-700 dark:text-blue-300">
              Cambiar solo para este puesto
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <FilasCondiciones valores={efectivo} areas={areas} catalogos={catalogos} onAbrirContrato={() => setHoja("contrato")} onAbrirTurno={() => setHoja("turno")} onCambio={(c) => void cambiar(c)} distintas={distintas} />
            <button type="button" onClick={volverAlEquipo} className="min-h-[44px] text-sm font-bold text-blue-700 dark:text-blue-300">
              Volver a las del equipo
            </button>
          </div>
        )}
      </Seccion>

      {!esServicios && (
        <Seccion titulo="Categoría e importe">
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/70">
            {/* El campo del alta individual: la categoría con su nivel, y la ventana con buscador y escala. */}
            <CampoCategoria categoria={categoriaActual} nivel={categoriaActual ? oferta.nivelPorId.get(categoriaActual._id) || null : null} onAbrir={() => setHoja("categoria")} deshabilitado={!empresa} motivoDeshabilitado="Elegí el proyecto y la empresa del equipo" />
            {/*
              LOS IMPORTES, LOS DEL ALTA INDIVIDUAL. Acá no hay fechas todavía —son de cada contratación—,
              así que mensual y total quedan sin calcular; la jornada y la semana sí, y es lo que se fija
              para el puesto. Lo que se escribe distinto de la escala queda como importe fijado a mano.
            */}
            <div onInputCapture={() => (tocoImporte.current = true)}>
              <ImportesDelContrato
                className="space-y-4"
                valorJornada={importe}
                onValorJornada={setImporte}
                mesesEq={mesesEqRef}
                jornadas={jornadasRef}
                diasSemana={diasRef.length}
                bloqueado={!categoriaActual}
                textoBloqueado="Se habilita al elegir la categoría."
                ayudaJornada={
                  <>
                    <AyudaImportes bloqueado={!categoriaActual} esServicios={false} categoria={categoriaActual?.name} cct={cct} multiplicador={multDelPuesto} contrato={contratoDelPuesto?.name} escalaBase={escalaBase} diferencia={diferencia} />
                    <p className="text-[11px] text-slate-400">
                      Sobre un mes de referencia: este mes, {jornadasRef} jornadas{efectivo.diasSemana?.length ? " con los días del turno" : " de lunes a viernes"}. Las fechas reales van al contratar.
                    </p>
                  </>
                }
                {...PROPS_IMPORTES_MOVIL}
              />
            </div>
          </div>
        </Seccion>
      )}

      <Seccion titulo="Reemplazo">
        {/* El bloque del alta individual. Acá se guarda en la plantilla (es la base del puesto); al contratar se puede cambiar sólo esa vez. */}
        {r?.revisarMotivo && <p className="mb-2 text-xs font-semibold text-amber-800 dark:text-amber-300">Venía sin motivo: elegilo.</p>}
        <BloqueReemplazo
          activo={reemplazoAbierto}
          onActivo={(v) => {
            setReemplazoAbierto(v);
            if (!v) {
              setMotivoPendiente("");
              if (r) quitarReemplazo();
            }
          }}
          motivos={catalogos.motivos}
          motivoId={r?.motivoReemplazoId || motivoPendiente}
          onMotivo={(id) => (r ? void guardar(() => plantillasEquipoAPI.reemplazo(p._id, equipo._id, puesto._id, { replacedUserId: r.replacedUserId, motivoReemplazoId: id || null })) : setMotivoPendiente(id))}
          nombreReemplazado={r?.nombre || ""}
          onElegirPersona={() => setHoja("reemplazado")}
          onQuitarPersona={quitarReemplazo}
        />
      </Seccion>

      <Seccion titulo="Más">
        {/* Dos botones, uno al lado del otro: son dos acciones distintas, cada una con su blanco entero, y no dos renglones de una lista. */}
        <div className="flex gap-2">
          {persona && (
            <button type="button" onClick={() => void guardar(() => plantillasEquipoAPI.asignar(p._id, equipo._id, puesto._id, null))} className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-800 dark:border-slate-600 dark:text-slate-100">
              Quitar persona
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              const ok: any = await sweetAlert.confirm("¿Sacar este puesto del equipo?", "Sigue en el grupo y se puede volver a usar.", "Sacar", "Cancelar");
              if (!(ok === true || ok?.isConfirmed)) return;
              const r2 = await guardar(() => plantillasEquipoAPI.usoDelPuesto(p._id, equipo._id, puesto._id, true));
              if (r2) navigate(atras, { replace: true });
            }}
            className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-red-300 px-3 text-sm font-bold text-red-700 dark:border-red-800 dark:text-red-300"
          >
            Sacar del equipo
          </button>
        </div>
      </Seccion>

      <SelectorPersona
        abierta={hoja === "persona"}
        onCerrar={() => setHoja(null)}
        titulo={`Puesto ${numero} · ${rol}`}
        subtitulo={equipo.nombre}
        projectId={equipo.projectId}
        rol={catalogos.roleFrames.find((y) => y._id === puesto.rolesFrame[0])?.name}
        marcas={marcas}
        onElegir={(pe) => void guardar(() => plantillasEquipoAPI.asignar(p._id, equipo._id, puesto._id, pe._id))}
      />
      <SelectorPersona
        abierta={hoja === "reemplazado"}
        onCerrar={() => setHoja(null)}
        titulo="¿A quién reemplaza?"
        subtitulo="Del equipo del proyecto"
        projectId={equipo.projectId}
        soloProyecto
        onElegir={(pe) => void guardar(() => plantillasEquipoAPI.reemplazo(p._id, equipo._id, puesto._id, { replacedUserId: pe._id, motivoReemplazoId: r?.motivoReemplazoId ?? (motivoPendiente || null) }))}
      />
      <ModalCategoria
        abierto={hoja === "categoria"}
        onCerrar={() => setHoja(null)}
        subtitulo={cct ? `Del convenio ${cct}` : undefined}
        oferta={{ documentos: oferta.documentos, nivelDe: (c) => oferta.nivelPorId.get(c._id) || null, rolNoTieneCategoriasDelConvenio: oferta.rolNoTieneCategoriasDelConvenio, rolNoTieneCategoriasDeLaValoracion: oferta.rolNoTieneCategoriasDeLaValoracion, ocultasPorValoracion: oferta.ocultasPorValoracion }}
        verTodasDelConvenio={verTodasDelConvenio}
        onVerTodasDelConvenio={() => setVerTodasDelConvenio(true)}
        categoriaId={efectivo.categoriaSatId || ""}
        onElegir={(id) => void cambiar({ categoriaSatId: id || null })}
      />
      <HojasCondiciones cual={hoja === "contrato" || hoja === "turno" ? hoja : null} onCerrar={() => setHoja(null)} titulo={`Puesto ${numero}`} areas={areas} catalogos={catalogos} valores={efectivo} onCambio={(c) => void cambiar(c)} />
    </Pantalla>
  );
}
