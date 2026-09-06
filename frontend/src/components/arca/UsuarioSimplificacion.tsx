import React, { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserLock, faSpinner, faTriangleExclamation, faCircleInfo, faCalendarDays, faHourglassHalf, faCheck, faRotate, faListUl, faXmark } from '@fortawesome/free-solid-svg-icons';
import { InfoModal } from '../ui/InfoModal';
import { Modal } from '../ui/Modal';
import { afipAPI, SimplificacionStatus, CorridaObrasSocialesLog } from '../../api/afip';
import { sweetAlert } from '../../utils/sweetAlert';

/**
 * El usuario de clave fiscal con el que el SERVIDOR opera Simplificación Registral.
 *
 * ES OTRA COSA QUE EL CERTIFICADO de «Conexión → Constancia de CUIT», y la confusión es fácil: los
 * dos son «credenciales de ARCA». El certificado sirve para webservices (Consulta Padrón) y no puede
 * entrar a ninguna pantalla; este es un login de persona, y hace falta porque la obra social de un
 * trabajador no la publica ningún webservice — solo aparece precompletada en la pantalla de altas.
 *
 * SE DIBUJA IGUAL QUE AQUELLA, a propósito. Estaban armadas como cosas distintas —aquella una
 * tarjeta de estado con sus acciones abajo, esta un formulario siempre a la vista— y se leían como
 * módulos diferentes de la app en vez de como dos variantes de lo mismo. Misma forma y mismo
 * comportamiento: con la conexión hecha se ve el estado; el formulario aparece cuando no la hay, o
 * cuando se pide cambiarla.
 */
