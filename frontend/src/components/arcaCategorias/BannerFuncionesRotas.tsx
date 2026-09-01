import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { InfoModal } from '../ui/InfoModal';
import { roleFrameAPI, FuncionRota } from '../../api/roleFrames';

/**
 * El panel rojo del PUENTE: funciones FRAME que ya no pueden proponer una categoría válida.
 *
 * Es el gemelo del banner de categorías huérfanas y está a propósito con la misma forma —rojo,
 * arriba, con el detalle a un click— porque son el mismo tipo de problema visto desde los dos lados:
 * allá una categoría que no se puede usar, acá un rol que va a ofrecer una que no se puede usar.
 *
 * POR QUÉ HIZO FALTA
 *
 * La Fase 2 dio de baja «Actor» y cuatro funciones quedaron apuntándole. No lo vio nadie, y el panel
 * de huérfanas tampoco: una categoría de baja SIN contratos deja de figurar ahí a propósito. O sea
 * que el aviso existente estaba mirando justo el lado por donde no se veía. Mientras tanto, cualquiera
 * que armara un contrato con rol «Actor» recibía como propuesta una categoría sin convenio ni código,
 * y el TXT de esa persona no se podía generar.
 *
 * EL NÚMERO QUE IMPORTA es el de contratos, no el de funciones: «Doblajista, 0 contratos» puede
 * esperar a que alguien decida; «Actor, 151» hay que arreglarlo hoy. Por eso ordena por eso y por eso
 * el conteo va en cada línea.
 */
export const BannerFuncionesRotas: React.FC = () => {
  const [rotas, setRotas] = useState<FuncionRota[]>([]);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    // Si falla, no se muestra nada: un banner de error sobre un error de red diría algo falso sobre
    // los datos. El script `funciones-frame:auditar` sigue siendo la fuente que no depende de esto.
    roleFrameAPI
      .rotas()
      .then(setRotas)
      .catch(() => setRotas([]));
  }, []);

  if (rotas.length === 0) return null;

  const contratos = rotas.reduce((a, f) => a + f.contratos, 0);

  return (
    <>
      <div className="flex items-center gap-1.5 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-3 py-2">
        <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 text-red-600 dark:text-red-400 shrink-0" />
        <span className="text-xs text-red-800 dark:text-red-300 min-w-0 truncate mr-0.5">
          {rotas.length === 1 ? (
            <>
              Hay <strong>1 función FRAME</strong> sin categoría válida que proponer
            </>
          ) : (
            <>
              Hay <strong>{rotas.length} funciones FRAME</strong> sin categoría válida que proponer
            </>
          )}
          {contratos > 0 && <> · {contratos} contrato(s) las usan</>}
          <span className="hidden sm:inline text-red-700/80 dark:text-red-400/80"> — {rotas.map((f) => f.nombre).join(', ')}</span>
        </span>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          title="Ver cuáles son y qué les pasa"
          aria-label="Ver las funciones FRAME sin categoría válida"
          className="shrink-0 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors"
        >
          <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
        </button>
      </div>

      <InfoModal isOpen={abierto} onClose={() => setAbierto(false)} title={rotas.length === 1 ? 'Una función sin categoría válida' : `${rotas.length} funciones sin categoría válida`} size="md">
        <div className="space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-200">
            Estas funciones apuntan a categorías que ya no existen o que están dadas de baja. Los contratos ya armados no se rompen —su categoría sigue resolviendo—, pero el <strong>próximo</strong> que
            se arme con estos roles va a recibir como propuesta algo sin convenio ni código, y su TXT no se va a poder generar.
          </p>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
            {rotas.map((f) => (
              <div key={f._id} className="px-3 py-2.5 text-sm">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{f.nombre}</span>
                  {/* El conteo decide la urgencia: 0 contratos puede esperar a que alguien decida. */}
                  <span className={`text-xs ${f.contratos > 0 ? 'text-red-700 dark:text-red-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>{f.contratos} contrato(s)</span>
                </div>
                {f.motivos.map((m, i) => (
                  <p key={i} className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    {m}
                  </p>
                ))}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Se arreglan asignándoles las categorías del convenio que les corresponde, desde Usuarios → Roles Empresa. Para las que no tienen un reemplazo obvio —«Doblajista», «Coordinador de
            Intimidad»— la decisión es de quien conoce el convenio: el sistema no adivina una categoría por parecido de nombre.
          </p>
        </div>
      </InfoModal>
    </>
  );
};
