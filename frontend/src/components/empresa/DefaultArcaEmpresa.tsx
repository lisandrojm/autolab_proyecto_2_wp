import React, { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar, faSearch, faXmark, faEraser, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import { SeccionEmpleador } from './EmpresaContextLayout';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { HerenciaGlobal } from '../arca/HerenciaGlobal';
import { useGuardarEmpresa } from './useGuardarEmpresa';
import { SimpleCatalogApi, SimpleCatalogItem } from '../../api/simpleCatalog';
import { CAMPO_IDS_DE_VINCULO } from '../../api/companies';
import { Company } from '../../api/companies';
import { sweetAlert } from '../../utils/sweetAlert';
import { Modal } from '../ui/Modal';

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
   * La tabla muestra SÓLO los que esta empleadora agregó, con «Agregar» para sumar del nomenclador y
   * una acción para quitar. Es la lista que ofrecen los selectores de sus contratos. Sin esto la
   * lista sale del recorte que se hace en Configuración → ARCA, columna «Habilitadas para».
   */
  agregarDesdeLaFicha?: boolean;
  /** Columnas propias del nomenclador, entre «Nombre» y «Por defecto». */
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

export const DefaultArcaEmpresa: React.FC<Props> = ({ empresa, recargar, campo, api, queEs, nota, filtrarPorGrupoDeLaEmpresa, ambito, agregarDesdeLaFicha, columnasExtra = [] }) => {
  const { guardar, guardando } = useGuardarEmpresa(empresa, recargar);
  const [items, setItems] = useState<SimpleCatalogItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState('');
  const [soloDelGrupo, setSoloDelGrupo] = useState(true);
  const [agregando, setAgregando] = useState(false);

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
  /*
    Agregando desde la ficha, la tabla es la lista de la empleadora tal cual está: vacía es vacía. Lo
    que sigue valiendo es que los selectores, con la lista vacía, ofrecen todo el nomenclador; por
    eso el estado vacío lo dice.
  */
  const agrega = !!agregarDesdeLaFicha && !!campoVinculo;
  const listados = agrega ? items.filter((i) => asignados.includes(i._id)) : delaEmpresa;

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

  /** Suma al final de la lista de la empleadora. Se guarda en un solo request. */
  const agregar = async (ids: string[]) => {
    if (!campoVinculo || ids.length === 0) return false;
    const nuevos = [...new Set([...asignados, ...ids])];
    return guardar({ [campoVinculo]: nuevos } as Partial<Company>, `Se ${ids.length === 1 ? 'agregó' : `agregaron ${ids.length}`} a ${empresa.razonSocial}.`);
  };

  /**
   * Saca uno de la lista. Si era el marcado por defecto, el default se limpia en el mismo guardado:
   * si no, la empleadora heredaría un valor que su propia lista ya no ofrece. Quitar el último deja
   * la lista vacía, y vacía los selectores vuelven a ofrecer todo: se avisa antes.
   */
  const quitar = async (i: SimpleCatalogItem) => {
    if (!campoVinculo) return;
    const nuevos = asignados.filter((id) => id !== i._id);
    const codigo = String(i.externalId || '');
    const limpiaDefault = !!codigo && codigo === marcado;
    const avisos = [
      limpiaDefault && `Es ${queEs} por defecto: se quita también.`,
      nuevos.length === 0 && `Es la última: sin ninguna agregada, los selectores de ${empresa.razonSocial} vuelven a ofrecer todo el nomenclador.`,
    ].filter(Boolean);
    const r = await sweetAlert.confirm(`¿Quitar ${nombreDe(codigo) || i.name}?`, avisos.length ? avisos.join(' ') : `Deja de ofrecerse en los selectores de ${empresa.razonSocial}.`, 'Sí, quitar');
    if (!r.isConfirmed) return;
    guardar(
      { [campoVinculo]: nuevos, ...(limpiaDefault ? { defaultsArca: { [campo]: '' } } : {}) } as Partial<Company>,
      `${nombreDe(codigo) || i.name} ya no se ofrece en ${empresa.razonSocial}.${limpiaDefault ? ' Era el valor por defecto: se quitó.' : ''}`,
    );
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
        {asignados.length > 0 && !agrega && (
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
            Mostrando los {delaEmpresa.length} que esta empleadora usa, de {items.length} del nomenclador. Se eligen desde Configuración → ARCA, en la columna «Empresas».
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
        {agrega && (
          <button type="button" onClick={() => setAgregando(true)} disabled={guardando || listados.length >= items.length} className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold btn-primary disabled:opacity-50">
            <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
            Agregar
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
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap w-px">
                <span className="inline-flex items-center gap-2">
                  Por defecto
                  <LimpiarDefaultEmpresa hayValor={!!marcado} onLimpiar={() => marcar(marcado)} queEs={queEs} disabled={guardando} />
                </span>
              </th>
              {agrega && <th className="px-4 py-3 w-px" aria-label="Acciones" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
            {visibles.length === 0 ? (
              <tr>
                <td colSpan={3 + columnasExtra.length + (agrega ? 1 : 0)} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  {agrega && listados.length === 0 ? `Esta empleadora todavía no agregó ninguna. Mientras tanto, sus selectores ofrecen todo el nomenclador (${items.length}).` : 'No hay ninguno que coincida.'}
                </td>
              </tr>
            ) : (
              visibles.map((i) => {
                const codigo = String(i.externalId || '');
                const esDefecto = !!codigo && codigo === marcado;
                return (
                  <tr key={i._id} className="hover:bg-gray-50 dark:hover:bg-gray-900/20">
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">{codigo || '—'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-800 dark:text-gray-200">{i.name}</td>
                    {columnasExtra.map((c) => (
                      <td key={c.label} className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300">{c.render(i)}</td>
                    ))}
                    <td className="px-4 py-2.5">
                      <button type="button" onClick={() => marcar(codigo)} disabled={guardando || !codigo} title={esDefecto ? `Es ${queEs} por defecto. Click para quitarlo.` : `Marcar como ${queEs} por defecto de esta empleadora`} aria-pressed={esDefecto} className={`shrink-0 transition-colors disabled:opacity-50 ${esDefecto ? 'text-amber-500 hover:text-amber-600' : 'text-gray-300 dark:text-gray-600 hover:text-amber-500'}`}>
                        <FontAwesomeIcon icon={faStar} className="h-3.5 w-3.5" />
                      </button>
                    </td>
                    {agrega && (
                      <td className="px-4 py-2.5 text-right">
                        <button type="button" onClick={() => quitar(i)} disabled={guardando} title={`Quitar de ${empresa.razonSocial}`} aria-label={`Quitar ${i.name} de ${empresa.razonSocial}`} className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50">
                          <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {agregando && (
        <AgregarDelNomenclador
          disponibles={items.filter((i) => !asignados.includes(i._id))}
          columnasExtra={columnasExtra}
          razonSocial={empresa.razonSocial}
          guardando={guardando}
          onCerrar={() => setAgregando(false)}
          onAgregar={async (ids) => {
            if (await agregar(ids)) setAgregando(false);
          }}
        />
      )}
    </SeccionEmpleador>
  );
};

/** El modal de «Agregar»: los del nomenclador que la empleadora todavía no tiene, con buscador y tildes. */
const AgregarDelNomenclador: React.FC<{
  disponibles: SimpleCatalogItem[];
  columnasExtra: NonNullable<Props['columnasExtra']>;
  razonSocial: string;
  guardando: boolean;
  onCerrar: () => void;
  onAgregar: (ids: string[]) => void;
}> = ({ disponibles, columnasExtra, razonSocial, guardando, onCerrar, onAgregar }) => {
  const [q, setQ] = useState('');
  const [elegidos, setElegidos] = useState<string[]>([]);
  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return texto ? disponibles.filter((i) => `${i.externalId || ''} ${i.name || ''}`.toLowerCase().includes(texto)) : disponibles;
  }, [disponibles, q]);
  const alternar = (id: string) => setElegidos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <Modal
      isOpen
      onClose={onCerrar}
      title="Agregar"
      subtitle={razonSocial}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <button type="button" onClick={onCerrar} disabled={guardando} className="btn-secondary">
            Cancelar
          </button>
          <button type="button" onClick={() => onAgregar(elegidos)} disabled={guardando || elegidos.length === 0} className="btn-primary disabled:opacity-50">
            {guardando ? 'Guardando…' : elegidos.length > 1 ? `Agregar ${elegidos.length}` : 'Agregar'}
          </button>
        </div>
      }
    >
      <div className="space-y-2">
        <div className="relative">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código o nombre..." className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200" />
        </div>
        <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60">
          {visibles.length === 0 ? (
            <p className="px-3 py-4 text-xs text-gray-400 italic">{disponibles.length === 0 ? 'Ya están todas agregadas.' : 'No hay ninguna que coincida.'}</p>
          ) : (
            visibles.map((i) => (
              <label key={i._id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/30">
                <input type="checkbox" checked={elegidos.includes(i._id)} onChange={() => alternar(i._id)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">{String(i.externalId || '—')}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-gray-800 dark:text-gray-200">{i.name}</span>
                  {columnasExtra.map((c) => (
                    <span key={c.label} className="block text-[11px] text-gray-500 dark:text-gray-400">
                      {c.label}: {c.render(i)}
                    </span>
                  ))}
                </span>
              </label>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
};
