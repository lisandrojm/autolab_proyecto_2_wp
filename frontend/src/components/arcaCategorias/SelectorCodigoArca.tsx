import React, { useEffect, useMemo, useState } from 'react';
import { arcaCategoriasAPI, CodigoArcaDisponible } from '../../api/arcaCategorias';
import { normalizarNombre } from '@compartido/catalogoArca';

/**
 * EL CÓDIGO DE ARCA DE UNA CATEGORÍA SE ELIGE, NO SE TIPEA.
 *
 * Lista los códigos vigentes que ARCA publica para el convenio (el espejo), con su descripción
 * literal, y se busca por código o por texto. Era un campo libre de 6 dígitos: así se cargó un código
 * de otra categoría en 41 filas sin que nada lo notara. El servidor repite la validación.
 *
 * Los códigos que ya usa OTRA categoría activa se ven pero no se pueden elegir (el índice es único).
 */
export const SelectorCodigoArca: React.FC<{ convenio: string; valor: string; onChange: (codigo: string, descripcion: string) => void; codigoPropio?: string }> = ({ convenio, valor, onChange, codigoPropio }) => {
  const [opciones, setOpciones] = useState<CodigoArcaDisponible[] | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    setOpciones(null);
    if (!convenio) return;
    arcaCategoriasAPI
      .codigosArca(convenio)
      .then(setOpciones)
      .catch(() => setOpciones([]));
  }, [convenio]);

  const visibles = useMemo(() => {
    const t = normalizarNombre(q);
    const d = q.replace(/\D/g, '');
    return (opciones || []).filter((o) => !q.trim() || (d && o.codigo.includes(d)) || (t && normalizarNombre(o.descripcion).includes(t)));
  }, [opciones, q]);

  const elegida = (opciones || []).find((o) => o.codigo === valor);

  if (!convenio) return <p className="text-xs text-gray-500">Elegí primero el convenio.</p>;
  if (opciones === null) return <p className="text-xs text-gray-500">Cargando los códigos de ARCA…</p>;
  if (opciones.length === 0) return <p className="text-xs text-red-600 dark:text-red-400">El espejo de ARCA no tiene códigos para {convenio}. Sembralo o sincronizalo (Configuración → ARCA → Catálogo).</p>;

  return (
    <div>
      {elegida ? (
        <p className="mb-1 text-xs text-gray-700 dark:text-gray-200">
          <span className="font-mono font-semibold">{elegida.codigo}</span> · {elegida.descripcion}
        </p>
      ) : valor ? (
        <p className="mb-1 text-xs text-red-600 dark:text-red-400">
          El código actual <span className="font-mono">{valor}</span> no está vigente en ARCA para {convenio}: elegí uno de la lista.
        </p>
      ) : null}
      <input type="text" value={q} onChange={(e) => setQ(e.target.value)} className="input-field" placeholder="Buscar por código o por descripción de ARCA…" />
      <div className="mt-1 max-h-48 overflow-y-auto rounded border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
        {visibles.map((o) => {
          const ocupado = !!o.usadoPor && o.codigo !== codigoPropio;
          const sel = o.codigo === valor;
          return (
            <button
              type="button"
              key={o.codigo}
              disabled={ocupado}
              onClick={() => onChange(o.codigo, o.descripcion)}
              title={ocupado ? `Lo usa «${o.usadoPor}»` : undefined}
              className={`w-full text-left px-2 py-1.5 text-xs flex gap-2 items-baseline ${sel ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800'} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <span className="font-mono shrink-0">{o.codigo}</span>
              <span className="flex-1">{o.descripcion}</span>
              {ocupado && <span className="text-[10px] text-gray-500 shrink-0">usado por {o.usadoPor}</span>}
            </button>
          );
        })}
        {visibles.length === 0 && <p className="px-2 py-2 text-xs text-gray-500">Ningún código coincide.</p>}
      </div>
    </div>
  );
};
