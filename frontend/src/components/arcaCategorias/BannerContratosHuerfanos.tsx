import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { InfoModal } from '../ui/InfoModal';
import { arcaCategoriasAPI, PunterosHuerfanos } from '../../api/arcaCategorias';

/**
 * El tercer panel rojo: CONTRATOS que apuntan a una categoría que no existe.
 *
 * Los tres son la misma familia vista desde tres lados, y ahora están los tres:
 *
 *   1. Categoría sin convenio ni código      → el banner de huérfanas
 *   2. Función FRAME sin categoría válida    → `BannerFuncionesRotas`
 *   3. Contrato con puntero a la nada        → este
 *
 * Este faltaba, y es el que más caro salía. Los otros dos recorren catálogos y se preguntan si les
 * falta algo; un puntero a un id que no existe se les escapa por definición, porque no hay nada que
 * listar. Así fue como 164 contratos con `categoria_sat_id 43` sobrevivieron a todas las revisiones.
 *
 * Y ES EL ÚNICO DE LOS TRES QUE YA ESTÁ ROTO. Una función mal apuntada arruina el PRÓXIMO contrato;
 * esto son contratos que ya existen y cuyo TXT sale sin las posiciones 101-106, así que ARCA los
 * rechaza hoy. Por eso el texto habla en presente y no en condicional.
 */
export const BannerContratosHuerfanos: React.FC = () => {
  const [datos, setDatos] = useState<PunterosHuerfanos | null>(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    // Si falla, no se muestra nada: un banner rojo por un error de red diría algo falso sobre los
    // datos. `npm run punteros-categoria:reparar:dry` sigue siendo la fuente que no depende de esto.
    arcaCategoriasAPI
      .contratosHuerfanos()
      .then(setDatos)
      .catch(() => setDatos(null));
  }, []);

  if (!datos || datos.total === 0) return null;

  return (
    <>
      <div className="flex items-center gap-1.5 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-3 py-2">
        <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 text-red-600 dark:text-red-400 shrink-0" />
        <span className="text-xs text-red-800 dark:text-red-300 min-w-0 truncate mr-0.5">
          {datos.total === 1 ? (
            <>
              Hay <strong>1 contrato</strong> que apunta a una categoría que no existe
            </>
          ) : (
            <>
              Hay <strong>{datos.total} contratos</strong> que apuntan a una categoría que no existe
            </>
          )}
          <span className="hidden sm:inline text-red-700/80 dark:text-red-400/80"> — su alta no se puede generar</span>
        </span>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          title="Ver a qué apuntan y qué contratos son"
          aria-label="Ver los contratos que apuntan a una categoría que no existe"
          className="shrink-0 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors"
        >
          <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
        </button>
      </div>

      <InfoModal isOpen={abierto} onClose={() => setAbierto(false)} title={datos.total === 1 ? 'Un contrato sin categoría resoluble' : `${datos.total} contratos sin categoría resoluble`} size="md">
        <div className="space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-200">
            El contrato guarda un número de categoría que no existe en el catálogo. El TXT sale sin las posiciones <strong>101-106</strong> —categoría profesional— y ARCA lo rechaza. No es un riesgo
            futuro: estos contratos ya existen y hoy no se pueden dar de alta.
          </p>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
            {datos.porCategoria.map((g) => (
              <div key={g.categoriaSatId} className="px-3 py-2.5 text-sm">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <span className="text-gray-900 dark:text-gray-100">
                    <span className="font-mono text-xs text-gray-500 dark:text-gray-400">id {g.categoriaSatId}</span>
                    {g.nombreGuardado && <span className="font-semibold"> «{g.nombreGuardado}»</span>}
                  </span>
                  <span className="text-xs font-semibold text-red-700 dark:text-red-400">{g.contratos} contrato(s)</span>
                </div>
                {/* El desglose por rol es lo que separa casos distintos con el mismo id roto. */}
                {g.roles.map((r) => (
                  <p key={String(r.rolFrameId)} className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    {r.contratos} de «{r.nombre}»
                  </p>
                ))}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            El nombre guardado en el contrato dice a qué apuntaba. Cuando hay una categoría equivalente evidente —mismo nombre, mismo código de ARCA— se corrige el puntero con{' '}
            <span className="font-mono text-[11px]">punteros-categoria:reparar</span>. Cuando no la hay, o cuando el rol del contrato no propone esa categoría, la decisión es de quien conoce el
            convenio: el sistema no reasigna por parecido de nombre.
          </p>
        </div>
      </InfoModal>
    </>
  );
};
