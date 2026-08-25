import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faCheck, faCopy, faCircleCheck, faXmark, faTriangleExclamation, faPlay, faStop, faRotateRight, faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { ContractOverviewRow } from '../../api/users';
import { projectsAPI } from '../../api/projects';
import { AfipValues } from './afipCompleteness';
import { asistenteAPI, EventoProgreso } from '../../api/asistente';
import { BloqueAsistente, useAsistente } from './EstadoAsistente';
import { sweetAlert } from '../../utils/sweetAlert';
import { afipAPI } from '../../api/afip';

/**
 * Validar obras sociales contra ARCA. UNA pantalla, sirva para 1 o para 20.
 *
 * Antes eran dos experiencias para la misma tarea: un panel masivo que arrancaba con tres bloques de
 * instrucciones —el estado y la acción quedaban enterrados— y, desde una persona, una expansión
 * DENTRO del formulario de Datos ARCA que empujaba Sucursal, Actividad y Convenio hacia abajo y hacía
 * perder de vista lo que se estaba mirando. Es el mismo trámite; ahora es la misma pantalla y lo
 * único que cambia es el número.
 *
 * EL PRINCIPIO: la pantalla muestra ESTADO, no instrucciones. Las instrucciones existen —hacen falta
 * la primera vez— pero van colapsadas, porque se hacen una vez y la sesión de ARCA dura días.
 *
 * CÓMO CORRE, SI UNA PÁGINA NO PUEDE EJECUTAR PROGRAMAS
 *
 * Por el ASISTENTE WEPRODU: un servicio local que el administrativo ejecuta una vez y queda
 * corriendo (`tools/asistente/`). Escucha solo en 127.0.0.1, abre el Chrome de ARCA con su perfil
 * dedicado, y recorre los CUIL con el mismo motor CDP de siempre. Acá adentro no hay ninguna regla
 * del trámite: las tandas de 10 y el «Aceptar» que no se toca viven en `validar-obras-sociales.mjs`.
 *
 * Quien GUARDA es esta pantalla, no el Asistente. Él lee de ARCA y devuelve los códigos; el `POST`
 * que los fija sale de acá, con la sesión de quien está sentado adelante. Así el servicio local no
 * necesita —ni tiene— credenciales de WeProdu.
 *
 * Y NO QUEDA NINGÚN COMANDO DE TERMINAL EN ESTA PANTALLA. Quien la usa es administrativo. El camino
 * por `npm run` sigue existiendo y está documentado en `tools/README.md`, para quien programa.
 */

const soloDigitos = (v: string): string => String(v || '').replace(/\D/g, '');
const conGuiones = (c: string) => (c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c);
const formatCuil = (v: string): string => conGuiones(soloDigitos(v));

/**
 * Cuánto se aguanta sin UN SOLO evento del Asistente antes de cortar y decirlo.
 *
 * Generoso porque la espera legítima más larga —que la persona abra la pantalla de altas— late cada
 * 3 segundos, así que nunca se acerca a este tope. Lo que este número atrapa es el silencio real: un
 * Asistente que se murió, un stream que se cortó sin avisar.
 */
const TOPE_SIN_EVENTOS_MS = 90_000;

/** Una fila del lote: el contrato y los valores ya resueltos por el checklist. */
export type FilaConstatacion = { row: ContractOverviewRow; valores: AfipValues };

/**
 * El estado de una fila durante la corrida.
 *
 * `guardando` es un estado propio y no un detalle: entre que ARCA contesta y WeProdu fija el valor
 * hay un ida y vuelta que puede fallar por motivos que no tienen nada que ver con ARCA —la obra
 * social no está registrada por la empleadora, el código no está en el catálogo—. Colapsarlo con
 * `listo` haría que una fila se vea guardada cuando no se guardó.
 */
type EnVivo = {
  estado: 'consultando' | 'guardando' | 'listo' | 'error';
  /**
   * ARCA no devolvió ninguna obra social para esta persona.
   *
   * NO es un fallo: significa que no tiene una declarada y rige la del convenio. Se guarda igual, con
   * su fecha. Se marca aparte porque en la tabla se veía casi igual que un error, y son opuestos —
   * uno hay que resolverlo, el otro ya está resuelto.
   */
  sinDeclarar?: boolean;
  /** El RNOS que devolvió ARCA. Vacío es una RESPUESTA: «no tiene afiliación propia». */
  rnos?: string;
  antes?: string;
  despues?: string;
  cambio?: 'igual' | 'actualizada';
  motivo?: string;
};

// ─────────────────────────────────────────────────────────────── piezas chicas
const CeldaCuil: React.FC<{ cuil: string }> = ({ cuil }) => {
  const [copiado, setCopiado] = useState(false);
  if (!cuil) return <span className="text-[11px] text-amber-700 dark:text-amber-400">sin CUIL</span>;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(formatCuil(cuil));
          setCopiado(true);
          window.setTimeout(() => setCopiado(false), 1500);
        } catch {
          /* sin portapapeles el número está a la vista igual */
        }
      }}
      title="Copiar"
      className="font-mono text-[11.5px] text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 inline-flex items-center gap-1.5 transition-colors"
    >
      {formatCuil(cuil)}
      <FontAwesomeIcon icon={copiado ? faCheck : faCopy} className={`h-2.5 w-2.5 ${copiado ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`} />
    </button>
  );
};

