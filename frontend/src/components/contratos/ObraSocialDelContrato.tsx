import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faTurnDown, faChevronRight, faChevronDown, faArrowUpRightFromSquare, faSpinner, faCheck, faTriangleExclamation, faCopy, faCircleQuestion } from '@fortawesome/free-solid-svg-icons';
import { ContractOverviewRow } from '../../api/users';
import { projectsAPI } from '../../api/projects';
import { sweetAlert } from '../../utils/sweetAlert';
import { formatRnos } from '../../utils/rnos';
import { AfipFieldCheck, AfipValues } from './afipCompleteness';
import { InfoCampo } from './DatosArcaDetalle';

/**
 * MUESTRA la obra social de un contrato. No la pregunta.
 *
 * Esta sección era un formulario: instructivo, buscador de las 494 y dos opciones para contestar qué
 * había devuelto ARCA. Funcionaba, pero obligaba a hacer el trámite UNA VEZ POR PERSONA — con 26
 * altas, 26 idas a ARCA y 26 decisiones a mano. El trabajo real es por tanda, no por contrato, así
 * que la constatación se mudó entera a la pantalla de lote: el operador se loguea una vez, el script
 * recorre todos los CUIL y el resultado vuelve en un solo pegado.
 *
 * Lo que queda acá es el estado —qué obra social rige, de dónde salió y si está sellada— más dos
 * atajos: copiar el CUIL, y `Re-constatar`, que devuelve ESTE contrato a la cola y abre ARCA. Un
 * contrato suelto se resuelve por el mismo camino que los 26, con una cola de uno: un segundo flujo
 * "para el caso puntual" es justo lo que se acaba de sacar.
 *
 * La fuente es ARCA: Simplificación Registral → Relaciones Laborales → Registrar Nuevas Altas, donde
 * el organismo precompleta la obra social que tiene registrada para ese CUIL. Lo que devuelve queda
 * FIJO —es quien después valida el alta— y si no devuelve nada, rige la del convenio.
 */

/**
 * Login de clave fiscal. Es el ÚNICO punto de entrada que sirve siempre.
 *
 * No se enlaza ninguna URL interna de MiSimplificación —ni `login/indexContribuyente.aspx` ni
 * `Contribuyente/DatosBasicos.aspx`—: las dos redirigen a `FinSession.aspx` ("su tiempo de sesión ha
 * finalizado") si no hay una sesión viva DEL SERVICIO, que es propia y no se hereda de estar logueado
 * en ARCA. Como desde acá no hay forma de saber si existe —es otro dominio—, se manda al login, que
 * cuando ya hay sesión pasa de largo al portal.
 */
const LOGIN_AFIP_URL = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/** CUIL con guiones, como lo pide el formulario de ARCA: así se pega sin retocarlo. */
const formatCuil = (v: string): string => {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : String(v || '');
};

