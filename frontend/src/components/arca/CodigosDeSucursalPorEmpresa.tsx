import React from 'react';
import { codigoDeSucursalParaEmpresa } from '@compartido/sucursalesDeEmpresa';
import type { Company } from '../../api/companies';

/**
 * EL CÓDIGO DE UN DOMICILIO, POR EMPRESA.
 *
 * En ARCA el código de sucursal es de cada CUIT: Ruiz Huidobro 4365 es la 00001 de 2030 S.R.L. y la
 * 00003 de FZERO y de GRINI. La tabla de Sucursales mostraba UN código por domicilio —el del
 * catálogo—, que era el de una sola de las empresas y se leía como si valiera para todas.
 *
 * Acá se muestra el de cada empleadora que tiene el domicilio, agrupando a las que comparten código.
 * La que todavía no tiene el suyo cargado figura con el del catálogo, marcada: es el que le rige
 * hasta que se cargue el de su padrón (ver `compartido/sucursalesDeEmpresa.ts`).
 *
 * Sin ninguna empresa asociada queda el código del catálogo, apagado: no es de nadie todavía.
 */
export const CodigosDeSucursalPorEmpresa: React.FC<{ sucursalId: string; codigoDelCatalogo?: string; empresas: Company[] }> = ({ sucursalId, codigoDelCatalogo, empresas }) => {
  const conEste = empresas.filter((e) => (e.sucursalIds || []).map(String).includes(sucursalId));
  if (conEste.length === 0) {
    return (
      <span className="text-sm font-mono text-gray-400 dark:text-gray-500" title="Ninguna empresa tiene este domicilio: es el código con el que se cargó en el catálogo.">
        {codigoDelCatalogo || '—'}
      </span>
    );
  }
  // código → empresas que lo usan, y si para alguna sale del catálogo (no tiene el propio cargado).
  const grupos = new Map<string, { empresas: string[]; delCatalogo: boolean }>();
  for (const e of conEste) {
    const r = codigoDeSucursalParaEmpresa(e.sucursalActividades, sucursalId, codigoDelCatalogo);
    const clave = `${r.codigo || '—'}|${r.origen === 'empresa' ? 'p' : 'c'}`;
    const g = grupos.get(clave) || { empresas: [], delCatalogo: r.origen !== 'empresa' };
    g.empresas.push(e.razonSocial);
    grupos.set(clave, g);
  }
  return (
    <div className="flex flex-col gap-1">
      {[...grupos.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([clave, g]) => {
          const codigo = clave.split('|')[0];
          return (
            <span key={clave} className="inline-flex items-center gap-1.5 whitespace-nowrap" title={g.delCatalogo ? `${g.empresas.join(', ')}: todavía sin su código cargado; rige el del catálogo. Cargalo en la ficha de la empresa → ARCA → Domicilios.` : `Código con el que ${g.empresas.join(', ')} tiene registrado este domicilio en ARCA.`}>
              <span className={`text-sm font-mono font-semibold px-2 py-0.5 rounded border ${g.delCatalogo ? 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50' : 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800/50'}`}>{codigo}</span>
              <span className="text-xs text-gray-600 dark:text-gray-300">{g.empresas.join(', ')}</span>
              {g.delCatalogo && <span className="text-[10px] italic text-amber-700 dark:text-amber-400">del catálogo</span>}
            </span>
          );
        })}
    </div>
  );
};
