/**
 * ═══════════════════════════════════════════════════════════════════════
 * LAS BANDEJAS DE CONTRATACIÓN (11/11/2026, pedido del usuario)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Los pasos de «Gestión de Contratos» eran pestañas adentro de /admin/contracts, detrás de otra
 * pestaña («Contratos» / «Gestión de Contratos»): menú → página → pestaña → sub-pestaña. Pero cada
 * paso es de hecho una bandeja de trabajo —una cola con su número—, así que pasan a ser páginas con
 * URL propia, colgadas del menú lateral en el orden del circuito.
 *
 * Este archivo es la única definición: el orden, el número, la ruta, el permiso, qué muestra cada
 * una y cómo se cuenta. Lo leen las rutas (`App`), el menú (`Navbar`), la pantalla (`ContractsPage`)
 * y los tests. Es puro —sin React ni API— para poder probarlo en Node.
 *
 * Solicitudes es el paso 1 (10/11/2026, pedido del usuario: va antes del trámite impositivo) y
 * conserva su URL de siempre. «Contratos» (el listado) y el viejo paso «Contratados» se fusionaron
 * en la última bandeja: mostraban los mismos contratos.
 */

export type ClaveBandeja = 'solicitudes' | 'tramite-impositivo' | 'generar-documentos' | 'para-firmar' | 'enviado-a-la-firma' | 'firmados' | 'contratos';

/** Las tres carpetas de Dropbox Sign, con el nombre que usa `ContractDropboxTab`. */
export type CarpetaFirma = 'para_firmar' | 'enviado_firma' | 'firmados';

/** Qué componente dibuja la bandeja (lo que antes dibujaba su pestaña). */
export type ContenidoBandeja = { tipo: 'solicitudes' } | { tipo: 'tramite' } | { tipo: 'generar' } | { tipo: 'dropbox'; carpeta: CarpetaFirma } | { tipo: 'padron' };

export interface Bandeja {
  clave: ClaveBandeja;
  numero: number;
  label: string;
  ruta: string;
  /** Alcanza con cualquiera. Los mismos de la pestaña que reemplaza. */
  permisos: string[];
  /** Una línea: qué hay acá. La usa el título del ítem del menú y el ⓘ de la pantalla. */
  descripcion: string;
  /** La explicación larga del ⓘ (era el modal «Qué es cada pestaña»). */
  explicacion: string;
  /** Carpeta de Dropbox Sign, si la bandeja la lee (sólo informativo: la real sale de la config). */
  carpeta?: string;
  contenido: ContenidoBandeja;
  /** Si su número es trabajo para hacer (suma en el grupo del menú) o sólo un recuento. */
  accionable: boolean;
}

export const RUTA_CONTRATACION = '/admin/contratacion';
const PERMISO_CONTRATOS = ['admin_contracts:view'];

