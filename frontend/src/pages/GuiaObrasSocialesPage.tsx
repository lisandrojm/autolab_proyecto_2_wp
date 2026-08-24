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

/**
 * El menú contextual de macOS, dibujado.
 *
 * Va dibujado y no como captura de pantalla porque una imagen de macOS envejece con cada versión del
 * sistema y termina mostrando un menú que ya no se parece al que la persona tiene delante. Lo que
 * tiene que quedar claro es UNA cosa —hay que usar el botón derecho y elegir «Abrir»— y para eso el
 * dibujo alcanza y siempre va a estar actualizado.
 */
const MenuMac: React.FC = () => (
  <div className="shrink-0 w-44 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-sm overflow-hidden text-[12px] select-none">
    <div className="px-3 py-1.5 text-gray-400 dark:text-gray-500">Abrir con</div>
    <div className="px-3 py-1.5 bg-blue-600 text-white font-semibold flex items-center justify-between">
      Abrir
      <FontAwesomeIcon icon={faArrowRight} className="h-2.5 w-2.5" />
    </div>
    <div className="px-3 py-1.5 text-gray-400 dark:text-gray-500">Mover a la papelera</div>
    <div className="px-3 py-1.5 text-gray-400 dark:text-gray-500">Obtener información</div>
  </div>
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

      {/*
        Esta sección existe por un motivo medible: el ejecutable no está firmado, así que la PRIMERA
        vez los dos sistemas lo bloquean con un cartel que parece decir «este programa es peligroso».
        Sin este paso escrito, la persona lo borra y abandona la instalación ahí — y desde WeProdu
        eso se ve idéntico a «no lo descargó»: el Asistente simplemente nunca aparece.
      */}
      <Seccion n={2} titulo="Instalar el Asistente — se hace una sola vez">
        <p>
          El Asistente es el programa que corre en <strong>tu</strong> máquina y le deja a WeProdu abrir el Chrome de ARCA con un botón. Se descarga desde la pantalla de validación, se ejecuta, y{' '}
          <strong>se empareja solo</strong>: abre WeProdu en el navegador y queda conectado. No hay ningún código que copiar.
        </p>

        <Aviso>
          <strong>La primera vez el sistema lo va a bloquear.</strong> El ejecutable no está firmado con un certificado de desarrollador, y tanto macOS como Windows tratan a todo lo que no esté firmado
          igual: cartel de advertencia y nada más. No es un aviso sobre este programa en particular — es el aviso por defecto para cualquier programa sin certificado.
        </Aviso>

        <ol className="space-y-4 mt-2">
          <Paso n={1} titulo="Descargalo desde la pantalla de validación">
            Elegí tu sistema. En Mac hay dos: <strong>Apple Silicon</strong> (M1 en adelante) e <strong>Intel</strong>. Si elegís el que no es, no arranca y dice «bad CPU type»; en ese caso bajá el otro.
            Lo mirás en <strong></strong> → Acerca de esta Mac.
          </Paso>

          <Paso n={2} titulo="Mac: click derecho sobre el archivo → Abrir → Abrir">
            <span className="block">
              Descomprimí el .zip y vas a tener <Cod>AsistenteWeProdu.command</Cod>. <strong>Con doble click no alcanza</strong>: macOS lo bloquea y solo ofrece «Mover a la papelera». Con el botón
              derecho aparece «Abrir», y esa vía sí deja la opción de abrirlo igual. Se hace una vez: después el doble click funciona siempre.
            </span>
            <span className="mt-3 flex items-start gap-3 flex-wrap">
              <MenuMac />
              <span className="text-[12.5px] text-gray-500 dark:text-gray-400 max-w-xs">
                Botón derecho sobre el archivo → <strong>Abrir</strong>. En el cartel que sale después, otra vez <strong>Abrir</strong>.
              </span>
            </span>
          </Paso>

          <Paso n={3} titulo="Windows: Más información → Ejecutar de todas formas">
            SmartScreen muestra «Windows protegió su PC» y un solo botón visible, <strong>No ejecutar</strong>. El link <strong>Más información</strong> —arriba, en letra chica— revela el botón{' '}
            <strong>Ejecutar de todas formas</strong>. También se hace una vez.
          </Paso>

          <Paso n={4} titulo="Listo: se abre WeProdu solo y queda conectado">
            Se abre una ventana negra de consola —dejala abierta, es el Asistente corriendo— y el navegador va a WeProdu. La pantalla de validación pasa a decir{' '}
            <strong>Asistente conectado</strong>. Si el navegador no se abrió, entrá a <Cod>127.0.0.1:47653/emparejar</Cod>: ahí está el código para pegarlo a mano.
          </Paso>
        </ol>

        <Clave>
          <strong>El emparejamiento es por navegador y de una sola vez.</strong> Si después usás WeProdu desde otro navegador o borrás los datos del sitio, hay que volver a emparejar — y ahí sirve{' '}
          <Cod>127.0.0.1:47653/emparejar</Cod>, que es la única dirección del Asistente que no pide el código, justamente porque es de donde se saca.
        </Clave>
      </Seccion>

      <Seccion n={3} titulo="Preparación — cada vez que vas a validar">
        <p>
          ARCA no tiene una API que devuelva la obra social de un trabajador: el dato solo existe en la pantalla del organismo, dentro de tu sesión. Así que hay que leerlo de ahí. Lo hace un script que
          se conecta a <strong>tu propio Chrome</strong>, ya abierto y logueado — no instala nada en el navegador.
        </p>

        <ol className="space-y-4 mt-2">
          <Paso n={1} titulo={<>Levantá el Chrome de ARCA: <Cod>npm run chrome-arca</Cod></>}>
            Desde <Cod>frontend/</Cod>. Abre un Chrome <strong>aparte</strong>, con su propio perfil y el puerto de depuración. No cierres el que estás usando: son dos ventanas independientes.
          </Paso>
          <Paso n={2} titulo="Entrá a ARCA y dejá abierta la pantalla de altas">
            En <strong>esa</strong> ventana: clave fiscal → <strong>Simplificación Registral - Empleadores</strong> → elegí el CUIT de la empleadora → <strong>Relaciones Laborales → Registrar Nuevas
            Altas</strong>. Elegir el CUIT no es opcional: es lo que inicia la «sesión de trabajo», y sin ese paso ARCA rechaza la pantalla de altas aunque estés logueado.
          </Paso>
          <Paso n={3} titulo={<>Corré <Cod>npm run validar-obras-sociales -- --empresa &lt;id&gt;</Cod></>}>
            Toma los pendientes de esa empleadora, los consulta en ARCA de a 10 y guarda el resultado. No hay archivo que bajar ni nada que pegar. Con <Cod>--dry-run</Cod> muestra exactamente qué
            aplicaría y no escribe nada.
          </Paso>
        </ol>

        <Clave>
          {/* Es la diferencia práctica más grande del rediseño y conviene decirla explícita: el login
              deja de ser un peaje por corrida. */}
          <strong>El perfil queda guardado, así que la sesión de ARCA dura días.</strong> El login deja de ser «cada corrida» y pasa a ser «cada tanto». Si la sesión no está, el script te abre el login,
          te dice qué falta y espera hasta 5 minutos a que entres — después sigue solo.
        </Clave>

        <Aviso>
          Mientras ese Chrome esté abierto, <strong>cualquier programa que corra en tu máquina puede controlarlo</strong>. Como usa un <strong>perfil aparte</strong>, el alcance se limita a esa ventana:
          tu mail, tu banco y el resto de tus pestañas —que viven en tu Chrome de siempre— quedan afuera. Igual, cerralo cuando termines. Es la contrapartida honesta de no instalar una extensión.
        </Aviso>

        <p>
          El script <strong>nunca pide ni guarda tu clave fiscal</strong>: se cuelga de la sesión que abriste vos. Si la pantalla no está lista, te dice qué falta y termina — no reintenta ni adivina.
        </p>

        <p className="text-[13px] text-gray-500 dark:text-gray-400">
          Antes esto se hacía con una extensión de navegador (Tampermonkey). Se abandonó: sus fallas eran todas del mecanismo y no del trámite — el sandbox de la extensión, un permiso de Chrome apagado
          por defecto, versiones que había que reinstalar a mano, copias duplicadas pisándose entre ellas. Nada de eso existe conectándose a un Chrome común.
        </p>
      </Seccion>

      <Seccion n={4} titulo="El circuito, por tanda">
        <div className="flex items-center gap-2 flex-wrap text-[13px] my-1">
          {['Asignar empleadora', 'Login en ARCA', 'Correr el script', 'Generar TXT'].map((paso, i, arr) => (
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
          El script le pide a WeProdu los pendientes de esa empleadora, los carga en ARCA de a 10 —el máximo que el organismo acepta—, lee la obra social que precompleta cada fila, deja la pantalla
          vacía al terminar y guarda el resultado. Cada obra social queda cargada en su contrato, con fecha y con el origen, y deja de figurar como pendiente.
        </p>
        <Clave>
          <strong>El script solo lee.</strong> Los únicos botones que aprieta en la pantalla de altas son <strong>Agregar</strong> y <strong>Reiniciar</strong>. <strong>Nunca «Aceptar»</strong>, que es el
          que registra las altas ante el organismo: esas salen del TXT, no de acá.
        </Clave>

        <p className="font-semibold text-gray-900 dark:text-gray-100 pt-1">Qué se guarda y qué se rechaza</p>
        <p>
          Antes de escribir, el servidor valida cada código igual que cuando se pegaba a mano: que el RNOS exista en el catálogo de Obras Sociales y que <strong>la empleadora lo tenga registrado ante
          ARCA</strong>. Lo que no pasa esa prueba se rechaza con el motivo y no se guarda. Y lo ya constatado <strong>no se pisa</strong>: correr el script dos veces seguidas no cambia nada la segunda.
        </p>
        <p>
          El panel <strong>«Validar obras sociales»</strong> sigue aceptando el pegado manual <Cod>CUIL,RNOS</Cod> para cuando no se puede correr el script — otra máquina, otra persona, otro navegador—.
          Ese camino conserva su previsualización antes de guardar.
        </p>
      </Seccion>

      <Seccion n={5} titulo="Los tres estados">
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

      <Seccion n={6} titulo="Reglas que no se rompen">
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

      <Seccion n={7} titulo="Si algo no funciona">
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
        <Sintoma q="Me aparece «El puente falló al arrancar» en todas las pantallas">
          Es el userscript viejo, de cuando esto se hacía con una extensión: sigue pidiendo un archivo que ya no existe y recibe otra cosa (de ahí el <Cod>Unexpected token '&lt;'</Cod>). Abrí el panel de
          Tampermonkey y <strong>desinstalá «WeProdu — Puente ARCA»</strong> —y cualquier otra copia del script—: ya no se usa para nada.
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
