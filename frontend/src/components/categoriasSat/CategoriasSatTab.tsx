import React, { useState, useEffect } from 'react';
import { fuzzyMatch } from '../../utils/searchHelpers';
import { categoriaSatAPI, CategoriaSatItem } from '../../api/categoriasSat';
import { SearchAndFilters } from '../ui/SearchAndFilters';
import { EmptyState } from '../ui/EmptyState';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { Card } from '../ui/Card';
import { InfoModal } from '../ui/InfoModal';
import { ViewToggle, ViewMode } from '../ui/ViewToggle';
import { sweetAlert } from '../../utils/sweetAlert';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faListCheck, faChevronUp, faChevronDown, faDownload, faUpload, faFileExcel, faTimes, faPlus, faEdit, faTrash, faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import { useAuthStore } from '../../stores/authStore';

type SortField = 'numeroCategoria' | 'nombre' | 'sueldoBruto' | 'neto' | 'codigoAfip' | 'presentismo' | 'sueldoBasico' | 'sueldoAdicional' | 'fechaActualizacion';
type SortDir = 'asc' | 'desc';

const formatCurrency = (value: number | undefined | null): string => {
  if (value === undefined || value === null) return '—';
  return value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });
};

const formatDate = (value: string | Date | undefined | null): string => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('es-AR');
  } catch {
    return String(value);
  }
};

