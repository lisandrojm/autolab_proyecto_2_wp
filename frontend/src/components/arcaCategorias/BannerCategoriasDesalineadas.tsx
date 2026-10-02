import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { InfoModal } from '../ui/InfoModal';
import { arcaCategoriasAPI, EstadoCatalogoArca } from '../../api/arcaCategorias';
import { TEXTO_ESTADO_CATEGORIA } from '@compartido/catalogoArca';

/**
 * El cuarto panel rojo: categorías cuyo CÓDIGO no dice lo que dice su NOMBRE.
 *
 * Es el que faltaba cuando 41 categorías del 0634/11 quedaron con el código de otra: todas tenían
 * convenio, un código válido de 6 dígitos y contratos andando, así que ningún otro banner las veía. Lo
 * que estaba mal era el significado, y eso solo se ve comparando contra lo que ARCA publica (el espejo
 * de ARCA). Hasta corregirlas, sus contratos no pueden generar el alta.
 *
 * Si falla el pedido no se muestra nada: un banner por un error de red diría algo falso.
 */
export const BannerCategoriasDesalineadas: React.FC<{ recarga?: number }> = ({ recarga }) => {
  const [datos, setDatos] = useState<EstadoCatalogoArca | null>(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    arcaCategoriasAPI
      .estadoCatalogo()
      .then(setDatos)
      .catch(() => setDatos(null));
  }, [recarga]);

  if (!datos || !datos.espejo || datos.total === 0) return null;

  return (
    <>
      <div className="flex items-center gap-1.5 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-3 py-2">
        <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 text-red-600 dark:text-red-400 shrink-0" />
        <span className="text-xs text-red-800 dark:text-red-300 min-w-0 truncate mr-0.5">
          <strong>{datos.total} categoría(s)</strong> no coinciden con lo que ARCA dice de su código
          <span className="hidden sm:inline text-red-700/80 dark:text-red-400/80"> — {datos.contratosAfectados} contrato(s) no pueden generar el alta</span>
        </span>
        <button type="button" onClick={() => setAbierto(true)} title="Ver cuáles y qué dice ARCA" aria-label="Ver las categorías que no coinciden con ARCA" className="shrink-0 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors">
          <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
        </button>
      </div>

      <InfoModal isOpen={abierto} onClose={() => setAbierto(false)} title={`${datos.total} categoría(s) que no coinciden con ARCA`} size="lg">
        <div className="space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-200">
            El código de cada una existe, pero ARCA lo describe distinto. Un alta con ese código declara <strong>otra categoría</strong> y ARCA la acepta sin avisar. Corregí el código editando la categoría
            (se elige de la lista de ARCA), o —si el nombre propio es a propósito— confirmalo al guardar.
          </p>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700 max-h-[50vh] overflow-y-auto">
            {datos.categorias.map((c) => (
              <div key={c._id} className="px-3 py-2 text-sm">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <span className="text-gray-900 dark:text-gray-100">
                    <span className="font-mono text-xs text-gray-500">{c.convenio} · {c.codigoArca}</span> <span className="font-semibold">«{c.nombre}»</span>
                    {c.grupo != null && <span className="text-xs text-gray-500"> · grupo {c.grupo}</span>}
                  </span>
                  <span className="text-xs font-semibold text-red-700 dark:text-red-400">{c.contratos} contrato(s)</span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                  {TEXTO_ESTADO_CATEGORIA[c.estadoArca]}
                  {c.descripcionArcaEspejo ? <> — ARCA: «{c.descripcionArcaEspejo}»</> : null}
                </p>
              </div>
            ))}
          </div>
        </div>
      </InfoModal>
    </>
  );
};
