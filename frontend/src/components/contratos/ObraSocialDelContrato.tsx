import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faArrowUpRightFromSquare, faSpinner, faCheck, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { ContractOverviewRow } from '../../api/users';
import { createSimpleCatalogApi, SimpleCatalogItem } from '../../api/simpleCatalog';
import { projectsAPI } from '../../api/projects';
import { sweetAlert } from '../../utils/sweetAlert';
import { formatRnos } from '../../utils/rnos';
import { AfipValues } from './afipCompleteness';

/**
 * Constatar y fijar la obra social de UN contrato.
 *
 * Es el único lugar donde el dato se carga. Vive en el contrato porque ARCA declara el RNOS en cada
 * alta (pos. 40-45), no por CUIL: dos contratos de la misma persona en dos empleadoras llevan cada
 * uno el suyo, y el dato caduca solo por desregulación.
 *
 * La fuente es el **Padrón de Beneficiarios de la SSS**, no ARCA: lo actualiza cada obra social con
 * carácter de declaración jurada, la consulta es de solo lectura y no exige estar logueado con el
 * CUIT de la empleadora. Lo que ARCA precompleta en su pantalla de altas viene de relaciones
 * laborales anteriores y puede estar atrasado respecto de una opción de cambio — queda como
 * desempate, y por eso no es la opción que la UI ofrece primero.
 *
 * NO hay forma de automatizarlo: la SSS tiene tres modos de acceso (público, Agentes del Seguro y
 * Hospitales de Gestión Descentralizada) y una productora no es ninguno de los tres, así que tampoco
 * hay vía con credenciales. El acceso público está detrás de un captcha. El paso es manual.
 */

const PADRON_SSS = 'https://www.sssalud.gob.ar/index.php?cat=consultas&page=padron';

const obrasSocialesApi = createSimpleCatalogApi('/obras-sociales');

const sinAcentos = (s: string): string =>
  String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * Buscador sobre las 496 del catálogo, por código o por nombre.
 *
 * Acepta las dos cosas a propósito: no está confirmado si la consulta pública de la SSS devuelve el
 * RNOS de 6 dígitos o solo el nombre del Agente del Seguro, y así sirve para los dos casos.
 */
