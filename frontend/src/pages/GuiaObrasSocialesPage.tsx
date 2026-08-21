import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShieldHeart, faArrowRight, faTriangleExclamation, faBan } from '@fortawesome/free-solid-svg-icons';
import { PageLayout } from '../components/ui/PageLayout';

/**
 * Guía de la validación de obras sociales contra ARCA.
 *
 * Es una página hermana de "Cómo funciona" y no una sección suya: aquella explica la cadena de
 * dependencias del alta masiva y el registro de 130 completo; esta explica UN campo —el RNOS, pos.
 * 40-45— y el único trámite del módulo que sale de la app y se opera contra la web del organismo.
 * Mezclarlas obligaría a leer la cadena entera para entender por qué hay que abrir Chrome de otra
 * forma.
 *
 * Se lee una vez y se vuelve cuando algo falla; por eso el troubleshooting de la sección 6 son los
 * síntomas que efectivamente ocurrieron, no casos hipotéticos.
 */

const Seccion: React.FC<{ n: number; titulo: string; children: React.ReactNode }> = ({ n, titulo, children }) => (
  <section className="border-t border-gray-200 dark:border-gray-800 pt-5 mt-8 first:border-t-0 first:mt-0 first:pt-0">
    <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
      {n} · {titulo}
    </h2>
    <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{children}</div>
  </section>
);

/** Lo que hay que retener sí o sí. Se destaca poco y a propósito: si todo resalta, nada resalta. */
const Clave: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-lg border border-blue-300 dark:border-blue-800/70 bg-blue-50/70 dark:bg-blue-950/30 px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{children}</div>
);

const Aviso: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-lg border border-amber-300 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/20 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 flex items-start gap-2.5">
    <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 mt-1 shrink-0 text-amber-600 dark:text-amber-400" />
    <span>{children}</span>
  </div>
);

const Prohibido: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-lg border border-red-300 dark:border-red-800/70 bg-red-50/70 dark:bg-red-950/20 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 flex items-start gap-2.5">
    <FontAwesomeIcon icon={faBan} className="h-3.5 w-3.5 mt-1 shrink-0 text-red-600 dark:text-red-400" />
    <span>{children}</span>
  </div>
);

const Paso: React.FC<{ n: number; titulo: React.ReactNode; children: React.ReactNode; id?: string }> = ({ n, titulo, children, id }) => (
  <li id={id} className="relative pl-10 scroll-mt-24">
    <span className="absolute left-0 top-0 h-6 w-6 rounded-full bg-blue-600 text-white text-[12px] font-semibold flex items-center justify-center">{n}</span>
    <p className="font-semibold text-gray-900 dark:text-gray-100">{titulo}</p>
    <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-0.5">{children}</p>
  </li>
);

const Cod: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <code className="font-mono text-[12.5px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-blue-700 dark:text-blue-300">{children}</code>
);

const Sintoma: React.FC<{ q: string; children: React.ReactNode }> = ({ q, children }) => (
  <div>
    <p className="font-semibold text-gray-900 dark:text-gray-100 mt-4">{q}</p>
    <p className="text-[13.5px] text-gray-500 dark:text-gray-400">{children}</p>
  </div>
);

