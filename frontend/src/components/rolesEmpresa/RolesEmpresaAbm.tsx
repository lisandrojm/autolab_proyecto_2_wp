import React, { useEffect, useState, useMemo } from 'react';
import { roleFrameAPI, RoleFrameItem, CategoriaAsociada, CoberturaFuncion } from '../../api/roleFrames';
import { createSimpleCatalogApi, SimpleCatalogItem } from '../../api/simpleCatalog';
import { categoriaSatAPI, CategoriaSatItem, esElegible } from '../../api/categoriasSat';
import { Card } from '../ui/Card';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { SearchAndFilters } from '../ui/SearchAndFilters';
import { faUserShield, faLayerGroup, faTable, faGrip, faEdit, faTrash, faSearch, faTimes, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Modal } from '../ui/Modal';
import { sweetAlert } from '../../utils/sweetAlert';

const valoracionesApi = createSimpleCatalogApi('/valoraciones');

/**
 * Badge de categoría: código de ARCA + nombre, con el convenio del que cuelga.
 *
 * `onQuitar` lo convierte en removible, para el formulario. El mismo badge que usan las tarjetas del
 * listado: es la misma cosa mostrada en dos lados, y dos versiones terminan divergiendo.
 */
const CategoriaSatBadge: React.FC<{ label: string; convenio?: string; valoracion?: { name: string; color?: string }; onQuitar?: () => void }> = ({ label, convenio, valoracion, onQuitar }) => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
    <FontAwesomeIcon icon={faLayerGroup} className="h-2.5 w-2.5" />
    {convenio && <span className="font-mono opacity-70">{convenio}</span>}
    {label}
    {/* El nivel, pegado a la categoría: es lo que decide si esta categoría se ofrece o no en un
        proyecto, así que leerlo aparte obligaría a cruzar dos listas de memoria. */}
    {valoracion && (
      <span
        className="ml-0.5 px-1 rounded-sm font-bold border"
        style={valoracion.color ? { color: valoracion.color, borderColor: valoracion.color, backgroundColor: `${valoracion.color}1a` } : undefined}
        title={`Valoración: ${valoracion.name}`}
      >
        {valoracion.name}
      </span>
    )}
    {onQuitar && (
      <button type="button" onClick={onQuitar} title={`Quitar ${label}`} aria-label={`Quitar ${label}`} className="ml-0.5 rounded hover:bg-blue-200 dark:hover:bg-blue-800/60 p-0.5">
        <FontAwesomeIcon icon={faTimes} className="h-2.5 w-2.5" />
      </button>
    )}
  </span>
);

/**
 * Aviso de función que mezcla convenios.
 *
 * Una función FRAME mapea a categorías: si esas categorías son de CCT distintos, el contrato puede
 * terminar con una que la empleadora no tiene habilitada, y ARCA rechaza el alta. No es un detalle de
 * catálogo — el convenio no viaja en el TXT, ARCA lo infiere del código de categoría, así que el
 * error no se ve hasta que el organismo devuelve el archivo.
 */
const AvisoConveniosMezclados: React.FC<{ convenios: string[] }> = ({ convenios }) => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 border border-red-200 dark:border-red-800" title={`Esta función apunta a categorías de ${convenios.join(' y ')}. Una empleadora tiene que tener habilitado el convenio de la categoría que se elija: si no lo tiene, ARCA rechaza el alta.`}>
    <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5" />
    {convenios.length} convenios
  </span>
);

/**
 * Aviso de función que no cubre todas las valoraciones.
 *
 * Mismo formato que `AvisoConveniosMezclados` —recuento afuera, detalle en el `title`— porque es la
 * misma clase de problema: algo que recién se va a notar al armar un contrato, cuando el selector de
 * categoría no ofrezca nada para ese proyecto. Verlo acá es poder arreglarlo antes de que haya
 * alguien esperando el alta.
 *
 * En ámbar y no en rojo: una función sin cubrir no genera un rechazo de ARCA como los convenios
 * mezclados. Es un hueco comercial, no un dato inválido.
 */
const AvisoValoracionesFaltantes: React.FC<{ cubre: string[]; faltan: string[] }> = ({ cubre, faltan }) => (
  <span
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
    title={`Esta función cubre ${cubre.length > 0 ? cubre.join(' y ') : 'ninguna valoración'}. Le falta${faltan.length === 1 ? '' : 'n'} ${faltan.join(' y ')}: un proyecto de ese nivel no va a encontrar ninguna categoría para ofrecer.`}
  >
    <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5" />
    {cubre.length} de {cubre.length + faltan.length} valoraciones
  </span>
);

