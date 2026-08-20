import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faSpinner, faCheck, faCopy, faArrowUpRightFromSquare, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { ContractOverviewRow } from '../../api/users';
import { projectsAPI } from '../../api/projects';
import { sweetAlert } from '../../utils/sweetAlert';
import { AfipValues } from './afipCompleteness';
import { InfoCampo } from './DatosArcaDetalle';

/**
 * El campo Obra Social del formulario, con la validación adentro.
 *
 * Antes la obra social estaba DOS VECES en el modal: este campo, que solo decía "Falta", y un panel
 * entero abajo con el CUIL, el instructivo y la acción. Dos representaciones del mismo dato, y la que
 * tenía el valor no era la que tenía el botón. Ahora todo vive acá: el estado, el valor, la nota de
 * qué va a quedar, y el click que lo resuelve.
 *
 * No es un campo que se tipea, como Modalidad: el valor lo pone ARCA. Por eso no abre un picker sino
 * el flujo de validación, y una vez validado queda con candado — el server rechaza sobrescribirlo.
 *
 * El motor es el mismo del lote (`aplicarObrasSocialesLote`): acá se usa con una cola de uno. Un
 * segundo camino "para el caso puntual" es lo que se viene sacando a propósito — dos caminos por los
 * que un RNOS entra al sistema son dos formas de que diverjan.
 */

const LOGIN_AFIP_URL = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

const soloDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const formatCuil = (v: string): string => {
  const d = soloDigitos(v);
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : String(v || '');
};
const fechaCorta = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const CampoObraSocial: React.FC<{
  row: ContractOverviewRow;
  valores: AfipValues;
  onGuardado: (patch?: Partial<ContractOverviewRow>) => void;
}> = ({ row, valores, onGuardado }) => {
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [pegado, setPegado] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  const validada = valores.constatacion !== 'sin_constatar';
  const fecha = fechaCorta(valores.constatadaEl || '');
  const delConvenio = valores.convenioCategoria ? `convenio ${valores.convenioCategoria}` : 'convenio';

  const copiarCuil = async () => {
    try {
      await navigator.clipboard.writeText(formatCuil(row.cuit || ''));
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      sweetAlert.error('No se pudo copiar', 'El navegador bloqueó el portapapeles. Copiá el CUIL a mano.');
    }
  };

  /** Abre el flujo: copia el CUIL y lleva a ARCA, que es lo primero que hay que hacer igual. */
  const empezar = async () => {
    setAbierto(true);
    await copiarCuil();
    window.open(LOGIN_AFIP_URL, '_blank', 'noopener,noreferrer');
  };

  /**
   * Aplica lo que devolvió ARCA para ESTA persona.
   *
   * Acepta el `CUIL,RNOS` completo o solo el código: el operador puede venir del script —que copia
   * el par— o de mirar la pantalla, donde lo único que ve es el número. Exigir un formato cuando ya
   * se sabe de quién se trata sería pedir trabajo por nada.
   */
  const aplicar = async () => {
    const empresaId = String(row.empresaContratoId || '');
    if (!empresaId) return;
    const cuil = soloDigitos(row.cuit);
    // Si vienen dos columnas se toma la segunda; si viene una sola, esa es el RNOS.
    const partes = pegado.split(/[,;\t\s]+/).map(soloDigitos).filter(Boolean);
    const rnos = partes.length > 1 ? partes[partes.length - 1] : partes[0] || '';
    if (rnos && rnos.length !== 6) {
      sweetAlert.error('Código inválido', `«${rnos}» no es un código RNOS de 6 dígitos. Copiá el que muestra ARCA, o dejá el campo vacío si no devolvió ninguna.`);
      return;
    }
    setTrabajando(true);
    try {
      const r = await projectsAPI.aplicarObrasSocialesLote(empresaId, [{ cuil, rnos }], false);
      if (r.aplicados === 0) {
        // El server enumera por qué no entró: sin contrato en esa empleadora, código fuera del
        // catálogo, o una obra social que la empleadora no tiene registrada ante ARCA.
        const motivo = r.noRegistrada.length
          ? `${r.noRegistrada[0].nombre} no está entre las obras sociales que esta empleadora registró ante ARCA: el organismo rechazaría el alta.`
          : r.rnosDesconocido.length
            ? `El código ${r.rnosDesconocido[0].rnos} no está en el catálogo de Obras Sociales.`
            : r.yaBloqueados.length
              ? 'Este contrato ya está validado y queda fijo. Usá Re-validar.'
              : 'No se pudo aplicar.';
        sweetAlert.error('No se aplicó', motivo);
        return;
      }
      setAbierto(false);
      setPegado('');
      onGuardado();
    } catch (e: any) {
      sweetAlert.error('No se pudo', e?.response?.data?.error || 'No se pudo aplicar el resultado.');
    } finally {
      setTrabajando(false);
    }
  };

  /**
   * Borra la validación y devuelve el contrato a "sin validar".
   *
   * Va con `forzar` porque lo sellado en ARCA es inmutable para el server: sin eso contesta 409. Es
   * el único punto que escribe ese borrado, y lo comparten los dos botones de abajo — que se
   * diferencian solo en qué pasa DESPUÉS.
   */
  const desfijar = async (): Promise<boolean> => {
    setTrabajando(true);
    try {
      const ref = row.contratoId || row.contractIndex;
      await projectsAPI.updateObraSocialContrato(row.projectId, row.userId, ref as never, { obraSocialId: null, origen: 'manual', forzar: true });
      onGuardado({ osId: null, obraSocialOrigen: '', obraSocialConstatadaEn: '', obraSocialConstatadaEl: '', obraSocialNoFigura: false, obraSocialBloqueada: false });
      return true;
    } catch (e: any) {
      sweetAlert.error('No se pudo', e?.response?.data?.error || 'No se pudo quitar la obra social.');
      return false;
    } finally {
      setTrabajando(false);
    }
  };

  /** Re-validar: borra y sigue de largo a ARCA, para volver a validar en el momento. */
  const reValidar = async () => {
    const r = await sweetAlert.confirm(
      '¿Volver a validar en ARCA?',
      'Se borra lo que había y este contrato vuelve a quedar sin obra social hasta que ARCA devuelva una nueva.',
      'Sí, re-validar',
    );
    if (!r.isConfirmed) return;
    if (await desfijar()) await empezar();
  };

  /**
   * Quitar: borra y se queda ahí.
   *
   * Existe aparte de Re-validar porque hay un caso en que no se quiere ir a ARCA: el dato quedó mal y
   * primero hay que arreglar otra cosa —elegir la empleadora, por ejemplo—. Sin esto, la única forma
   * de sacar una obra social sellada era arrancar una consulta que todavía no se puede completar.
   */
  const quitar = async () => {
    const r = await sweetAlert.confirm(
      '¿Quitar la obra social?',
      'Este contrato vuelve a quedar SIN VALIDAR y no va a entrar en el TXT hasta que se valide de nuevo en ARCA. No se pierde nada más: el valor sale del organismo, no se carga a mano.',
      'Sí, quitar',
    );
    if (r.isConfirmed) await desfijar();
  };

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[12px] text-gray-600 dark:text-gray-400 flex items-center gap-1.5 min-w-0">
          <span className="truncate">Obra Social</span>
          <InfoCampo campo="rnos" />
        </span>
        <span className="shrink-0 text-[9.5px] px-1.5 py-px rounded border tracking-wide bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800/70">40–45</span>
      </div>

      {/* Sin validar NO va en el ámbar de "Falta": no es un dato que alguien olvidó tipear, es un
          trámite que todavía no se hizo. El borde neutro y el botón dicen eso. */}
      <div className={`rounded-md border px-2.5 py-1.5 flex items-center justify-between gap-2 ${validada ? 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/40' : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40'}`}>
        <span className="min-w-0 flex items-baseline gap-2">
          {validada ? (
            <>
              <FontAwesomeIcon icon={faLock} className="h-2.5 w-2.5 text-gray-400 self-center shrink-0" />
              <span className="font-mono text-[12.5px] text-gray-900 dark:text-gray-100 shrink-0">{soloDigitos(valores.rnos)}</span>
              <span className="text-[12px] text-gray-500 dark:text-gray-400 truncate">{valores.nombreObraSocial}</span>
            </>
          ) : (
            <span className="text-[12.5px] text-gray-400 dark:text-gray-500">— sin validar</span>
          )}
        </span>
        {!validada && !!row.empresaContratoId && (
          <button type="button" onClick={empezar} className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30">
            Validar
            <FontAwesomeIcon icon={faChevronRight} className="h-2.5 w-2.5" />
          </button>
        )}
      </div>

      {/* La nota de referencia SOLO antes de validar: después el valor ya está puesto y repetirla
          sobra. Dice qué va a pasar; no es el valor. */}
      {!validada ? (
        <p className="text-[10.5px] text-gray-500 dark:text-gray-500 mt-1 px-0.5 leading-snug">
          {!row.empresaContratoId ? (
            <>elegí la empleadora para poder validarla</>
          ) : valores.rnosSugerido ? (
            <>
              por defecto iría <span className="font-mono">{soloDigitos(valores.rnosSugerido)}</span> · {valores.nombreObraSocialSugerida} ({delConvenio})
            </>
          ) : (
            <>sin validar el contrato no entra en el TXT</>
          )}
        </p>
      ) : (
        <p className="text-[10.5px] text-gray-500 dark:text-gray-500 mt-1 px-0.5 leading-snug flex items-center gap-1.5 flex-wrap">
          <span>
            {row.obraSocialNoFigura ? <>validada · ARCA sin afiliación → del {delConvenio}</> : <>validada en ARCA</>}
            {fecha ? ` · ${fecha}` : ''}
          </span>
          <button type="button" disabled={trabajando} onClick={reValidar} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50">
            Re-validar
          </button>
          <span aria-hidden>·</span>
          <button type="button" disabled={trabajando} onClick={quitar} title="Borra la validación y deja el campo sin validar, sin ir a ARCA" className="font-semibold text-red-600 dark:text-red-400 hover:underline disabled:opacity-50">
            Quitar
          </button>
        </p>
      )}

      {/* El flujo de validar: aparece al pedirlo, no como sección permanente. */}
      {abierto && !validada && (
        <div className="mt-1.5 rounded-md border border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/20 px-2.5 py-2 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[12px] font-bold text-gray-800 dark:text-gray-100">{formatCuil(row.cuit || '')}</span>
            <button type="button" onClick={copiarCuil} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-800">
              <FontAwesomeIcon icon={copiado ? faCheck : faCopy} className="h-2.5 w-2.5" />
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
            <a href={LOGIN_AFIP_URL} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[10.5px] font-semibold text-blue-700 dark:text-blue-400 hover:underline">
              Abrir ARCA
              <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2 w-2" />
            </a>
          </div>
          <p className="text-[10.5px] text-gray-600 dark:text-gray-400">Relaciones Laborales → Registrar Nuevas Altas: pegá el CUIL y copiá acá el código que precompleta. Si no devuelve ninguna, dejalo vacío.</p>
          <div className="flex items-center gap-2">
            <input value={pegado} onChange={(e) => setPegado(e.target.value)} placeholder="código, o vacío si no devolvió" className="input-field flex-1 text-[12px] font-mono py-1" />
            <button type="button" disabled={trabajando} onClick={aplicar} className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {trabajando ? <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" /> : <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />}
              Aplicar
            </button>
            <button type="button" onClick={() => setAbierto(false)} className="shrink-0 text-[10.5px] text-gray-500 hover:underline">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