export const GuiaObrasSocialesPage: React.FC = () => (
  <PageLayout title="ARCA | Validación de obras sociales" subtitle="Cómo se confirma contra ARCA qué obra social le corresponde a cada persona, antes de generar el archivo de altas" faIcon={{ icon: faShieldHeart }}>
    <div className="max-w-3xl space-y-1">
      <Seccion n={1} titulo="Por qué existe este paso">
        <p>
          En el archivo de altas masivas, la obra social ocupa las <strong>posiciones 40 a 45</strong> de cada registro. Es el dato que define <strong>a dónde se derivan los aportes</strong> de esa persona.
        </p>
        <Clave>
          <strong>La norma dice qué hay que declarar:</strong> el código de la obra social <strong>escogida por el trabajador</strong>, o —si no ejerció la opción— <strong>la que corresponde a la actividad</strong>{' '}
          (la del convenio).
        </Clave>
        <p>
          <strong>ARCA no corrige lo que declarás.</strong> Es una declaración jurada: lo que mandás queda como lo mandaste. Tanto es así que, si la persona cambia de obra social después del alta, la norma te
          obliga a informar la modificación — si el organismo lo arreglara solo, esa obligación no existiría.
        </p>
        <Aviso>
          <strong>Qué pasa si se declara mal.</strong> Los aportes se derivan a la obra social equivocada. La que la persona realmente eligió no recibe los fondos, y puede quedarse sin cobertura. Corregirlo
          después implica una rectificativa.
        </Aviso>
        <p>
          Por eso WeProdu valida cada CUIL contra ARCA <strong>antes</strong> de armar el archivo: para declarar el número real y no un supuesto.
        </p>
      </Seccion>

      <Seccion n={2} titulo="Preparación — cada vez que vas a validar">
        <p>
          ARCA no tiene una API que devuelva la obra social de un trabajador: el dato solo existe en la pantalla del organismo, dentro de tu sesión. Así que hay que leerlo de ahí. Lo hace un script que
          se conecta a <strong>tu propio Chrome</strong>, ya abierto y logueado — no instala nada en el navegador.
        </p>

        <ol className="space-y-4 mt-2">
          <Paso n={1} titulo="Cerrá Chrome por completo">
            No alcanza con cerrar la ventana: tiene que salir del todo, porque el puerto de depuración se abre al arrancar el proceso.
          </Paso>
          <Paso n={2} titulo="Abrilo con el puerto de depuración">
            <span className="block mt-1">
              macOS: <Cod>open -a "Google Chrome" --args --remote-debugging-port=9222</Cod>
            </span>
            <span className="block mt-1">
              Windows: <Cod>chrome.exe --remote-debugging-port=9222</Cod>
            </span>
          </Paso>
          <Paso n={3} titulo="Entrá a ARCA y dejá abierta la pantalla de altas">
            Clave fiscal → <strong>Simplificación Registral - Empleadores</strong> → elegí el CUIT de la empleadora → <strong>Relaciones Laborales → Registrar Nuevas Altas</strong>. Elegir el CUIT no es
            opcional: es lo que inicia la «sesión de trabajo», y sin ese paso ARCA rechaza la pantalla de altas aunque estés logueado.
          </Paso>
          <Paso n={4} titulo={<>Corré <Cod>npm run validar-obras-sociales</Cod></>}>
            Con los CUIL a validar: <Cod>-- --cuils cuils.txt</Cod>. Devuelve un <Cod>CUIL,RNOS</Cod> por línea, que se pega en el panel «Constatar obras sociales» de WeProdu.
          </Paso>
        </ol>

        <Aviso>
          Mientras Chrome esté abierto con <Cod>--remote-debugging-port</Cod>, <strong>cualquier programa que corra en tu máquina puede controlarlo</strong>: leer tus pestañas, tu sesión de ARCA, todo.
          Usalo solo mientras dure la validación y después volvé a abrir Chrome normal. Es la contrapartida honesta de no instalar una extensión.
        </Aviso>

        <p>
          El script <strong>nunca pide ni guarda tu clave fiscal</strong>: se cuelga de la sesión que abriste vos. Si la pantalla no está lista, te dice qué falta y termina — no reintenta ni adivina.
        </p>

        <p className="text-[13px] text-gray-500 dark:text-gray-400">
          Antes esto se hacía con una extensión de navegador (Tampermonkey). Se abandonó: sus fallas eran todas del mecanismo y no del trámite — el sandbox de la extensión, un permiso de Chrome apagado
          por defecto, versiones que había que reinstalar a mano, copias duplicadas pisándose entre ellas. Nada de eso existe conectándose al Chrome que ya está abierto.
        </p>
      </Seccion>

      <Seccion n={3} titulo="El circuito, por tanda">
        <div className="flex items-center gap-2 flex-wrap text-[13px] my-1">
          {['Asignar empleadora', 'Copiar los CUIL', 'Login en ARCA', 'Correr el script', 'Pegar el resultado', 'Generar TXT'].map((paso, i, arr) => (
            <React.Fragment key={paso}>
              <span className={`px-3 py-2 rounded-lg border ${i === 1 ? 'border-blue-400 dark:border-blue-600 text-blue-700 dark:text-blue-300' : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}>
                {paso}
              </span>
              {i < arr.length - 1 && <FontAwesomeIcon icon={faArrowRight} className="h-2.5 w-2.5 text-gray-400" />}
            </React.Fragment>
          ))}
        </div>

        <p className="font-semibold text-gray-900 dark:text-gray-100 pt-1">Asignar la empleadora</p>
        <p>
          Cada contrato tiene que tener su <strong>Empresa Contrato</strong> elegida. La obra social se valida contra el CUIT que la declara, así que <strong>una tanda es siempre de una sola empleadora</strong>.
          Los contratos sin empresa no entran.
        </p>

        <p className="font-semibold text-gray-900 dark:text-gray-100 pt-1">Validar</p>
        <p>
          Apretás <strong>«Validar obras sociales»</strong>: WeProdu junta los CUIL pendientes de esa empleadora y te los deja para copiar. Con eso corrés el script (sección 2), que los carga en ARCA de
          a 10 —el máximo que el organismo acepta—, lee la obra social que precompleta cada fila y deja la pantalla vacía al terminar.
        </p>
        <Clave>
          <strong>El script solo lee.</strong> Los únicos botones que aprieta en la pantalla de altas son <strong>Agregar</strong> y <strong>Reiniciar</strong>. <strong>Nunca «Aceptar»</strong>, que es el
          que registra las altas ante el organismo: esas salen del TXT, no de acá.
        </Clave>

        <p className="font-semibold text-gray-900 dark:text-gray-100 pt-1">Pegar el resultado</p>
        <p>
          El script devuelve <Cod>CUIL,RNOS</Cod> por línea. Eso se pega en el panel <strong>«Constatar obras sociales»</strong>, que antes de guardar te muestra la previsualización y valida que cada
          obra social esté entre las que la empleadora tiene registradas ante ARCA. Recién ahí queda cargada en cada contrato, con fecha, y deja de figurar como pendiente.
        </p>
      </Seccion>

      <Seccion n={4} titulo="Los tres estados">
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/60">
              <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="text-left px-3 py-2">Estado</th>
                <th className="text-left px-3 py-2">Qué significa</th>
                <th className="text-left px-3 py-2">Qué se declara en el TXT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              <tr>
                <td className="px-3 py-2.5 align-top">
                  <span className="text-[11px] px-2 py-0.5 rounded-full border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 whitespace-nowrap">sin validar</span>
                </td>
                <td className="px-3 py-2.5 align-top text-gray-700 dark:text-gray-300">Nadie consultó todavía qué obra social tiene esta persona.</td>
                <td className="px-3 py-2.5 align-top text-gray-700 dark:text-gray-300">
                  Nada — este contrato <strong>no entra</strong> al archivo.
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2.5 align-top">
                  <span className="text-[11px] px-2 py-0.5 rounded-full border border-green-300 dark:border-green-800 text-green-700 dark:text-green-400 whitespace-nowrap">validada</span>
                </td>
                <td className="px-3 py-2.5 align-top text-gray-700 dark:text-gray-300">ARCA devolvió una obra social propia: la persona ejerció la opción.</td>
                <td className="px-3 py-2.5 align-top text-gray-700 dark:text-gray-300">
                  <strong>Esa</strong> obra social. Queda fija.
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2.5 align-top">
                  <span className="text-[11px] px-2 py-0.5 rounded-full border border-green-300 dark:border-green-800 text-green-700 dark:text-green-400 whitespace-nowrap">validada · del convenio</span>
                </td>
                <td className="px-3 py-2.5 align-top text-gray-700 dark:text-gray-300">ARCA no tiene afiliación registrada para esta persona.</td>
                <td className="px-3 py-2.5 align-top text-gray-700 dark:text-gray-300">
                  La <strong>del convenio</strong>. También es una validación completa.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <Clave>
          <strong>Que ARCA no devuelva nada es una respuesta, no un error.</strong> Significa que esa persona no eligió otra obra social, así que le corresponde la del convenio. Se registra con fecha y no vuelve
          a pedirse.
        </Clave>
      </Seccion>

      <Seccion n={5} titulo="Reglas que no se rompen">
        <Prohibido>
          <strong>Nunca apretar «Aceptar» en ARCA.</strong> Esa pantalla se usa <strong>solo para leer</strong> la obra social. Si la confirmás, estás registrando altas por duplicado y por fuera del archivo. Las
          altas salen del TXT, no de ahí.
        </Prohibido>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
          <strong className="text-gray-900 dark:text-gray-100">Una tanda, una empleadora.</strong> La obra social se valida contra el CUIT que la declara. Mezclar dos empresas en la misma tanda da resultados que
          no significan nada.
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
          <strong className="text-gray-900 dark:text-gray-100">Si se vence la sesión de ARCA, no pasa nada.</strong> El script frena, te avisa cuántos faltan y <strong>no marca a nadie como «sin obra
          social»</strong>. Volvés a loguearte, reabrís la pantalla y sigue desde donde iba.
        </div>
      </Seccion>

      <Seccion n={6} titulo="Si algo no funciona">
        <Sintoma q="«No pude conectarme a Chrome»">
          Chrome no está corriendo con el puerto de depuración. Cerralo <strong>del todo</strong> —no solo la ventana— y volvé a abrirlo con el comando del paso 2. Si lo abriste normal y después ejecutaste
          el comando, no alcanza: el puerto se abre al arrancar el proceso.
        </Sintoma>
        <Sintoma q="«No encontré ninguna pestaña de ARCA»">
          Chrome está en modo depuración pero falta la pestaña. Entrá a Simplificación Registral y dejá abierta <strong>Registrar Nuevas Altas</strong>.
        </Sintoma>
        <Sintoma q="«La sesión de ARCA no está activa»">
          O no entraste con clave fiscal, o falta elegir el CUIT de la empleadora — ese paso es el que inicia la «sesión de trabajo». Si tu clave no tiene acceso a ese CUIT, hay que pedir la delegación.
        </Sintoma>
        <Sintoma q="¿El script puede dar de alta a alguien por error?">
          No. En la pantalla de altas aprieta <strong>únicamente</strong> «Agregar» y «Reiniciar». El «Aceptar» —el que registra ante el organismo— no lo toca nunca, y los botones se buscan por su texto
          exacto, jamás por posición. Las altas salen del TXT, no de ahí.
        </Sintoma>
        <Sintoma q="Prefiero no abrir Chrome de otra forma">
          Se puede: copiás los CUIL desde WeProdu, los cargás en ARCA a mano y pegás el resultado en la misma caja donde va la salida del script. Es más tedioso pero hace exactamente lo mismo, y siempre
          está disponible.
        </Sintoma>
        <Sintoma q="Una obra social quedó mal">
          Se corrige con <strong>«Re-validar»</strong>, que repite la consulta. Los valores validados no se editan a mano a propósito: el número tiene que venir del organismo.
        </Sintoma>
      </Seccion>
    </div>
  </PageLayout>
);

export default GuiaObrasSocialesPage;
