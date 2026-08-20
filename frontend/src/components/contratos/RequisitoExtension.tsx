import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUpRightFromSquare, faCircleCheck, faTriangleExclamation, faPuzzlePiece, faCopy, faCheck, faSpinner, faPlug, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
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
      /* Con nombre: "Extensión activa" no dice CUÁL, y el operador que quiere revisarla no sabe qué
         buscar en chrome://extensions. El ⓘ abre la explicación completa. */
      <span className={`${base} bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200/60 dark:border-green-800/60`}>
        <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" />
        Tampermonkey activa (v{version})
        <button type="button" onClick={() => setAbierto(true)} title="Qué es, qué hace y qué no hace" className="text-green-700/70 dark:text-green-400/70 hover:text-green-800 dark:hover:text-green-300">
          <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
        </button>
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
        {estado === 'instalada_sin_responder' ? 'Tampermonkey sin permiso' : 'Tampermonkey no instalada'}
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

            <QueEsLaExtension estado={estado} version={version} />
          </div>
        </Modal>
      )}
    </>
  );
};

/**
 * Qué es la extensión, qué hace y qué no. Todo en un lugar.
 *
 * Se pregunta siempre lo mismo y en este orden: por qué hace falta instalar algo, qué va a hacer en
 * mi navegador, y si toca mi clave fiscal. Contestarlo acá evita que cada operador tenga que
 * preguntarlo — y que alguien decida no instalarla por una duda que se responde en tres líneas.
 */
const QueEsLaExtension: React.FC<{ estado: EstadoExtension; version: string | null }> = ({ estado, version }) => (
  <div className="space-y-3 text-[13px] text-gray-700 dark:text-gray-300 leading-relaxed">
    <div>
      <p className="font-semibold text-gray-900 dark:text-gray-100">Qué es</p>
      <p>
        <strong>Tampermonkey</strong> es una extensión de navegador que ejecuta pequeños programas en las páginas que vos abrís. Nosotros le damos uno —el <em>userscript</em> de WeProdu— que hace de puente
        entre esta app y la pantalla de ARCA.
      </p>
    </div>

    <div>
      <p className="font-semibold text-gray-900 dark:text-gray-100">Por qué hace falta</p>
      <p>
        La obra social que ARCA tiene registrada para un CUIL <strong>no la devuelve ninguna API</strong>: el único webservice conectado trae datos del contribuyente, no la obra social de un trabajador. El
        dato solo aparece precompletado en la pantalla de altas del organismo. WeProdu y ARCA son dos sitios distintos y el navegador no deja que uno lea al otro — la extensión es lo único que puede
        estar en los dos lados y pasar los datos.
      </p>
    </div>

    <div>
      <p className="font-semibold text-gray-900 dark:text-gray-100">Qué hace exactamente</p>
      <ul className="list-disc pl-5 space-y-0.5 mt-0.5">
        <li>En WeProdu: recibe la lista de CUIL a validar. Nada más.</li>
        <li>En ARCA, en <em>Registrar Nuevas Altas</em>: escribe cada CUIL, aprieta <strong>Agregar</strong> y lee la obra social que el organismo precompleta.</li>
        <li>Trabaja en tandas de 10 —el máximo que ARCA acepta— y usa <strong>Reiniciar</strong> entre tandas, que vacía la grilla sin registrar nada.</li>
        <li>Al terminar deja la pantalla de ARCA vacía y devuelve los resultados a WeProdu, que los guarda.</li>
      </ul>
    </div>

    <div className="rounded-lg border border-red-300 dark:border-red-800/70 bg-red-50/70 dark:bg-red-950/20 px-3 py-2.5">
      <p className="font-semibold text-gray-900 dark:text-gray-100">Qué NO hace</p>
      <ul className="list-disc pl-5 space-y-0.5 mt-0.5">
        <li>
          <strong>No registra ninguna alta.</strong> Nunca aprieta «Aceptar»: los únicos dos botones que puede tocar son <em>Agregar</em> y <em>Reiniciar</em>, buscados por su rótulo exacto. Las altas
          salen del TXT.
        </li>
        <li>
          <strong>No guarda ni ve tu clave fiscal.</strong> Trabaja dentro de la sesión que abriste vos; por eso el login es manual y no se puede saltear. Esa es la garantía, no una limitación pendiente.
        </li>
        <li>
          <strong>No manda nada a ningún lado.</strong> Solo habla entre esta app y ARCA, en tu navegador.
        </li>
        <li>
          <strong>No corre en otros sitios.</strong> Solo en WeProdu y en la pantalla de altas de ARCA (ver <code className="font-mono text-[12px]">@match</code> en la cabecera del script, que podés leer
          entero).
        </li>
      </ul>
    </div>

    <div>
      <p className="font-semibold text-gray-900 dark:text-gray-100">Si algo falla</p>
      <p>
        La corrida frena y avisa; nunca marca a alguien como «sin obra social» por una falla. Si se vence la sesión de ARCA, retoma sola después del relogin. Si un CUIL no se puede consultar, queda
        pendiente en vez de darse por hecho.
      </p>
    </div>

    <p className="text-[12px] text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-200 dark:border-gray-800">
      Estado actual: <strong>{estado === 'activa' ? `activa, v${version}` : estado === 'desactualizada' ? `v${version} instalada (hay una más nueva)` : estado === 'instalada_sin_responder' ? 'instalada pero sin permiso para ejecutarse' : 'no instalada'}</strong>.{' '}
      <a href="/arca/guia-obras-sociales" target="_blank" rel="noreferrer" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
        Guía completa de la validación →
      </a>
    </p>
  </div>
);