const fechaCorta = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const ObraSocialDelContrato: React.FC<{
  row: ContractOverviewRow;
  valores: AfipValues;
  /** De dónde salió la obra social, ya redactado por el checklist ("del convenio 0634/11"). */
  etiquetaOrigen?: string;
  /** Avisos de obra social del checklist. Se muestran acá y no en la lista de abajo: son de este tema. */
  avisos?: AfipFieldCheck[];
  onGuardado: (patch?: Partial<ContractOverviewRow>) => void;
}> = ({ row, valores, etiquetaOrigen, avisos = [], onGuardado }) => {
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

  const fechaConstatada = fechaCorta(valores.constatadaEl || '');
  /**
   * `obraSocialBloqueada` es el flag PERSISTIDO: el server lo escribe al sellar en ARCA y es el que
   * hace cumplir la inmutabilidad (contesta 409). Acá se respeta ese flag en vez de volver a
   * derivarlo, para que el candado de la UI y el del server no puedan discrepar. El fallback por
   * `constatadaEn === 'arca'` cubre los contratos sellados antes de que el flag existiera.
   */
  const bloqueada = row.obraSocialBloqueada === true || (row.obraSocialConstatadaEn === 'arca' && (!!row.osId || !!row.obraSocialNoFigura));
  const constatada = valores.constatacion !== 'sin_constatar';

  const copiarCuil = async () => {
    try {
      await navigator.clipboard.writeText(formatCuil(row.cuit || ''));
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      sweetAlert.error('No se pudo copiar', 'El navegador bloqueó el portapapeles. Copiá el CUIL a mano.');
    }
  };

  /**
   * Re-constatar: devuelve ESTE contrato a la cola y abre ARCA.
   *
   * No abre un formulario: desfija la obra social —con `forzar`, porque lo sellado en ARCA es
   * inmutable— y el contrato vuelve a contar como pendiente. La próxima corrida del script lo toma
   * como a cualquier otro. Así hay UN solo camino por el que un RNOS entra al sistema, y no dos que
   * puedan divergir.
   */
  const reConstatar = async () => {
    const r = await sweetAlert.confirm(
      '¿Volver a constatar en ARCA?',
      'Se borra lo que había y este contrato vuelve a la lista de pendientes. Copiá su CUIL, corré el script en ARCA y pegá el resultado en «Constatar obras sociales». No se edita a mano.',
      'Sí, re-constatar',
    );
    if (!r.isConfirmed) return;
    setTrabajando(true);
    try {
      const ref = row.contratoId || row.contractIndex;
      await projectsAPI.updateObraSocialContrato(row.projectId, row.userId, ref as never, { obraSocialId: null, origen: 'manual', forzar: true });
      onGuardado({ osId: null, obraSocialOrigen: '', obraSocialConstatadaEn: '', obraSocialConstatadaEl: '', obraSocialNoFigura: false, obraSocialBloqueada: false });
      await copiarCuil();
      window.open(LOGIN_AFIP_URL, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      sweetAlert.error('No se pudo', e?.response?.data?.error || 'No se pudo desfijar la obra social.');
    } finally {
      setTrabajando(false);
    }
  };

  // La leyenda dice de dónde viene el número, que es lo único que cambia entre un contrato y otro.
  // El candado es el que salió de ARCA; la flecha, el que se hereda del convenio.
  const leyenda =
    valores.constatacion === 'afiliada'
      ? `constatada en ARCA${fechaConstatada ? ` ${fechaConstatada}` : ''}`
      : valores.constatacion === 'no_figura'
        ? `sin registro en ARCA${fechaConstatada ? ` ${fechaConstatada}` : ''} · rige el convenio`
        : etiquetaOrigen || 'sin constatar';

  return (
    <div className={`rounded-lg border overflow-hidden ${abierto ? 'border-blue-300 dark:border-blue-800' : 'border-gray-200 dark:border-gray-700'}`}>
      {/* UNA línea, como cualquier otro campo del modal. Lo que antes ocupaba media pantalla —CUIL,
          pasos, radios— se hace ahora en la pantalla de lote, para toda la tanda de una vez. */}
      <button type="button" onClick={() => setAbierto((v) => !v)} className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
        <FontAwesomeIcon
          icon={bloqueada ? faLock : constatada ? faTurnDown : faCircleQuestion}
          className={`h-3 w-3 shrink-0 ${constatada ? 'text-gray-400' : 'text-amber-500'}`}
          title={bloqueada ? 'La devolvió ARCA: queda fija' : constatada ? 'Heredada del convenio' : 'Sin constatar en ARCA'}
        />
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 shrink-0">Obra social</span>
        <InfoCampo campo="rnos" />
        {valores.rnos ? (
          <>
            <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400 shrink-0" title={`RNOS ${formatRnos(valores.rnos)}`}>
              {String(valores.rnos || '').replace(/\D/g, '')}
            </span>
            <span className="text-xs text-gray-800 dark:text-gray-100 min-w-0 truncate">{valores.nombreObraSocial || '—'}</span>
          </>
        ) : (
          <span className="text-xs text-amber-700 dark:text-amber-400 min-w-0">Sin resolver — sin ella el contrato no entra en el TXT</span>
        )}
        <span className={`text-[11px] shrink-0 ml-auto flex items-center gap-1.5 ${constatada ? 'text-gray-500 dark:text-gray-400' : 'text-amber-700 dark:text-amber-400'}`}>
          {leyenda}
          <FontAwesomeIcon icon={abierto ? faChevronDown : faChevronRight} className="h-2.5 w-2.5" />
        </span>
      </button>

      {abierto && (
        <div className="border-t border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/20 px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 shrink-0">CUIL</span>
            <span className="font-mono text-sm font-bold text-gray-800 dark:text-gray-100">{row.cuit ? formatCuil(row.cuit) : '— sin CUIL cargado'}</span>
            {!!row.cuit && (
              <button
                type="button"
                onClick={copiarCuil}
                title="Copiar para pegarlo en Registrar Nuevas Altas"
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <FontAwesomeIcon icon={copiado ? faCheck : faCopy} className="h-3 w-3" />
                {copiado ? 'Copiado' : 'Copiar'}
              </button>
            )}
            {constatada && (
              <button
                type="button"
                disabled={trabajando}
                onClick={reConstatar}
                title="Vuelve a la lista de pendientes y abre ARCA. El valor sale del script, no se edita a mano."
                className="ml-auto inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold text-blue-700 dark:text-blue-400 hover:bg-blue-100/60 dark:hover:bg-blue-900/30 disabled:opacity-50"
              >
                {trabajando ? <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" /> : <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2.5 w-2.5" />}
                Re-constatar
              </button>
            )}
          </div>

          {/* Dónde se resuelve. Que la acción NO esté acá hay que decirlo, o la pantalla se lee como
              incompleta: el operador buscaría el buscador que ya no está. */}
          <p className="text-[11px] text-gray-600 dark:text-gray-400">
            {constatada ? (
              bloqueada ? (
                <>Este valor lo devolvió ARCA y por eso queda fijo. Para cambiarlo, re-constatalo.</>
              ) : (
                <>Rige la obra social del convenio. Se confirma con el resto de la tanda.</>
              )
            ) : (
              <>
                Se constata en <strong>Constatar obras sociales</strong>, con toda la tanda de la empleadora de una vez: no hace falta resolverla contrato por contrato.
              </>
            )}
          </p>

          {/* Avisos de obra social del checklist: viven acá y no en la lista de abajo, que mostraba lo
              mismo dos veces. */}
          {avisos
            .filter((a) => a.key !== 'rnosSinConstatar')
            .map((a) => (
              <p key={a.key} className="text-[11px] text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5 mt-0.5 shrink-0" />
                <span className="min-w-0">{a.detalle || a.label}</span>
              </p>
            ))}
        </div>
      )}
    </div>
  );
};
