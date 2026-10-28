import React, { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar, faSearch, faXmark, faEraser } from '@fortawesome/free-solid-svg-icons';
import { SeccionEmpleador } from './EmpresaContextLayout';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { HerenciaGlobal } from '../arca/HerenciaGlobal';
import { useGuardarEmpresa } from './useGuardarEmpresa';
import { SimpleCatalogApi, SimpleCatalogItem } from '../../api/simpleCatalog';
import { CAMPO_IDS_DE_VINCULO } from '../../api/companies';
import { Company } from '../../api/companies';
import { sweetAlert } from '../../utils/sweetAlert';

/**
 * EL VALOR POR DEFECTO DE UNA EMPLEADORA, MARCADO SOBRE EL NOMENCLADOR.
 *
 * Reemplaza a la pantalla «Defaults de ARCA», que juntaba tres códigos en un formulario con combos.
 * Ese formulario tenía dos problemas y los dos venían de estar lejos del dato:
 *
 *   · Se elegía sin el contexto del nomenclador —sin ver los códigos, ni los repetidos, ni de qué
 *     grupo era cada uno—. En Tipos de Servicio hay 49 nombres duplicados entre los dos grupos: dos
 *     opciones idénticas en el combo que escriben números distintos en las posiciones 107-109.
 *   · Editaba con un `<select>` campos que en otras pantallas se marcan con ★. Dos gestos para la
 *     misma decisión, y en el caso del grupo llegaron a ser dos editores del MISMO campo, donde el
 *     último en guardar pisaba al otro sin decir nada.
 *
 * Acá se marca sobre la lista real, con el mismo click que ya usan Convenios y Domicilios: se guarda
 * al instante, sin «Guardar cambios». Y arriba se dice qué tiene marcado la instalación, para que
 * pisarla sea una decisión y no un accidente.
 */

interface Props {
  empresa: Company;
  recargar: () => Promise<void>;
  /** La clave de `Company.defaultsArca` que marca esta pantalla. */
  campo: 'tipoServicio' | 'modalidadContratacion' | 'modalidadLiquidacion' | 'puestoDesempenado' | 'situacionRevista';
  /** El nomenclador del que se elige. */
  api: SimpleCatalogApi;
  /** Cómo se nombra lo que se marca, para los tooltips ("el tipo de servicio"). */
  queEs: string;
  /** Dónde cae en el archivo de altas. Es el dato que justifica que esto exista. */
  nota: string;
  /**
   * Acota la lista al grupo que la empleadora tiene marcado (solo Tipos de Servicio).
   *
   * El grupo no viaja al TXT: filtra qué tipos se ofrecen, igual que en Simplificación Registral.
   * Sin filtrar son 293 opciones con 49 nombres repetidos.
   */
  filtrarPorGrupoDeLaEmpresa?: boolean;
  /** La frase del mapa de ámbitos: por qué esta tabla no se declara por empresa. */
  ambito: string;
  /**
   * Muestra el nomenclador entero con un switch «Habilitada» por fila, para elegir DESDE LA FICHA
   * cuáles ofrece esta empleadora en los selectores. Sin esto la lista sale ya recortada y el
   * recorte se cambia sólo desde Configuración → ARCA, columna «Habilitadas para».
   */
  editarHabilitados?: boolean;
  /** Columnas propias del nomenclador, entre «Nombre» y «Habilitada». */
  columnasExtra?: Array<{ label: string; render: (item: SimpleCatalogItem) => React.ReactNode }>;
}

/**
 * QUITAR EL DEFAULT DE ESTA EMPLEADORA, sin ir a buscar la fila que lo tiene.
 *
 * El gemelo de `LimpiarDefaultArca`, para el escalón de empresa: el gesto es el mismo, pero cada uno
 * escribe en su propio lado —aquel en el documento de la instalación, éste en la ficha—, así que la
 * acción la pasa la pantalla. Sin valor marcado no se dibuja: limpiar lo vacío no tiene efecto que
 * mostrar, y estando siempre visible haría dudar de si quedó algo puesto.
 */