export const BANDEJAS: Bandeja[] = [
  {
    clave: 'solicitudes',
    numero: 1,
    label: 'Solicitudes',
    ruta: '/admin/solicitudes',
    // Una solicitud es un alta de usuario, no un contrato: comparte permiso con Usuarios.
    permisos: ['admin_users:view'],
    descripcion: 'Las solicitudes de alta pendientes. Al aprobarlas nace el contrato y pasa al Trámite impositivo.',
    explicacion:
      'Vive en la base de datos. Son las solicitudes de alta pendientes, de todos los clientes y proyectos. Al aprobarlas nace el contrato y pasa al Trámite impositivo (Alta temprana de ARCA, Constancia de CUIT o Sin CUIT).',
    contenido: { tipo: 'solicitudes' },
    accionable: true,
  },
  {
    clave: 'tramite-impositivo',
    numero: 2,
    label: 'Trámite impositivo',
    ruta: `${RUTA_CONTRATACION}/tramite-impositivo`,
    permisos: PERMISO_CONTRATOS,
    descripcion: 'El contrato está en UNA de las tres variantes: Alta temprana de ARCA, Constancia de CUIT o Sin CUIT.',
    explicacion:
      'Vive en la base de datos de la aplicación, no en Dropbox. Son los contratos registrados que todavía no se hizo nada en ARCA, en UNA de tres variantes excluyentes. Alta temprana de ARCA: contratos que necesitan un Alta. Constancia de CUIT: contratos a los que hay que verificarles si el CUIT está activo o no en ARCA. Sin CUIT: personas que todavía no tienen CUIT/CUIL argentino; se carga la documentación de respaldo, se valida y se las envía a Generar Documentos de forma excepcional. No interviene Dropbox Sign.',
    contenido: { tipo: 'tramite' },
    accionable: true,
  },
  {
    clave: 'generar-documentos',
    numero: 3,
    label: 'Generar documentos',
    ruta: `${RUTA_CONTRATACION}/generar-documentos`,
    permisos: PERMISO_CONTRATOS,
    descripcion: 'Se generan los PDF de Contrato y Release, que quedan en la carpeta Outbox.',
    explicacion:
      'Vive en la base de datos: contratos con el trámite impositivo terminado, cuyo documento ya llegó a las carpetas de ARCA (Alta temprana de Arca, Constancia de cuit). Acá se generan los PDF de Contrato y Release, que quedan en la carpeta Outbox de Dropbox: es el paso previo a enviarlos a firmar, pero todavía no se envía nada desde acá.',
    contenido: { tipo: 'generar' },
    accionable: true,
  },
  {
    clave: 'para-firmar',
    numero: 4,
    label: 'Para Firmar',
    ruta: `${RUTA_CONTRATACION}/para-firmar`,
    permisos: PERMISO_CONTRATOS,
    carpeta: 'Outbox',
    descripcion: 'Documentos listos para enviarlos a firmar por Dropbox Sign.',
    explicacion: 'Lee la carpeta Outbox de Dropbox: contratos ya generados, listos para enviarlos a firmar por Dropbox Sign. Todavía no se envió nada.',
    contenido: { tipo: 'dropbox', carpeta: 'para_firmar' },
    accionable: true,
  },
  {
    clave: 'enviado-a-la-firma',
    numero: 5,
    label: 'Enviado a la firma',
    ruta: `${RUTA_CONTRATACION}/enviado-a-la-firma`,
    permisos: PERMISO_CONTRATOS,
    carpeta: 'Pendbox',
    descripcion: 'La solicitud ya se envió desde Dropbox Sign y se espera la firma.',
    explicacion:
      'Lee la carpeta Pendbox de Dropbox. La solicitud ya se envió desde Dropbox Sign y se espera la firma del destinatario. Se detecta por el correo de aviso que manda Dropbox Sign, y con eso el archivo se mueve desde Outbox: así no se puede enviar dos veces por error.',
    contenido: { tipo: 'dropbox', carpeta: 'enviado_firma' },
    accionable: false,
  },
  {
    clave: 'firmados',
    numero: 6,
    label: 'Firmados',
    ruta: `${RUTA_CONTRATACION}/firmados`,
    permisos: PERMISO_CONTRATOS,
    carpeta: 'Requested signatures',
    descripcion: 'Contratos que ya volvieron firmados.',
    explicacion: 'Lee la carpeta Requested signatures de Dropbox: contratos que ya volvieron firmados y se pueden descargar.',
    contenido: { tipo: 'dropbox', carpeta: 'firmados' },
    accionable: false,
  },
  {
    clave: 'contratos',
    numero: 7,
    label: 'Contratos',
    ruta: `${RUTA_CONTRATACION}/contratos`,
    permisos: PERMISO_CONTRATOS,
    descripcion: 'Todos los contratos en cualquier estado, y las solicitudes pendientes desde que se envían.',
    explicacion:
      'Vive en la base de datos. Es el padrón: todos los contratos creados desde Solicitudes o desde la plataforma, en cualquier estado, uno por renglón, más las solicitudes pendientes, que todavía no tienen contrato y aparecen desde que se envían. Reúne el viejo listado «Contratos» y el paso «Contratados». Lo último creado arriba.',
    contenido: { tipo: 'padron' },
    accionable: false,
  },
];

export const bandejaPorClave = (clave: ClaveBandeja): Bandeja => BANDEJAS.find((b) => b.clave === clave)!;

/** La bandeja de una ruta (`/admin/contratacion/firmados` → Firmados). Sin query ni barra final. */
export const bandejaDeRuta = (pathname: string): Bandeja | undefined => {
  const limpia = pathname.split('?')[0].replace(/\/+$/, '');
  return BANDEJAS.find((b) => b.ruta === limpia);
};