const BuscadorObraSocial: React.FC<{ catalogo: SimpleCatalogItem[]; onElegir: (os: SimpleCatalogItem) => void }> = ({ catalogo, onElegir }) => {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const resultados = useMemo(() => {
    const term = sinAcentos(q.trim());
    const digitos = q.replace(/\D/g, '');
    if (!term) return catalogo.slice(0, 25);
    return catalogo.filter((o) => (digitos && String(o.externalId || '').includes(digitos)) || sinAcentos(o.name).includes(term)).slice(0, 25);
  }, [catalogo, q]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por RNOS o por nombre…" className="input-field w-full pl-9" />
      </div>
      {resultados.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 px-1 py-2">Sin resultados para «{q}».</p>
      ) : (
        <ul className="max-h-48 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60 bg-white dark:bg-gray-900">
          {resultados.map((o) => (
            <li key={o._id}>
              <button type="button" onClick={() => onElegir(o)} className="w-full text-left px-3 py-2 flex items-baseline gap-3 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">
                <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400 shrink-0">{formatRnos(o.externalId)}</span>
                <span className="text-sm text-gray-800 dark:text-gray-200 min-w-0">{o.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const ObraSocialDelContrato: React.FC<{
  row: ContractOverviewRow;
  valores: AfipValues;
  /** De dónde salió la obra social, ya redactado por el checklist ("del convenio 0634/11"). */
  etiquetaOrigen?: string;
  onGuardado: (patch?: Partial<ContractOverviewRow>) => void;
}> = ({ row, valores, etiquetaOrigen, onGuardado }) => {
  const [abierto, setAbierto] = useState(false);
  const [catalogo, setCatalogo] = useState<SimpleCatalogItem[]>([]);
  const [elegida, setElegida] = useState<SimpleCatalogItem | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto || catalogo.length > 0) return;
    obrasSocialesApi
      .list()
      .then(setCatalogo)
      .catch(() => setCatalogo([]));
  }, [abierto, catalogo.length]);

  const fijada = !!row.osId;
  const constatada = row.obraSocialOrigen === 'constatada';

  const guardar = async (origen: 'constatada' | 'manual', constatadaEn?: 'sss' | 'arca') => {
    if (!elegida) return;
    const osId = Number((elegida.data as { id?: number } | undefined)?.id);
    if (!Number.isFinite(osId)) {
      sweetAlert.error('Obra social inválida', 'Esa obra social no tiene código interno. Revisala en Configuración → ARCA → Obras Sociales.');
      return;
    }
    setGuardando(true);
    try {
      // Se direcciona por el `_id` del contrato cuando está: la posición en el array cambia si alguien
      // borra otro contrato mientras esta pantalla está abierta, y el PATCH escribiría en el equivocado.
      const ref = row.contratoId || row.contractIndex;
      const res = await projectsAPI.updateObraSocialContrato(row.projectId, row.userId, ref as never, { obraSocialId: osId, origen, constatadaEn });
      onGuardado({
        osId: res.obraSocialId,
        obraSocialOrigen: (res.obraSocialOrigen || '') as ContractOverviewRow['obraSocialOrigen'],
        obraSocialConstatadaEn: (res.obraSocialConstatadaEn || '') as ContractOverviewRow['obraSocialConstatadaEn'],
        obraSocialConstatadaEl: res.obraSocialConstatadaEl || '',
      });
      setAbierto(false);
      setElegida(null);
    } catch (e: any) {
      // El server valida que esté entre las registradas por la empleadora: ese error trae la empresa
      // y la acción concreta, así que se muestra tal cual en vez de un genérico.
      sweetAlert.error('No se pudo guardar', e?.response?.data?.error || 'No se pudo guardar la obra social del contrato.');
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async () => {
    const r = await sweetAlert.confirm('¿Quitar la obra social del contrato?', 'Vuelve a resolverse por la cascada: la del convenio de su categoría, o la de excluidos de convenio. Se pierde la constatación.', 'Sí, quitar');
    if (!r.isConfirmed) return;
    setGuardando(true);
    try {
      const ref = row.contratoId || row.contractIndex;
      await projectsAPI.updateObraSocialContrato(row.projectId, row.userId, ref as never, { obraSocialId: null, origen: 'manual' });
      onGuardado({ osId: null, obraSocialOrigen: '', obraSocialConstatadaEn: '', obraSocialConstatadaEl: '' });
      setAbierto(false);
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo quitar la obra social.');
    } finally {
      setGuardando(false);
    }
  };

  /*
   * La sección entera vive acá —cabecera incluida— y no en el detalle que la muestra. El panel de
   * constatación es ancho (instrucciones + buscador + tres botones) y si el detalle armaba la fila y
   * este componente solo aportaba el botón, el panel abría dentro de la columna angosta de la derecha.
   */
  return (
    <div className={`rounded-lg border overflow-hidden ${abierto ? 'border-blue-300 dark:border-blue-800' : 'border-gray-200 dark:border-gray-700'}`}>
      <div className="px-3 py-2.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Obra social del contrato</p>
          {valores.rnos ? (
            <p className="text-sm text-gray-800 dark:text-gray-100 mt-0.5 flex items-baseline gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">{formatRnos(valores.rnos)}</span>
              <span className="min-w-0">{valores.nombreObraSocial || '—'}</span>
            </p>
          ) : (
            <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">Sin resolver — sin ella el contrato no entra en el TXT</p>
          )}
          {etiquetaOrigen && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{etiquetaOrigen}</p>}
        </div>
        <button type="button" onClick={() => setAbierto((v) => !v)} className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
          {abierto ? 'Cerrar' : constatada ? 'Cambiar' : 'Constatar en la SSS'}
        </button>
      </div>

      {abierto && (
        <div className="border-t border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/20 p-3 space-y-3">
          {/* Las instrucciones van EN la pantalla y no en un manual: el paso es manual y quien lo hace
              necesita saber exactamente dónde mirar y qué significa que el CUIL no aparezca. */}
          <div className="text-[11px] text-gray-700 dark:text-gray-300 space-y-1.5">
            <p>
              SSS → Base de Datos → <strong>Padrón de Beneficiarios</strong> → <em>Acceso Público</em> → ingresá el CUIL {row.cuit ? <span className="font-mono">{row.cuit}</span> : ''} y resolvé el captcha.
            </p>
            <a href={PADRON_SSS} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-blue-700 dark:text-blue-400 hover:underline">
              Abrir el padrón de la SSS
              <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2.5 w-2.5" />
            </a>
            <p>Devuelve los datos del beneficiario y el Agente del Seguro en el que está afiliado. Cargá esa obra social acá.</p>
            <p className="text-gray-500 dark:text-gray-400">Si el CUIL no aparece en el padrón, la persona no tiene obra social declarada: se aplica la del convenio y no hace falta cargar nada.</p>
          </div>

          {elegida ? (
            <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 flex items-center gap-3">
              <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">{formatRnos(elegida.externalId)}</span>
              <span className="text-sm text-gray-800 dark:text-gray-200 min-w-0 flex-1 truncate">{elegida.name}</span>
              <button type="button" onClick={() => setElegida(null)} className="text-[11px] text-gray-500 hover:underline shrink-0">
                Cambiar
              </button>
            </div>
          ) : (
            <BuscadorObraSocial catalogo={catalogo} onElegir={setElegida} />
          )}

          {elegida && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={guardando} onClick={() => guardar('constatada', 'sss')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {guardando ? <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" /> : <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />}
                La constaté en la SSS
              </button>
              {/* ARCA como desempate: quien ya está en su pantalla de altas y ve un valor precompletado
                  puede registrarlo, pero queda marcado con su fuente para saber cuánto creerle. */}
              <button type="button" disabled={guardando} onClick={() => guardar('constatada', 'arca')} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                La vi en ARCA
              </button>
              <button type="button" disabled={guardando} onClick={() => guardar('manual')} title="Sin constatar: queda marcada como excepción cargada a mano" className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                Cargar a mano
              </button>
            </div>
          )}

          {fijada && (
            <div className="pt-2 border-t border-blue-200/60 dark:border-blue-800/60 flex items-center gap-2">
              <button type="button" disabled={guardando} onClick={quitar} className="text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline disabled:opacity-50">
                Quitar la obra social de este contrato
              </button>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">— vuelve a resolverse por el convenio</span>
            </div>
          )}

          {!valores.rnos && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
              <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5 mt-0.5 shrink-0" />
              Este contrato no tiene ninguna obra social resuelta: sin ella no entra en el TXT.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
