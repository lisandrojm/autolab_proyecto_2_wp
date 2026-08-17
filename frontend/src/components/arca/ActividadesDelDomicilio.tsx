import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faPlus, faSearch, faTriangleExclamation, faPenToSquare, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { createSimpleCatalogApi, SimpleCatalogItem } from '../../api/simpleCatalog';
import { sweetAlert } from '../../utils/sweetAlert';

/**
 * Las actividades declaradas para UN domicilio de explotación.
 *
 * Se eligen del catálogo, no se tipean. El caso que lo motivó está en los datos: Tronador 671 tiene
 * "SERVICIOS CONEXOS A LA PRODUCCIÓN DE ESPECTÁCULOS…" con acentos y sin acentos, en dos filas, porque
 * las dos veces se escribió a mano. Con el catálogo el código sale con sus 6 dígitos y la descripción
 * es la del nomenclador, siempre igual.
 *
 * LO QUE ESTO NO ES: la lista de lo que un contrato puede declarar. El contrato elige entre las
 * actividades DE SU DOMICILIO —las de esta lista— y nada más. El catálogo entero (2.350) solo aparece
 * acá, al declarar. Si algún día un selector de contrato ofrece el catálogo, eso es el bug.
 *
 * Se guarda desnormalizado (`{ codigo, descripcion }`) a propósito: el import del padrón trae códigos,
 * no ids, y así el domicilio se sigue leyendo aunque el catálogo cambie.
 */

const actividadesApi = createSimpleCatalogApi('/arca/actividades');

export interface ActividadDomicilio {
  codigo: string;
  /** Opcional igual que en el modelo: el padrón a veces trae el código sin texto. */
  descripcion?: string;
}

/** Código a 6 dígitos con ceros a la izquierda: es lo que espera el TXT (pos. 79-84). */
const pad6 = (v: string): string => {
  const d = v.replace(/\D/g, '');
  return d ? d.padStart(6, '0').slice(-6) : '';
};

/**
 * El nomenclador mezcla "PRODUCCIÓN" y "PRODUCCION": la búsqueda ignora los acentos para encontrar las
 * dos. Se usa `\p{Diacritic}` y no el rango de combinantes escrito a mano, porque ese rango son
 * caracteres invisibles en el código y cualquier editor que "arregle" el encoding lo rompe en silencio.
 */
const sinAcentos = (s: string): string => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * Buscador del catálogo, por código o por descripción.
 *
 * Es un combo de búsqueda y no un `<select>`: con 2.350 opciones un select nativo es inusable, y con
 * el catálogo vacío un select no tendría nada que ofrecer y no habría forma de entender por qué.
 */