export const LimpiarDefaultEmpresa: React.FC<{ hayValor: boolean; onLimpiar: () => void; queEs: string; disabled?: boolean }> = ({ hayValor, onLimpiar, queEs, disabled }) => {
  if (!hayValor) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onLimpiar();
      }}
      disabled={disabled}
      title={`Quitar ${queEs} por defecto de esta empleadora. Vuelve a regir el de la instalación.`}
      className="inline-flex items-center gap-1 text-[10px] font-semibold normal-case tracking-normal text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
    >
      <FontAwesomeIcon icon={faEraser} className="h-2.5 w-2.5" />
      Limpiar
    </button>
  );
};

/** El grupo con el que quedó clasificado un tipo en el nomenclador. Vacío = todavía sin clasificar. */
const grupoDelItem = (t: SimpleCatalogItem): string => String((t as { grupo?: unknown }).grupo ?? '');

export const DefaultArcaEmpresa: React.FC<Props> = ({ empresa, recargar, campo, api, queEs, nota, filtrarPorGrupoDeLaEmpresa, ambito, editarHabilitados, columnasExtra = [] }) => {
  const { guardar, guardando } = useGuardarEmpresa(empresa, recargar);
  const [items, setItems] = useState<SimpleCatalogItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState('');
  const [soloDelGrupo, setSoloDelGrupo] = useState(true);

  useEffect(() => {
    api
      .list()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setCargando(false));
  }, [api]);

  const marcado = String(empresa.defaultsArca?.[campo] || '');
  const grupoEmpresa = String(empresa.defaultsArca?.grupoTipoServicio || '');
  const acotaPorGrupo = !!filtrarPorGrupoDeLaEmpresa && !!grupoEmpresa;

  /**
   * Los que ESTA empleadora usa. Lista vacía = TODOS, no ninguno.
   *
   * Esa asimetría es lo que hace que la vinculación se pueda agregar sin romper nada: ninguna empresa
   * existente tiene códigos asignados, y leer el vacío como «ninguno» las dejaría a todas sin
   * opciones de un día para el otro. Además es el default sano: recortar es la excepción, y una
   * empleadora que nunca tocó el filtro quiere ver el nomenclador entero.
   */
  // Puesto y situación de revista no tienen vínculo por empresa: se ofrece el nomenclador entero.
  const campoVinculo = campo in CAMPO_IDS_DE_VINCULO ? CAMPO_IDS_DE_VINCULO[campo as keyof typeof CAMPO_IDS_DE_VINCULO] : undefined;
  const asignados = ((campoVinculo ? (empresa[campoVinculo] as string[] | undefined) : undefined) || []).map(String);
  const delaEmpresa = useMemo(() => (asignados.length === 0 ? items : items.filter((i) => asignados.includes(i._id))), [items, asignados.join(',')]);
  // Con el switch a la vista se lista el nomenclador entero: lo deshabilitado tiene que poder volver a prenderse.
  const editaHabilitados = !!editarHabilitados && !!campoVinculo;
  const listados = editaHabilitados ? items : delaEmpresa;
  const habilitado = (i: SimpleCatalogItem) => asignados.length === 0 || asignados.includes(i._id);

  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return listados.filter((i) => {
      if (acotaPorGrupo && soloDelGrupo && grupoDelItem(i) !== grupoEmpresa) return false;
      if (!texto) return true;
      return `${i.externalId || ''} ${i.name || ''}`.toLowerCase().includes(texto);
    });
  }, [listados, q, acotaPorGrupo, soloDelGrupo, grupoEmpresa]);

  const nombreDe = (codigo: string): string => {
    const i = items.find((x) => String(x.externalId || '') === codigo);
    return i ? `${i.externalId} — ${i.name}` : '';
  };

  /**
   * Marca o desmarca. Volver a clickear el marcado lo SACA: es la única forma de dejar a esta
   * empleadora sin default propio y que vuelva a heredar el de la instalación.
   */
  const marcar = (codigo: string) => {
    const nuevo = marcado === codigo ? '' : codigo;
    guardar(
      { defaultsArca: { [campo]: nuevo } } as Partial<Company>,
      nuevo ? `${nombreDe(nuevo)} es ahora ${queEs} por defecto de ${empresa.razonSocial}.` : `${empresa.razonSocial} vuelve a heredar ${queEs} de la instalación.`,
    );
  };

  /**
   * Prende o apaga un ítem para esta empleadora.
   *
   * La lista vacía significa TODOS, así que: apagar uno con la lista vacía guarda todos menos ése;
   * prender el último que faltaba vuelve a guardar vacío; y no se puede apagar el último que queda,
   * porque la lista quedaría vacía y volvería a ofrecer todos.
   *
   * Si el que se apaga es el marcado por defecto, el default se limpia en el mismo guardado: si no,
   * la empleadora heredaría un valor que su propio filtro ya no ofrece.
   */
  const alternarHabilitado = (i: SimpleCatalogItem) => {
    if (!campoVinculo) return;
    const actuales = asignados.length === 0 ? items.map((x) => x._id) : asignados;
    const apagar = habilitado(i);
    const nuevos = apagar ? actuales.filter((id) => id !== i._id) : [...new Set([...actuales, i._id])];
    if (nuevos.length === 0) {
      sweetAlert.error('No se puede', `Tiene que quedar al menos una habilitada. Con ninguna, ${empresa.razonSocial} volvería a ofrecer todas.`);
      return;
    }
    const todos = items.every((x) => nuevos.includes(x._id));
    const codigo = String(i.externalId || '');
    const limpiaDefault = apagar && !!codigo && codigo === marcado;
    guardar(
      { [campoVinculo]: todos ? [] : nuevos, ...(limpiaDefault ? { defaultsArca: { [campo]: '' } } : {}) } as Partial<Company>,
      `${nombreDe(codigo) || i.name} ${apagar ? 'ya no se ofrece' : 'se ofrece'} en ${empresa.razonSocial}.${limpiaDefault ? ' Era el valor por defecto: se quitó.' : ''}`,
    );
  };

  const habilitarTodos = () => {
    if (!campoVinculo) return;
    guardar({ [campoVinculo]: [] } as Partial<Company>, `${empresa.razonSocial} vuelve a ofrecer todo el nomenclador.`);
  };

  if (cargando) return <LoadingSpinner message="Cargando el nomenclador..." />;

  return (
    <SeccionEmpleador>
      {/*
        DECIR QUE ESTO NO SE DECLARA ANTE ARCA, en la pantalla donde nace la duda.

        Está en la ficha de una empleadora, al lado de convenios y domicilios que SÍ son un registro
        ante el organismo. Sin esta línea, recortar la lista se lee como declarar un padrón — y no
        recortarla, como un trámite pendiente.

        Mismo tratamiento que la nota gris de /convenios: no es un banner ni un modal.
      */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3 py-2.5">
        <p className="text-xs text-gray-600 dark:text-gray-300">
          <strong className="text-gray-900 dark:text-gray-100">Preferencia de la empresa</strong>, no un registro ante ARCA.
        </p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{ambito}</p>
      </div>

      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{nota}</p>
        <HerenciaGlobal campo={campo} valorEmpresa={marcado} nombreDe={nombreDe} />
        {/*
          Decir que la lista está RECORTADA, y dónde se cambia.

          Sin esto, una lista de cuatro códigos sobre un nomenclador de 293 se lee como un catálogo a
          medio importar, y el próximo paso es ir a cargarlos de nuevo.
        */}
        {asignados.length > 0 && !editaHabilitados && (
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
            Mostrando los {delaEmpresa.length} que esta empleadora usa, de {items.length} del nomenclador. Se eligen desde Configuración → ARCA, en la columna «Empresas».
          </p>
        )}
        {editaHabilitados && (
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
            {asignados.length > 0 ? (
              <>
                Esta empleadora ofrece {delaEmpresa.length} de {items.length} en los selectores.{' '}
                <button type="button" onClick={habilitarTodos} disabled={guardando} className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 underline underline-offset-2 disabled:opacity-50">
                  Habilitar todas
                </button>
              </>
            ) : (
              <>Se ofrecen todas en los selectores. Apagá «Habilitada» en las que esta empleadora no usa.</>
            )}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar por código o nombre...`} className="w-full pl-9 pr-8 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200" />
          {q && (
            <button type="button" onClick={() => setQ('')} title="Limpiar la búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
              <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {/* Solo aparece si hay algo que acotar: un filtro que no filtra nada es una pregunta sin
            respuesta útil, y acá además explicaría mal por qué la lista está entera. */}
        {acotaPorGrupo && (
          <button type="button" onClick={() => setSoloDelGrupo((v) => !v)} className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${soloDelGrupo ? 'bg-blue-50 dark:bg-blue-900/25 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
            {soloDelGrupo ? `Del grupo ${grupoEmpresa} (${visibles.length})` : `Los ${listados.length}`}
          </button>
        )}
      </div>

      {/*
        TABLA CON ENCABEZADOS, y «Por defecto» como última columna a la derecha.

        Era una lista sin títulos con la ★ pegada al principio de cada fila: no decía qué era cada
        cosa —el número suelto podía leerse como un orden y no como el código que viaja al TXT— y
        dejaba el control en el borde opuesto al de todas las demás pantallas.
      */}
      <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap w-px">Código</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nombre</th>
              {columnasExtra.map((c) => (
                <th key={c.label} className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{c.label}</th>
              ))}
              {editaHabilitados && (
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap w-px" title="Si se ofrece en los selectores para los contratos de esta empleadora.">Habilitada</th>
              )}
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap w-px">
                <span className="inline-flex items-center gap-2">
                  Por defecto
                  <LimpiarDefaultEmpresa hayValor={!!marcado} onLimpiar={() => marcar(marcado)} queEs={queEs} disabled={guardando} />
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
            {visibles.length === 0 ? (
              <tr>
                <td colSpan={3 + columnasExtra.length + (editaHabilitados ? 1 : 0)} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  No hay ninguno que coincida.
                </td>
              </tr>
            ) : (
              visibles.map((i) => {
                const codigo = String(i.externalId || '');
                const esDefecto = !!codigo && codigo === marcado;
                const activo = habilitado(i);
                return (
                  <tr key={i._id} className={`hover:bg-gray-50 dark:hover:bg-gray-900/20 ${activo ? '' : 'opacity-60'}`}>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">{codigo || '—'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-800 dark:text-gray-200">{i.name}</td>
                    {columnasExtra.map((c) => (
                      <td key={c.label} className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300">{c.render(i)}</td>
                    ))}
                    {editaHabilitados && (
                      <td className="px-4 py-2.5 text-center">
                        {/* Mismo switch que «Empresas que lo usan»: prender o apagar una relación, no elegir de una lista. */}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={activo}
                          aria-label={`${activo ? 'Deshabilitar' : 'Habilitar'} ${i.name} en ${empresa.razonSocial}`}
                          disabled={guardando}
                          onClick={() => alternarHabilitado(i)}
                          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${activo ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </td>
                    )}
                    <td className="px-4 py-2.5">
                      <button type="button" onClick={() => marcar(codigo)} disabled={guardando || !codigo || !activo} title={!activo ? 'Habilitala primero para poder marcarla por defecto.' : esDefecto ? `Es ${queEs} por defecto. Click para quitarlo.` : `Marcar como ${queEs} por defecto de esta empleadora`} aria-pressed={esDefecto} className={`shrink-0 transition-colors disabled:opacity-50 ${esDefecto ? 'text-amber-500 hover:text-amber-600' : 'text-gray-300 dark:text-gray-600 hover:text-amber-500'}`}>
                        <FontAwesomeIcon icon={faStar} className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </SeccionEmpleador>
  );
};
