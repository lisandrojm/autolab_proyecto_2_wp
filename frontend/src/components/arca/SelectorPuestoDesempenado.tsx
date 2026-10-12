import React, { useEffect, useMemo, useState } from 'react';
import { createSimpleCatalogApi, SimpleCatalogItem } from '../../api/simpleCatalog';
import { normalizarNombre } from '@compartido/catalogoArca';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faPen } from '@fortawesome/free-solid-svg-icons';
import { Modal } from '../ui/Modal';

/**
 * PUESTO DESEMPEÑADO DE ARCA: se elige del catálogo (Configuración → ARCA → Puestos Desempeñados),
 * buscando por código o descripción. Solo los ACTIVOS; el que ya tenía, aunque se haya desactivado,
 * se sigue mostrando para que se vea qué hay.
 *
 * Lo usan el Rol Empresa (formulario y asignación rápida) y la Categoría.
 */
const api = createSimpleCatalogApi('/arca/puestos-desempenados');
let cache: Promise<SimpleCatalogItem[]> | null = null;
/** El catálogo es el mismo en toda la pantalla: se pide una vez. */
export const listarPuestos = () => (cache ??= api.list().catch(() => ((cache = null), [] as SimpleCatalogItem[])));

export const etiquetaPuesto = (p?: SimpleCatalogItem) => (p ? `${p.externalId} · ${p.name}` : '');

export const SelectorPuestoDesempenado: React.FC<{ valor: string; onChange: (codigo: string) => void; autoFocus?: boolean }> = ({ valor, onChange, autoFocus }) => {
  const [puestos, setPuestos] = useState<SimpleCatalogItem[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    void listarPuestos().then(setPuestos);
  }, []);

  const actual = (puestos || []).find((p) => p.externalId === valor);
  const visibles = useMemo(() => {
    const t = normalizarNombre(q);
    const d = q.replace(/\D/g, '');
    return (puestos || [])
      .filter((p) => (p as any).activo !== false)
      .filter((p) => !q.trim() || (d && String(p.externalId || '').includes(d)) || (t && normalizarNombre(p.name).includes(t)))
      .slice(0, 80);
  }, [puestos, q]);

  if (puestos === null) return <p className="text-xs text-gray-500">Cargando los puestos de ARCA…</p>;
  if (puestos.length === 0) return <p className="text-xs text-red-600 dark:text-red-400">El catálogo de puestos está vacío: importalo en Configuración → ARCA → Puestos Desempeñados.</p>;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        {valor ? (
          <span className="text-gray-700 dark:text-gray-200">
            {actual ? <strong className="font-mono">{actual.externalId}</strong> : <span className="font-mono">{valor}</span>} {actual ? `· ${actual.name}` : '(no está en el catálogo)'}
            {actual && (actual as any).activo === false && <span className="ml-1 text-amber-600">· desactivado</span>}
          </span>
        ) : (
          <span className="text-gray-500">Sin puesto</span>
        )}
        {valor && (
          <button type="button" onClick={() => onChange('')} className="text-red-600 dark:text-red-400 hover:underline">
            Quitar
          </button>
        )}
      </div>
      <input type="text" value={q} autoFocus={autoFocus} onChange={(e) => setQ(e.target.value)} className="input-field" placeholder="Buscar por código o descripción…" />
      <div className="mt-1 max-h-48 overflow-y-auto rounded border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
        {visibles.map((p) => (
          <button key={p._id} type="button" onClick={() => onChange(String(p.externalId || ''))} className={`w-full text-left px-2 py-1.5 text-xs flex gap-2 ${p.externalId === valor ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
            <span className="font-mono shrink-0">{p.externalId}</span>
            <span className="flex-1">{p.name}</span>
          </button>
        ))}
        {visibles.length === 0 && <p className="px-2 py-2 text-xs text-gray-500">Ningún puesto coincide.</p>}
      </div>
    </div>
  );
};

/**
 * EL MISMO SELECTOR, EN UNA LÍNEA: el puesto actual (o «Sin puesto · opcional») y un «+» que abre el
 * buscador en un modal. Para los formularios donde el buscador abierto ocupaba media pantalla (Rol
 * Empresa, pedido del 11/10/2026) y el puesto es opcional: la mayoría de las veces ya viene puesto o
 * no hace falta tocarlo. Cuando ya hay uno, el botón es un lápiz.
 */
export const CampoPuestoCompacto: React.FC<{ valor: string; onChange: (codigo: string) => void; etiqueta?: string; ayuda?: string; zIndex?: number }> = ({ valor, onChange, etiqueta = 'Puesto desempeñado (ARCA)', ayuda, zIndex = 70 }) => {
  const [abierto, setAbierto] = useState(false);
  const [puestos, setPuestos] = useState<SimpleCatalogItem[] | null>(null);
  useEffect(() => {
    void listarPuestos().then(setPuestos);
  }, []);
  const actual = (puestos || []).find((p) => p.externalId === valor);
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{etiqueta}</label>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          title={valor ? 'Cambiar el puesto desempeñado' : 'Elegir el puesto desempeñado (opcional)'}
          aria-label={valor ? 'Cambiar el puesto desempeñado' : 'Elegir el puesto desempeñado'}
          className="inline-flex items-center justify-center h-6 w-6 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          <FontAwesomeIcon icon={valor ? faPen : faPlus} className="h-3 w-3" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        {valor ? (
          <span className="text-gray-700 dark:text-gray-200">
            {actual ? <strong className="font-mono">{actual.externalId}</strong> : <span className="font-mono">{valor}</span>} {actual ? `· ${actual.name}` : puestos ? '(no está en el catálogo)' : ''}
            {actual && (actual as any).activo === false && <span className="ml-1 text-amber-600">· desactivado</span>}
          </span>
        ) : (
          <span className="text-gray-500">Sin puesto · opcional{ayuda ? `: ${ayuda}` : ''}</span>
        )}
        {valor && (
          <button type="button" onClick={() => onChange('')} className="text-red-600 dark:text-red-400 hover:underline shrink-0">
            Quitar
          </button>
        )}
      </div>
      {abierto && (
        <Modal isOpen onClose={() => setAbierto(false)} title={etiqueta} size="md" zIndex={zIndex}>
          <div className="space-y-3">
            {ayuda && <p className="text-xs text-gray-500 dark:text-gray-400">{ayuda}.</p>}
            <SelectorPuestoDesempenado
              autoFocus
              valor={valor}
              onChange={(codigo) => {
                onChange(codigo);
                // Elegir uno cierra; «Quitar» (vacío) deja el modal abierto para elegir otro.
                if (codigo) setAbierto(false);
              }}
            />
            <div className="flex justify-end">
              <button type="button" onClick={() => setAbierto(false)} className="btn-secondary text-sm">
                Cerrar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
