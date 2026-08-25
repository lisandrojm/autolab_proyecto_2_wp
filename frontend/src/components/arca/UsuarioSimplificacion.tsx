import React, { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserLock, faSpinner, faTriangleExclamation, faCircleInfo, faCalendarDays, faHourglassHalf, faCheck, faRotate } from '@fortawesome/free-solid-svg-icons';
import { InfoModal } from '../ui/InfoModal';
import { afipAPI, SimplificacionStatus } from '../../api/afip';
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

  const botonInfo = (
    <button type="button" onClick={() => setInfo(true)} title="Qué es esto y en qué se diferencia del certificado" className="ml-auto text-gray-400 hover:text-blue-600 dark:hover:text-blue-400">
      <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
    </button>
  );

  const modalInfo = (
    <InfoModal isOpen onClose={() => setInfo(false)} title="Conexión de obras sociales" subtitle="Qué es, y por qué no alcanza con el certificado" size="md" zIndex={90}>
      <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
        <p>
          Es <strong>otra cosa</strong> que el certificado de «Conexión → Constancia de CUIT». Aquel consulta el padrón por webservice y trae datos del contribuyente; este es un login de clave fiscal,
          y hace falta porque <strong>la obra social de un trabajador no la devuelve ninguna API</strong>: solo aparece precompletada en la pantalla de altas de ARCA.
        </p>
        <p>Con esto conectado, validar obras sociales lo hace el servidor solo y deja de necesitar que alguien instale el Asistente en su computadora.</p>
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
          <FontAwesomeIcon icon={faUserLock} className="h-7 w-7 text-blue-600" />
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Obras sociales conectado</h3>
            <p className="text-xs text-gray-500">Usuario de clave fiscal: {estado.cuitUsuario}</p>
          </div>
          {botonInfo}
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-300">
          El servidor valida las obras sociales <strong>solo</strong>: nadie tiene que instalar el Asistente ni dejar ninguna ventana abierta.
        </p>

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
          <button onClick={desconectar} className="text-sm text-red-500 hover:text-red-600 font-semibold">
            Desconectar
          </button>
          <button onClick={() => setCambiando(true)} className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-semibold">
            <FontAwesomeIcon icon={faRotate} className="h-3.5 w-3.5" />
            Cambiar credenciales
          </button>
        </div>

        {info && modalInfo}
      </div>
    );
  }

  // ── Sin conectar (o cambiando): el formulario, con la anatomía de «Conectar ARCA» ──
  return (
    <div className={tarjeta}>
      <div className="flex items-center gap-3 mb-4">
        <FontAwesomeIcon icon={faUserLock} className="h-7 w-7 text-blue-600" />
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Conectar obras sociales</h3>
          <p className="text-xs text-gray-500">Usuario de clave fiscal de Simplificación Registral — se guarda cifrado.</p>
        </div>
        {botonInfo}
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