export const UsuarioSimplificacion: React.FC<{
  /** Se llama al guardar bien. Lo usa el modal de la pantalla de validar para cerrarse y seguir. */
  onGuardado?: () => void;
  /** En el modal el encabezado ya lo pone el modal: repetirlo dos veces no explica nada. */
  sinEncabezado?: boolean;
}> = ({ onGuardado, sinEncabezado }) => {
  const [estado, setEstado] = useState<SimplificacionStatus | null>(null);
  const [cuit, setCuit] = useState('');
  const [clave, setClave] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [info, setInfo] = useState(false);
  /** Con credenciales cargadas, el formulario aparece solo si se pide cambiarlas. */
  const [cambiando, setCambiando] = useState(false);
  const [verLogs, setVerLogs] = useState(false);
  const [logs, setLogs] = useState<CorridaObrasSocialesLog[] | null>(null);
  const [cargandoLogs, setCargandoLogs] = useState(false);
  const [logAbierto, setLogAbierto] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setEstado(await afipAPI.simplificacionStatus());
    } catch {
      setEstado(null);
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = async () => {
    setGuardando(true);
    try {
      await afipAPI.guardarSimplificacion({ cuitUsuario: cuit.replace(/\D/g, ''), clave });
      // La clave se borra del formulario apenas se guarda: no tiene por qué seguir en memoria del
      // navegador ni quedar en un campo que alguien pueda revelar con el ojito del password.
      setClave('');
      setCambiando(false);
      await cargar();
      onGuardado?.();
      sweetAlert.success('Listo', 'La próxima validación de obras sociales la va a hacer el servidor solo.');
    } catch (e: any) {
      sweetAlert.error('No se pudo guardar', e?.response?.data?.error || 'Revisá el CUIT y la clave.');
    } finally {
      setGuardando(false);
    }
  };

  const desconectar = async () => {
    const r = await sweetAlert.confirm(
      '¿Desconectar obras sociales?',
      'El servidor deja de poder validarlas solo. También se borra la sesión guardada, así que el acceso se corta ya — no queda entrando con la sesión anterior.',
      'Sí, desconectar',
    );
    if (!r.isConfirmed) return;
    try {
      await afipAPI.borrarSimplificacion();
      await cargar();
    } catch (e: any) {
      sweetAlert.error('No se pudo', e?.response?.data?.error || 'No se pudo desconectar.');
    }
  };

  const abrirLogs = async () => {
    setVerLogs(true);
    setCargandoLogs(true);
    try {
      setLogs(await afipAPI.logsSimplificacion());
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudieron cargar los logs.');
      setLogs([]);
    } finally {
      setCargandoLogs(false);
    }
  };

  /**
   * El historial de corridas.
   *
   * Hasta acá, lo único que se sabía de una corrida era `ultimoError`: una sola línea, la de la última
   * vez, que se pisa con la siguiente. Si una validación de sesenta personas dejó cuatro sin dato, no
   * quedaba en ningún lado qué cuatro ni por qué — y como la obra social se declara ante el organismo
   * y después queda fija, «¿de dónde salió este código?» tiene que tener respuesta.
   */
  const modalLogs = (
    <Modal isOpen onClose={() => setVerLogs(false)} title="Logs de obras sociales" subtitle="Últimas 50 corridas de validación contra ARCA" size="xl" zIndex={90}>
      {cargandoLogs ? (
        <div className="flex justify-center py-10 text-gray-400">
          <FontAwesomeIcon icon={faSpinner} spin className="mr-2" /> Cargando...
        </div>
      ) : !logs || logs.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">Todavía no se corrió ninguna validación.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700/60 max-h-[65vh] overflow-y-auto custom-scrollbar">
          {logs.map((log) => {
            // Verde solo si no faltó nadie y no se cayó. `sinDeclarar` no cuenta como falla: ARCA
            // contestó, y lo que contestó es que rige la obra social del convenio.
            const ok = !log.error && log.faltaron === 0;
            const abierto = logAbierto === log._id;
            return (
              <li key={log._id} className="py-2.5">
                <button type="button" onClick={() => setLogAbierto(abierto ? null : log._id)} className="w-full flex items-start justify-between gap-3 text-left">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FontAwesomeIcon icon={ok ? faCheck : faXmark} className={`h-3 w-3 ${ok ? 'text-green-500' : 'text-red-500'}`} />
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate">{log.empresaRazonSocial || log.empresaCuit || 'Empleadora sin nombre'}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {log.validadas}/{log.total} con obra social · {log.guardadas} guardadas
                        {log.sinDeclarar > 0 ? ` · ${log.sinDeclarar} sin declarar` : ''}
                        {log.faltaron > 0 ? ` · ${log.faltaron} sin leer` : ''}
                      </span>
                    </div>
                    {(log.error || log.motivo) && <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5 truncate">{log.error || log.motivo}</p>}
                  </div>
                  <span className="text-[11px] text-gray-400 whitespace-nowrap shrink-0">{new Date(log.createdAt).toLocaleString('es-AR')}</span>
                </button>
                {abierto && (
                  <div className="mt-2 space-y-2">
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Duró {Math.round(log.duracionMs / 1000)} s · {log.seLogueo ? 'tuvo que iniciar sesión' : 'usó la sesión guardada'}
                      {log.empresaCuit ? ` · CUIT ${log.empresaCuit}` : ''}
                    </p>
                    {(log.renombrados?.length || 0) > 0 && (
                      <div className="rounded-lg border border-amber-200 dark:border-amber-800/70 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2">
                        <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">Nombres corregidos con los de ARCA</p>
                        <ul className="mt-1 space-y-0.5">
                          {log.renombrados!.map((r, i) => (
                            <li key={i} className="text-[11.5px] text-gray-700 dark:text-gray-300">
                              <span className="text-gray-400 line-through">{r.antes}</span> <span className="text-gray-400">→</span> <span className="font-semibold">{r.ahora}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {log.detalle.length === 0 ? (
                      <p className="text-[11px] text-gray-400">No se llegó a leer a nadie.</p>
                    ) : (
                      <ul className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60 max-h-[40vh] overflow-y-auto custom-scrollbar">
                        {log.detalle.map((d, i) => (
                          <li key={`${d.cuil}-${i}`} className="flex items-start justify-between gap-3 px-3 py-1.5 text-[11.5px]">
                            <span className="font-mono text-gray-600 dark:text-gray-300">{d.cuil}</span>
                            {d.error ? (
                              <span className="text-amber-600 dark:text-amber-400 text-right">{d.error}</span>
                            ) : d.rnos ? (
                              <span className="font-mono font-semibold text-gray-800 dark:text-gray-100">{d.rnos}</span>
                            ) : (
                              <span className="text-gray-400">sin obra social declarada</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );

  const botonInfo = (
    <button type="button" onClick={() => setInfo(true)} title="Qué es esto y en qué se diferencia del certificado" className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400">
      <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
    </button>
  );

  const modalInfo = (
    <InfoModal isOpen onClose={() => setInfo(false)} title="Obras sociales, nombres y documentos" subtitle="Qué es, para qué se usa, y por qué no alcanza con el certificado" size="md" zIndex={90}>
      <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
        <p>
          Es <strong>otra cosa</strong> que el certificado de «Conexión → Constancia de CUIT». Aquel consulta el padrón por webservice y trae datos del contribuyente; este es un login de clave fiscal,
          y hace falta porque <strong>la obra social de un trabajador no la devuelve ninguna API</strong>: solo aparece precompletada en la pantalla de altas de ARCA.
        </p>
        <p>Con esto conectado, la consulta la hace el servidor solo y deja de necesitar que alguien instale el Asistente en su computadora.</p>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30 px-3 py-2.5 space-y-2">
          <p className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">Se usa para tres cosas, con una sola consulta</p>
          <p className="text-[13px]">
            Al escribir un CUIL en la pantalla de altas, ARCA muestra la <strong>obra social</strong> precompletada y el <strong>nombre</strong> de la persona. Son el mismo renglón, así que validar la
            obra social y validar el nombre no cuestan dos consultas: cuestan una.
          </p>
          <p className="text-[13px]">
            El <strong>tipo y número de documento</strong> no los devuelve ARCA en ninguna de las dos conexiones. En un CUIT de persona física —los que empiezan con 20, 23, 24, 25, 26 o 27— el
            documento son los ocho dígitos del medio, así que se calcula del propio CUIT y se compara con lo que tiene la ficha. No hace falta preguntárselo a nadie.
          </p>
          <p className="text-[13px] text-gray-600 dark:text-gray-400">
            El certificado de «Constancia de CUIT» queda para lo suyo: los contratos de <strong>servicios</strong>, que son monotributistas y necesitan la constancia.
          </p>
        </div>
        <div className="rounded-lg border border-amber-300 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/20 px-3 py-2.5 flex items-start gap-2.5">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="text-[13px]">
            <strong>Usá un usuario creado aparte, no el del apoderado.</strong> En AFIP, creale su propia clave fiscal y delegale <strong>únicamente «Simplificación Registral»</strong> desde
            Administrador de Relaciones. Una clave fiscal completa abre DDJJ, pagos y facturación: si alguna vez se compromete el servidor, la diferencia es entre perder el acceso a una pantalla de
            altas o a toda la identidad tributaria de la empresa. <strong>WeProdu no puede verificar qué servicios tiene delegados</strong> — eso se controla en AFIP.
          </span>
        </div>
      </div>
    </InfoModal>
  );

  if (!estado) return null;

  /** La misma caja que la tarjeta del certificado. En el modal la pone el modal. */
  const tarjeta = sinEncabezado ? '' : 'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 max-w-xl';

  // ── Conectado: tarjeta de ESTADO, con la misma anatomía que la del certificado ──
  if (estado.configurado && !cambiando) {
    return (
      <div className={`${tarjeta} space-y-4`}>
        <div className="flex items-center gap-3">
          <FontAwesomeIcon icon={faUserLock} className="h-7 w-7 shrink-0 text-blue-600" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Obras sociales, nombres y documentos</h3>
              {botonInfo}
            </div>
            <p className="text-xs text-gray-500">Usuario de clave fiscal: {estado.cuitUsuario}</p>
          </div>
          {/* Arriba a la derecha, no en la fila de abajo: es la única acción destructiva de la
              tarjeta, y ahí no queda pegada a las que se usan todos los días. */}
          <button onClick={desconectar} className="ml-auto self-start shrink-0 text-sm text-red-500 hover:text-red-600 font-semibold">
            Desconectar
          </button>
        </div>

        {/*
          QUÉ SE HACE CON ESTA CONEXIÓN, dicho en la tarjeta y no solo en el ⓘ.

          Se llama «obras sociales» por lo primero que resolvió, pero la pantalla de altas de ARCA
          muestra las tres cosas al escribir un CUIL: la obra social precompletada y el nombre con el
          que la persona figura ante el organismo. Quien viene a conectar esto tiene que poder saber
          que también de acá sale la validación de nombres, sin abrir el ⓘ.
        */}
        <p className="text-sm text-gray-600 dark:text-gray-300">
          El servidor consulta <strong>solo</strong>: nadie tiene que instalar el Asistente ni dejar ninguna ventana abierta.
        </p>
        <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
          <li className="flex items-start gap-2">
            <FontAwesomeIcon icon={faCheck} className="h-3 w-3 mt-1 shrink-0 text-green-600 dark:text-green-400" />
            <span>
              La <strong>obra social</strong> que ARCA tiene registrada para cada trabajador.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <FontAwesomeIcon icon={faCheck} className="h-3 w-3 mt-1 shrink-0 text-green-600 dark:text-green-400" />
            <span>
              El <strong>nombre real</strong>, tal como figura ante el organismo. Sale de la misma consulta: la pantalla lo muestra al lado de la obra social.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <FontAwesomeIcon icon={faCheck} className="h-3 w-3 mt-1 shrink-0 text-green-600 dark:text-green-400" />
            <span>
              El <strong>tipo y número de documento</strong>. Este no lo devuelve ARCA por ningún lado: en un CUIT de persona física son los ocho dígitos del medio, así que se calcula y se verifica
              contra la ficha.
            </span>
          </li>
        </ul>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm border-t border-gray-100 dark:border-gray-700 pt-3">
          {estado.ultimoLoginAt && (
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
              <FontAwesomeIcon icon={faCalendarDays} className="text-gray-400 w-3.5" />
              Último ingreso el {new Date(estado.ultimoLoginAt).toLocaleDateString('es-AR')}
            </div>
          )}
          {estado.sesionGuardadaAt && (
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
              <FontAwesomeIcon icon={faHourglassHalf} className="text-gray-400 w-3.5" />
              Sesión guardada el {new Date(estado.sesionGuardadaAt).toLocaleDateString('es-AR')}
            </div>
          )}
        </div>

        {/*
          Ocupa el mismo lugar que el banner del servicio en la otra tarjeta, y con el mismo criterio:
          «cargado» solo dice que hay credenciales; que ARCA las acepte se sabe recién al usarlas. Por
          eso el último error, si lo hubo, manda sobre el verde.
        */}
        {estado.ultimoError ? (
          <div className="space-y-1 text-xs px-3 py-2 rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2 font-semibold">
              <FontAwesomeIcon icon={faTriangleExclamation} className="w-3.5 shrink-0" />
              El último intento falló
            </div>
            <p className="whitespace-pre-line">{estado.ultimoError}</p>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-200 dark:border-green-800">
            <FontAwesomeIcon icon={faCheck} className="w-3.5 shrink-0" />
            Credenciales cargadas{estado.sesionGuardadaAt ? ' — con sesión abierta, no necesita loguearse' : ''}
          </div>
        )}

        <div className="flex items-center gap-4">
          <button onClick={() => setCambiando(true)} className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-semibold">
            <FontAwesomeIcon icon={faRotate} className="h-3.5 w-3.5" />
            Cambiar credenciales
          </button>
          <button onClick={abrirLogs} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 font-semibold">
            <FontAwesomeIcon icon={faListUl} className="h-3.5 w-3.5" />
            Logs
          </button>
        </div>

        {info && modalInfo}
        {verLogs && modalLogs}
      </div>
    );
  }

  // ── Sin conectar (o cambiando): el formulario, con la anatomía de «Conectar ARCA» ──
  return (
    <div className={tarjeta}>
      <div className="flex items-center gap-3 mb-4">
        <FontAwesomeIcon icon={faUserLock} className="h-7 w-7 text-blue-600" />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Conectar obras sociales</h3>
            {botonInfo}
          </div>
          <p className="text-xs text-gray-500">Usuario de clave fiscal de Simplificación Registral — se guarda cifrado.</p>
        </div>
      </div>

      {/*
        UNA línea de advertencia, no el recuadro entero.

        El resto está en el info, pero esta frase se queda a la vista a propósito: es el único texto
        de la pantalla que cambia lo que hay que ESCRIBIR en los campos de abajo. Detrás de un click
        se lee cuando la clave del apoderado ya está pegada, y ahí no sirve para nada.
      */}
      <p className="mb-3 text-[11.5px] text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
        <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3 mt-0.5 shrink-0" />
        <span>
          Usá un usuario creado aparte con «Simplificación Registral» como único servicio delegado, <strong>no el del apoderado</strong>.
        </span>
      </p>

      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">CUIT del usuario</label>
          <input value={cuit} onChange={(e) => setCuit(e.target.value)} placeholder="20-12345678-9" className="input-field w-full text-sm" />
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">El del usuario que inicia sesión, no el de la empleadora.</p>
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Clave fiscal</label>
          <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} className="input-field w-full text-sm" />
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Se guarda cifrada y no se puede volver a leer desde acá.</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando || cuit.replace(/\D/g, '').length !== 11 || !clave}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {guardando && <FontAwesomeIcon icon={faSpinner} spin className="h-3.5 w-3.5" />}
          {estado.configurado ? 'Guardar' : 'Conectar'}
        </button>
        {/* Cancelar solo existe si hay algo a lo que volver: sin credenciales cargadas dejaría la
            tarjeta sin ninguna acción. */}
        {estado.configurado && (
          <button type="button" onClick={() => setCambiando(false)} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 font-semibold">
            Cancelar
          </button>
        )}
      </div>
      {estado.configurado && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">Cambiarlas borra la sesión guardada: si no, el servidor seguiría entrando con la anterior.</p>}

      {info && modalInfo}
    </div>
  );
};
