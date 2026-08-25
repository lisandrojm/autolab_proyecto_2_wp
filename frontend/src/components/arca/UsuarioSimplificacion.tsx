import React, { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserLock, faSpinner, faCircleCheck, faTriangleExclamation, faTrash } from '@fortawesome/free-solid-svg-icons';
import { afipAPI, SimplificacionStatus } from '../../api/afip';
import { sweetAlert } from '../../utils/sweetAlert';

/**
 * El usuario de clave fiscal con el que el SERVIDOR opera Simplificación Registral.
 *
 * ES OTRA COSA QUE EL CERTIFICADO de arriba en esta misma pantalla, y la confusión es fácil: los dos
 * son «credenciales de ARCA». El certificado sirve para webservices (Consulta Padrón) y no puede
 * entrar a ninguna pantalla; este es un login de persona, y hace falta porque la obra social de un
 * trabajador no la publica ningún webservice — solo aparece precompletada en la pantalla de altas.
 *
 * Con esto cargado, validar obras sociales deja de necesitar un programa instalado en la máquina de
 * cada administrativo: lo hace el servidor.
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
      await cargar();
      onGuardado?.();
      sweetAlert.success('Listo', 'La próxima validación de obras sociales la va a hacer el servidor solo.');
    } catch (e: any) {
      sweetAlert.error('No se pudo guardar', e?.response?.data?.error || 'Revisá el CUIT y la clave.');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    const r = await sweetAlert.confirm(
      '¿Sacar las credenciales?',
      'El servidor deja de poder validar obras sociales solo. También se borra la sesión guardada, así que el acceso se corta ya — no queda entrando con la sesión anterior.',
      'Sí, sacarlas',
    );
    if (!r.isConfirmed) return;
    try {
      await afipAPI.borrarSimplificacion();
      await cargar();
    } catch (e: any) {
      sweetAlert.error('No se pudo', e?.response?.data?.error || 'No se pudieron sacar las credenciales.');
    }
  };

  if (!estado) return null;

  return (
    <div className={sinEncabezado ? '' : 'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 max-w-2xl'}>
      {!sinEncabezado && (
        <p className="text-[13px] font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <FontAwesomeIcon icon={faUserLock} className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          Usuario para Simplificación Registral
        </p>
      )}
      <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-1">
        Es <strong>otra cosa</strong> que el certificado de arriba. Aquel sirve para consultar el padrón por webservice; este es un login de clave fiscal, y hace falta porque la obra social de un
        trabajador no la devuelve ninguna API: solo aparece en la pantalla de altas. Con esto cargado, validar obras sociales deja de necesitar el Asistente en cada computadora.
      </p>

      {/*
        La advertencia va ANTES del formulario, no debajo.

        Una clave fiscal no está acotada a esa pantalla: abre DDJJ, pagos, facturación electrónica y
        el Administrador de Relaciones. Puesta después de los campos, se lee cuando ya se pegó la
        clave del apoderado — y en ese momento el aviso ya no sirve para nada.
      */}
      <div className="mt-3 rounded-lg border border-amber-300 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/20 px-3 py-2.5 flex items-start gap-2.5">
        <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="text-[11.5px] text-gray-700 dark:text-gray-300">
          <strong>Usá un usuario creado aparte, no el del apoderado.</strong> En AFIP, creale su propia clave fiscal y delegale <strong>únicamente «Simplificación Registral»</strong> desde
          Administrador de Relaciones. Una clave fiscal completa abre DDJJ, pagos y facturación: si alguna vez se compromete el servidor, la diferencia es entre perder el acceso a una pantalla de
          altas o a toda la identidad tributaria de la empresa. <strong>WeProdu no puede verificar qué servicios tiene delegados</strong> — eso se controla en AFIP.
        </span>
      </div>

      {estado.configurado && (
        <div className="mt-3 flex items-center gap-2 flex-wrap text-[12px]">
          <span className="inline-flex items-center gap-1.5 text-green-700 dark:text-green-400 font-semibold">
            <FontAwesomeIcon icon={faCircleCheck} className="h-3.5 w-3.5" />
            Cargado · CUIT {estado.cuitUsuario}
          </span>
          {estado.ultimoLoginAt && <span className="text-gray-500 dark:text-gray-400">· último ingreso {new Date(estado.ultimoLoginAt).toLocaleDateString('es-AR')}</span>}
          {estado.sesionGuardadaAt && <span className="text-gray-500 dark:text-gray-400">· con sesión guardada (no necesita loguearse)</span>}
          <button type="button" onClick={borrar} className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-semibold text-red-600 dark:text-red-400 hover:underline">
            <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
            Sacar
          </button>
        </div>
      )}

      {/* El último error se muestra siempre que exista: es lo que evita ir a buscar los logs del VPS. */}
      {estado.ultimoError && (
        <p className="mt-2 text-[11.5px] text-red-600 dark:text-red-400">
          <strong>Último intento:</strong> {estado.ultimoError}
        </p>
      )}

      <div className="mt-3 grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">CUIT del usuario</label>
          <input value={cuit} onChange={(e) => setCuit(e.target.value)} placeholder="20-12345678-9" className="input-field w-full text-sm" />
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">El del usuario que inicia sesión, no el de la empleadora.</p>
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Clave fiscal</label>
          <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} placeholder={estado.configurado ? 'Escribí una nueva para reemplazarla' : ''} className="input-field w-full text-sm" />
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Se guarda cifrada y no se puede volver a leer desde acá.</p>
        </div>
      </div>

      <button
        type="button"
        onClick={guardar}
        disabled={guardando || cuit.replace(/\D/g, '').length !== 11 || !clave}
        className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {guardando && <FontAwesomeIcon icon={faSpinner} spin className="h-3.5 w-3.5" />}
        {estado.configurado ? 'Reemplazar credenciales' : 'Guardar credenciales'}
      </button>
      {estado.configurado && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">Reemplazarlas borra la sesión guardada: si no, el servidor seguiría entrando con la anterior.</p>}
    </div>
  );
};