/** La que sigue en el circuito, para el «siguiente paso →». La última no tiene. */
export const siguienteBandeja = (clave: ClaveBandeja): Bandeja | undefined => BANDEJAS[BANDEJAS.findIndex((b) => b.clave === clave) + 1];

/* ─── Las tres variantes del Trámite impositivo: quedan adentro de la bandeja, con `?variante=`. ─── */

export type VarianteTramite = 'alta-temprana' | 'constancia-cuit' | 'sin-cuit';
export const VARIANTES_TRAMITE: { clave: VarianteTramite; label: string }[] = [
  { clave: 'alta-temprana', label: 'Alta temprana de ARCA' },
  { clave: 'constancia-cuit', label: 'Constancia de CUIT' },
  { clave: 'sin-cuit', label: 'Sin CUIT' },
];
export const varianteDeQuery = (valor: string | null | undefined): VarianteTramite => (VARIANTES_TRAMITE.some((v) => v.clave === valor) ? (valor as VarianteTramite) : 'alta-temprana');

/* ─── Las URLs viejas ─── */

/**
 * A dónde va hoy lo que antes se abría en /admin/contracts. Se recibe el `search` (con o sin «?»).
 *
 *  · sin `tab` → Trámite impositivo (era la pestaña que abría por defecto).
 *  · `tab=contracts` → Contratos (el listado, que ahora es el padrón).
 *  · `tab=management` → Trámite impositivo. Gestionar Equipo llega así con `projectId`, que se conserva.
 *  · `paso=solicitudes` (el padrón abría la solicitud tocada) → Solicitudes, con su `buscar`.
 *
 * El resto de los parámetros (`projectId`, `buscar`) viaja tal cual.
 */
export const rutaNuevaDeContratos = (search: string): string => {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const tab = params.get('tab');
  const paso = params.get('paso');
  params.delete('tab');
  params.delete('paso');
  const destino = paso === 'solicitudes' ? bandejaPorClave('solicitudes') : tab === 'contracts' ? bandejaPorClave('contratos') : bandejaPorClave('tramite-impositivo');
  const resto = params.toString();
  return resto ? `${destino.ruta}?${resto}` : destino.ruta;
};

/* ─── Los números del menú ─── */

/**
 * Lo que se sabe de cada bandeja. `null` = todavía no se contó (o no se pudo): el menú no dibuja
 * nada, que no es lo mismo que «(0)».
 */
export interface ContadoresContratacion {
  solicitudes: number | null;
  tramite: { alta: number; cuit: number; sinCuit: number } | null;
  generarDocumentos: number | null;
  dropbox: Record<CarpetaFirma, number> | null;
  contratos: number | null;
}

export const CONTADORES_VACIOS: ContadoresContratacion = { solicitudes: null, tramite: null, generarDocumentos: null, dropbox: null, contratos: null };

/** El número de una bandeja, con el mismo corte que la pantalla (el trámite suma sus tres variantes). */
export const contadorDeBandeja = (c: ContadoresContratacion, clave: ClaveBandeja): number | null => {
  const b = bandejaPorClave(clave);
  switch (b.contenido.tipo) {
    case 'solicitudes':
      return c.solicitudes;
    case 'tramite':
      return c.tramite ? c.tramite.alta + c.tramite.cuit + c.tramite.sinCuit : null;
    case 'generar':
      return c.generarDocumentos;
    case 'dropbox':
      return c.dropbox ? c.dropbox[b.contenido.carpeta] : null;
    case 'padron':
      return c.contratos;
  }
};

/**
 * El número del grupo «Contratación» cerrado: la suma de lo que espera que alguien haga algo
 * (Solicitudes, Trámite, Generar, Para Firmar). Enviados, firmados y el padrón son recuentos, no
 * trabajo: sumarlos daba el «99+» de siempre, que no decía nada. Sólo de las bandejas que se ven.
 */
export const sumaAccionable = (c: ContadoresContratacion, visibles: ClaveBandeja[] = BANDEJAS.map((b) => b.clave)): number =>
  BANDEJAS.filter((b) => b.accionable && visibles.includes(b.clave)).reduce((total, b) => total + (contadorDeBandeja(c, b.clave) || 0), 0);