const BuscadorActividad: React.FC<{
  catalogo: SimpleCatalogItem[];
  cargando: boolean;
  yaElegidas: string[];
  onElegir: (a: ActividadDomicilio) => void;
  onCancelar: () => void;
}> = ({ catalogo, cargando, yaElegidas, onElegir, onCancelar }) => {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const resultados = useMemo(() => {
    const term = sinAcentos(q.trim());
    const soloDigitos = q.replace(/\D/g, '');
    const disponibles = catalogo.filter((a) => !yaElegidas.includes(pad6(String(a.externalId || ''))));
    if (!term) return disponibles.slice(0, 30);
    return disponibles.filter((a) => (soloDigitos && String(a.externalId || '').includes(soloDigitos)) || sinAcentos(a.name || '').includes(term)).slice(0, 30);
  }, [catalogo, q, yaElegidas]);

  return (
    <div className="rounded-lg border border-blue-300 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/20 p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código o descripción…" className="input-field w-full pl-9" />
        </div>
        <button type="button" onClick={onCancelar} title="Cancelar" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0 px-1">
          <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
        </button>
      </div>

      {cargando ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 px-1 py-2">
          <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5 h-3 w-3" />
          Cargando el catálogo…
        </p>
      ) : catalogo.length === 0 ? (
        // El catálogo vacío no es un error: se llena solo con el primer import del padrón, o de una
        // vez importando el nomenclador. Decirlo acá evita que parezca que la pantalla está rota.
        <p className="text-xs text-amber-700 dark:text-amber-400 px-1 py-2">El catálogo de Actividades está vacío. Se llena solo al importar el padrón en esta misma pantalla, o de una vez desde Configuración → ARCA → Actividades.</p>
      ) : resultados.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 px-1 py-2">Sin resultados para «{q}».</p>
      ) : (
        <ul className="max-h-52 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60 bg-white dark:bg-gray-900">
          {resultados.map((a) => {
            const codigo = pad6(String(a.externalId || ''));
            return (
              <li key={a._id}>
                <button type="button" onClick={() => onElegir({ codigo, descripcion: a.name })} className="w-full text-left px-3 py-2 flex items-baseline gap-3 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">
                  <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400 shrink-0">{codigo}</span>
                  <span className="text-sm text-gray-800 dark:text-gray-200 min-w-0">{a.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export const ActividadesDelDomicilio: React.FC<{
  actividades: ActividadDomicilio[];
  onChange: (as: ActividadDomicilio[]) => void;
  /** Se dispara al dar de alta una actividad en el catálogo, para refrescar quien lo tenga cargado. */
  onCatalogoCambiado?: () => void;
}> = ({ actividades, onChange, onCatalogoCambiado }) => {
  const [catalogo, setCatalogo] = useState<SimpleCatalogItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [dandoDeAlta, setDandoDeAlta] = useState<string | null>(null);

  const cargarCatalogo = () =>
    actividadesApi
      .list()
      .then(setCatalogo)
      .catch(() => setCatalogo([]))
      .finally(() => setCargando(false));

  useEffect(() => {
    cargarCatalogo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const porCodigo = useMemo(() => new Map(catalogo.map((a) => [pad6(String(a.externalId || '')), a.name])), [catalogo]);

  const quitar = (i: number) => onChange(actividades.filter((_, j) => j !== i));

  /**
   * Sube al catálogo una actividad que estaba solo en el domicilio.
   *
   * Es el camino de vuelta para lo cargado antes de que el catálogo existiera: el dato del padrón es
   * el bueno, así que en vez de pedirle al operador que lo vuelva a buscar, se promueve el que ya
   * tiene. Después queda disponible para el resto de los domicilios.
   */
  const darDeAltaEnCatalogo = async (a: ActividadDomicilio) => {
    setDandoDeAlta(a.codigo);
    try {
      await actividadesApi.create({ nombre: (a.descripcion || a.codigo).trim(), externalId: a.codigo });
      await cargarCatalogo();
      onCatalogoCambiado?.();
      sweetAlert.success('Agregada al catálogo', `${a.codigo} — ${a.descripcion || 'sin descripción'} ya está disponible para los demás domicilios.`);
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo agregar la actividad al catálogo.');
    } finally {
      setDandoDeAlta(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Actividades del domicilio ({actividades.length})</label>
        {!buscando && (
          <button type="button" onClick={() => setBuscando(true)} className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
            <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
            Agregar actividad
          </button>
        )}
      </div>

      {buscando && (
        <div className="mb-2">
          <BuscadorActividad
            catalogo={catalogo}
            cargando={cargando}
            yaElegidas={actividades.map((a) => pad6(a.codigo))}
            onCancelar={() => setBuscando(false)}
            onElegir={(a) => {
              onChange([...actividades, a]);
              setBuscando(false);
            }}
          />
        </div>
      )}

      {actividades.length === 0 && !buscando ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic ml-1">Sin actividades cargadas. Los contratos de esta sucursal no van a poder generar el alta.</p>
      ) : (
        <div className="space-y-1.5">
          {actividades.map((a, i) => {
            const codigo = pad6(a.codigo);
            const delCatalogo = porCodigo.get(codigo);
            // Solo se marca cuando el catálogo pudo cargarse: si está vacío porque no respondió, todas
            // las filas dirían "no está en el catálogo" y sería una alarma falsa.
            const desconocida = !cargando && catalogo.length > 0 && !delCatalogo;
            return (
              <div key={`${codigo}-${i}`} className={`rounded-lg border px-3 py-2 ${desconocida ? 'border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40'}`}>
                <div className="flex items-start gap-3">
                  <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400 shrink-0 mt-0.5">{codigo || '—'}</span>
                  {/* La descripción es de solo lectura: viene del catálogo y es lo que garantiza que la
                      misma actividad se escriba igual en todos los domicilios. */}
                  <span className="text-sm text-gray-800 dark:text-gray-200 min-w-0 flex-1">{delCatalogo || a.descripcion || <span className="italic text-gray-400">sin descripción</span>}</span>
                  <button type="button" onClick={() => quitar(i)} title="Quitar la actividad de este domicilio" className="text-gray-400 hover:text-red-500 transition-colors shrink-0">
                    <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
                  </button>
                </div>

                {desconocida && (
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap pl-[3.75rem]">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                      <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5" />
                      No está en el catálogo
                    </span>
                    <button type="button" disabled={dandoDeAlta === codigo} onClick={() => darDeAltaEnCatalogo({ codigo, descripcion: a.descripcion })} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50">
                      {dandoDeAlta === codigo ? <FontAwesomeIcon icon={faSpinner} spin className="h-2.5 w-2.5" /> : <FontAwesomeIcon icon={faPenToSquare} className="h-2.5 w-2.5" />}
                      Darla de alta con esta descripción
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {actividades.length > 1 && <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 ml-1">Con más de una actividad, cada contrato de esta sucursal tiene que elegir cuál declara.</p>}
    </div>
  );
};