/**
 * Lo que le está pasando a una fila, con el ANTES y el DESPUÉS.
 *
 * Mostrar solo el resultado ocultaba lo único que hay que revisar: si la obra social CAMBIÓ. Con
 * `120900 → 901402` se ve que a esa persona se le movió el dato; con un tilde verde a secas, no.
 * «sin cambios» se dice explícito y en gris para que el ojo pase de largo: es el caso mayoritario y
 * no pide nada de quien mira.
 */
const CeldaEnVivo: React.FC<{ v?: EnVivo; porDefecto: string }> = ({ v, porDefecto }) => {
  if (!v) return <span className="text-[11px] text-gray-400 dark:text-gray-500">en cola</span>;

  if (v.estado === 'consultando') return <span className="text-[11px] rounded-full px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900">consultando…</span>;

  if (v.estado === 'guardando')
    return (
      <span className="text-[11.5px] text-gray-500 dark:text-gray-400 inline-flex items-center gap-1.5">
        <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3 text-blue-500" />
        guardando…
      </span>
    );

  if (v.estado === 'error')
    return (
      <span className="text-[11.5px] text-red-600 dark:text-red-400 inline-flex items-start gap-1.5">
        <FontAwesomeIcon icon={faXmark} className="h-3 w-3 mt-0.5 shrink-0" />
        <span>{v.motivo || 'no se pudo validar'}</span>
      </span>
    );

  /*
    SIN DECLARAR es un resultado, no una media tirada.

    ARCA precompleta la obra social solo cuando la persona ya tiene una; vacío significa que no tiene
    y rige la del convenio. Se ve distinto de «actualizada» —no hubo cambio que revisar— y sobre todo
    distinto de un error, que es lo que se le parecía: acá no hay nada que resolver.
  */
  if (v.sinDeclarar) {
    return (
      <span className="text-[11.5px] text-gray-500 dark:text-gray-400 inline-flex items-center gap-1.5 flex-wrap">
        <FontAwesomeIcon icon={faCheck} className="h-3 w-3 text-green-600/70 dark:text-green-400/70" />
        sin declarar en ARCA · queda <span className="font-mono">{v.despues || porDefecto || '—'}</span> del convenio
      </span>
    );
  }

  return (
    <span className="text-[11.5px] inline-flex items-center gap-1.5 flex-wrap">
      <span className="font-mono text-gray-500 dark:text-gray-400">{v.antes || porDefecto || '—'}</span>
      <FontAwesomeIcon icon={faArrowRight} className="h-2.5 w-2.5 text-gray-400" />
      <span className={`font-mono ${v.cambio === 'actualizada' ? 'font-bold text-blue-700 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>{v.despues || porDefecto || '—'}</span>
      {v.cambio === 'actualizada' ? (
        <span className="text-green-700 dark:text-green-400 inline-flex items-center gap-1">
          <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
          actualizada
        </span>
      ) : (
        <span className="text-gray-400 dark:text-gray-500 inline-flex items-center gap-1">
          <FontAwesomeIcon icon={faCheck} className="h-3 w-3 text-green-600/70 dark:text-green-400/70" />
          sin cambios
        </span>
      )}
    </span>
  );
};

// ──────────────────────────────────────────────────────────────── la pantalla

export const PantallaValidarObrasSociales: React.FC<{
  /** Filas del filtro vigente. Una sola cuando se entra desde una persona. */
  filas: FilaConstatacion[];
  /** Razón social de la empleadora activa, o vacío si están todas. */
  empleadora?: string;
  /**
   * CUIT de esa empleadora. Es lo que le deja al Asistente elegirla solo en ARCA.
   *
   * Opcional: sin él, el Asistente espera a que la persona la elija a mano, como antes.
   */
  empleadoraCuit?: string;
  /** Id de la empleadora activa. Sin ella no se puede aplicar: la validación del RNOS es por CUIT. */
  empresaId?: string;
  /** Vuelve a pedir el listado. Es lo que hace posible mirar la corrida del script. */
  onRefrescar?: () => void | Promise<void>;
  onLoteAplicado?: () => void;
}> = ({ filas, empleadora, empleadoraCuit, empresaId, onRefrescar, onLoteAplicado }) => {
  /** Corriendo: el Asistente está recorriendo ARCA y los resultados llegan por su stream. */
  const [mirando, setMirando] = useState(false);
  const asistente = useAsistente();
  /**
   * ¿El servidor puede validar solo?
   *
   * Cuando hay un usuario de clave fiscal cargado (Configuración → ARCA → Conexión), la validación
   * la hace el VPS con su propio Chromium y NADIE tiene que instalar el Asistente ni dejar una
   * ventana abierta. Ese es el camino bueno; el Asistente queda como respaldo para cuando no está
   * configurado — o cuando alguien prefiere correrlo con su propia sesión.
   *
   * `null` mientras no se sabe: hasta tenerlo no se puede elegir camino, y mostrar el del Asistente
   * por defecto haría parpadear un bloque de instalación que quizá no hace falta.
   */
  const [servidorListo, setServidorListo] = useState<boolean | null>(null);
  useEffect(() => {
    afipAPI
      .simplificacionStatus()
      .then((r) => setServidorListo(r.configurado))
      .catch(() => setServidorListo(false));
  }, []);
  /**
   * Lo que va pasando con cada CUIL, en vivo.
   *
   * Guarda el ANTES y el DESPUÉS, no solo el resultado. Cambiar la obra social de alguien sin que se
   * vea de qué a qué es exactamente lo que este flujo tiene que hacer visible: el valor que estaba
   * puesto por convenio y el que ARCA acaba de contestar son datos distintos y la diferencia importa.
   */
  const [enVivo, setEnVivo] = useState<Record<string, EnVivo>>({});
  const cortarStream = useRef<null | (() => void)>(null);
  /** Marca de tiempo del último evento recibido. Es lo que reinicia la guardia. */
  const [ultimoEvento, setUltimoEvento] = useState(0);
  /**
   * Lo que quedó sin consultar cuando se corta la sesión de ARCA.
   *
   * No se pierde ni se marca como error: la sesión que se cae no dice nada sobre esas personas. Queda
   * acá para reanudar sola cuando la sesión vuelva (ver el efecto de más abajo).
   */
  const [pausadoEn, setPausadoEn] = useState<string[]>([]);
  /**
   * Qué está haciendo la corrida AHORA, en una frase.
   *
   * Entre apretar «Validar» y el primer resultado puede haber minutos: conectarse al Chrome, y sobre
   * todo esperar a que la persona abra «Registrar Nuevas Altas» —el motor aguanta hasta 5—. Eso se
   * veía como veinte filas «en cola» y nada moviéndose, indistinguible de un cuelgue. La barra de
   * progreso tampoco ayudaba: con 0 de 20 medía 0 px de ancho.
   */
  const [faseCorrida, setFaseCorrida] = useState<string>('');
  /**
   * La corrida terminó SIN hacer todo lo que se le pidió.
   *
   * Antes esto no se guardaba en ningún lado y no se mostraba: un `fin` con `faltaron: 20` se
   * renderizaba exactamente igual que no haber apretado nada — las filas quedaban «en cola», sin
   * cartel, sin color, sin botón. Eso es lo que la persona lee como «se cuelga».
   */
  const [fracaso, setFracaso] = useState<{ faltaron: number; motivo: string } | null>(null);

  const clave = (r: ContractOverviewRow) => `${r._id}-${r.contractIndex}`;

  /**
   * Las que estaban pendientes al ABRIR, congeladas.
   *
   * Sin esto, cada fila resuelta se sale sola de la lista y las de abajo suben un renglón: se pierde
   * el acuse de recibo de lo que se acaba de hacer. Congelado, la fila se queda en su lugar y pasa a
   * verde — que es además lo que hace legible mirar una corrida.
   */
  const [clavesIniciales] = useState(() => new Set(filas.filter((f) => f.valores.constatacion === 'sin_constatar').map((f) => `${f.row._id}-${f.row.contractIndex}`)));
  const visibles = useMemo(() => filas.filter((f) => clavesIniciales.has(clave(f.row))), [filas, clavesIniciales]);
  const pendientes = useMemo(() => visibles.filter((f) => f.valores.constatacion === 'sin_constatar'), [visibles]);

  const total = clavesIniciales.size;

  /**
   * El progreso sale de la CORRIDA, no del listado.
   *
   * `filas` se recarga una sola vez, al final, así que durante la tanda `pendientes.length` no se
   * mueve: la barra se quedaba clavada en 0 y el «12 de 20» decía siempre 0 de 20 — justo mientras
   * pasa lo único que hay que mirar. Terminada la corrida vale lo mismo por los dos caminos.
   */
  const resueltas = useMemo(() => Object.values(enVivo).filter((v) => v.estado === 'listo' || v.estado === 'error').length, [enVivo]);
  const hechas = mirando ? resueltas : total - pendientes.length;
  const conAfiliacion = mirando
    ? Object.values(enVivo).filter((v) => v.estado === 'listo' && !!v.rnos).length
    : visibles.filter((f) => f.valores.constatacion === 'afiliada').length;
  const sinAfiliacion = mirando
    ? Object.values(enVivo).filter((v) => v.estado === 'listo' && v.sinDeclarar).length
    : visibles.filter((f) => f.valores.constatacion === 'no_figura').length;
  const terminado = total > 0 && pendientes.length === 0;

  /** Al desmontar, se corta el stream: dejarlo abierto filtra una conexión por cada vez que se abre. */
  useEffect(() => () => cortarStream.current?.(), []);

  /**
   * Guardia: si no llega ningún evento en TOPE_SIN_EVENTOS_MS, se corta y se dice.
   *
   * Una pantalla que espera para siempre es un bug aunque el que esté roto sea el otro lado. El
   * Asistente puede morirse, el stream puede cortarse sin cerrar, o puede aparecer mañana un camino
   * que no emita nada — y en los tres casos lo que la persona ve es idéntico: filas «en cola» que no
   * avanzan. Esto pone un piso: pasado ese tiempo hay un cartel y un botón, no una espera muda.
   *
   * El reloj se reinicia con CADA evento, incluido el de «esperando»: ese llega cada 3 s durante la
   * espera de la pantalla de altas, así que una espera larga y legítima no dispara la guardia.
   */
  useEffect(() => {
    if (!mirando) return;
    const id = window.setTimeout(() => {
      cortarStream.current?.();
      setMirando(false);
      setFaseCorrida('');
      setFracaso({ faltaron: total - resueltas, motivo: `Pasaron ${Math.round(TOPE_SIN_EVENTOS_MS / 1000)} segundos sin noticias del Asistente. Fijate si su ventana sigue abierta.` });
    }, TOPE_SIN_EVENTOS_MS);
    return () => window.clearTimeout(id);
    // `ultimoEvento` es lo que reinicia el reloj en cada evento recibido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mirando, ultimoEvento]);

  useEffect(() => {
    if (terminado) setMirando(false);
  }, [terminado]);

  /**
   * Por qué el lote rechazó ESTE CUIL. Sale del mismo detalle que ya devolvía el endpoint.
   *
   * Se traduce a una frase corta y accionable porque va adentro de la fila, no en un párrafo al pie:
   * quien mira la corrida tiene que poder decidir qué hacer con esa persona sin salir de la pantalla.
   */
  const motivoDeRechazo = (r: Awaited<ReturnType<typeof projectsAPI.aplicarObrasSocialesLote>>, cuil: string): string => {
    if (r.noRegistrada.some((x) => x.cuil === cuil)) return `${empleadora || 'la empleadora'} no la tiene registrada en ARCA`;
    if (r.rnosDesconocido.some((x) => x.cuil === cuil)) return 'el código no está en el catálogo de Obras Sociales';
    if (r.yaBloqueados.includes(cuil)) return 'ya estaba validada: no se pisa';
    if (r.sinContrato.includes(cuil)) return 'sin contrato en esta empleadora';
    return 'no se pudo guardar';
  };

  /**
   * Fija en WeProdu lo que ARCA contestó para UNA persona.
   *
   * Se guarda de a una y NO todo junto al final, que era como estaba. El motivo del batch era pasar
   * por la validación del endpoint —que la obra social esté entre las que la empleadora registró—,
   * pero eso se conserva igual: se llama al MISMO endpoint con un solo item, así que la red sigue
   * puesta. Lo que se gana es que una fila resuelta ya está guardada: si la sesión se cae en la
   * persona 12, las 11 anteriores no dependen de que la corrida llegue al final.
   *
   * Un rechazo NO corta el lote. La fila queda en rojo con el motivo y la corrida sigue: el problema
   * es de esa persona —o de la configuración de la empresa— y no de las otras diecinueve.
   */
  const guardarUna = async (f: FilaConstatacion, cuil: string, rnos: string) => {
    const antes = f.valores.rnos || f.valores.rnosSugerido || '';
    setEnVivo((p) => ({ ...p, [cuil]: { ...p[cuil], estado: 'guardando', rnos } }));
    try {
      const r = await projectsAPI.aplicarObrasSocialesLote(empresaId as string, [{ cuil, rnos }], false);
      if (r.aplicados === 0) {
        setEnVivo((p) => ({ ...p, [cuil]: { estado: 'error', rnos, antes, motivo: motivoDeRechazo(r, cuil) } }));
        return;
      }
      // Sin afiliación propia en ARCA: el valor que queda es el del convenio, que es el que ya estaba.
      const despues = rnos || f.valores.rnosSugerido || '';
      setEnVivo((p) => ({ ...p, [cuil]: { estado: 'listo', rnos, antes, despues, sinDeclarar: !rnos, cambio: antes === despues ? 'igual' : 'actualizada' } }));
      // El listado se recarga UNA vez al terminar, no por fila: veinte recargas completas mientras
      // corre es tráfico inútil y hace parpadear la tabla que la persona está mirando.
    } catch (e: any) {
      setEnVivo((p) => ({ ...p, [cuil]: { estado: 'error', rnos, antes, motivo: e?.response?.data?.error || e?.message || 'no se pudo guardar' } }));
    }
  };

  /**
   * La corrida DEL SERVIDOR: el VPS abre su propio Chromium, entra a ARCA y valida.
   *
   * Nadie instala nada y no hay ninguna ventana que dejar abierta. Los CUIL no se mandan desde acá:
   * los resuelve el server con la misma función que alimenta el contador de la grilla.
   *
   * El progreso llega por polling y no por stream: son minutos y unos pocos eventos, y una conexión
   * viva por pestaña para ahorrar un request cada dos segundos no se paga sola.
   */
  const empezarCorridaEnServidor = async () => {
    if (!empresaId) return;
    setPausadoEn([]);
    setFracaso(null);
    setEnVivo({});
    setFaseCorrida('Abriendo ARCA en el servidor…');
    try {
      await projectsAPI.validarObrasSocialesEnServidor(empresaId);
    } catch (e: any) {
      setFaseCorrida('');
      sweetAlert.error('No pude arrancar', e?.response?.data?.error || 'El servidor no aceptó la corrida.');
      return;
    }
    setMirando(true);
    seguirCorridaDelServidor();
  };

  /**
   * Consume los eventos de la corrida del servidor.
   *
   * Se reprocesan TODOS los eventos en cada vuelta —el server los devuelve enteros— porque son
   * pocos y así una pantalla que se abre a mitad de camino ve lo que ya pasó. Reconstruir el estado
   * desde el principio es además lo que hace que no importe si se pierde una vuelta del polling.
   */
  const seguirCorridaDelServidor = useCallback(() => {
    const id = window.setInterval(async () => {
      let r: Awaited<ReturnType<typeof projectsAPI.estadoValidacionServidor>>;
      try {
        r = await projectsAPI.estadoValidacionServidor();
      } catch {
        return; // un traspié de red no tiene que matar el seguimiento; la próxima vuelta reintenta
      }
      setUltimoEvento((n) => n + 1);

      const vivo: Record<string, EnVivo> = {};
      for (const ev of r.eventos as any[]) {
        if (ev.tipo === 'abriendo') setFaseCorrida('Abriendo ARCA en el servidor…');
        else if (ev.tipo === 'conectado') setFaseCorrida('Adentro de ARCA. Buscando la pantalla de altas…');
        else if (ev.tipo === 'consultando') { vivo[ev.cuil] = { estado: 'consultando' }; setFaseCorrida(''); }
        else if (ev.tipo === 'resultado') vivo[ev.cuil] = { estado: 'listo', rnos: ev.rnos, sinDeclarar: !ev.rnos, despues: ev.rnos };
        else if (ev.tipo === 'error') vivo[ev.cuil] = { estado: 'error', motivo: ev.motivo };
        else if (ev.tipo === 'guardando') setFaseCorrida('Guardando lo que devolvió ARCA…');
        else if (ev.tipo === 'fallo') setFracaso({ faltaron: total, motivo: ev.mensaje });
        else if (ev.tipo === 'fin' && ev.faltaron > 0) setFracaso({ faltaron: ev.faltaron, motivo: ev.motivo });
      }
      setEnVivo(vivo);

      if (!r.corriendo) {
        window.clearInterval(id);
        cortarStream.current = null;
        setMirando(false);
        setFaseCorrida('');
        onLoteAplicado?.();
        await onRefrescar?.();
      }
    }, 2000);
    // Se reusa `cortarStream` para que «Detener» y el desmontaje corten los dos caminos igual.
    cortarStream.current = () => window.clearInterval(id);
  }, [total, onLoteAplicado, onRefrescar]);

  /**
   * Arranca la corrida en el Asistente y escucha su progreso.
   *
   * `cuils` explícito porque esto se usa para tres cosas: el lote completo, el reintento de los que
   * fallaron, y la reanudación después de que se caiga la sesión. Son la misma corrida con distinta
   * lista, y tenerlas como tres funciones distintas era cómo se terminaban comportando distinto.
   */
  const empezarCorrida = async (cuils?: string[]) => {
    if (!empresaId) return;
    const lista = cuils && cuils.length > 0 ? cuils : pendientes.map((f) => soloDigitos(f.row.cuit || ''));
    if (lista.length === 0) return;
    setPausadoEn([]);
    setFracaso(null);
    setFaseCorrida('Arrancando…');
    // Solo se limpian los que se van a volver a consultar: borrar todo perdería el resultado de los
    // que ya salieron bien, que es justamente lo que un reintento no tiene que tocar.
    setEnVivo((p) => {
      const n = { ...p };
      for (const c of lista) delete n[c];
      return n;
    });

    try {
      await asistenteAPI.validar(lista.map((cuil) => ({ cuil })), empleadoraCuit || '');
    } catch (e: any) {
      sweetAlert.error('No pude arrancar', e?.message || 'El Asistente no aceptó la corrida.');
      return;
    }
    setMirando(true);

    const porCuil = new Map(visibles.map((f) => [soloDigitos(f.row.cuit || ''), f]));
    cortarStream.current = asistenteAPI.progreso(async (ev: EventoProgreso) => {
      // Cualquier evento reinicia la guardia: lo que se vigila es el SILENCIO, no el progreso.
      setUltimoEvento((n) => n + 1);
      if (ev.tipo === 'conectando') {
        setFaseCorrida('Conectando con el Chrome de ARCA…');
      } else if (ev.tipo === 'conectado') {
        setFaseCorrida('Conectado. Buscando la pantalla de ARCA…');
      } else if (ev.tipo === 'esperando') {
        // El minuto que falta va en el texto: una espera con final visible se tolera; una sin final
        // se lee como que se colgó. Es la misma espera, contada.
        const min = Math.max(1, Math.ceil(ev.restanMs / 60000));
        setFaseCorrida(`Esperando a que abras «Registrar Nuevas Altas» en la ventana de ARCA — sigo solo apenas aparezca (espero ${min} min más).`);
      } else if (ev.tipo === 'listo') {
        setFaseCorrida('Pantalla de ARCA lista. Consultando…');
      } else if (ev.tipo === 'consultando') {
        setFaseCorrida('');
        setEnVivo((p) => ({ ...p, [ev.cuil]: { ...p[ev.cuil], estado: 'consultando' } }));
      } else if (ev.tipo === 'resultado') {
        const f = porCuil.get(ev.cuil);
        if (f) await guardarUna(f, ev.cuil, ev.rnos);
      } else if (ev.tipo === 'error') {
        setEnVivo((p) => ({ ...p, [ev.cuil]: { estado: 'error', motivo: ev.motivo || 'ARCA no abrió el bloque para este CUIL' } }));
      } else if (ev.tipo === 'fallo') {
        setMirando(false);
        setFaseCorrida('');
        sweetAlert.error('Se cortó la corrida', ev.mensaje);
      } else if (ev.tipo === 'fin') {
        setMirando(false);
        setFaseCorrida('');
        /*
          Sesión caída a mitad: se PAUSA, no se aborta.

          Lo ya guardado quedó guardado (cada fila se fijó al llegar). Los que faltaron quedan en
          `pausadoEn` y se reanudan solos cuando la sesión vuelva. Marcarlos como error diría algo
          sobre esas personas que ARCA nunca contestó.
        */
        if (ev.sinSesion) setPausadoEn(lista.filter((c) => !['listo', 'error'].includes(enVivoRef.current[c]?.estado || '')));
        /*
          Nadie procesado y sin sesión caída = fracaso, no final.

          Y las filas que quedaron sin tocar pasan a «no se pudo»: dejarlas en «en cola» después de
          que el stream cerró es afirmar que siguen esperando algo que ya no va a llegar.
        */
        if (ev.faltaron > 0 && !ev.sinSesion) {
          setFracaso({ faltaron: ev.faltaron, motivo: ev.motivo || '' });
          setEnVivo((p) => {
            const n = { ...p };
            for (const c of lista) if (!['listo', 'error'].includes(n[c]?.estado || '')) n[c] = { estado: 'error', motivo: 'no se pudo consultar' };
            return n;
          });
        }
        onLoteAplicado?.();
        await onRefrescar?.();
      }
    });
  };

  /**
   * `enVivo` leído desde adentro del callback del stream.
   *
   * El callback se crea una vez, al abrir el stream, así que su clausura ve el `enVivo` de ese
   * instante y no el actual. Sin el ref, la lista de pendientes al pausar se calcularía sobre un
   * estado vacío y se reintentaría todo, incluido lo que ya se guardó.
   */
  const enVivoRef = useRef(enVivo);
  useEffect(() => {
    enVivoRef.current = enVivo;
  }, [enVivo]);

  /**
   * Si el Asistente desaparece, la corrida no puede seguir «en curso».
   *
   * El stream muere sin avisar —no llega ningún evento de cierre cuando el proceso se va— así que
   * `mirando` se quedaba en true para siempre: la cabecera decía «Validando obras sociales» con su
   * botón Detener, y tres renglones más abajo la misma pantalla decía «Asistente no detectado». Dos
   * afirmaciones opuestas a la vez, y la de arriba era la falsa.
   *
   * Lo que quedó consultado ya está guardado; el resto pasa a `pausadoEn` y se reanuda solo cuando el
   * Asistente vuelva, que es el mismo camino que la sesión de ARCA caída.
   */
  useEffect(() => {
    if (!mirando || asistente.fallo !== 'no-detectado') return;
    cortarStream.current?.();
    setMirando(false);
    setFaseCorrida('');
    setPausadoEn(pendientes.map((f) => soloDigitos(f.row.cuit || '')).filter((c) => !['listo', 'error'].includes(enVivoRef.current[c]?.estado || '')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asistente.fallo, mirando]);

  /** Los que quedaron en rojo. Es lo que ofrece el botón de reintentar. */
  const fallidos = useMemo(() => Object.entries(enVivo).filter(([, v]) => v.estado === 'error').map(([c]) => c), [enVivo]);

  /**
   * Reanudar sola cuando vuelve la sesión.
   *
   * Es el cierre del estado de pausa: la persona se loguea en la otra ventana y esto sigue donde
   * estaba, sin que tenga que volver acá y apretar nada. Sin esto, «se pausa y no se aborta» sería
   * una promesa a medias — el trabajo quedaría esperando un click que nadie sabe que hay que dar.
   */
  useEffect(() => {
    if (pausadoEn.length === 0 || mirando) return;
    if (asistente.estado?.sesionArca !== 'viva' || asistente.estado?.corriendo) return;
    const seguir = pausadoEn;
    setPausadoEn([]);
    void empezarCorrida(seguir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asistente.estado?.sesionArca, asistente.estado?.corriendo, pausadoEn, mirando]);

  const detener = async () => {
    /*
      Se corta el camino que está corriendo. Son dos y no uno.

      `cortarStream` es el mismo en los dos —corta el stream del Asistente o el polling del
      servidor— pero el pedido de frenar va a lugares distintos: cortar solo del lado del navegador
      dejaría al VPS abriendo pantallas de ARCA sin nadie mirando.
    */
    try {
      if (servidorListo) await projectsAPI.detenerValidacionServidor();
      else await asistenteAPI.detener();
    } catch {
      /* si del otro lado ya no hay corrida, no hay nada que frenar */
    }
    cortarStream.current?.();
    setMirando(false);
    setFaseCorrida('');
  };

  // Con la empleadora en el título: durante la corrida es el dato que dice contra qué CUIT se está
  // consultando, y es el que hay que reelegir en ARCA si el lote cambia de empresa.
  const cabecera = terminado ? `${total} validada${total === 1 ? '' : 's'}` : mirando ? `Validando obras sociales${empleadora ? ` — ${empleadora}` : ''}` : 'Validar obras sociales';
  const subcabecera = terminado
    ? `${conAfiliacion} con afiliación propia · ${sinAfiliacion} quedan con la del convenio`
    : mirando
      ? `${hechas} de ${total} · se guardan solas al llegar · no cierres el Chrome de ARCA`
      : `${empleadora ? `${empleadora} · ` : ''}${pendientes.length} pendiente${pendientes.length === 1 ? '' : 's'}`;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* ── Cabecera: estado a la izquierda, la acción a la derecha ─────────── */}
      <div className="px-4 py-3 flex items-center gap-3 flex-wrap border-b border-gray-200 dark:border-gray-700">
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            {terminado && <FontAwesomeIcon icon={faCircleCheck} className="h-4 w-4 text-green-600 dark:text-green-400" />}
            {cabecera}
          </h3>
          <p className="text-[12px] text-gray-500 dark:text-gray-400">{subcabecera}</p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Reintentar los que fallaron. Va al lado del principal y no al pie: si hay tres en rojo,
              la acción que sigue es esa y no volver a correr las veinte. */}
          {!mirando && fallidos.length > 0 && (
            <button type="button" onClick={() => empezarCorrida(fallidos)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-semibold border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
              <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3" />
              Reintentar {fallidos.length === 1 ? 'el que falló' : `los ${fallidos.length} que fallaron`}
            </button>
          )}
          {!terminado &&
            (mirando ? (
              <button type="button" onClick={detener} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-red-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                <FontAwesomeIcon icon={faStop} className="h-3 w-3" />
                Detener
              </button>
            ) : (
              <button
                type="button"
                onClick={() => (servidorListo ? empezarCorridaEnServidor() : empezarCorrida())}
                /* Sin sesión de ARCA el botón no puede funcionar, y dejarlo apretable haría fallar la
                   corrida por un motivo que el bloque de arriba ya está explicando — con su propia
                   acción, que es la que hay que apretar. El `title` nombra el estado REAL: decir
                   «primero abrí ARCA» con ARCA ya abierto mandaba a la persona a hacer algo que ya
                   estaba hecho. */
                /* Con el servidor configurado el botón no depende del Asistente: no hay ninguna
                   sesión local que mirar, la abre el VPS. */
                disabled={!empresaId || pendientes.length === 0 || (!servidorListo && (asistente.estado?.sesionArca !== 'viva' || !!asistente.estado?.corriendo))}
                title={
                  servidorListo
                    ? 'Lo hace el servidor: no hace falta instalar nada ni dejar ninguna ventana abierta.'
                    : asistente.estado?.sesionArca === 'viva'
                    ? undefined
                    : asistente.estado?.chromeAbierto
                      ? 'El Chrome de ARCA está abierto pero falta iniciar sesión: usá «Ir a esa ventana», acá arriba.'
                      : 'Falta abrir el Chrome de ARCA: usá «Abrir ARCA», acá arriba.'
                }
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <FontAwesomeIcon icon={faPlay} className="h-3 w-3" />
                {/* El botón dice CUÁNTAS. «Validar» a secas no deja saber si son estas 20 o la de al lado. */}
                Validar {pendientes.length === 1 ? '1 obra social' : `${pendientes.length} obras sociales`}
              </button>
            ))}
        </div>
      </div>

      {/*
        El bloque del Asistente solo aparece si el servidor NO puede hacerlo.

        Cuando está configurado, todo eso —instalar, emparejar, abrir Chrome, la ventana que no hay
        que cerrar— deja de existir para el que usa la pantalla, y mostrarlo sería pedirle que
        resuelva un problema que ya no tiene. `null` es «todavía no sé»: no se muestra nada hasta
        saberlo, para no hacer parpadear un bloque de instalación que quizá no hace falta.
      */}
      {servidorListo === false && <BloqueAsistente uso={asistente} empleadora={empleadora} />}
      {servidorListo === true && (
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 text-[12px] text-gray-600 dark:text-gray-400 flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
          Lo hace el servidor · no hace falta instalar nada
        </div>
      )}

      {/*
        Pausado por sesión caída. NO es un error y no se ve como uno.

        Lo que se consultó ya está guardado; lo que falta espera. El bloque de arriba ya está
        mostrando el estado «falta iniciar sesión» con su botón, así que acá solo se dice qué va a
        pasar cuando eso se resuelva — que es lo que la persona no puede adivinar.
      */}
      {pausadoEn.length > 0 && !mirando && (
        <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-amber-50/70 dark:bg-amber-950/20 text-[11.5px] text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            {asistente.fallo === 'no-detectado' ? (
              <>
                Se cerró el Asistente con <strong>{pausadoEn.length}</strong> sin consultar. Lo ya validado quedó guardado. <strong>Sigue solo</strong> apenas lo vuelvas a ejecutar.
              </>
            ) : (
              <>
                Se cortó la sesión de ARCA con <strong>{pausadoEn.length}</strong> sin consultar. Lo ya validado quedó guardado. <strong>Sigue solo</strong> apenas vuelvas a entrar en esa ventana.
              </>
            )}
          </span>
        </div>
      )}

      {/*
        La barra, y una línea que dice qué está pasando.

        INDETERMINADA mientras no haya ninguna resuelta: con `width: 0%` la barra medía cero píxeles,
        así que durante toda la parte lenta —conectarse, esperar la pantalla de altas— no había NADA
        moviéndose en pantalla. Una barra que no se mueve y una app colgada se ven igual.
      */}
      {mirando && total > 0 && (
        <div className="h-1 bg-gray-200 dark:bg-gray-700 overflow-hidden">
          {hechas === 0 ? (
            <div className="h-full w-1/3 bg-gradient-to-r from-blue-600 to-green-500 animate-[barrita_1.4s_ease-in-out_infinite]" />
          ) : (
            <div className="h-full bg-gradient-to-r from-blue-600 to-green-500 transition-[width] duration-500" style={{ width: `${Math.round((hechas / total) * 100)}%` }} />
          )}
        </div>
      )}

      {/* Qué está haciendo ahora. Es lo que convierte una espera de minutos en algo que se entiende. */}
      {mirando && faseCorrida && (
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-blue-50/60 dark:bg-blue-950/20 text-[11.5px] text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3 shrink-0 text-blue-600 dark:text-blue-400" />
          <span>{faseCorrida}</span>
        </div>
      )}

      {/*
        Sin una sola empleadora no se puede aplicar la tanda, y hay que DECIRLO.

        La validación de "esta obra social está entre las registradas" es por CUIT: mezclar dos
        empleadoras haría que el mismo RNOS sea válido para unas filas e inválido para otras.
      */}
      {!empresaId && (
        <div className="m-4 rounded-lg border border-amber-300 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/20 px-3 py-2.5 text-[11.5px] text-gray-700 dark:text-gray-300 flex items-start gap-2">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Los contratos elegidos son de <strong>más de una empleadora</strong>, o todavía no tienen una asignada. La obra social se valida contra el CUIT que la declara, así que la tanda tiene que ser
            de una sola: elegí la empleadora en las pestañas de arriba —o asignásela a estos contratos— y volvé a intentar.
          </span>
        </div>
      )}

      {/*
        La corrida terminó sin validar a nadie. ANTES ESTO NO SE VEÍA.

        Un `fin` con `faltaron: 20` se renderizaba igual que no haber apretado nada: filas «en cola»,
        sin cartel, sin color, sin botón. La persona se quedaba mirando una pantalla que no afirmaba
        ni éxito ni fracaso, y lo leía como un cuelgue. Un fracaso silencioso es peor que un error.
      */}
      {fracaso && (
        <div className="mx-4 mt-3 rounded-lg border border-red-300 dark:border-red-800/70 bg-red-50/70 dark:bg-red-950/20 px-3 py-2.5 flex items-start gap-2.5">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
          <div className="min-w-0 flex-1 text-[11.5px] text-gray-700 dark:text-gray-300">
            <p className="font-semibold text-red-700 dark:text-red-400">
              La corrida terminó sin validar {fracaso.faltaron === total ? `ninguna de las ${total}` : `${fracaso.faltaron} de ${total}`}.
            </p>
            <p className="mt-0.5">{fracaso.motivo || 'El Asistente no informó el motivo. El detalle se imprime en su ventana.'}</p>
          </div>
          <button type="button" onClick={() => empezarCorrida()} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-100/60 dark:hover:bg-red-950/40 transition-colors">
            <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3" />
            Reintentar
          </button>
        </div>
      )}

      {/* ── La tabla ────────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
              <th className="px-4 py-2.5 font-bold">Persona</th>
              <th className="px-3 py-2.5 font-bold">CUIL</th>
              {/* Qué pasa si NO validás. Es la pregunta que se hace quien duda si vale la pena el trámite. */}
              <th className="px-3 py-2.5 font-bold">Qué va a quedar hoy</th>
              <th className="px-3 py-2.5 font-bold">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[12px] text-gray-500 dark:text-gray-400">
                  No hay obras sociales pendientes de validar en esta selección.
                </td>
              </tr>
            ) : (
              visibles.map((f) => {
                const k = clave(f.row);
                const sugerido = f.valores.rnosSugerido ? `${f.valores.rnosSugerido}${f.valores.nombreObraSocialSugerida ? ` · ${f.valores.nombreObraSocialSugerida}` : ''}` : '';
                return (
                  <tr key={k} className="border-b border-gray-100 dark:border-gray-700/60 align-middle">
                    <td className="px-4 py-2.5 text-gray-800 dark:text-gray-200">{f.row.userName}</td>
                    <td className="px-3 py-2.5">
                      <CeldaCuil cuil={f.row.cuit || ''} />
                    </td>
                    <td className="px-3 py-2.5 text-[11.5px] text-gray-500 dark:text-gray-400 font-mono">{sugerido || <span className="text-amber-700 dark:text-amber-400">sin default · el convenio no tiene obra social</span>}</td>
                    <td className="px-3 py-2.5">
                      {/*
                        Si esta corrida tocó esta fila, se muestra lo que la corrida dijo — incluso
                        después de recargar el listado. El estado recargado diría «afiliación propia»
                        y perdería el dato que importa revisar: DE QUÉ a qué cambió. Ese registro
                        tiene que sobrevivir hasta que se cierre la pantalla.
                      */}
                      {enVivo[soloDigitos(f.row.cuit || '')] ? (
                        <CeldaEnVivo v={enVivo[soloDigitos(f.row.cuit || '')]} porDefecto={f.valores.rnosSugerido || ''} />
                      ) : f.valores.constatacion === 'afiliada' ? (
                        <span className="text-[11.5px] text-green-700 dark:text-green-400 font-mono inline-flex items-center gap-1.5">
                          <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
                          {f.valores.rnos} · afiliación propia
                        </span>
                      ) : f.valores.constatacion === 'no_figura' ? (
                        /*
                          «Sin afiliación» es un ÉXITO y se muestra como tal.

                          Es la respuesta más común de ARCA —la persona no tiene obra social propia, rige
                          la del convenio— y como vacío se leía como si la consulta hubiera fallado.
                        */
                        <span className="text-[11.5px] text-gray-500 dark:text-gray-400 inline-flex items-center gap-1.5">
                          <FontAwesomeIcon icon={faCheck} className="h-3 w-3 text-green-600 dark:text-green-400" />
                          sin afiliación → queda <span className="font-mono">{f.valores.rnosSugerido || '—'}</span>
                        </span>
                      ) : (
                        <CeldaEnVivo v={enVivo[soloDigitos(f.row.cuit || '')]} porDefecto={f.valores.rnosSugerido || ''} />
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── El pie: qué cambió, sin tener que contar ─────────────────────────── */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 text-[12px] text-gray-600 dark:text-gray-400">
        {terminado ? (
          <>Los {total} contrato{total === 1 ? '' : 's'} quedaron con su obra social fija y con fecha. La pantalla de ARCA quedó limpia.</>
        ) : mirando ? (
          <>
            {conAfiliacion} con obra social propia · {sinAfiliacion} sin declarar · {Math.max(0, total - resueltas)} por consultar
          </>
        ) : fallidos.length > 0 ? (
          <>
            {fallidos.length} sin validar por el motivo que dice cada fila. Lo demás quedó guardado.
          </>
        ) : (
          <>Se guardan solas al llegar. Nada se pisa sin mostrarte antes qué cambia.</>
        )}
      </div>
    </div>
  );
};
