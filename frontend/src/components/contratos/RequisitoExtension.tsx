import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUpRightFromSquare, faCircleCheck, faTriangleExclamation, faPuzzlePiece, faCopy, faCheck, faSpinner, faPlug } from '@fortawesome/free-solid-svg-icons';
import { useExtensionArca, probarExtension, useEstadoExtension, USERSCRIPT_URL, EstadoExtension } from './puenteArca';
import { Modal } from '../ui/Modal';

/**
 * Aviso de instalación de la extensión que valida las obras sociales contra ARCA.
 *
 * Sin ella no hay puente entre WeProdu y ARCA: la app no puede leer lo que el organismo precompleta
 * en su pantalla de altas, así que la validación automática simplemente no ocurre. Decirlo donde se
 * usa evita la conclusión razonable pero equivocada de que la función está rota.
 *
 * NO bloquea nada: sin la extensión igual se pueden copiar los CUIL y trabajar a mano.
 */

export const TAMPERMONKEY_URL = 'https://www.tampermonkey.net/';

/* La detección vive en `puenteArca.ts`, junto al resto del contrato con el script: repartirla en
   dos archivos es cómo terminan usando marcas distintas y una dice que está y la otra que no. */

export const RequisitoExtension: React.FC<{ compacto?: boolean }> = ({ compacto }) => {
  const version = useExtensionArca();
  const [copiando, setCopiando] = useState(false);
  /** Resultado del ping. `null` = todavía no se probó en esta sesión. */
  const [prueba, setPrueba] = useState<{ estado: EstadoExtension; version: string | null } | null>(null);
  const [probando, setProbando] = useState(false);

  const probar = async () => {
    setProbando(true);
    setPrueba(await probarExtension());
    setProbando(false);
  };
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState('');

  /**
   * Copiar el código para pegarlo en Tampermonkey.
   *
   * Es la vía PRINCIPAL, no un plan B. Chrome intercepta la navegación a cualquier `.user.js` y la
   * bloquea con "No es posible añadir aplicaciones, extensiones ni secuencias de comandos de usuario
   * desde este sitio web": la instalación con un click desde la app no es posible, y el link solo
   * lleva a ese cartel. Pegando el código en el editor de Tampermonkey no interviene Chrome.
   */
  const copiarScript = async () => {
    setCopiando(true);
    setError('');
    try {
      const res = await fetch(USERSCRIPT_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      await navigator.clipboard.writeText(await res.text());
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 4000);
    } catch {
      setError('No se pudo copiar. Abrí el archivo con el link de al lado y copiá el contenido a mano.');
    } finally {
      setCopiando(false);
    }
  };

  /*
   * El estado del medio: el script está instalado pero NO contesta.
   *
   * Es el más caro de los tres porque se parece al bueno —la marca está, la app dice "detectada"— y
   * sin embargo no va a arrancar nada. La causa concreta en Chrome es el permiso "Permitir scripts de
   * usuario", apagado por defecto, que no da ningún error: simplemente no pasa nada.
   */
  if (prueba?.estado === 'instalada_sin_responder') {
    return (
      <div className="rounded-lg border border-amber-300 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/20 px-3 py-2.5 space-y-1.5">
        <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          El script está instalado pero no responde
        </p>
        <p className="text-[11px] text-gray-700 dark:text-gray-300">
          Cargó, pero los eventos no llegan. En <code className="font-mono text-[10.5px]">chrome://extensions</code> → <strong>Tampermonkey</strong> → <em>Detalles</em>, activá{' '}
          <strong>Permitir scripts de usuario</strong>. Después recargá esta pantalla.
        </p>
        <button type="button" onClick={probar} disabled={probando} className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50">
          {probando ? 'Probando…' : 'Volver a probar'}
        </button>
      </div>
    );
  }

  // Instalada y respondiendo: una línea y nada más. Quien ya la tiene no necesita releer las
  // instrucciones, y dejarlas puestas convierte el aviso en ruido que se aprende a ignorar.
  if (version) {
    return (
      <p className="text-[11px] text-green-700 dark:text-green-400 flex items-center gap-1.5">
        <FontAwesomeIcon icon={prueba?.estado === 'activa' ? faCircleCheck : faPlug} className="h-3 w-3" />
        {prueba?.estado === 'activa' ? (
          <>Extensión activa (v{prueba.version || version}) — la validación corre sola.</>
        ) : (
          <>
            Extensión detectada (v{version}).
            <button type="button" onClick={probar} disabled={probando} className="font-semibold hover:underline disabled:opacity-50 ml-1">
              {probando ? 'Probando…' : 'Probar la extensión'}
            </button>
          </>
        )}
      </p>
    );
  }

  return (
    <div className={`rounded-lg border border-amber-300 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/20 ${compacto ? 'px-3 py-2.5' : 'p-3'} space-y-2`}>
      <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
        <FontAwesomeIcon icon={faPuzzlePiece} className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
        Requisito: extensión de validación
      </p>
      <p className="text-[11px] text-gray-700 dark:text-gray-300">
        Para traer las obras sociales desde ARCA automáticamente necesitás <strong>Tampermonkey</strong> con nuestro script. Se instala una vez. Sin él la validación es manual: copiar los CUIL, correrlos en
        ARCA y pegar el resultado.
      </p>

      {/* Instalar desde la URL es el camino BUENO, no el cómodo: así el script queda vinculado a su
          origen y Tampermonkey lo actualiza solo. Pegado a mano no tiene de dónde actualizarse y se
          queda en la versión del día que se pegó, mientras la app avanza. */}
      <ol className="text-[11px] text-gray-700 dark:text-gray-300 space-y-1.5 list-decimal pl-4">
        <li>
          Instalá <strong>Tampermonkey</strong> desde{' '}
          <a href={TAMPERMONKEY_URL} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 dark:text-blue-400 hover:underline">
            tampermonkey.net
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2.5 w-2.5 ml-1" />
          </a>
          .
        </li>
        <li>
          En Chrome, entrá a <code className="font-mono text-[10.5px]">chrome://extensions</code> → Tampermonkey → <strong>Detalles</strong> y prendé <strong>«Permitir secuencias de comandos del usuario»</strong>{' '}
          (y el <strong>Modo de desarrollador</strong>, arriba a la derecha). Sin eso queda instalada pero no ejecuta nada, y no siempre lo avisa —{' '}
          <a href="/arca/guia-obras-sociales#permiso-chrome" target="_blank" rel="noreferrer" className="font-semibold text-blue-700 dark:text-blue-400 hover:underline">
            ver el paso con detalle
          </a>
          .
        </li>
        <li>
          Abrí el script con <strong>Instalar el script</strong> (abajo): Tampermonkey muestra su pantalla de instalación y se aprieta <strong>Instalar</strong>. Instalado así <strong>se actualiza
          solo</strong> cuando publicamos una versión nueva.
        </li>
        <li>Volvé a esta pantalla y apretá «Probar la extensión»: tiene que decir «Extensión activa».</li>
      </ol>

      <div className="flex items-center gap-2 flex-wrap">
        <a href={USERSCRIPT_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700">
          Instalar el script
          <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2.5 w-2.5" />
        </a>
        {/* Copiar y pegar sobrevive como salida de emergencia, marcado como tal: si Tampermonkey no
            intercepta el archivo, es la única forma de instalarlo — pero así no se actualiza solo. */}
        <button
          type="button"
          onClick={copiarScript}
          disabled={copiando}
          title="Alternativa si Tampermonkey no abre su pantalla de instalación. Ojo: pegado a mano NO se actualiza solo."
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          <FontAwesomeIcon icon={copiando ? faSpinner : copiado ? faCheck : faCopy} spin={copiando} className="h-3 w-3" />
          {copiado ? 'Copiado' : '¿Problemas? Copiar y pegar'}
        </button>
        <button type="button" onClick={probar} disabled={probando} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
          <FontAwesomeIcon icon={probando ? faSpinner : faPlug} spin={probando} className="h-3 w-3" />
          {probando ? 'Probando…' : 'Probar la extensión'}
        </button>
        <span className="text-[11px] text-amber-700 dark:text-amber-400 inline-flex items-center gap-1.5">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5" />
          No detectada
        </span>
      </div>
      {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}

      {/* La pregunta de seguridad aparece sola en cuanto se menciona "extensión" y "clave fiscal" en
          la misma pantalla. Se contesta acá, antes de que haya que ir a preguntar. */}
      <p className="text-[10.5px] text-gray-500 dark:text-gray-400">
        La extensión corre en tu navegador y solo lee la obra social que ARCA ya muestra en Registrar Nuevas Altas. No guarda tu clave fiscal ni registra ninguna alta.
      </p>
    </div>
  );
};

/**
 * El estado de la extensión, en la barra de la grilla.
 *
 * Va donde está el botón de validar y no solo dentro del modal: si el operador se entera de que falta
 * algo recién cuando abre la pantalla de validación —o peor, cuando mandó la tanda y no pasó nada—,
 * el aviso llegó tarde. Se prueba solo al cargar (`useEstadoExtension`), así el estado es real y no
 * "cargó una vez".
 *
 * Los tres estados se ven distintos a propósito. El del medio —instalada pero muda— se parece al
 * bueno y sin embargo no funciona; darle el mismo color que a "activa" es lo que hace que alguien
 * pierda una tarde.
 */
export const ChipExtension: React.FC = () => {
  const { estado, version, disponible, probando, reintentar } = useEstadoExtension();
  const [abierto, setAbierto] = useState(false);

  const base = 'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold border transition-colors';

  if (probando) {
    return (
      <span className={`${base} bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700`}>
        <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" />
        Extensión…
      </span>
    );
  }

  const chip =
    estado === 'desactualizada' ? (
      /* Responde, pero con una versión vieja. Se ve igual que "funciona" y sin embargo le pueden
         faltar arreglos que la app ya da por hechos — el tope de 10 de ARCA, por ejemplo, que sin el
         arreglo pierde gente en silencio. Por eso tiene su propio color y su propia acción. */
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title={`Tenés la v${version} instalada y hay una v${disponible}. Click para actualizar.`}
        className={`${base} bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200/60 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/30`}
      >
        <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
        Extensión v{version} · hay v{disponible}
      </button>
    ) : estado === 'activa' ? (
      <span title={`Tampermonkey responde (v${version}). La validación de obras sociales corre sola.`} className={`${base} bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200/60 dark:border-green-800/60`}>
        <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" />
        Extensión activa
      </span>
    ) : (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title={
          estado === 'instalada_sin_responder'
            ? 'El script está instalado pero no responde: falta activar «Permitir secuencias de comandos del usuario». Click para ver cómo.'
            : 'Sin la extensión la validación de obras sociales es manual. Click para instalarla.'
        }
        className={`${base} bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200/60 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/30`}
      >
        <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
        {estado === 'instalada_sin_responder' ? 'Extensión sin permiso' : 'Extensión no instalada'}
      </button>
    );

  return (
    <>
      {chip}
      {abierto && (
        <Modal isOpen={abierto} onClose={() => setAbierto(false)} title="Extensión de validación" subtitle="Necesaria para traer las obras sociales desde ARCA automáticamente" size="lg" zIndex={80}>
          <div className="space-y-3">
            {estado === 'desactualizada' && (
              <div className="rounded-lg border border-amber-300 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/20 px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  Tenés la v{version} y hay una v{disponible}.
                </p>
                <p className="mt-1">
                  Si lo instalaste <strong>pegándolo a mano</strong>, no tiene de dónde actualizarse y se va a quedar ahí para siempre. Reinstalalo desde el link —así queda vinculado al origen y
                  Tampermonkey lo actualiza solo—, o abrí el panel de Tampermonkey → <em>Buscar actualizaciones</em>.
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <a href={USERSCRIPT_URL} target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                    Instalar la v{disponible}
                  </a>
                  <button type="button" onClick={reintentar} className="text-[12px] font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                    Ya actualicé — volver a probar
                  </button>
                </div>
              </div>
            )}
            {estado === 'instalada_sin_responder' && (
              <div className="rounded-lg border border-amber-300 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/20 px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                <p className="font-semibold text-gray-900 dark:text-gray-100">Está instalada, pero no responde.</p>
                <p className="mt-1">
                  Falta un permiso. Entrá a <code className="font-mono text-[12.5px]">chrome://extensions</code> → <strong>Tampermonkey</strong> → <em>Detalles</em> y activá{' '}
                  <strong>«Permitir secuencias de comandos del usuario»</strong>. Después recargá esta pantalla.
                </p>
                <button type="button" onClick={reintentar} className="text-[12px] font-semibold text-blue-600 dark:text-blue-400 hover:underline mt-2">
                  Ya lo activé — volver a probar
                </button>
              </div>
            )}
            {/* El bloque de instalación solo cuando falta instalarla. Con el script ya puesto diría
                "detectada" justo debajo del cartel que explica que no responde — dos mensajes que se
                contradicen sobre la misma cosa. */}
            {estado === 'ausente' && <RequisitoExtension />}
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Los dos requisitos son <strong>independientes</strong>: tener Tampermonkey instalado, y que ese script tenga permitido ejecutarse. El segundo viene apagado por defecto y no da ningún error —
              simplemente no pasa nada.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
};