/**
 * Lo único que el ABM expone hacia afuera: abrir el formulario de alta.
 *
 * El botón `+` vive en el encabezado de la página, al lado del ícono de info —como en el resto de las
 * pantallas—, pero el estado del formulario vive acá adentro. En vez de subir media docena de `useState`
 * a la página solo para dibujar un botón, la página toma una ref y dispara esta acción.
 */
export interface RolesEmpresaAbmHandle {
  abrirNuevo: () => void;
}

export const RolesEmpresaAbm = React.forwardRef<RolesEmpresaAbmHandle>((_props, ref) => {
  const [roles, setRoles] = useState<RoleFrameItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<RoleFrameItem | null>(null);
  const [allCategories, setAllCategories] = useState<CategoriaSatItem[]>([]);

  // CRUD Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleFrameItem | null>(null);
  const [formName, setFormName] = useState('');
  /*
    LAS CATEGORÍAS ELEGIDAS, CON SU VALORACIÓN.

    Era `string[]` y pasó a esto porque la valoración es una propiedad de la ASOCIACIÓN función ↔
    categoría, no de la categoría: el mismo código de ARCA puede ser Oro acá y Plata en otra función.
    `valoracionId: null` es «sin valorar», un estado válido — hasta que se cargue, el filtro de
    contratación no se aplica y todo sigue funcionando como antes.
  */
  const [selectedCategorias, setSelectedCategorias] = useState<CategoriaAsociada[]>([]);
  const idsElegidos = useMemo(() => new Set(selectedCategorias.map((c) => c.categoryId)), [selectedCategorias]);
  const valoracionDe = (categoryId: string) => selectedCategorias.find((c) => c.categoryId === categoryId)?.valoracionId || '';
  const ponerValoracion = (categoryId: string, valoracionId: string) =>
    setSelectedCategorias((prev) => prev.map((c) => (c.categoryId === categoryId ? { ...c, valoracionId: valoracionId || null } : c)));

  /** Las valoraciones del tenant, para los selects. Sólo las activas: son para contratos nuevos. */
  const [valoraciones, setValoraciones] = useState<SimpleCatalogItem[]>([]);
  const valoracionPorId = useMemo(() => new Map(valoraciones.map((v) => [v._id, v])), [valoraciones]);
  /** Cobertura por función, para el aviso del listado. */
  const [cobertura, setCobertura] = useState<Map<string, CoberturaFuncion>>(new Map());
  const [catSearch, setCatSearch] = useState('');

  // View Mode Logic
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const [isLarge, setIsLarge] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => {
      const isNowLarge = window.innerWidth >= 1024;
      setIsLarge(isNowLarge);
      if (!isNowLarge) {
        setViewMode('cards');
      }
    };

    if (window.innerWidth >= 1024) {
      const saved = localStorage.getItem('rolesFrameViewMode');
      if (saved === 'table' || saved === 'cards') {
        setViewMode(saved as 'table' | 'cards');
      }
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isLarge) {
      localStorage.setItem('rolesFrameViewMode', viewMode);
    }
  }, [viewMode, isLarge]);

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const data = await roleFrameAPI.list();
      setRoles(data);
    } catch (error) {
      console.error('Error fetching role frames:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await categoriaSatAPI.list();
      setAllCategories(data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  /*
    Valoraciones y cobertura, cada una con su catch.

    Si no llegan, el ABM tiene que seguir funcionando exactamente como antes: sin valoraciones el
    select no se dibuja y `selectedCategorias` guarda `valoracionId: null`, que es «sin valorar» y
    el estado con el que convive todo lo ya cargado. Tirar la pantalla abajo por un catálogo nuevo
    sería frenar la contratación por una función que todavía nadie usa.
  */
  const fetchValoraciones = async () => {
    try {
      setValoraciones(await valoracionesApi.list({ activo: 'true' }));
    } catch (error) {
      console.error('Error fetching valoraciones:', error);
      setValoraciones([]);
    }
  };

  const fetchCobertura = async () => {
    try {
      setCobertura(new Map((await roleFrameAPI.cobertura()).map((c) => [c._id, c])));
    } catch (error) {
      console.error('Error fetching cobertura:', error);
      setCobertura(new Map());
    }
  };

  useEffect(() => {
    fetchRoles();
    fetchCategories();
    fetchValoraciones();
    fetchCobertura();
  }, []);

  const filteredRoles = useMemo(() => {
    if (!searchTerm) return roles;
    const lowerSearch = searchTerm.toLowerCase();
    return roles.filter((r) => r.name.toLowerCase().includes(lowerSearch) || r.externalId.toLowerCase().includes(lowerSearch));
  }, [roles, searchTerm]);

  /** Índice del catálogo por el id numérico legacy, para resolver convenio y código de cada asociada. */
  const catalogoPorId = useMemo(() => new Map(allCategories.map((c) => [String(c.data?.id), c])), [allCategories]);

  /**
   * Las categorías asociadas a una función, resueltas contra el catálogo vigente.
   *
   * La copia denormalizada que guarda la función no tiene el convenio, y el número que sí tiene
   * (`numeroCategoria`) es el del GRUPO salarial — lo compartían decenas de categorías distintas, así
   * que como etiqueta no identificaba nada. Lo que identifica es el código de ARCA de 6 dígitos.
   */
  const categoriasDe = (role: RoleFrameItem): Array<{ key: string; label: string; convenio: string }> =>
    (role.data?.categoriasSat || []).map((c: any, i: number) => {
      const vigente = catalogoPorId.get(String(c.id));
      const codigo = String(vigente?.data?.codigoArca || '').trim();
      const nombre = vigente?.data?.nombre || vigente?.name || c.nombre || c.name || 'Sin nombre';
      return { key: `${c.id ?? i}`, label: codigo ? `${codigo} · ${nombre}` : nombre, convenio: String(vigente?.data?.convenio || '').trim() };
    });

  /** Los CCT distintos a los que apunta la función. Más de uno es el problema que hay que ver. */
  const conveniosDe = (role: RoleFrameItem): string[] => [...new Set(categoriasDe(role).map((c) => c.convenio || 'sin convenio'))];

  const openCreate = () => {
    setEditingRole(null);
    setFormName('');
    setSelectedCategorias([]);
    setCatSearch('');
    setShowModal(true);
  };

  React.useImperativeHandle(ref, () => ({ abrirNuevo: openCreate }));

  const openEdit = (role: RoleFrameItem) => {
    setEditingRole(role);
    setFormName(role.name);

    // Resolve associated category _ids from the loaded list. Se matchea por `id` (el id numérico
    // propio de cada categoría, `data.id`), NO por `numeroCategoria`: varias categorías con
    // nombres distintos comparten el mismo número (es una escala salarial, no un identificador),
    // así que matchear por número tildaba TODAS las que tuvieran ese número en vez de solo la
    // elegida.
    const categoriasGuardadas = role.data?.categoriasSat || [];
    const associatedIds = categoriasGuardadas.map((c: any) => c.id).filter((id: any) => id !== undefined && id !== null);
    const associatedNames = categoriasGuardadas.map((c: any) => c.nombre || c.name).filter(Boolean);

    /* La valoración viene en la MISMA entrada de `categoriasSat` que la categoría, así que se
       resuelve por `data.id` (el legacy) y no por el `_id` del catálogo, que ahí no está. */
    const valoracionPorLegacyId = new Map<number, string | null>(
      ((selectedRole?.data?.categoriasSat as any[]) || role.data?.categoriasSat || []).map((c: any) => [Number(c?.id), c?.valoracionId ? String(c.valoracionId) : null]),
    );
    const asociadas: CategoriaAsociada[] = allCategories
      .filter((cat) => {
        if (associatedIds.length > 0) return cat.data?.id !== undefined && associatedIds.includes(cat.data.id);
        // Fallback para roles guardados antes de que `categoriasSat` tuviera `id` (legado).
        const catName = cat.data?.nombre || cat.name;
        return associatedNames.includes(catName);
      })
      .map((cat) => ({ categoryId: cat._id, valoracionId: valoracionPorLegacyId.get(Number(cat.data?.id)) ?? null }));

    setSelectedCategorias(asociadas);
    setCatSearch('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      sweetAlert.error('Error', 'El nombre es obligatorio');
      return;
    }
    try {
      const payload = {
        name: formName.trim(),
        categorias: selectedCategorias,
      };

      if (editingRole) {
        await roleFrameAPI.update(editingRole._id, payload);
        sweetAlert.success('Función actualizada', 'La función se ha modificado correctamente');
      } else {
        await roleFrameAPI.create(payload);
        sweetAlert.success('Función creada', 'La función se ha creado correctamente');
      }
      setShowModal(false);
      fetchRoles();
      // La cobertura cambia con lo que se acaba de guardar: sin esto el aviso del listado seguiría
      // mostrando el hueco que la persona acaba de tapar.
      fetchCobertura();
    } catch (error: any) {
      const message = error.response?.data?.error || 'Error al guardar la función';
      sweetAlert.error('Error', message);
    }
  };

  const handleDelete = async (role: RoleFrameItem) => {
    const result = await sweetAlert.confirm('¿Eliminar función?', `¿Estás seguro de que quieres eliminar la función "${role.name}"?`);
    if (result.isConfirmed) {
      try {
        await roleFrameAPI.remove(role._id);
        sweetAlert.success('Función eliminada', 'La función ha sido eliminada correctamente');
        fetchRoles();
      } catch (error: any) {
        const message = error.response?.data?.error || 'Error al eliminar la función';
        sweetAlert.error('Error', message);
      }
    }
  };

  /**
   * Las categorías que se pueden asociar, AGRUPADAS POR CONVENIO.
   *
   * Antes era una lista corrida de 109 ítems etiquetados "Cat. N - nombre", donde N era el grupo
   * salarial: nada indicaba de qué CCT era cada una, y así se armaron funciones que mezclan
   * convenios. Con el convenio como encabezado, elegir dos de CCT distintos deja de ser algo que se
   * pueda hacer sin darse cuenta.
   */
  const gruposParaSelect = useMemo(() => {
    // Solo las elegibles: los alias existen para que resuelvan contratos históricos, no para
    // asociarlos a una función nueva (ver `esElegible`). Las ya asociadas se resuelven aparte, en
    // `openEdit`, que busca sobre `allCategories` sin filtrar.
    const q = catSearch.trim().toLowerCase();
    const elegibles = allCategories.filter(esElegible).filter((cat) => {
      if (!q) return true;
      const nombre = (cat.data?.nombre || cat.name || '').toLowerCase();
      return nombre.includes(q) || String(cat.data?.codigoArca || '').includes(q) || String(cat.data?.convenio || '').toLowerCase().includes(q);
    });

    const porConvenio = new Map<string, CategoriaSatItem[]>();
    for (const cat of elegibles) {
      const cct = String(cat.data?.convenio || '').trim() || 'Sin convenio';
      if (!porConvenio.has(cct)) porConvenio.set(cct, []);
      porConvenio.get(cct)!.push(cat);
    }
    return [...porConvenio.entries()]
      // "Sin convenio" al final: no es un convenio más, es un dato roto.
      .sort((a, b) => (a[0] === 'Sin convenio' ? 1 : b[0] === 'Sin convenio' ? -1 : a[0].localeCompare(b[0])))
      .map(([convenio, cats]) => ({ convenio, cats: cats.sort((x, y) => String(x.data?.codigoArca || '').localeCompare(String(y.data?.codigoArca || ''))) }));
  }, [allCategories, catSearch]);

  const totalParaSelect = useMemo(() => gruposParaSelect.reduce((acc, g) => acc + g.cats.length, 0), [gruposParaSelect]);

  /**
   * Las categorías elegidas, para los badges de arriba del buscador.
   *
   * Se resuelven contra `allCategories` —el catálogo COMPLETO— y no contra `gruposParaSelect`, que
   * está filtrado por el buscador: si no, escribir cualquier cosa haría desaparecer los badges de
   * categorías que siguen tildadas, y con la lista scrolleada no habría forma de ver qué hay puesto.
   *
   * Incluye las que ya no son elegibles (alias viejos que quedaron asociados): esconderlas dejaría
   * un recuento «(4)» sobre tres badges.
   */
  const categoriasElegidas = useMemo(() => {
    const porId = new Map(allCategories.map((c) => [c._id, c]));
    return selectedCategorias
      .map((sel) => ({ sel, cat: porId.get(sel.categoryId) }))
      .filter((x) => !!x.cat)
      .map(({ sel, cat }) => {
        const c = cat as CategoriaSatItem;
        const codigo = String(c.data?.codigoArca || '').trim();
        const nombre = c.data?.nombre || c.name || 'Sin nombre';
        const v = sel.valoracionId ? valoracionPorId.get(sel.valoracionId) : undefined;
        return {
          id: c._id,
          label: codigo ? `${codigo} · ${nombre}` : nombre,
          convenio: String(c.data?.convenio || '').trim(),
          valoracion: v ? { name: String(v.name), color: String(v.color || '') } : undefined,
        };
      });
  }, [allCategories, selectedCategorias, valoracionPorId]);

  /** Los CCT de lo que está tildado ahora mismo: avisa antes de guardar, no después. */
  const conveniosSeleccionados = useMemo(() => {
    const porMongoId = new Map(allCategories.map((c) => [c._id, String(c.data?.convenio || '').trim() || 'sin convenio']));
    return [...new Set(selectedCategorias.map((c) => porMongoId.get(c.categoryId)).filter(Boolean) as string[])];
  }, [allCategories, selectedCategorias]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
        <div className="flex-1 w-full">
          <SearchAndFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} searchPlaceholder="Buscar por nombre o ID externo..." />
        </div>
        {/* El `+` se mudó al encabezado de la página, al lado del info del título. */}
        <div className="flex items-center gap-2 shrink-0">
          {isLarge && (
            <div className="flex items-center gap-2">
              <button onClick={() => setViewMode('cards')} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === 'cards' ? 'bg-blue-500 text-white shadow-sm border-blue-500' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} title="Vista de tarjetas">
                <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
              </button>
              <button onClick={() => setViewMode('table')} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === 'table' ? 'bg-blue-500 text-white shadow-sm border-blue-500' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} title="Vista de tabla">
                <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <LoadingSpinner message="Cargando funciones..." />
      ) : filteredRoles.length === 0 ? (
        <div className="text-center py-12">
          <FontAwesomeIcon icon={faUserShield} className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No se encontraron funciones</h3>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {filteredRoles.map((role) => (
            <Card
              key={role._id}
              onClick={() => setSelectedRole(role)}
              className="hover:scale-[1.03] hover:shadow-lg transition-all duration-200 cursor-pointer"
              header={{
                title: role.name,
                icon: faUserShield,
              }}
              footer={{
                leftContent: (
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500">
                    <FontAwesomeIcon icon={faLayerGroup} />
                    <span>{role.data?.categoriasSat?.length || 0} Categorías</span>
                  </div>
                ),
                actions: [
                  {
                    icon: faEdit,
                    title: 'Editar',
                    variant: 'default',
                    onClick: (e) => {
                      e.stopPropagation();
                      openEdit(role);
                    },
                  },
                  {
                    icon: faTrash,
                    title: 'Eliminar',
                    variant: 'default',
                    onClick: (e) => {
                      e.stopPropagation();
                      handleDelete(role);
                    },
                  },
                ],
              }}
            >
              <div className="flex flex-wrap gap-1.5">
                {categoriasDe(role).length === 0 ? (
                  <span className="text-xs text-gray-400">Sin categorías</span>
                ) : (
                  <>
                    {conveniosDe(role).length > 1 && <AvisoConveniosMezclados convenios={conveniosDe(role)} />}
                    {(() => {
                      const c = cobertura.get(role._id);
                      return c && c.totalValoraciones > 0 && c.faltan.length > 0 ? <AvisoValoracionesFaltantes cubre={c.cubre.map((v) => v.name)} faltan={c.faltan.map((v) => v.name)} /> : null;
                    })()}
                    {categoriasDe(role).map((c) => (
                      <CategoriaSatBadge key={c.key} label={c.label} convenio={c.convenio} />
                    ))}
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="mt-6 overflow-hidden border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nombre</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID Externo</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Categorías</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {filteredRoles.map((role) => (
                  <tr key={role._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group cursor-pointer" onClick={() => setSelectedRole(role)}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center shrink-0">
                          <FontAwesomeIcon icon={faUserShield} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{role.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-900 px-2 py-0.5 rounded">{role.externalId}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5 max-w-md">
                        {categoriasDe(role).length === 0 ? (
                          <span className="text-sm text-gray-400">Ninguna</span>
                        ) : (
                          <>
                            {conveniosDe(role).length > 1 && <AvisoConveniosMezclados convenios={conveniosDe(role)} />}
                    {(() => {
                      const c = cobertura.get(role._id);
                      return c && c.totalValoraciones > 0 && c.faltan.length > 0 ? <AvisoValoracionesFaltantes cubre={c.cubre.map((v) => v.name)} faltan={c.faltan.map((v) => v.name)} /> : null;
                    })()}
                            {categoriasDe(role).map((c) => (
                              <CategoriaSatBadge key={c.key} label={c.label} convenio={c.convenio} />
                            ))}
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(role)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors" title="Editar">
                          <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDelete(role)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors" title="Eliminar">
                          <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedRole && (
        <Modal isOpen={!!selectedRole} onClose={() => setSelectedRole(null)} title={selectedRole.name} subtitle="Información detallada de la función" size="lg">
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nombre</label>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{selectedRole.name}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">ID Externo</label>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{selectedRole.externalId}</p>
              </div>
            </div>

            {selectedRole.data?.categoriasSat?.length > 0 && (
              <div>
                <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <FontAwesomeIcon icon={faLayerGroup} className="text-primary-500" />
                  Categorías Asociadas
                </h4>
                <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Convenio</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Cód. ARCA</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Nombre</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Valoración</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Bruto</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Neto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {/* Se resuelve contra el catálogo vigente: la copia guardada en la función no
                          tiene el convenio y su escala puede ser de una paritaria anterior. */}
                      {selectedRole.data.categoriasSat.map((cat: any, i: number) => {
                        const vigente = catalogoPorId.get(String(cat.id));
                        const convenio = String(vigente?.data?.convenio || '').trim();
                        return (
                          <tr key={cat.id ?? i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                            <td className="px-4 py-2 text-xs font-mono text-gray-600 dark:text-gray-400">{convenio || <span className="text-red-600 dark:text-red-400 font-sans font-semibold">sin convenio</span>}</td>
                            <td className="px-4 py-2 text-xs font-mono text-gray-600 dark:text-gray-400">{vigente?.data?.codigoArca || <span className="text-red-600 dark:text-red-400 font-sans font-semibold">sin código</span>}</td>
                            <td className="px-4 py-2 text-xs text-gray-700 dark:text-gray-300 font-medium">{vigente?.data?.nombre || vigente?.name || cat.nombre}</td>
                            {/* Entre el nombre y la plata a propósito: es lo que explica POR QUÉ esa
                                categoría cuesta lo que cuesta, y leerlo después del importe llega tarde. */}
                            <td className="px-4 py-2 text-xs">
                              {(() => {
                                const v = cat.valoracionId ? valoracionPorId.get(String(cat.valoracionId)) : undefined;
                                if (!v) return <span className="text-gray-400 dark:text-gray-600">sin valorar</span>;
                                const color = String(v.color || '');
                                return (
                                  <span className="px-1.5 py-0.5 rounded font-semibold border text-[11px]" style={color ? { color, borderColor: color, backgroundColor: `${color}1a` } : undefined}>
                                    {String(v.name)}
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="px-4 py-2 text-xs text-right text-gray-700 dark:text-gray-300 font-mono">${(vigente?.data?.sueldoBruto ?? cat.sueldoBruto)?.toLocaleString()}</td>
                            <td className="px-4 py-2 text-xs text-right text-gray-700 dark:text-gray-300 font-mono">${(vigente?.data?.neto ?? cat.neto)?.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {showModal && (
        <Modal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title={editingRole ? 'Editar Rol Empresa' : 'Nuevo Rol Empresa'}
          subtitle={editingRole ? 'Modifica los datos de la función' : 'Agrega una nueva función y asocia categorías'}
          size="lg"
          footer={
            <div className="flex items-center justify-end gap-3 w-full">
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const form = document.querySelector<HTMLFormElement>('#role-frame-form');
                  form?.requestSubmit();
                }}
                className="btn-primary"
              >
                {editingRole ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          }
        >
          <form id="role-frame-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre de la Función *</label>
              <input type="text" required value={formName} onChange={(e) => setFormName(e.target.value)} className="input-field w-full px-3 py-2 border rounded bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100" placeholder="Ej: Motion Graphic" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Categorías * {selectedCategorias.length > 0 ? <span className="font-normal text-gray-500 dark:text-gray-400">({selectedCategorias.length})</span> : null}
                </label>
                <button
                  type="button"
                  onClick={() => setSelectedCategorias([])}
                  disabled={selectedCategorias.length === 0}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                >
                  Limpiar
                </button>
              </div>
              {/* Lo elegido va ARRIBA del buscador: adentro lo haría crecer de alto y se leería como
                  texto ya escrito en el campo. Mismo criterio que Rol/es Empresa y Sindicatos. */}
              {categoriasElegidas.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {categoriasElegidas.map((c) => (
                    <CategoriaSatBadge key={c.id} label={c.label} convenio={c.convenio} valoracion={c.valoracion} onQuitar={() => setSelectedCategorias(selectedCategorias.filter((x) => x.categoryId !== c.id))} />
                  ))}
                </div>
              )}
              <div className="relative mb-2">
                <input type="text" value={catSearch} onChange={(e) => setCatSearch(e.target.value)} className="input-field w-full pl-9 pr-8 py-2 border rounded bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100" placeholder="Buscar por nombre, código ARCA o convenio..." />
                <div className="absolute inset-y-0 left-3 pl-3 flex items-center pointer-events-none text-gray-400">
                  <FontAwesomeIcon icon={faSearch} className="h-4 w-4" />
                </div>
                {catSearch && (
                  <button type="button" onClick={() => setCatSearch('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    <FontAwesomeIcon icon={faTimes} className="h-4 w-4" />
                  </button>
                )}
              </div>

              {conveniosSeleccionados.length > 1 && (
                <div className="mb-2 flex items-start gap-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-2.5">
                  <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Estás mezclando categorías de <strong>{conveniosSeleccionados.join(' y ')}</strong>. Una empleadora solo puede dar de alta categorías de los convenios que tiene habilitados: si se elige la del convenio equivocado, ARCA rechaza el alta y el error no se ve hasta que devuelve el archivo.
                  </span>
                </div>
              )}

              {/*
                `pt-0` y fondo OPACO, las dos cosas por el encabezado sticky de adentro:

                - Con `p-3`, esos 12px de padding scrollean por encima del sticky —que se pega al
                  borde del área de contenido— y dejaban una franja donde las filas pasaban sin que
                  nada las tapara. El aire de arriba lo pone ahora el propio encabezado.
                - `dark:bg-gray-900/50` es medio transparente. Un encabezado sticky con ese fondo deja
                  ver el contenido pasando por debajo, que es justo lo que un sticky viene a evitar.
              */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 pb-3 pt-0 max-h-60 overflow-y-auto space-y-3 bg-gray-50 dark:bg-gray-900">
                {totalParaSelect === 0 ? (
                  <p className="text-sm text-gray-500 italic p-2">No se encontraron categorías</p>
                ) : (
                  gruposParaSelect.map((grupo) => (
                    <div key={grupo.convenio}>
                      {/* El convenio como encabezado: es el nivel del que cuelga la categoría, no una etiqueta más. */}
                      <div className="sticky top-0 z-10 flex items-center gap-2 px-1.5 pt-3 pb-1 mb-1 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                        <span className="font-mono text-[11px] font-bold text-blue-700 dark:text-blue-400">{grupo.convenio}</span>
                        <span className="text-[10px] text-gray-400">{grupo.cats.length} categoría(s)</span>
                      </div>
                      {grupo.cats.map((cat) => {
                        const isChecked = idsElegidos.has(cat._id);
                        return (
                          <div key={cat._id} className="flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 p-1.5 rounded transition-colors">
                            <label className="flex flex-1 min-w-0 items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (isChecked) {
                                    setSelectedCategorias(selectedCategorias.filter((x) => x.categoryId !== cat._id));
                                  } else {
                                    setSelectedCategorias([...selectedCategorias, { categoryId: cat._id, valoracionId: null }]);
                                  }
                                }}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                                <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{cat.data?.codigoArca || '——————'}</span> · {cat.data?.nombre || cat.name}
                              </span>
                            </label>
                            {/*
                              El select SÓLO cuando la categoría está tildada: sin tildar no hay
                              asociación que valorar, y un control activo sobre algo que no está
                              elegido promete una decisión que no se guarda en ningún lado.
                            */}
                            {isChecked && valoraciones.length > 0 && (
                              <select
                                value={valoracionDe(cat._id)}
                                onChange={(e) => ponerValoracion(cat._id, e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                title={`Valoración de ${cat.data?.nombre || cat.name} en esta función`}
                                className="shrink-0 text-[11px] rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 px-1.5 py-0.5"
                              >
                                <option value="">Sin valorar</option>
                                {valoraciones.map((v) => (
                                  <option key={v._id} value={v._id}>
                                    {String(v.name)}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
});

RolesEmpresaAbm.displayName = 'RolesEmpresaAbm';

export default RolesEmpresaAbm;
