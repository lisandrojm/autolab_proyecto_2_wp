import React from "react";

/**
 * Qué es cada dato del alta de ARCA, de dónde sale y por qué frena el TXT.
 *
 * Vive en un diccionario y no en el texto de cada check por dos razones:
 *
 *  1. El modal se llena de párrafos. La explicación de la Empresa sola ocupaba cuatro renglones
 *     permanentes, y multiplicado por trece campos el checklist deja de leerse de un vistazo. Con un
 *     ícono por campo, el detalle está a un click y no compite con "qué me falta".
 *  2. El mismo texto sirve en la grilla, en el detalle y en la ayuda de la pantalla. Repetido en
 *     cada lugar terminaría divergiendo.
 *
 * `posicion` es dónde cae el dato en el registro de 130 caracteres. Los que no llevan posición no son
 * campos del archivo (la Empresa, el convenio de la categoría): son datos que deciden o validan.
 */
export interface ExplicacionCampo {
  titulo: string;
  /** Posiciones en el registro, si es un campo del TXT. */
  posicion?: string;
  /** De dónde sale el dato. */
  origen: string;
  cuerpo: React.ReactNode;
}

export const EXPLICACIONES: Record<string, ExplicacionCampo> = {
  empresa: {
    titulo: "Empresa del Contrato",
    origen: "Se elige por contrato, entre las empresas del proyecto",
    cuerpo: (
      <>
        <p>
          El TXT se sube <strong>dentro de la sesión de ARCA de una sola empleadora</strong>, y el organismo atribuye el alta al CUIT con el que estás logueado — el archivo no lo lleva escrito.
        </p>
        <p>
          Por eso cada contrato tiene que decir con cuál se da de alta: define <strong>en qué archivo entra</strong>. Un contrato metido en el archivo equivocado se da de alta bajo la empleadora que no es, y nada lo marca como error.
        </p>
        <p>
          Además <strong>destraba la Sucursal y valida la Categoría</strong>: las sucursales elegibles son las del padrón de esta empresa, y los convenios que tiene registrados son los que dicen si la categoría es aceptable. Mientras falte, esos campos quedan en espera.
        </p>
      </>
    ),
  },

  cuil: {
    titulo: "CUIL",
    posicion: "5-15",
    origen: "Ficha de la persona",
    cuerpo: (
      <>
        <p>Identifica a la persona en el alta. Van los 11 dígitos sin guiones.</p>
        <p>
          No alcanza con que tenga 11 dígitos: se valida el <strong>prefijo</strong> (20/23/24/25/26/27 para personas físicas) y el <strong>dígito verificador</strong>. Un CUIL mal tipeado pasa cualquier chequeo de largo y lo rechaza ARCA sin decir por qué.
        </p>
      </>
    ),
  },

  fechaInicio: {
    titulo: "Fecha de inicio de la relación laboral",
    posicion: "20-29",
    origen: "Fecha de alta del contrato",
    cuerpo: (
      <>
        <p>
          Va en formato <span className="font-mono">AAAA/MM/DD</span>. Es la fecha desde la que la persona queda declarada como empleada.
        </p>
        <p>Si la fecha guardada tiene un formato que no se puede interpretar, el contrato se omite del archivo en vez de mandar el campo en blanco: un alta sin fecha de inicio la rechaza ARCA.</p>
      </>
    ),
  },

  fechaFin: {
    titulo: "Fecha de fin de la relación laboral",
    posicion: "30-39",
    origen: "Fecha de baja del contrato",
    cuerpo: (
      <>
        <p>
          Es el único campo donde el vacío puede ser el valor <em>correcto</em>. Depende de la modalidad de contratación:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Obligatoria</strong> en las modalidades a plazo determinado (<span className="font-mono">021</span>, <span className="font-mono">022</span>, <span className="font-mono">012</span>).
          </li>
          <li>
            <strong>Tiene que ir en blanco</strong> en las de tiempo indeterminado (<span className="font-mono">008</span>, <span className="font-mono">001</span>).
          </li>
        </ul>
        <p>Cargarla en una indeterminada, o no cargarla en un plazo fijo, cambia el sentido del alta. Por eso se valida en las dos direcciones.</p>
      </>
    ),
  },

  rnos: {
    titulo: "Código RNOS (obra social)",
    posicion: "40-45",
    origen: "ARCA — Registrar Nuevas Altas",
    cuerpo: (
      <>
        <p>
          El código de 6 dígitos de la obra social del trabajador. ARCA lo declara <strong>en cada alta</strong>, no por persona: dos contratos de la misma persona en dos empleadoras llevan cada uno el suyo.
        </p>
        <p>
          <strong>Hasta que no se valida contra ARCA, el contrato no tiene obra social</strong> y su TXT no se puede generar. El valor aparece recién con la validación: si el organismo devuelve una, va esa; si no devuelve ninguna, queda la del convenio de su categoría, también confirmada. Antes de validar se muestra cuál <em>iría</em>, como referencia — no como valor puesto, porque nadie lo verificó todavía.
        </p>
        <p>
          La fuente es <strong>ARCA</strong>: Simplificación Registral → Relaciones Laborales → <em>Registrar Nuevas Altas</em>. Se pone el CUIL y el organismo precompleta la obra social que tiene registrada. Lo que devuelve <strong>queda fijo</strong>: es quien después valida el alta, así que no se corrige a mano. Si no devuelve nada, la persona no tiene afiliación registrada y rige la del convenio.
        </p>
        {/*
          El código de colores de la columna, escrito. Sin esto, el azul es una convención que solo
          conoce quien la pidió: el que llega después ve dos verdes y un azul y no sabe cuál mirar.
        */}
        <p>
          <strong>Los colores de la columna.</strong> <span className="text-blue-600 dark:text-blue-400 font-semibold">Azul</span> es la única que hay que mirar: ARCA devolvió una obra social{' '}
          <strong>distinta</strong> de la del convenio, así que esa persona no lleva la que se hubiera puesto por defecto. En <span className="text-green-700 dark:text-green-400 font-semibold">verde</span>{' '}
          van las que confirman lo que ya se sabía —sin afiliación propia, o la misma del convenio—, y en <span className="text-red-600 dark:text-red-400 font-semibold">rojo</span> las que la empleadora no
          tiene registradas ante ARCA, que hacen rechazar el alta.
        </p>
        <p>
          No hay forma de automatizarlo desde el server: Simplificación Registral es una aplicación web con clave fiscal, sin webservice, y el servicio de ARCA que sí está conectado (Consulta Padrón)
          devuelve datos del contribuyente, no la obra social de un trabajador. Lo que sí se automatiza es el tipeo: lo hace el <strong>Asistente WeProdu</strong>, un programa que corre en tu máquina y
          opera tu propia sesión de ARCA con un botón.
        </p>
        <p>
          <a href="/arca/guia-obras-sociales" target="_blank" rel="noreferrer" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            Guía completa de la validación de obras sociales →
          </a>
        </p>
      </>
    ),
  },

  retribucion: {
    titulo: "Retribución pactada",
    posicion: "58-72",
    origen: "Sueldo bruto del grupo de la categoría",
    cuerpo: (
      <>
        <p>
          El sueldo bruto. No se carga por contrato: sale del <strong>grupo salarial</strong> al que pertenece la categoría, que es donde vive la escala del convenio.
        </p>
        <p>
          Se manda con <strong>2 decimales implícitos</strong>: $785.955,27 va como <span className="font-mono">000000078595527</span>. Podés verlo formateado en "Cómo queda en el archivo".
        </p>
      </>
    ),
  },

  modalidadLiq: {
    titulo: "Modalidad de liquidación",
    posicion: "73",
    origen: "Tipo de Contrato",
    cuerpo: (
      <>
        <p>Cada cuánto se liquida la retribución. Un solo dígito.</p>
        <p>
          Son ocho: <span className="font-mono">1</span> mes · <span className="font-mono">2</span> quincena · <span className="font-mono">3</span> semana · <span className="font-mono">4</span> día · <span className="font-mono">5</span> hora · <span className="font-mono">6</span> pieza · <span className="font-mono">7</span> a comisión · <span className="font-mono">8</span> jornal.
        </p>
        <p>Se carga una vez por Tipo de Contrato y lo heredan todos los contratos de ese tipo.</p>
      </>
    ),
  },

  sucursal: {
    titulo: "Sucursal (domicilio de desempeño)",
    posicion: "74-78",
    origen: "Padrón de la empresa — Domicilios de Explotación",
    cuerpo: (
      <>
        <p>El domicilio donde la persona presta servicios, tal como está declarado en el padrón de ARCA de la empleadora.</p>
        <p>
          <strong>No es la Sede</strong> del sistema: las Sedes son los lugares de trabajo con los que opera WeProdu y no tienen relación con el padrón. La sucursal es una entidad de ARCA, con su código y sus actividades.
        </p>
        <p>Solo se pueden elegir las sucursales asignadas a la empresa del contrato: el código sale del padrón de ese CUIT, así que una de otra empresa sería un alta mal declarada.</p>
      </>
    ),
  },

  actividad: {
    titulo: "Actividad del domicilio",
    posicion: "79-84",
    origen: "Actividades declaradas para esa sucursal",
    cuerpo: (
      <>
        <p>La actividad económica con la que se declara el alta. Cuelga del domicilio, no del tipo de contrato ni de la persona.</p>
        <p>
          ARCA <strong>solo acepta las actividades declaradas para esa sucursal</strong>. No hay catálogo global del que elegir: en la pantalla del organismo el combo viene filtrado por el domicilio elegido.
        </p>
        <p>Si la sucursal tiene una sola actividad, el contrato la hereda y no hay nada que elegir. Si tiene varias — ARCA lo permite — hay que decir con cuál se declara este contrato.</p>
      </>
    ),
  },

  categoriaProf: {
    titulo: "Categoría profesional",
    posicion: "101-106",
    origen: "Categoría del contrato",
    cuerpo: (
      <>
        <p>El código de 6 dígitos de la categoría en la que está encuadrada la persona.</p>
        <p>
          Las categorías pertenecen a un <strong>convenio colectivo</strong>: no hay una lista única. El combo de ARCA viene filtrado por los convenios que la empleadora tiene registrados.
        </p>
        <p>De la categoría también sale la retribución, a través del grupo salarial de su convenio.</p>
      </>
    ),
  },

  convenioCategoria: {
    titulo: "Convenio de la categoría",
    origen: "Convenios registrados por la empresa",
    cuerpo: (
      <>
        <p>
          No es un campo del archivo: el convenio va <strong>en blanco</strong> en el registro (posiciones 91-100). ARCA lo infiere del código de categoría.
        </p>
        <p>
          Se chequea igual porque el organismo <strong>solo acepta categorías de los convenios que la empleadora tiene registrados</strong>. Una categoría de otro convenio pasa todos los controles de formato y la rechaza ARCA.
        </p>
        <p>
          El convenio no se elige: lo determina la categoría. "Excluido de convenio" (<span className="font-mono">9999/99</span>) también es un convenio, no la ausencia de uno.
        </p>
      </>
    ),
  },

  rnosSinConstatar: {
    titulo: "Obra social sin constatar",
    origen: "Ficha de la persona (dato heredado)",
    cuerpo: (
      <>
        <p>
          <strong>No bloquea el alta.</strong> Hay un RNOS y el archivo se genera igual.
        </p>
        <p>
          Pero ese código viene de la <strong>ficha de la persona</strong>, de antes de que la obra social se declarara por contrato. Puede estar vencido: la afiliación caduca sola por desregulación o por una opción de cambio, y nadie lo avisa.
        </p>
        <p>
          Se constata en <strong>ARCA</strong> (Relaciones Laborales → Registrar Nuevas Altas, con el CUIL) y se carga en la tarjeta de Obra social de este contrato. Es un aviso para ir limpiando los datos viejos, no un freno.
        </p>
      </>
    ),
  },

  obraSocialRegistrada: {
    titulo: "Obra social registrada en ARCA",
    origen: "Obras sociales registradas por la empleadora",
    cuerpo: (
      <>
        <p>
          No es un campo aparte del archivo: es un chequeo sobre el <strong>RNOS</strong> que se va a mandar.
        </p>
        <p>
          Cada empleadora tiene en ARCA su propia lista de obras sociales registradas. El organismo <strong>solo acepta altas con obras sociales de esa lista</strong>, así que una que no esté registrada hace rechazar el alta aunque el código exista y la persona esté afiliada.
        </p>
        <p>La lista se extrae del padrón de la empresa (Datos del Empleador → Obras Sociales) y se carga en su ficha.</p>
      </>
    ),
  },

  obraSocialSinVerificar: {
    titulo: "Obra social sin verificar contra ARCA",
    origen: "Obras sociales registradas por la empleadora",
    cuerpo: (
      <>
        <p>
          <strong>No bloquea el alta.</strong> El RNOS está y el archivo se genera igual.
        </p>
        <p>
          Lo que no se pudo hacer es constatar que esa obra social esté entre las <strong>registradas por la empleadora en ARCA</strong>, que es la lista contra la que el organismo valida. Sin esa lista cargada, la comprobación queda pendiente.
        </p>
        <p>Se resuelve cargando el padrón de obras sociales de la empresa en su ficha. Es un aviso para ir limpiando, no un freno.</p>
      </>
    ),
  },

  tipoServicio: {
    titulo: "Tipo de servicio",
    posicion: "107-109",
    origen: "Tipo de Contrato",
    cuerpo: (
      <>
        <p>Clasifica el servicio prestado, que es lo que determina el cómputo jubilatorio.</p>
        <p>
          El habitual es <span className="font-mono">000</span> — Servicios comunes continuos. El resto son regímenes especiales: tareas insalubres, aeronavegantes, docentes, etc.
        </p>
        <p>Se carga una vez por Tipo de Contrato.</p>
      </>
    ),
  },

  modalidadContrato: {
    titulo: "Modalidad de contrato",
    posicion: "17-19",
    origen: "Tipo de Contrato",
    cuerpo: (
      <>
        <p>Con qué figura legal se contrata a la persona. Tres dígitos.</p>
        <p>
          Las que más se usan: <span className="font-mono">008</span> tiempo completo indeterminado · <span className="font-mono">022</span> plazo fijo a tiempo completo · <span className="font-mono">021</span> plazo fijo a tiempo parcial · <span className="font-mono">012</span> trabajo eventual.
        </p>
        <p>
          <strong>Define si hace falta la fecha de fin</strong>: las de plazo determinado la exigen y las de tiempo indeterminado la prohíben.
        </p>
      </>
    ),
  },
};
