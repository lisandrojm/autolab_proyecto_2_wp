import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShieldHeart, faArrowRight, faTriangleExclamation, faBan } from '@fortawesome/free-solid-svg-icons';
import { PageLayout } from '../components/ui/PageLayout';
import { RequisitoExtension } from '../components/contratos/RequisitoExtension';

/**
 * Guía de la validación de obras sociales contra ARCA.
 *
 * Es una página hermana de "Cómo funciona" y no una sección suya: aquella explica la cadena de
 * dependencias del alta masiva y el registro de 130 completo; esta explica UN campo —el RNOS, pos.
 * 40-45— y el único trámite del módulo que sale de la app y necesita una extensión del navegador.
 * Mezclarlas obligaría a leer la cadena entera para entender por qué falta un permiso de Chrome.
 *
 * Se lee una vez y se vuelve cuando algo falla; por eso el troubleshooting de la sección 6 son los
 * síntomas que efectivamente ocurrieron, no casos hipotéticos.
 *
 * El estado de la extensión se muestra EN VIVO (`RequisitoExtension`), con el mismo indicador de tres
 * estados que la pantalla de validación: una guía que dice "instalá la extensión" a quien ya la tiene
 * —o que asegura que está lista cuando el permiso falta— deja de ser confiable para todo lo demás.
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

      <Seccion n={2} titulo="Preparación — se hace una sola vez">
        <p>
          La validación automática necesita una extensión en tu navegador. ARCA no tiene una API que devuelva la obra social, así que el dato se lee de la pantalla del organismo, en tu propia sesión.
        </p>

        {/* El estado real, acá y no solo en la pantalla de validación: es donde alguien llega cuando
            algo no anda, y lo primero que necesita saber es en cuál de los tres estados está. */}
        <RequisitoExtension compacto />

        <ol className="space-y-4 mt-2">
          <Paso n={1} titulo={<>Instalá Tampermonkey desde <Cod>tampermonkey.net</Cod></>}>
            Es la extensión que permite que WeProdu y ARCA se pasen datos. Sin ella no hay puente: son dos sitios distintos y el navegador no deja que uno lea al otro.
          </Paso>
          <Paso n={2} id="permiso-chrome" titulo={<>Activá el permiso en Chrome</>}>
            Entrá a <Cod>chrome://extensions</Cod> → Tampermonkey → <strong>Detalles</strong>, y prendé <strong>«Permitir secuencias de comandos del usuario»</strong>. Sin este permiso la extensión queda
            instalada pero <strong>no ejecuta nada</strong>, y no siempre lo avisa.
          </Paso>
          <Paso n={3} titulo="Instalá el script de WeProdu">
            Desde el botón «Copiar el script» del bloque de arriba: se pega en Tampermonkey → <em>Crear un nuevo script</em> → guardar. Chrome bloquea la instalación directa de un <Cod>.user.js</Cod> desde
            cualquier sitio, así que copiar y pegar es el camino, no un rodeo.
          </Paso>
          <Paso n={4} titulo="Probalo">
            Apretá <strong>«Probar la extensión»</strong>: tiene que decir <strong>«Extensión activa»</strong> en verde. Si dice que está instalada pero no responde, falta el permiso del paso 2.
          </Paso>
        </ol>
      </Seccion>

      <Seccion n={3} titulo="El circuito, por tanda">
        <div className="flex items-center gap-2 flex-wrap text-[13px] my-1">
          {['Asignar empleadora', 'Validar obras sociales', 'Login en ARCA', 'El script corre solo', 'Generar TXT'].map((paso, i, arr) => (
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
          Apretás <strong>«Validar obras sociales»</strong>. WeProdu junta los CUIL pendientes de esa empleadora y abre ARCA.
        </p>
        <Clave>
          <strong>Tu único paso manual es el login.</strong> Entrás con clave fiscal y de ahí en adelante va solo: elige el CUIT de la empleadora, entra al servicio, va a{" "}
          <strong>Relaciones Laborales → Registrar Nuevas Altas</strong>, carga cada CUIL, lee la obra social que ARCA precompleta y sigue con el siguiente. No toques nada mientras corre.
        </Clave>
        <p>
          Tu clave fiscal <strong>no se guarda en ningún lado</strong>. El script trabaja dentro de la sesión que abriste vos; por eso el login es manual y no se puede saltear.
        </p>

        <p className="font-semibold text-gray-900 dark:text-gray-100 pt-1">Los resultados vuelven solos</p>
        <p>Al terminar, cada obra social queda cargada en su contrato, con fecha, y deja de figurar como pendiente.</p>
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
        <Sintoma q="Dice «No detectada»">
          El script no está instalado, o Tampermonkey no lo está ejecutando. Revisá el paso 2 de la preparación: el permiso <strong>«Permitir secuencias de comandos del usuario»</strong> es el que más se pasa por
          alto.
        </Sintoma>
        <Sintoma q="Dice «instalada pero no responde»">El script cargó pero no puede comunicarse. Casi siempre es el mismo permiso. Prendelo, recargá la página y probá de nuevo.</Sintoma>
        <Sintoma q="Se abre ARCA y no arranca solo">
          El script se muestra en cada pantalla del recorrido y dice qué falta: leé el cartelito de abajo a la derecha. Los dos casos más comunes son que todavía no hayas entrado con clave fiscal, o
          que <strong>tu clave no tenga acceso al CUIT de esa empleadora</strong> —ahí lo dice con todas las letras y hay que pedir la delegación—.
        </Sintoma>
        <Sintoma q="¿El script puede dar de alta a alguien por error?">
          No. El único botón que aprieta en ARCA es el <strong>«Aceptar» del selector de CUIT</strong>, que solo define bajo qué empresa se opera y es reversible. El «Aceptar» de la pantalla de altas —el
          que registra ante el organismo— no lo toca nunca: las altas salen del TXT, no de ahí.
        </Sintoma>
        <Sintoma q="Prefiero no instalar nada">
          Se puede: copiás los CUIL desde WeProdu, los cargás en ARCA a mano y pegás el resultado en la caja de la pantalla de validación. Es más tedioso pero hace exactamente lo mismo, y siempre está disponible.
        </Sintoma>
        <Sintoma q="Una obra social quedó mal">
          Se corrige con <strong>«Re-validar»</strong>, que repite la consulta. Los valores validados no se editan a mano a propósito: el número tiene que venir del organismo.
        </Sintoma>
      </Seccion>
    </div>
  </PageLayout>
);

export default GuiaObrasSocialesPage;
