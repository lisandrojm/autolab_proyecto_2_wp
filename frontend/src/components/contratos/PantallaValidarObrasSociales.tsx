import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faCheck, faCopy, faCircleCheck, faXmark, faTriangleExclamation, faPlay, faStop, faRotateRight, faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { ContractOverviewRow } from '../../api/users';
import { projectsAPI } from '../../api/projects';
import { AfipValues } from './afipCompleteness';
import { asistenteAPI, EventoProgreso } from '../../api/asistente';
import { BloqueAsistente, useAsistente } from './EstadoAsistente';
import { sweetAlert } from '../../utils/sweetAlert';

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
  /** Id de la empleadora activa. Sin ella no se puede aplicar: la validación del RNOS es por CUIT. */
  empresaId?: string;
  /** Vuelve a pedir el listado. Es lo que hace posible mirar la corrida del script. */
  onRefrescar?: () => void | Promise<void>;
  onLoteAplicado?: () => void;
}> = ({ filas, empleadora, empresaId, onRefrescar, onLoteAplicado }) => {
  /** Corriendo: el Asistente está recorriendo ARCA y los resultados llegan por su stream. */
  const [mirando, setMirando] = useState(false);
  const asistente = useAsistente();
  /**
   * Lo que va pasando con cada CUIL, en vivo.
   *
   * Guarda el ANTES y el DESPUÉS, no solo el resultado. Cambiar la obra social de alguien sin que se
   * vea de qué a qué es exactamente lo que este flujo tiene que hacer visible: el valor que estaba
   * puesto por convenio y el que ARCA acaba de contestar son datos distintos y la diferencia importa.
   */
  const [enVivo, setEnVivo] = useState<Record<string, EnVivo>>({});
  const cortarStream = useRef<null | (() => void)>(null);
  /**
   * Lo que quedó sin consultar cuando se corta la sesión de ARCA.
   *
   * No se pierde ni se marca como error: la sesión que se cae no dice nada sobre esas personas. Queda
   * acá para reanudar sola cuando la sesión vuelva (ver el efecto de más abajo).
   */
  const [pausadoEn, setPausadoEn] = useState<string[]>([]);

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
    ? Object.values(enVivo).filter((v) => v.estado === 'listo' && !v.rnos).length
    : visibles.filter((f) => f.valores.constatacion === 'no_figura').length;
  const terminado = total > 0 && pendientes.length === 0;

  /** Al desmontar, se corta el stream: dejarlo abierto filtra una conexión por cada vez que se abre. */
  useEffect(() => () => cortarStream.current?.(), []);

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
      setEnVivo((p) => ({ ...p, [cuil]: { estado: 'listo', rnos, antes, despues, cambio: antes === despues ? 'igual' : 'actualizada' } }));
      // El listado se recarga UNA vez al terminar, no por fila: veinte recargas completas mientras
      // corre es tráfico inútil y hace parpadear la tabla que la persona está mirando.
    } catch (e: any) {
      setEnVivo((p) => ({ ...p, [cuil]: { estado: 'error', rnos, antes, motivo: e?.response?.data?.error || e?.message || 'no se pudo guardar' } }));
    }
  };

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
    // Solo se limpian los que se van a volver a consultar: borrar todo perdería el resultado de los
    // que ya salieron bien, que es justamente lo que un reintento no tiene que tocar.
    setEnVivo((p) => {
      const n = { ...p };
      for (const c of lista) delete n[c];
      return n;
    });

    try {
      await asistenteAPI.validar(lista.map((cuil) => ({ cuil })));
    } catch (e: any) {
      sweetAlert.error('No pude arrancar', e?.message || 'El Asistente no aceptó la corrida.');
      return;
    }
    setMirando(true);

    const porCuil = new Map(visibles.map((f) => [soloDigitos(f.row.cuit || ''), f]));
    cortarStream.current = asistenteAPI.progreso(async (ev: EventoProgreso) => {
      if (ev.tipo === 'consultando') {
        setEnVivo((p) => ({ ...p, [ev.cuil]: { ...p[ev.cuil], estado: 'consultando' } }));
      } else if (ev.tipo === 'resultado') {
        const f = porCuil.get(ev.cuil);
        if (f) await guardarUna(f, ev.cuil, ev.rnos);
      } else if (ev.tipo === 'error') {
        setEnVivo((p) => ({ ...p, [ev.cuil]: { estado: 'error', motivo: 'ARCA no devolvió fila para este CUIL' } }));
      } else if (ev.tipo === 'fallo') {
        setMirando(false);
        sweetAlert.error('Se cortó la corrida', ev.mensaje);
      } else if (ev.tipo === 'fin') {
        setMirando(false);
        /*
          Sesión caída a mitad: se PAUSA, no se aborta.

          Lo ya guardado quedó guardado (cada fila se fijó al llegar). Los que faltaron quedan en
          `pausadoEn` y se reanudan solos cuando la sesión vuelva. Marcarlos como error diría algo
          sobre esas personas que ARCA nunca contestó.
        */
        if (ev.sinSesion) setPausadoEn(lista.filter((c) => !['listo', 'error'].includes(enVivoRef.current[c]?.estado || '')));
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
    try {
      await asistenteAPI.detener();
    } catch {
      /* si el Asistente ya no está, la corrida tampoco */
    }
    cortarStream.current?.();
    setMirando(false);
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
                onClick={() => empezarCorrida()}
                /* Sin sesión de ARCA el botón no puede funcionar, y dejarlo apretable haría fallar la
                   corrida por un motivo que el bloque de arriba ya está explicando — con su propia
                   acción, que es la que hay que apretar. El `title` nombra el estado REAL: decir
                   «primero abrí ARCA» con ARCA ya abierto mandaba a la persona a hacer algo que ya
                   estaba hecho. */
                disabled={!empresaId || pendientes.length === 0 || asistente.estado?.sesionArca !== 'viva' || !!asistente.estado?.corriendo}
                title={
                  asistente.estado?.sesionArca === 'viva'
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

      {/* Ni un comando de terminal: lo que ve el administrativo es si el Asistente está o no. */}
      <BloqueAsistente uso={asistente} empleadora={empleadora} />

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
            Se cortó la sesión de ARCA con <strong>{pausadoEn.length}</strong> sin consultar. Lo ya validado quedó guardado. <strong>Sigue solo</strong> apenas vuelvas a entrar en esa ventana.
          </span>
        </div>
      )}

      {/* Barra de progreso: solo mientras corre. Sin nada que mirar es decoración. */}
      {mirando && total > 0 && (
        <div className="h-1 bg-gray-200 dark:bg-gray-700">
          <div className="h-full bg-gradient-to-r from-blue-600 to-green-500 transition-[width] duration-500" style={{ width: `${Math.round((hechas / total) * 100)}%` }} />
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
            {conAfiliacion} con obra social propia · {sinAfiliacion} sin afiliación · {Math.max(0, total - resueltas)} por consultar
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