export const CategoriasSatTab: React.FC = () => {
  const [categorias, setCategorias] = useState<CategoriaSatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('numeroCategoria');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Vista (Tabla vs Tarjetas)
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [isLarge, setIsLarge] = useState(window.innerWidth >= 1024);
  useEffect(() => {
    const handleResize = () => {
      const isNowLarge = window.innerWidth >= 1024;
      setIsLarge(isNowLarge);
      if (!isNowLarge) setViewMode('cards');
    };
    if (window.innerWidth >= 1024) {
      const saved = localStorage.getItem('categoriasSatViewMode');
      if (saved === 'table' || saved === 'cards') setViewMode(saved as ViewMode);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  useEffect(() => {
    if (isLarge) localStorage.setItem('categoriasSatViewMode', viewMode);
  }, [viewMode, isLarge]);
  const effectiveViewMode: ViewMode = isLarge ? viewMode : 'cards';

  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('config_holidays:view');

  // ABM Modal
  const [showModal, setShowModal] = useState(false);
  const [editingCategoria, setEditingCategoria] = useState<CategoriaSatItem | null>(null);
  const [formData, setFormData] = useState({
    numeroCategoria: '',
    nombre: '',
    sueldoBasico: '',
    sueldoAdicional: '',
    sueldoBruto: '',
    sueldoBrutoLetras: '',
    presentismo: '',
    neto: '',
    sueldoNetoLetras: '',
    codigoAfip: '',
    fechaActualizacion: '',
  });

  // Bulk Import Modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  // Global Update Modal State
  const [showGlobalModal, setShowGlobalModal] = useState(false);
  const [selectedGlobalCat, setSelectedGlobalCat] = useState<number | ''>('');
  const [globalFormData, setGlobalFormData] = useState({
    sueldoBasico: '',
    sueldoAdicional: '',
    sueldoBruto: '',
    sueldoBrutoLetras: '',
    presentismo: '',
    neto: '',
    sueldoNetoLetras: '',
    fechaActualizacion: '',
  });

  const handleGlobalCategorySelect = (catNumVal: string) => {
    if (!catNumVal) {
      setSelectedGlobalCat('');
      setGlobalFormData({
        sueldoBasico: '',
        sueldoAdicional: '',
        sueldoBruto: '',
        sueldoBrutoLetras: '',
        presentismo: '',
        neto: '',
        sueldoNetoLetras: '',
        fechaActualizacion: new Date().toISOString().split('T')[0],
      });
      return;
    }

    const num = Number(catNumVal);
    setSelectedGlobalCat(num);

    const match = categorias.find((c) => c.data?.numeroCategoria === num);
    if (match) {
      setGlobalFormData({
        sueldoBasico: String(match.data?.sueldoBasico ?? ''),
        sueldoAdicional: String(match.data?.sueldoAdicional ?? ''),
        sueldoBruto: String(match.data?.sueldoBruto ?? ''),
        sueldoBrutoLetras: match.data?.sueldoBrutoLetras || '',
        presentismo: String(match.data?.presentismo ?? ''),
        neto: String(match.data?.neto ?? ''),
        sueldoNetoLetras: match.data?.sueldoNetoLetras || '',
        fechaActualizacion: match.data?.fechaActualizacion ? new Date(match.data.fechaActualizacion).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      });
    }
  };

  const handleGlobalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedGlobalCat === '') {
      sweetAlert.error('Error', 'Debe seleccionar un Nº de categoría');
      return;
    }
    try {
      const payload = {
        sueldoBasico: Number(globalFormData.sueldoBasico || 0),
        sueldoAdicional: Number(globalFormData.sueldoAdicional || 0),
        sueldoBruto: Number(globalFormData.sueldoBruto || 0),
        sueldoBrutoLetras: globalFormData.sueldoBrutoLetras.trim(),
        presentismo: Number(globalFormData.presentismo || 0),
        neto: Number(globalFormData.neto || 0),
        sueldoNetoLetras: globalFormData.sueldoNetoLetras.trim(),
        fechaActualizacion: globalFormData.fechaActualizacion,
      };

      await categoriaSatAPI.updateGlobal(selectedGlobalCat, payload);
      sweetAlert.success('Categoría actualizada', `Los valores salariales se aplicaron globalmente a todos los ítems de la Categoría Nº ${selectedGlobalCat}`);
      setShowGlobalModal(false);
      fetchCategorias();
    } catch (error: any) {
      const message = error.response?.data?.error || 'Error al actualizar la categoría globalmente';
      sweetAlert.error('Error', message);
    }
  };

  const openGlobalEdit = () => {
    setSelectedGlobalCat('');
    setGlobalFormData({
      sueldoBasico: '',
      sueldoAdicional: '',
      sueldoBruto: '',
      sueldoBrutoLetras: '',
      presentismo: '',
      neto: '',
      sueldoNetoLetras: '',
      fechaActualizacion: new Date().toISOString().split('T')[0],
    });
    setShowGlobalModal(true);
  };

  const openCreate = () => {
    setEditingCategoria(null);
    setFormData({
      numeroCategoria: '',
      nombre: '',
      sueldoBasico: '',
      sueldoAdicional: '',
      sueldoBruto: '',
      sueldoBrutoLetras: '',
      presentismo: '',
      neto: '',
      sueldoNetoLetras: '',
      codigoAfip: '',
      fechaActualizacion: new Date().toISOString().split('T')[0],
    });
    setShowModal(true);
  };

  const openEdit = (cat: CategoriaSatItem) => {
    setEditingCategoria(cat);
    setFormData({
      numeroCategoria: String(cat.data?.numeroCategoria ?? ''),
      nombre: cat.data?.nombre || cat.name || '',
      sueldoBasico: String(cat.data?.sueldoBasico ?? ''),
      sueldoAdicional: String(cat.data?.sueldoAdicional ?? ''),
      sueldoBruto: String(cat.data?.sueldoBruto ?? ''),
      sueldoBrutoLetras: cat.data?.sueldoBrutoLetras || '',
      presentismo: String(cat.data?.presentismo ?? ''),
      neto: String(cat.data?.neto ?? ''),
      sueldoNetoLetras: cat.data?.sueldoNetoLetras || '',
      codigoAfip: String(cat.data?.codigoAfip ?? ''),
      fechaActualizacion: cat.data?.fechaActualizacion ? new Date(cat.data.fechaActualizacion).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingCategoria(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        numeroCategoria: Number(formData.numeroCategoria),
        nombre: formData.nombre.trim(),
        sueldoBasico: Number(formData.sueldoBasico || 0),
        sueldoAdicional: Number(formData.sueldoAdicional || 0),
        sueldoBruto: Number(formData.sueldoBruto || 0),
        sueldoBrutoLetras: formData.sueldoBrutoLetras.trim(),
        presentismo: Number(formData.presentismo || 0),
        neto: Number(formData.neto || 0),
        sueldoNetoLetras: formData.sueldoNetoLetras.trim(),
        codigoAfip: Number(formData.codigoAfip || 0),
        fechaActualizacion: formData.fechaActualizacion,
      };

      if (editingCategoria) {
        await categoriaSatAPI.update(editingCategoria._id, payload);
        sweetAlert.success('Categoría actualizada', `Los cambios se han guardado y aplicado de manera global a todos los ítems con la Categoría Nº ${formData.numeroCategoria}`);
      } else {
        await categoriaSatAPI.create(payload);
        sweetAlert.success('Categoría creada', 'La categoría se ha creado correctamente');
      }
      closeModal();
      fetchCategorias();
    } catch (error: any) {
      const message = error.response?.data?.error || 'Error al guardar la categoría';
      sweetAlert.error('Error', message);
    }
  };

  const handleDelete = async (cat: CategoriaSatItem) => {
    const name = cat.data?.nombre || cat.name || 'Categoría';
    const result = await sweetAlert.confirm('¿Eliminar categoría?', `¿Estás seguro de que quieres eliminar la categoría "${name}" (Nº ${cat.data?.numeroCategoria})?`);
    if (result.isConfirmed) {
      try {
        await categoriaSatAPI.remove(cat._id);
        sweetAlert.success('Categoría eliminada', 'La categoría ha sido eliminada correctamente');
        fetchCategorias();
      } catch (error: any) {
        const message = error.response?.data?.error || 'Error al eliminar la categoría';
        sweetAlert.error('Error', message);
      }
    }
  };

  useEffect(() => {
    fetchCategorias();
  }, []);

  const fetchCategorias = async () => {
    try {
      setLoading(true);
      const data = await categoriaSatAPI.list();
      setCategorias(data);
    } catch (error) {
      console.error('Error fetching categorias SAT:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
    if (sortField !== field) return <FontAwesomeIcon icon={faChevronUp} className="h-2.5 w-2.5 opacity-0 group-hover:opacity-30 ml-1" />;
    return <FontAwesomeIcon icon={sortDir === 'asc' ? faChevronUp : faChevronDown} className="h-2.5 w-2.5 text-blue-500 ml-1" />;
  };

  const filtered = categorias
    .filter((c) => {
      const q = searchTerm.trim().toLowerCase();
      if (q.length === 0) return true;
      return fuzzyMatch(c.name || '', q) || fuzzyMatch(c.data?.nombre || '', q) || fuzzyMatch(String(c.data?.numeroCategoria ?? ''), q) || fuzzyMatch(String(c.data?.codigoAfip ?? ''), q) || fuzzyMatch(c.data?.sueldoBrutoLetras || '', q) || fuzzyMatch(c.data?.sueldoNetoLetras || '', q);
    })
    .sort((a, b) => {
      const valA = a.data?.[sortField];
      const valB = b.data?.[sortField];
      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDir === 'asc' ? valA - valB : valB - valA;
      }
      return sortDir === 'asc' ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
    });

  const handleDownloadTemplate = async () => {
    try {
      const blob = await categoriaSatAPI.downloadTemplate();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'plantilla_categorias_sat.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      sweetAlert.success('Descarga exitosa', 'La plantilla de Excel se ha descargado correctamente');
    } catch (error) {
      console.error('Error downloading template:', error);
      sweetAlert.error('Error', 'No se pudo descargar la plantilla');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setImportFile(e.target.files[0]);
      setImportErrors([]);
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;

    try {
      setImporting(true);
      setImportErrors([]);
      const res = await categoriaSatAPI.importExcel(importFile);
      sweetAlert.success('Actualización completada', res.message || `Se actualizaron ${res.count} categorías.`);
      setShowImportModal(false);
      setImportFile(null);
      fetchCategorias();
    } catch (error: any) {
      console.error('Import error:', error);
      const resErrors = error.response?.data?.details;
      const resMsg = error.response?.data?.error || 'Error al importar el archivo Excel';

      if (Array.isArray(resErrors)) {
        setImportErrors(resErrors);
      } else {
        sweetAlert.error('Error de importación', resMsg);
      }
    } finally {
      setImporting(false);
    }
  };

  const distinctCategoryNumbers = Array.from(new Set(categorias.map((c) => c.data?.numeroCategoria).filter((n) => n != null))).sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
        <div className="flex-1 w-full">
          <SearchAndFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} searchPlaceholder="Buscar por nombre, categoría, código AFIP..." />
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {canManage && (
            <button onClick={openCreate} title="Nueva categoría" aria-label="Nueva categoría" className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
              <FontAwesomeIcon icon={faPlus} />
            </button>
          )}
          <button onClick={handleDownloadTemplate} className="px-3 py-2 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all flex items-center gap-2 text-sm font-semibold active:scale-95" title="Descargar Plantilla">
            <FontAwesomeIcon icon={faDownload} className="h-4 w-4 text-green-600 dark:text-green-400" />
            <span className="hidden md:block">Descargar Plantilla</span>
          </button>
          <button
            onClick={() => {
              setImportFile(null);
              setImportErrors([]);
              setShowImportModal(true);
            }}
            className="px-3 py-2 rounded bg-green-600 text-white hover:bg-green-700 transition-all flex items-center gap-2 text-sm font-semibold shadow-md shadow-green-500/20 active:scale-95"
            title="Carga Masiva (Excel)"
          >
            <FontAwesomeIcon icon={faUpload} className="h-4 w-4" />
            <span className="hidden md:block">Carga Masiva</span>
          </button>
          {canManage && (
            <button onClick={openGlobalEdit} className="px-3 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 transition-all flex items-center gap-2 text-sm font-semibold shadow-md shadow-indigo-500/20 active:scale-95" title="Actualizar Valores de Categoría">
              <FontAwesomeIcon icon={faEdit} className="h-4 w-4 animate-pulse" />
              <span className="hidden md:block">Actualizar por Categoría</span>
            </button>
          )}
          {isLarge && <ViewToggle value={viewMode} onChange={setViewMode} />}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando categorías SAT..." />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={faListCheck}
          title="No hay categorías SAT"
          description={searchTerm ? 'No se encontraron categorías que coincidan con la búsqueda.' : 'No se encontraron categorías SAT en la base de datos.'}
          action={
            canManage && !searchTerm
              ? {
                  label: 'Nueva Categoría',
                  onClick: openCreate,
                  icon: faPlus,
                }
              : undefined
          }
        />
      ) : effectiveViewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mx-0.5 lg:mx-0">
          {filtered.map((cat) => (
            <Card
              key={cat._id}
              onClick={canManage ? () => openEdit(cat) : undefined}
              className="cursor-pointer hover:scale-[1.03] hover:shadow-lg transition-all duration-200"
              header={{
                title: cat.data?.nombre || cat.name || '—',
                subtitle: cat.data?.codigoAfip ? `Cód. AFIP ${cat.data.codigoAfip}` : undefined,
                icon: faListCheck,
                badges: [{ text: `Categoría ${cat.data?.numeroCategoria ?? '—'}`, variant: 'blue' }],
              }}
              footer={
                canManage
                  ? {
                      leftContent: <span className="text-xs text-gray-500 dark:text-gray-500">Actualizado: {formatDate(cat.data?.fechaActualizacion)}</span>,
                      actions: [
                        {
                          icon: faEdit,
                          onClick: (e) => {
                            e.stopPropagation();
                            openEdit(cat);
                          },
                          title: 'Editar',
                          variant: 'default',
                        },
                        {
                          icon: faTrash,
                          onClick: (e) => {
                            e.stopPropagation();
                            handleDelete(cat);
                          },
                          title: 'Eliminar',
                          variant: 'default',
                        },
                      ],
                    }
                  : undefined
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Sueldo Básico</label>
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{formatCurrency(cat.data?.sueldoBasico)}</div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Adicional</label>
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{formatCurrency(cat.data?.sueldoAdicional)}</div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Sueldo Bruto</label>
                  <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(cat.data?.sueldoBruto)}</div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Neto</label>
                  <div className="text-sm font-bold text-blue-700 dark:text-blue-400">{formatCurrency(cat.data?.neto)}</div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Presentismo</label>
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{formatCurrency(cat.data?.presentismo)}</div>
                </div>
              </div>
            </Card>
          ))}
          {canManage && <Card variant="create" onClick={openCreate} header={{ title: 'Nueva Categoría', subtitle: 'Agregar categoría manualmente', icon: faListCheck }} />}
        </div>
      ) : (
        <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm mx-0.5 lg:mx-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group select-none" onClick={() => handleSort('numeroCategoria')}>
                    <div className="flex items-center">
                      Nº Cat.
                      <SortIcon field="numeroCategoria" />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group select-none" onClick={() => handleSort('nombre')}>
                    <div className="flex items-center">
                      Nombre
                      <SortIcon field="nombre" />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group select-none" onClick={() => handleSort('sueldoBasico')}>
                    <div className="flex items-center">
                      Sueldo Básico
                      <SortIcon field="sueldoBasico" />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group select-none" onClick={() => handleSort('sueldoAdicional')}>
                    <div className="flex items-center">
                      Adicional
                      <SortIcon field="sueldoAdicional" />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group select-none" onClick={() => handleSort('sueldoBruto')}>
                    <div className="flex items-center">
                      Sueldo Bruto
                      <SortIcon field="sueldoBruto" />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group select-none hidden xl:table-cell" onClick={() => handleSort('presentismo')}>
                    <div className="flex items-center">
                      Presentismo
                      <SortIcon field="presentismo" />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group select-none" onClick={() => handleSort('neto')}>
                    <div className="flex items-center">
                      Neto
                      <SortIcon field="neto" />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group select-none hidden lg:table-cell" onClick={() => handleSort('codigoAfip')}>
                    <div className="flex items-center">
                      Cód. AFIP
                      <SortIcon field="codigoAfip" />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group select-none hidden lg:table-cell" onClick={() => handleSort('fechaActualizacion')}>
                    <div className="flex items-center">
                      Actualización
                      <SortIcon field="fechaActualizacion" />
                    </div>
                  </th>
                  {canManage && <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {filtered.map((cat) => (
                  <tr key={cat._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center justify-center h-7 w-10 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-bold">{cat.data?.numeroCategoria ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{cat.data?.nombre || cat.name || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{formatCurrency(cat.data?.sueldoBasico)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{formatCurrency(cat.data?.sueldoAdicional)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-emerald-700 dark:text-emerald-400 font-semibold">{formatCurrency(cat.data?.sueldoBruto)}</span>
                      {cat.data?.sueldoBrutoLetras && (
                        <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[150px]" title={cat.data.sueldoBrutoLetras}>
                          {cat.data.sueldoBrutoLetras}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{formatCurrency(cat.data?.presentismo)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-blue-700 dark:text-blue-400 font-bold">{formatCurrency(cat.data?.neto)}</span>
                      {cat.data?.sueldoNetoLetras && (
                        <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[150px]" title={cat.data.sueldoNetoLetras}>
                          {cat.data.sueldoNetoLetras}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{cat.data?.codigoAfip ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(cat.data?.fechaActualizacion)}</span>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEdit(cat)} className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 rounded transition-colors" title="Editar">
                            <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDelete(cat)} className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 rounded transition-colors" title="Eliminar">
                            <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals / Summary Footer */}
          <div className="bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Mostrando <span className="font-bold text-gray-700 dark:text-gray-300">{filtered.length}</span> de <span className="font-bold text-gray-700 dark:text-gray-300">{categorias.length}</span> categorías
            </span>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faFileExcel} className="text-green-600 dark:text-green-400 h-5 w-5" />
                <h3 className="font-bold text-lg text-gray-900 dark:text-white">Carga Masiva de Categorías SAT</h3>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors h-8 w-8 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700">
                <FontAwesomeIcon icon={faArrowLeft} className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="p-5 space-y-4">
              <div className="text-sm text-gray-600 dark:text-gray-300 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
                <p className="font-semibold mb-1">Instrucciones de Carga:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Descarga la plantilla de Excel provista.</li>
                  <li>
                    Columna obligatoria: <strong>numeroCategoria</strong>. Completa los valores a actualizar (sueldos y letras).
                  </li>
                  <li>Sube tu archivo completado en esta ventana.</li>
                  <li>Solo se actualizarán los valores de las categorías existentes. No se crean, eliminan ni modifican nombres ni códigos AFIP.</li>
                </ol>
              </div>

              <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900/20 hover:border-blue-500 dark:hover:border-blue-500 transition-all cursor-pointer relative group">
                <input type="file" accept=".xlsx, .xls" required onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                <FontAwesomeIcon icon={faFileExcel} className="h-10 w-10 text-green-500 dark:text-green-400 mb-3 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{importFile ? importFile.name : 'Selecciona o arrastra tu archivo Excel'}</span>
                <span className="text-xs text-gray-500 mt-1">Soporta archivos .xlsx y .xls</span>
              </div>

              {importErrors.length > 0 && (
                <div className="max-h-40 overflow-y-auto bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3 rounded-lg text-xs text-red-600 dark:text-red-400 space-y-1">
                  <p className="font-bold mb-1">Se encontraron los siguientes errores:</p>
                  {importErrors.map((err, idx) => (
                    <p key={idx}>{err}</p>
                  ))}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowImportModal(false)} className="flex-1 rounded-lg h-10 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-semibold bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={importing || !importFile} className="flex-1 rounded-lg h-10 bg-green-600 hover:bg-green-700 text-white font-semibold shadow-md shadow-green-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100">
                  {importing ? 'Importando...' : 'Subir e Importar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Update Modal */}
      {showGlobalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/30">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                  <FontAwesomeIcon icon={faEdit} className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white">Actualización Global</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Modifica sueldos masivamente por Nº Categoría</p>
                </div>
              </div>
              <button onClick={() => setShowGlobalModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors h-8 w-8 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700">
                <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
              </button>
            </div>

            {/* Form Content */}
            <form onSubmit={handleGlobalSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Seleccionar Nº Categoría *</label>
                <select required value={selectedGlobalCat} onChange={(e) => handleGlobalCategorySelect(e.target.value)} className="input-field w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500">
                  <option value="">-- Seleccionar categoría --</option>
                  {distinctCategoryNumbers.map((num) => (
                    <option key={num} value={num}>
                      Categoría Nº {num}
                    </option>
                  ))}
                </select>
              </div>

              {selectedGlobalCat !== '' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-slideDown">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sueldo Básico</label>
                    <input type="number" step="0.01" value={globalFormData.sueldoBasico} onChange={(e) => setGlobalFormData((prev) => ({ ...prev, sueldoBasico: e.target.value }))} className="input-field" placeholder="0.00" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sueldo Adicional</label>
                    <input type="number" step="0.01" value={globalFormData.sueldoAdicional} onChange={(e) => setGlobalFormData((prev) => ({ ...prev, sueldoAdicional: e.target.value }))} className="input-field" placeholder="0.00" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sueldo Bruto</label>
                    <input type="number" step="0.01" value={globalFormData.sueldoBruto} onChange={(e) => setGlobalFormData((prev) => ({ ...prev, sueldoBruto: e.target.value }))} className="input-field" placeholder="0.00" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sueldo Bruto Letras</label>
                    <input type="text" value={globalFormData.sueldoBrutoLetras} onChange={(e) => setGlobalFormData((prev) => ({ ...prev, sueldoBrutoLetras: e.target.value }))} className="input-field" placeholder="Ej: UN MILLÓN..." />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Presentismo</label>
                    <input type="number" step="0.01" value={globalFormData.presentismo} onChange={(e) => setGlobalFormData((prev) => ({ ...prev, presentismo: e.target.value }))} className="input-field" placeholder="0.00" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Neto</label>
                    <input type="number" step="0.01" value={globalFormData.neto} onChange={(e) => setGlobalFormData((prev) => ({ ...prev, neto: e.target.value }))} className="input-field" placeholder="0.00" />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sueldo Neto Letras</label>
                    <input type="text" value={globalFormData.sueldoNetoLetras} onChange={(e) => setGlobalFormData((prev) => ({ ...prev, sueldoNetoLetras: e.target.value }))} className="input-field" placeholder="Ej: UN MILLÓN..." />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha Actualización</label>
                    <input type="date" value={globalFormData.fechaActualizacion} onChange={(e) => setGlobalFormData((prev) => ({ ...prev, fechaActualizacion: e.target.value }))} className="input-field" />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 sticky bottom-0 animate-fadeIn">
                <button type="button" onClick={() => setShowGlobalModal(false)} className="flex-1 rounded-lg h-10 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-semibold bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={selectedGlobalCat === ''} className="flex-1 rounded-lg h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md shadow-indigo-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100">
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Alta / edición manual */}
      <InfoModal
        isOpen={showModal}
        onClose={closeModal}
        title={editingCategoria ? 'Editar Categoría SAT' : 'Nueva Categoría SAT'}
        subtitle={editingCategoria ? 'Modifica los datos de la categoría' : 'Agrega una categoría de forma manual'}
        size="lg"
        actions={[
          {
            label: editingCategoria ? 'Actualizar' : 'Crear',
            onClick: () => {
              const form = document.querySelector<HTMLFormElement>('#categoria-sat-form');
              form?.requestSubmit();
            },
            variant: 'primary',
          },
          {
            label: 'Cancelar',
            onClick: closeModal,
            variant: 'ghost',
          },
        ]}
      >
        <form id="categoria-sat-form" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nº Categoría *</label>
              <input type="number" required value={formData.numeroCategoria} onChange={(e) => setFormData((prev) => ({ ...prev, numeroCategoria: e.target.value }))} className="input-field" placeholder="Ej: 1" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre *</label>
              <input type="text" required value={formData.nombre} onChange={(e) => setFormData((prev) => ({ ...prev, nombre: e.target.value }))} className="input-field" placeholder="Ej: Director de Programas" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sueldo Básico</label>
              <input type="number" step="0.01" value={formData.sueldoBasico} onChange={(e) => setFormData((prev) => ({ ...prev, sueldoBasico: e.target.value }))} className="input-field" placeholder="0.00" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sueldo Adicional</label>
              <input type="number" step="0.01" value={formData.sueldoAdicional} onChange={(e) => setFormData((prev) => ({ ...prev, sueldoAdicional: e.target.value }))} className="input-field" placeholder="0.00" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sueldo Bruto</label>
              <input type="number" step="0.01" value={formData.sueldoBruto} onChange={(e) => setFormData((prev) => ({ ...prev, sueldoBruto: e.target.value }))} className="input-field" placeholder="0.00" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sueldo Bruto Letras</label>
              <input type="text" value={formData.sueldoBrutoLetras} onChange={(e) => setFormData((prev) => ({ ...prev, sueldoBrutoLetras: e.target.value }))} className="input-field" placeholder="Ej: UN MILLÓN OCHOCIENTOS..." />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Presentismo</label>
              <input type="number" step="0.01" value={formData.presentismo} onChange={(e) => setFormData((prev) => ({ ...prev, presentismo: e.target.value }))} className="input-field" placeholder="0.00" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Neto</label>
              <input type="number" step="0.01" value={formData.neto} onChange={(e) => setFormData((prev) => ({ ...prev, neto: e.target.value }))} className="input-field" placeholder="0.00" />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sueldo Neto Letras</label>
              <input type="text" value={formData.sueldoNetoLetras} onChange={(e) => setFormData((prev) => ({ ...prev, sueldoNetoLetras: e.target.value }))} className="input-field" placeholder="Ej: UN MILLÓN CUATROCIENTOS..." />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Código AFIP</label>
              <input type="number" value={formData.codigoAfip} onChange={(e) => setFormData((prev) => ({ ...prev, codigoAfip: e.target.value }))} className="input-field" placeholder="Ej: 35283" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha Actualización</label>
              <input type="date" value={formData.fechaActualizacion} onChange={(e) => setFormData((prev) => ({ ...prev, fechaActualizacion: e.target.value }))} className="input-field" />
            </div>
          </div>
        </form>
      </InfoModal>
    </div>
  );
};

export default CategoriasSatTab;
