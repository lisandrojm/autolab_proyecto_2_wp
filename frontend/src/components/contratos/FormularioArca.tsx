import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faChevronDown, faChevronRight, faRotate, faArrowUpRightFromSquare, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { ContractOverviewRow } from '../../api/users';
import { AfipCatalogs, AfipValues, MODALIDADES_PLAZO_DETERMINADO, MODALIDADES_TIEMPO_INDETERMINADO, buscarTipoContrato } from './afipCompleteness';
import { createSimpleCatalogApi, SimpleCatalogItem } from '../../api/simpleCatalog';
import { ContratoItem } from '../../api/contratos';
import { projectsAPI } from '../../api/projects';
import { sweetAlert } from '../../utils/sweetAlert';
import { CampoArca, FilaArca, DepGroup } from './CampoArca';
import { useResaltadoDependencias } from './useResaltadoDependencias';
import { CampoObraSocial } from './CampoObraSocial';
import { PickerArca } from './PickerArca';

/**
 * El formulario de Datos ARCA, con la forma de la pantalla del organismo: trece campos en tres
 * columnas, mismo orden y mismos rótulos, todos resueltos sin salir de acá.
 *
 * Por qué copiar esa forma: el operador ya la conoce —es donde carga las altas hoy— y el modal que
 * había era un diagnóstico, no un formulario. Decía "faltan 3 códigos" y mandaba a otra pantalla a
 * cargarlos; eran cuatro pasos para tres campos.
 *
 * La diferencia con ARCA que NO se tira: allá los 13 valores se tipean uno por uno para cada
 * persona; acá hay niveles (tipo de contrato, empresa, sucursal, convenio) y por eso la modalidad no
 * se carga 143 veces. El costo de esa ventaja es que editar desde una ficha toca a todas las que
 * comparten el nivel — y eso, que antes era invisible, ahora lo dice la tercera línea de cada campo
 * y el pie del picker.
 */

const tiposServicioApi = createSimpleCatalogApi('/arca/tipos-servicio');
const modalidadesContratoApi = createSimpleCatalogApi('/arca/modalidades-contratacion');
const modalidadesLiqApi = createSimpleCatalogApi('/arca/modalidades-liquidacion');

/** Qué campo tiene el picker abierto. */
type CampoAbierto = null | 'sucursal' | 'actividad' | 'convenio' | 'categoria';


/**
 * La fecha como se lee, `dd/mm/aaaa`. Solo para mostrar: al archivo va `fechaAfip`, que no pasa por acá.
 *
 * SIN CONSTRUIR UN `Date`, y no es un detalle de estilo. Estas son fechas de CALENDARIO —el día que
 * empieza el contrato— guardadas como `2026-07-04T00:00:00.000Z`. Pasarlas por `new Date(...)` y
 * leerlas con los getters locales las corre un día para todo el país: en UTC-3 esa medianoche UTC es
 * el 3 de julio a las 21. El alta se vería declarando otro día.
 *
 * Se parten los dígitos del string. Lo que no se reconoce se devuelve tal cual: mostrar el dato crudo
 * es feo, pero mostrar otra fecha es un error.
 */
const fechaLegible = (valor?: string): string => {
  if (!valor) return '';
  const iso = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : valor;
};

/**
 * ZONA 2 — LOS TRES CÓDIGOS QUE VIVEN EN EL TIPO DE CONTRATO. Solo lectura, con link a donde se editan.
 *
 * POR QUÉ DEJARON DE SER EDITABLES ACÁ
 *
 * Modalidad de contrato, tipo de servicio y modalidad de liquidación no son de esta persona: son del
 * TIPO de contrato, y editarlos desde una ficha tocaba a los 143 contratos que comparten ese tipo. El
 * picker lo avisaba en un pie ámbar, pero avisar de un efecto masivo no es lo mismo que no ofrecerlo:
 * el control estaba ahí, con la misma forma que la sucursal —que sí es de esta persona—, y la
 * diferencia entre los dos quedaba en un renglón que se lee después de hacer click.
 *
 * Así que se editan donde se entiende qué se está tocando: en el tipo de contrato.
 *
 * EL VACÍO ES UN PROBLEMA, Y SE DICE
 *
 * Un tipo puede no tener los códigos cargados —el propio modal de Editar Contrato lo advierte—, y sin
 * ellos no hay TXT. Antes eso se veía como tres campos en ámbar entre otros diez; acá el bloque nombra
 * cuáles faltan y ofrece el link. El botón de descargar ya estaba deshabilitado en ese caso: lo que
 * faltaba era la razón a la vista.
 */
const CodigosDelTipo: React.FC<{
  nombreTipo: string;
  tipoId?: string;
  modalidadContrato: string;
  nombreModalidadContrato?: string;
  tipoServicio: string;
  nombreTipoServicio?: string;
  modalidadLiq: string;
  nombreModalidadLiq?: string;
  /** Relee el tipo de contrato sin cerrar el modal. Es el mismo camino que usa guardar un código. */
  onRefrescar?: () => void;
}> = ({ nombreTipo, tipoId, modalidadContrato, nombreModalidadContrato, tipoServicio, nombreTipoServicio, modalidadLiq, nombreModalidadLiq, onRefrescar }) => {
  const faltantes = [
    !modalidadContrato && 'modalidad de contrato',
    !tipoServicio && 'tipo de servicio',
    !modalidadLiq && 'modalidad de liquidación',
  ].filter(Boolean) as string[];

  /*
    SE REVALIDA AL VOLVER A LA PESTAÑA.

    El link abre `/contratos` en otra pestaña justamente para no perder lo que se esté cargando acá.
    El costo de eso es que al volver, estos tres valores son los de antes de la edición. Escuchar el
    `focus` de la ventana cierra el círculo sin pedirle nada a nadie; el botón de recargar queda igual,
    para quien no se fía o cambió algo desde otro lado.
  */
  useEffect(() => {
    if (!onRefrescar) return;
    const alVolver = () => onRefrescar();
    window.addEventListener('focus', alVolver);
    return () => window.removeEventListener('focus', alVolver);
  }, [onRefrescar]);

  /* `/contratos` no tenía forma de abrir UN tipo: lee `?tab=` y nada más. El `tipo` es nuevo. */
  const href = tipoId ? `/contratos?tab=types&tipo=${encodeURIComponent(tipoId)}` : '/contratos?tab=types';

  return (
    <section className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30 px-3 py-2.5" aria-label={`Códigos del tipo de contrato ${nombreTipo}`}>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 min-w-0">
          Del tipo de contrato <span className="normal-case tracking-normal text-gray-500 dark:text-gray-400">«{nombreTipo}»</span>
        </h4>
        <div className="flex items-center gap-2 shrink-0">
          {onRefrescar && (
            <button type="button" onClick={onRefrescar} title="Volver a leer los códigos del tipo de contrato" aria-label="Volver a leer los códigos del tipo de contrato" className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors">
              <FontAwesomeIcon icon={faRotate} className="h-3 w-3" />
            </button>
          )}
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40">
            Editar en el contrato
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2.5 w-2.5" />
            <span className="sr-only">(se abre en una pestaña nueva)</span>
          </a>
        </div>
      </div>

      {faltantes.length > 0 && (
        <p className="mb-2 rounded-md border border-amber-300 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/20 px-2.5 py-2 text-[11.5px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3 mt-0.5 shrink-0" />
          <span>
            Falta{faltantes.length === 1 ? '' : 'n'} <strong>{faltantes.join(', ')}</strong> en el tipo de contrato «{nombreTipo}». Sin {faltantes.length === 1 ? 'ese código' : 'esos códigos'} no se puede generar el TXT.
          </span>
        </p>
      )}

      {/* Tono más apagado que la Zona 1 —es informativo— pero legible: gris de texto, no gris de
          deshabilitado. Lo que va al archivo tiene que poder leerse. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
        <FilaArca rotulo="Modalidad Contrato" campo="modalidadContrato" info="modalidadContrato" etiqueta="17–19" valor={modalidadContrato} nombre={nombreModalidadContrato} vacio="— sin cargar en el tipo de contrato" faltaEsError origen={<>define si va la fecha de fin</>} />
        <FilaArca rotulo="Tipo Servicio" campo="tipoServicio" info="tipoServicio" etiqueta="107–109" valor={tipoServicio} nombre={nombreTipoServicio} vacio="— sin cargar en el tipo de contrato" faltaEsError />
        <FilaArca rotulo="Mod. Liquidación" campo="modalidadLiq" info="modalidadLiq" etiqueta="73" valor={modalidadLiq} nombre={nombreModalidadLiq} vacio="— sin cargar en el tipo de contrato" faltaEsError />
      </div>
    </section>
  );
};

/**
 * ZONA 3 — LOS CUATRO VALORES QUE VAN AL ARCHIVO Y NADIE CARGA. Plegado, y como texto.
 *
 * Estaban en la grilla como campos deshabilitados con «— en blanco» adentro, y ahí un input vacío
 * dice «esto falta»: cuatro de trece casillas leyéndose como trabajo pendiente que no existe. Tampoco
 * alcanzaba con el badge «constante», porque tenía el mismo peso visual que el badge de posición y
 * significa lo contrario —uno marca lo que hay que completar, el otro lo que no—.
 *
 * No desaparecen: la pregunta «¿el agropecuario no hay que cargarlo?» se sigue contestando sola al
 * abrir. Pero se contesta una vez, y no ocupa un tercio del formulario mientras tanto.
 */
const VALORES_FIJOS: Array<{ etiqueta: string; valor: string; nota: string }> = [
  { etiqueta: 'Puesto desempeñado', valor: 'en blanco', nota: 'el registro de 130 lo deja vacío' },
  { etiqueta: 'Situación de revista', valor: 'en blanco', nota: 'el registro de 130 lo deja vacío' },
  { etiqueta: 'Trab. agropecuario', valor: 'N', nota: 'posición 16, siempre N' },
  { etiqueta: 'Lic. COVID / CCG', valor: '0', nota: 'posición 130, siempre 0' },
];

const ValoresFijos: React.FC = () => {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
      >
        <FontAwesomeIcon icon={abierto ? faChevronDown : faChevronRight} className="h-3 w-3 shrink-0 text-gray-400" />
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">Valores fijos ({VALORES_FIJOS.length})</span>
        <span className="text-[11px] text-gray-500 dark:text-gray-400">· van al TXT, no se editan</span>
      </button>

      {abierto && (
        <dl className="border-t border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60 bg-gray-50/60 dark:bg-gray-900/30">
          {VALORES_FIJOS.map((v) => (
            <div key={v.etiqueta} className="px-3 py-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <dt className="text-[12px] text-gray-700 dark:text-gray-200">{v.etiqueta}</dt>
              <dd className="font-mono text-[12px] text-gray-800 dark:text-gray-100">{v.valor}</dd>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">· {v.nota}</span>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
};

export const FormularioArca: React.FC<{
  row: ContractOverviewRow;
  valores: AfipValues;
  cat: AfipCatalogs;
  onGuardado: (patch?: Partial<ContractOverviewRow>) => void;
  /** Se llama cuando cambia algo del TIPO DE CONTRATO, que no vive en la fila: hay que recargar. */
  onCambioNivel?: () => void;
  /**
   * Abre la pantalla de validación de obras sociales con esta persona sola.
   *
   * Viaja desde la grilla, que es la única que sabe abrir el modal. Sin esto, `CampoObraSocial`
   * despliega su propio panel adentro del formulario y desplaza el resto de los campos.
   */
  onValidarObraSocial?: () => void;
}> = ({ row, valores, cat, onGuardado, onCambioNivel, onValidarObraSocial }) => {
  const [abierto, setAbierto] = useState<CampoAbierto>(null);
  /**
   * Envuelve la obra social Y las tres columnas: la obra social habilita seis campos de dos
   * columnas distintas, así que el resaltado tiene que poder llegar de una punta a la otra.
   */
  const camposRef = useRef<HTMLDivElement>(null);
  useResaltadoDependencias(camposRef);
  const [guardando, setGuardando] = useState<string | null>(null);

  // Nomencladores universales. Se cargan acá y no en la grilla: solo hacen falta con el modal
  // abierto, y sumarlos a `AfipCatalogs` los pondría en el camino del generador del TXT, que no los
  // necesita.
  const [tiposServicio, setTiposServicio] = useState<SimpleCatalogItem[]>([]);
  const [modalidadesContrato, setModalidadesContrato] = useState<SimpleCatalogItem[]>([]);
  const [modalidadesLiq, setModalidadesLiq] = useState<SimpleCatalogItem[]>([]);

  /**
   * Filtro de convenio para el picker de categoría. NO ES UN DATO DEL ALTA.
   *
   * Es el único filtro que queda en este formulario: el de Grupo → Tipo de Servicio se fue con los
   * códigos del tipo de contrato. Uno filtra y no se guarda, el otro es el que viaja al archivo. El
   * convenio va en blanco en el TXT (pos. 91-100) — ARCA lo deduce de la categoría, que es lo único
   * que se manda.
   *
   * Arranca en el convenio de la categoría que el contrato ya tiene: empezar en «todas» ofrecería
   * categorías de los cinco convenios de la empleadora mezcladas, que es justo lo que este filtro
   * viene a evitar.
   */
  /*
    Con categoría cargada manda ELLA: el convenio del alta es el de su categoría, no una preferencia.
    Sin categoría arranca vacío y lo completa el efecto de abajo con el habitual de la empleadora —
    que puede no estar elegida todavía cuando este componente monta.
  */
  const [convenioFiltro, setConvenioFiltro] = useState<string>(valores.convenioCategoria || '');

  /**
   * Las categorías que el picker ofrece, y el ÚNICO lugar donde se busca la elegida.
   *
   * Buscar el código en `cat.categorias` entero era un bug esperando: `codigoAfip` no es único entre
   * convenios, así que un mismo código presente en otro CCT podía ganar el `find` y guardar una
   * categoría de un convenio que la persona no eligió. ARCA la aceptaría igual —el código existe— y
   * el error aparecería recién en el sueldo.
   */
  const categoriasOfrecidas = useMemo(
    () =>
      cat.categorias
        .filter((c) => c.isActive !== false)
        .filter((c) => {
          const cct = String(c.data?.convenio || '').trim();
          if (!cct) return false;
          return convenioFiltro ? cct === convenioFiltro : (valores.conveniosEmpresa || []).includes(cct);
        }),
    [cat.categorias, convenioFiltro, valores.conveniosEmpresa],
  );

  /**
   * Los defaults de la empleadora, y qué pasa cuando la empleadora CAMBIA.
   *
   * Estaban en el inicializador de `useState`, que corre UNA vez: si la empleadora se elegía acá
   * adentro —el caso normal cuando falta— el inicializador ya había corrido en vacío y el default no
   * se aplicaba nunca.
   *
   * Y hay dos situaciones distintas, no una:
   *
   *   - MONTAJE: se completa lo que está vacío y no se pisa nada. Un default que sobreescribe una
   *     elección deja de ser un default.
   *   - CAMBIO DE EMPLEADORA: el filtro se REHACE. Lo que había era de OTRA empresa —sus convenios
   *     registrados son otros— así que conservarlo deja filtrando por un CCT que esta no tiene, y la
   *     lista de categorías sale vacía sin decir por qué. Quitar la empleadora lo deja en blanco por
   *     el mismo motivo: sin ella no hay conjunto del que elegir.
   */
  const empresaAnterior = useRef(row.empresaContratoId);
  useEffect(() => {
    const emp = cat.empresas?.find((e) => e._id === row.empresaContratoId) as { defaultsArca?: { convenioId?: string | null } } | undefined;
    const id = emp?.defaultsArca?.convenioId;
    const convenioDefault = id ? String(cat.convenios?.find((c) => c._id === String(id))?.externalId || '').trim() : '';

    if (empresaAnterior.current !== row.empresaContratoId) {
      empresaAnterior.current = row.empresaContratoId;
      setConvenioFiltro(convenioDefault);
      /*
        LA CATEGORÍA TAMBIÉN SE BORRA. Es la parte que escribe, y por eso va acá y no en el render.

        Los convenios registrados son de CADA CUIT: la categoría guardada salía de los de la empresa
        anterior. Mantenerla deja el contrato declarando una categoría que la empleadora nueva puede
        no tener habilitada, y eso ARCA lo rechaza — con el agravante de que el sueldo que quedaría es
        el de la escala del convenio viejo.

        Se borra SIEMPRE que había una, incluso si la empresa nueva registra el mismo convenio y la
        categoría seguiría siendo válida. Es a propósito: distinguir los dos casos haría que a veces
        se borre y a veces no, y una regla que depende de datos que no están a la vista se vuelve
        impredecible justo cuando importa.
      */
      if (row.categoria_sat_id) void guardarEnContrato('categoria', '');
      return;
    }
    // Con categoría cargada manda ELLA: el convenio del alta es el de su categoría.
    if (!valores.convenioCategoria && convenioDefault) setConvenioFiltro((prev) => prev || convenioDefault);
  }, [row.empresaContratoId, cat.empresas, cat.convenios, valores.convenioCategoria]);

  useEffect(() => {
    tiposServicioApi.list().then(setTiposServicio).catch(() => setTiposServicio([]));
    modalidadesContratoApi.list().then(setModalidadesContrato).catch(() => setModalidadesContrato([]));
    modalidadesLiqApi.list().then(setModalidadesLiq).catch(() => setModalidadesLiq([]));
  }, []);

  /*
    EL TIPO SE BUSCA CON LA MISMA FUNCIÓN QUE USA EL RESOLUTOR, no con una copia.

    Acá había un `find` por igualdad de nombre, que es lo que `resolveAfipValues` dejó de hacer: el
    nombre del contrato trae el sufijo de la empleadora («Jornada 2030 SRL») y el catálogo guarda el
    canónico («Jornada»). Con las dos búsquedas distintas, el modal MOSTRABA los datos del tipo
    —porque los lee del resolutor, que sí lo encuentra— y al guardar decía «No se encontró el tipo de
    contrato de este contrato», que es la peor forma del error: la pantalla afirma una cosa y la
    acción, la contraria.

    Dos búsquedas del mismo objeto se separan solas. Ahora es una.
  */
  const tipo: ContratoItem | undefined = useMemo(() => buscarTipoContrato(cat.tipos, row.nombre_contrato), [cat.tipos, row.nombre_contrato]);
  const nombreTipo = row.nombre_contrato || 'este tipo de contrato';


  /*
    Acá estaba «guardarEnTipo», que escribía los tres códigos ARCA en el tipo de contrato desde este
    modal. Se fue con los pickers: los códigos se editan en el tipo, no en la ficha de una persona,
    donde una edición alcanzaba a los 143 contratos que comparten ese tipo sin que se viera.
  */

  const guardarEnContrato = async (campo: 'sucursal' | 'actividad' | 'categoria', valor: string) => {
    // `valor` vacío en categoría = limpiarla (ver el picker de convenio).
    setGuardando(campo);
    try {
      if (campo === 'categoria') {
        // El server recalcula los sueldos derivados y los devuelve: la fila de la grilla tiene que
        // quedar con el sueldo de la categoría nueva, no con el de la anterior.
        const res = await projectsAPI.updateCategoriaSat(row.projectId, row.userId, row.contractIndex, valor === '' ? null : Number(valor));
        onGuardado({
          categoria_sat_id: res.categoria_sat_id,
          nombre_categoria_sat: res.nombre_categoria_sat,
          sueldo_neto: res.sueldo_neto,
          sueldo_bruto: res.sueldo_bruto,
        } as any);
      } else if (campo === 'sucursal') {
        const res = await projectsAPI.updateSucursalArca(row.projectId, row.userId, row.contractIndex, valor);
        onGuardado({ sucursalArcaId: res.sucursalArcaId || '', actividadArca: res.actividadArca || '' });
      } else {
        await projectsAPI.updateActividadArca(row.projectId, row.userId, row.contractIndex, valor);
        onGuardado({ actividadArca: valor });
      }
      setAbierto(null);
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo guardar.');
    } finally {
      setGuardando(null);
    }
  };

  const hayEmpresa = !!row.empresaContratoId;
  /**
   * LA CASCADA. Un solo estado derivado gobierna qué se puede tocar.
   *
   *     empleadora → convenio → categoría → obra social → el resto
   *
   * No es una preferencia de orden: cada eslabón define el conjunto elegible del siguiente. Sin
   * empleadora no existe la lista de convenios; sin convenio, la de categorías; y la obra social que
   * rige cuando ARCA no devuelve una propia es LA DEL CONVENIO, así que validarla antes de tener
   * convenio y categoría es validar contra un default que todavía puede cambiar.
   *
   * ESTO YA ESTUVO Y SE SACÓ, y conviene saber por qué vuelve. El comentario que lo removió decía que
   * poner la obra social como prerrequisito convertía «el paso MÁS LENTO y más externo, el único que
   * obliga a salir a ARCA con clave fiscal», en condición de cinco campos que no dependen de ella. Eso
   * era cierto entonces. Dejó de serlo: la validación ahora la corre el servidor con su propio usuario
   * delegado —nadie sale a ARCA ni instala nada— y el costo que justificaba la excepción desapareció.
   *
   * El precio que SÍ sigue en pie: los cinco campos del final (Sucursal, Actividad, Grupo/Tipo de
   * Servicio, Modalidades) no dependen de la obra social por ninguna regla del organismo. Se bloquean
   * por orden de trabajo, no por dependencia real. Si alguna vez eso vuelve a estorbar, este es el
   * lugar y `restoHabilitado` es la línea.
   */
  const convenioElegido = convenioFiltro || valores.convenioCategoria;
  const cascada = {
    convenio: hayEmpresa,
    categoria: hayEmpresa && !!convenioElegido,
    obraSocial: hayEmpresa && !!convenioElegido && !!valores.categoriaProf,
    resto: hayEmpresa && !!convenioElegido && !!valores.categoriaProf && valores.constatacion !== 'sin_constatar',
  };

  /** Por qué un campo está en espera. Siempre el eslabón que falta, nunca «completá lo anterior». */
  const motivoDe = (paso: keyof typeof cascada): React.ReactNode => {
    if (!hayEmpresa) return <>se habilita al elegir la empleadora</>;
    if (paso === 'categoria') return <>se habilita al elegir el convenio</>;
    if (paso === 'obraSocial') return <>se habilita al elegir la categoría</>;
    if (paso === 'resto') return !convenioElegido ? <>se habilita al elegir el convenio</> : !valores.categoriaProf ? <>se habilita al elegir la categoría</> : <>se habilita al validar la obra social</>;
    return <>se habilita al elegir la empleadora</>;
  };

  const bloqueadoPorPrevios = !cascada.resto;
  const motivoBloqueo = motivoDe('resto');
  // Por el CÓDIGO ya resuelto y no por `row.sucursalArcaId`: cuando el contrato no eligió ninguna,
  // rige la habitual de la empleadora (ver `resolveAfipValues`) y el nombre tiene que acompañarla.
  const sucursalElegida = valores.sucursalesDisponibles.find((s) => String(s.codigo) === valores.sucursal);
  /** `true` si lo que se muestra es el default de la empleadora y no una elección de este contrato. */
  const sucursalEsDefault = !row.sucursalArcaId && !!valores.sucursal;
  /** El domicilio habitual de esta empleadora, si dejó uno marcado (ficha → ARCA → Domicilios). */
  const sucursalPorDefecto = (cat.empresas?.find((e) => e._id === row.empresaContratoId) as { defaultsArca?: { sucursalId?: string | null } } | undefined)?.defaultsArca?.sucursalId || '';
  /** El convenio habitual de esta empleadora, en código (ficha → ARCA → Convenios). */
  const convenioHabitual = (() => {
    const emp = cat.empresas?.find((e) => e._id === row.empresaContratoId) as { defaultsArca?: { convenioId?: string | null } } | undefined;
    const id = emp?.defaultsArca?.convenioId;
    return id ? String(cat.convenios?.find((c) => c._id === String(id))?.externalId || '').trim() : '';
  })();

  // La fecha de fin depende de la modalidad: sin modalidad no se sabe si corresponde.
  const exigeFin = MODALIDADES_PLAZO_DETERMINADO.includes(valores.modalidadContrato);
  const prohibeFin = MODALIDADES_TIEMPO_INDETERMINADO.includes(valores.modalidadContrato);

  const nombreDe = (lista: SimpleCatalogItem[], codigo: string) => lista.find((x) => String(x.externalId || '').trim() === codigo)?.name || '';

  return (
    <>
      {/* Obra Social va a lo ancho y no en una columna: es el único campo con un trámite propio —el
          valor lo pone ARCA, no un catálogo— y adentro de una columna no entraban ni el nombre de la
          obra social ni su línea de estado. Con el mismo formato que la banda de Empleador, el trash
          queda alineado donde el ojo ya lo busca. */}
      <div ref={camposRef}>
        <div data-campo="obraSocial" data-depende-de="convenio">
        {/*
          BANDA 2 — CONVENIO, con la CATEGORÍA adentro.

          Mismo formato que las bandas de Empleador y Obra Social: ancho completo, borde propio, y el
          color dice si el paso está resuelto. Los tres van arriba y en el orden en que se resuelven,
          para que se lea de un vistazo que se elige DE A UNO y que lo de abajo espera.

          La categoría va dentro de la misma caja, separada por una línea, porque no es un paso
          aparte: es lo que el convenio condiciona. Sacarla afuera la volvería un cuarto paso y
          rompería la correspondencia con lo que hace ARCA, donde se elige convenio y en el mismo
          lugar la categoría de ese convenio.
        */}
        {/*
          EL RAIL ABRAZA LOS TRES: convenio → categoría → obra social.

          Es el mismo degradé que usa Sucursal → Actividad, y dice lo mismo: que están encadenadas y
          en qué dirección (fuerte arriba, tenue abajo, del que manda al que depende). Acá la cadena
          es de tres eslabones porque la obra social por defecto también cuelga del convenio, y ese
          era el enlace que no se veía: la validación fija un valor que eligió el convenio, dos cajas
          más arriba.
        */}
        <DepGroup etiqueta="Convenio, categoría y obra social">
        <div className="mb-3">
          <div className={`rounded-lg border px-3 py-2.5 ${valores.categoriaProf ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/40'}`}>
            <div>
              <CampoArca
                rotulo="Convenio"
                campo="convenio"
                info="convenioCategoria"
                rol="filtra"
                /*
                  Muestra EL FILTRO ELEGIDO, no el convenio derivado de la categoría.

                  Antes el campo era de solo lectura y mostrar el derivado era correcto. Ahora que se
                  puede elegir, mostrar el derivado significa que elegís 0322/75, la lista de abajo se
                  filtra bien, y el campo te sigue diciendo 0634/11: se lee como que la elección no se
                  guardó.

                  Mientras los dos no coincidan, el `origen` lo dice: el convenio del alta lo define la
                  CATEGORÍA, y hasta que no se elija una del convenio nuevo, la guardada sigue siendo
                  la de antes. Callar esa diferencia sería peor que la confusión original.
                */
                valor={cascada.convenio ? convenioFiltro || valores.convenioCategoria : ''}
                nombre={cascada.convenio ? cat.convenios?.find((c) => String(c.externalId || '').trim() === (convenioFiltro || valores.convenioCategoria))?.name : undefined}
                falta={cascada.convenio && !convenioFiltro && !valores.convenioCategoria}
                enEspera={!cascada.convenio}
                onEditar={cascada.convenio ? () => setAbierto('convenio') : undefined}
                origen={
                  !cascada.convenio ? (
                    motivoDe('convenio')
                  ) : convenioFiltro && valores.convenioCategoria && convenioFiltro !== valores.convenioCategoria ? (
                    <>
                      filtro elegido · la categoría guardada sigue siendo del <strong>{valores.convenioCategoria}</strong>
                    </>
                  ) : (
                    <>
                      {/* Las dos cosas que cuelgan del convenio. La obra social se nombra acá porque
                          es la que rige cuando ARCA no devuelve una propia —el caso más común— y
                          hasta ahora eso solo se descubría al validar. */}
                      define las <strong>categorías</strong> elegibles y la <strong>obra social por defecto</strong> · no va al archivo
                    </>
                  )
                }
              />

              {/* Adentro y DEBAJO, separada por una línea: la categoría es lo que el convenio
                  condiciona, no un paso aparte. */}
              <div className="mt-1 pt-2.5 border-t border-gray-200 dark:border-gray-700/60">
                <CampoArca
                  rotulo="Categoría"
                  campo="categoria"
                  dependeDe="convenio"
                  info="categoriaProf"
                  rol="campo"
                  etiqueta="101–106"
                  valor={valores.categoriaProf}
                  nombre={cat.categorias.find((c) => String(c.data?.codigoAfip ?? '') === valores.categoriaProf)?.name}
                  falta={!valores.categoriaProf}
                  enEspera={!cascada.categoria}
                  onEditar={cascada.categoria ? () => setAbierto('categoria') : undefined}
                  guardando={guardando === 'categoria'}
                  origen={!cascada.categoria ? motivoDe('categoria') : valores.convenioCategoria ? <>del convenio <strong>{valores.convenioCategoria}</strong> · cambia el sueldo del contrato</> : <>elegí una del convenio {convenioElegido}</>}
                />
              </div>

              {/*
                LA RETRIBUCIÓN VA ACÁ, DEBAJO DE LA CATEGORÍA. Es lo que la categoría decide.

                Estaba sola en un grupo «Remuneración» al final del formulario, y ahí quedaba colgada:
                un recuadro suelto diciendo «Falta» sin nada al lado que explicara de qué depende. Se
                completa sola al elegir la categoría, dos bloques más arriba, y esa relación no se veía
                por ningún lado. El chequeo ya lo sabía —su origen es `categoria_sat`, el mismo que el
                de la categoría—: lo que faltaba era que la pantalla lo dijera.

                APARECE RECIÉN CON LA CATEGORÍA ELEGIDA, por la misma razón que el resto de la cascada:
                antes de eso no hay ningún importe que mostrar, y un campo vacío pidiendo atención por
                algo que todavía no se puede resolver es exactamente lo que este modal viene evitando.

                Y NO SE EDITA. Sale del grupo salarial del convenio y se actualiza por paritaria; el
                valor correcto es el de la escala, no el que alguien tipee acá. Antes ya era de solo
                lectura —nunca tuvo `onEditar`— pero se dibujaba con el mismo recuadro que los campos
                que sí se eligen, así que parecía editable y roto. Como línea, se lee como lo que es:
                un dato derivado.
              */}
              {valores.categoriaProf && (
                <div className="mt-1 pt-2.5 border-t border-gray-200 dark:border-gray-700/60">
                  <FilaArca
                    rotulo="Retribución pactada"
                    campo="retribucion"
                    dependeDe="categoria"
                    info="retribucion"
                    etiqueta="58–72"
                    valor={valores.retribucion > 0 ? valores.retribucion.toLocaleString('es-AR', { minimumFractionDigits: 2 }) : ''}
                    vacio="— el grupo salarial de esta categoría no tiene sueldo bruto cargado"
                    faltaEsError
                    origen={<>del grupo salarial del convenio · se actualiza por paritaria</>}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

          {/*
            La obra social va DESPUÉS del convenio y la categoría.

            Cuando ARCA no devuelve una afiliación propia, la que rige es la del CONVENIO. Validar
            antes de tener convenio y categoría es validar contra un default que todavía puede
            cambiar: se elige otro convenio y esa validación queda hablando de otra obra social.
          */}
          {cascada.obraSocial ? (
            <CampoObraSocial
              row={row}
              valores={valores}
              onGuardado={onGuardado}
              onValidarEnPantalla={onValidarObraSocial}
              convenioPendiente={convenioFiltro && valores.convenioCategoria && convenioFiltro !== valores.convenioCategoria ? convenioFiltro : undefined}
            />
          ) : (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30 px-4 py-3 flex items-center gap-3">
              <FontAwesomeIcon icon={faLock} className="h-3 w-3 shrink-0 text-gray-400" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Obra social</p>
                {/* El motivo concreto, no «completá lo anterior»: lo que falta es UN eslabón y hay que
                    poder ir a ese. */}
                <p className="text-[12.5px] text-gray-500 dark:text-gray-400">{motivoDe('obraSocial')}</p>
              </div>
            </div>
          )}
        </DepGroup>
        </div>

        {/*
          EL RESTO, Y SE VE QUE ESTÁ ESPERANDO.

          Los campos ya salen apagados y con candado uno por uno, pero de a doce eso se lee como «hay
          muchos datos que faltan» y no como «todavía no es el turno de esto». La franja lo dice una
          vez, arriba, y el atenuado del bloque separa los tres pasos de arriba —donde SÍ hay que
          hacer algo— del resto.

          `pointer-events-none` no se usa: cada campo ya decide si es clickeable, y apagar el bloque
          entero también apagaría los ⓘ, que son lo único que se puede consultar mientras se espera.
        */}
        {!cascada.resto && (
          <div className="mb-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 px-3 py-2 flex items-center gap-2.5">
            <FontAwesomeIcon icon={faLock} className="h-3 w-3 shrink-0 text-gray-400" />
            <p className="text-[12px] text-gray-500 dark:text-gray-400">
              Lo de abajo <strong>{motivoDe('resto')}</strong>. Se completa de a un paso: empleadora, convenio y categoría, obra social.
            </p>
          </div>
        )}

        {/*
          ZONA 1 — LO QUE SE COMPLETA ACÁ, en tres grupos con título y dos columnas.

          Antes eran tres columnas de nombre genérico («Relación laboral», «Servicio y liquidación»,
          «Vigencia») que mezclaban cuatro naturalezas con la misma apariencia de input: lo que se
          edita acá, lo que se deriva de otro campo, lo que se edita en el tipo de contrato y lo que
          es constante. Todo con forma de control, y un control promete una decisión.

          Acá quedan SOLO los que se completan en esta pantalla. Los códigos del tipo bajaron a la
          Zona 2 y los constantes a la Zona 3. Dos columnas y no tres: a tres, cada campo tenía menos
          de un cuarto del ancho y los domicilios y descripciones de actividad se cortaban al medio.
        */}
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-x-5 transition-opacity ${cascada.resto ? '' : 'opacity-60'}`}>
          {/* ── Domicilio y actividad ───────────────────────────────────────────── */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Domicilio y actividad</h4>

            {/*
              Sucursal y Actividad son un PAR: la actividad solo puede ser una de las declaradas por
              la empleadora para ese domicilio.

              Van agrupadas pero SIN badge de «filtra», y la diferencia no es cosmética. «Filtra»
              marca a los campos que NO van al archivo, como el Convenio, que existe solo para acotar
              la lista de abajo. La Sucursal sí viaja al alta (pos. 74-78), así que llamarla filtro
              diría que no se guarda, que es lo contrario de lo que pasa.

              Lo que las dos comparten es la DEPENDENCIA, y eso es lo que dibuja el rail. El título de
              arriba es nuevo: el rail decía que estaban encadenadas, pero no de qué.
            */}
            <DepGroup etiqueta="Domicilio y actividad">
              <CampoArca
                rotulo="Sucursal"
                campo="sucursal"
                info="sucursal"
                rol="campo"
                etiqueta="74–78"
                valor={valores.sucursal}
                nombre={sucursalElegida?.domicilio}
                falta={hayEmpresa && !valores.sucursal}
                enEspera={bloqueadoPorPrevios}
                guardando={guardando === 'sucursal'}
                onEditar={() => setAbierto('sucursal')}
                origen={
                  bloqueadoPorPrevios ? (
                    motivoBloqueo
                  ) : sucursalEsDefault ? (
                    // Se dice que es el habitual, no se hace pasar por una elección: quien mira tiene
                    // que poder distinguir «lo eligieron» de «vino puesto».
                    <>
                      <strong>habitual</strong> de la empleadora · elegí otro si este alta va en otro domicilio
                    </>
                  ) : (
                    <>de los domicilios declarados por la empleadora</>
                  )
                }
              />

              {/*
                UN SOLO INPUT POR DECISIÓN REAL.

                La actividad es del domicilio: la empleadora declara ante ARCA qué actividades ejerce
                en cada uno, y el alta tiene que traer una de ésas. Cuando declaró UNA SOLA no hay
                nada que decidir —el valor queda determinado por la sucursal— y dibujar un segundo
                selector al lado del primero inventaba una elección que no existe: dos controles para
                un solo grado de libertad.

                Con varias sí vuelve a ser selector, porque ahí sí hay que decidir cuál se declara.
                ARCA rechaza el alta con una que ese CUIT no declaró en ese domicilio, así que la
                diferencia entre heredar y elegir es la diferencia entre un dato correcto y un rechazo.

                Lo que NO cambia es cómo se resuelve ni qué se guarda: la herencia ya vivía en
                `afipCompleteness` (`actividadOrigen === 'unica'`), se deriva al leer y no se persiste.
                Acá cambia únicamente cómo se muestra.
              */}
              {valores.actividadesDisponibles.length > 1 ? (
                <CampoArca
                  rotulo="Actividad"
                  campo="actividad"
                  dependeDe="sucursal"
                  info="actividad"
                  rol="campo"
                  etiqueta="79–84"
                  valor={valores.actividad}
                  nombre={valores.actividadesDisponibles.find((a) => a.codigo === valores.actividad)?.descripcion}
                  falta={!!valores.sucursal && !valores.actividad}
                  enEspera={bloqueadoPorPrevios || !valores.sucursal}
                  guardando={guardando === 'actividad'}
                  onEditar={() => setAbierto('actividad')}
                  origen={bloqueadoPorPrevios ? motivoBloqueo : <>{valores.actividadesDisponibles.length} declaradas en <strong>{valores.nombreSucursal || 'la sucursal'}</strong> · elegí cuál se declara</>}
                />
              ) : (
                <FilaArca
                  rotulo="Actividad"
                  campo="actividad"
                  dependeDe="sucursal"
                  info="actividad"
                  etiqueta="79–84"
                  valor={valores.actividad}
                  nombre={valores.actividadesDisponibles.find((a) => a.codigo === valores.actividad)?.descripcion}
                  vacio={bloqueadoPorPrevios ? '— en espera' : valores.sucursal ? '— la sucursal no tiene actividades declaradas' : '— se hereda al elegir la sucursal'}
                  faltaEsError={!!valores.sucursal}
                  origen={bloqueadoPorPrevios ? motivoBloqueo : valores.sucursal ? <>única de <strong>{valores.nombreSucursal || 'esta sucursal'}</strong>, se hereda</> : <>se hereda al elegir la sucursal</>}
                />
              )}
            </DepGroup>
          </div>

          {/* ── Vigencia ────────────────────────────────────────────────────────── */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Vigencia</h4>

            <CampoArca rotulo="Fecha de Inicio" campo="fechaInicio" info="fechaInicio" rol="campo" etiqueta="20–29" valor={fechaLegible(valores.fechaInicio)} falta={!valores.fechaInicio} origen={<>del contrato del miembro</>} />

            {/*
              CON MODALIDAD INDETERMINADA, LA FECHA DE FIN NO CORRESPONDE — y eso no es un campo vacío.

              El registro la exige en blanco, así que un recuadro vacío pidiendo atención estaba
              pidiéndola por algo que no hay que hacer. Pasa a línea de solo lectura y sale del
              contador (`noAplica` en el chequeo): con esta modalidad el formulario tiene cuatro
              campos, no cinco con uno regalado.

              Los otros tres casos siguen igual, porque en los tres hay algo que mirar: en espera
              mientras no haya modalidad, ámbar si la modalidad la exige y falta, y rojo si está
              cargada cuando tenía que ir vacía.
            */}
            {prohibeFin && !valores.fechaFin ? (
              <FilaArca
                rotulo="Fecha de Fin"
                campo="fechaFin"
                dependeDe="modalidadContrato"
                info="fechaFin"
                etiqueta="30–39"
                vacio="— no corresponde para esta modalidad"
                origen={
                  <>
                    la modalidad <strong>{valores.modalidadContrato}</strong> es por tiempo indeterminado: el registro la exige en blanco
                  </>
                }
              />
            ) : (
              <CampoArca
                rotulo="Fecha de Fin"
                campo="fechaFin"
                dependeDe="modalidadContrato"
                info="fechaFin"
                rol="campo"
                etiqueta="30–39"
                valor={fechaLegible(valores.fechaFin)}
                falta={exigeFin && !valores.fechaFin}
                error={prohibeFin && !!valores.fechaFin}
                enEspera={!valores.modalidadContrato}
                origen={!valores.modalidadContrato ? <>se habilita al elegir la modalidad de contrato</> : exigeFin ? <>la modalidad <strong>{valores.modalidadContrato}</strong> es a plazo determinado: es obligatoria</> : prohibeFin ? <>la modalidad <strong>{valores.modalidadContrato}</strong> es indeterminada: va en blanco</> : <>del contrato del miembro</>}
              />
            )}
          </div>

          {/* ── Remuneración ────────────────────────────────────────────────────── */}
          {/* Acá estaba el grupo «Remuneración», con la Retribución pactada sola adentro. Se mudó al
              recuadro del convenio, debajo de la Categoría, que es la que la define. */}
        </div>

        <CodigosDelTipo
          nombreTipo={nombreTipo}
          tipoId={tipo?._id}
          modalidadContrato={valores.modalidadContrato}
          nombreModalidadContrato={nombreDe(modalidadesContrato, valores.modalidadContrato)}
          tipoServicio={valores.tipoServicio}
          nombreTipoServicio={nombreDe(tiposServicio, valores.tipoServicio)}
          modalidadLiq={valores.modalidadLiq}
          nombreModalidadLiq={nombreDe(modalidadesLiq, valores.modalidadLiq)}
          onRefrescar={onCambioNivel}
        />

        <ValoresFijos />
      </div>

      {/* ── Pickers ─────────────────────────────────────────────────────────── */}
      <PickerArca
        abierto={abierto === 'sucursal'}
        onCerrar={() => setAbierto(null)}
        titulo="Sucursal"
        subtitulo="Domicilios de explotación declarados por esta empleadora ante ARCA."
        /*
          El domicilio HABITUAL de la empleadora va primero y marcado con ★.

          No se autocompleta en el contrato a propósito: el domicilio decide qué actividades acepta
          ARCA, y un default escrito solo dejaría el formulario viéndose completo con uno que nadie
          miró. Se ofrece primero y se elige con un click, que es la diferencia entre sugerir y decidir
          por el otro.
        */
        opciones={[...valores.sucursalesDisponibles]
          .sort((a, b) => (a._id === sucursalPorDefecto ? -1 : b._id === sucursalPorDefecto ? 1 : 0))
          .map((s) => ({
            codigo: s.codigo,
            nombre: s.domicilio,
            etiqueta: s.actividades.length === 0 ? 'sin actividades' : s._id === sucursalPorDefecto ? '★ habitual' : undefined,
          }))}
        valor={valores.sucursal}
        guardando={guardando === 'sucursal'}
        onElegir={(o) => {
          const s = valores.sucursalesDisponibles.find((x) => x.codigo === o.codigo);
          if (s) guardarEnContrato('sucursal', s._id);
        }}
        vacio={<>La empleadora no tiene domicilios de explotación cargados. Extraé su padrón en ARCA (Datos del Empleador → Domicilios de Explotación) y cargalo en su ficha.</>}
      />

      <PickerArca
        abierto={abierto === 'actividad'}
        onCerrar={() => setAbierto(null)}
        titulo="Actividad del domicilio"
        subtitulo={`Solo las declaradas en ${valores.nombreSucursal || 'esta sucursal'}. ARCA rechaza cualquier otra.`}
        opciones={valores.actividadesDisponibles.map((a) => ({ codigo: a.codigo, nombre: a.descripcion || '' }))}
        valor={valores.actividad}
        guardando={guardando === 'actividad'}
        onElegir={(o) => guardarEnContrato('actividad', o.codigo)}
      />

      {/*
        CONVENIO — filtra la lista de abajo y NO se guarda.

        Mismo rol que «Grupo de tipo de servicio» unas líneas más abajo. Solo se ofrecen los convenios
        que esta empleadora tiene registrados ante ARCA (`conveniosEmpresa`): el catálogo entero son
        ~2.669 y el organismo rechaza el alta con una categoría de un convenio que este CUIT no
        registró, así que ofrecerlos sería ofrecer errores.
      */}
      <PickerArca
        abierto={abierto === 'convenio'}
        onCerrar={() => setAbierto(null)}
        titulo="Convenio colectivo"
        subtitulo="Solo filtra las categorías de abajo. No se guarda ni va al archivo: ARCA lo deduce de la categoría."
        opciones={[
          { codigo: '', nombre: 'Sin filtrar — ver todas las categorías de la empleadora' },
          // El habitual primero y marcado: es sugerencia, los otros siguen elegibles.
          ...[...(valores.conveniosEmpresa || [])]
            .sort((a, b) => (a === convenioHabitual ? -1 : b === convenioHabitual ? 1 : 0))
            .map((cct) => {
              const nombre = cat.convenios?.find((c) => String(c.externalId || '').trim() === cct)?.name || '';
              const cuantas = cat.categorias.filter((c) => String(c.data?.convenio || '').trim() === cct && c.isActive !== false).length;
              return { codigo: cct, nombre, etiqueta: cct === convenioHabitual ? `★ habitual · ${cuantas} categorías` : `${cuantas} categorías` };
            }),
        ]}
        valor={convenioFiltro}
        onElegir={async (o) => {
          setConvenioFiltro(o.codigo);
          setAbierto(null);
          /*
            LA CATEGORÍA DE OTRO CONVENIO SE LIMPIA, y sin preguntar.

            Lo que viaja al archivo es la categoría; el convenio ARCA lo deduce DE ELLA. Un contrato
            con convenio 0102/90 y categoría del 9999/99 no es un aviso pendiente: es un alta que el
            organismo va a rechazar, con el agravante de que en pantalla se ve completa.

            SIN CONFIRMACIÓN a propósito: cambiar de convenio ES pedir otra categoría, así que
            preguntar «¿seguro?» sería preguntar por lo que se acaba de elegir. El cambio se ve solo —
            la categoría pasa a «Falta» y el picker de abajo ya ofrece las del convenio nuevo—, que es
            mejor feedback que un cartel que hay que cerrar antes de seguir.
          */
          if (!o.codigo || !valores.categoriaProf) return;
          const cat0 = cat.categorias.find((c) => String(c.data?.codigoAfip ?? '') === valores.categoriaProf);
          if (String(cat0?.data?.convenio || '').trim() === o.codigo) return;
          await guardarEnContrato('categoria', '');
        }}
        vacio={<>Esta empleadora no tiene convenios registrados. Cargalos en su ficha (ARCA → Convenios): sin convenio no hay categoría que ARCA acepte.</>}
      />

      {/*
        CATEGORÍA — esto SÍ es el dato del alta (pos. 101-106) y sí se guarda.

        Cambiarla recalcula los sueldos derivados del contrato, y por eso el subtítulo lo dice: el
        neto y el bruto salen de la escala del convenio, no se cargan a mano.
      */}
      <PickerArca
        abierto={abierto === 'categoria'}
        onCerrar={() => setAbierto(null)}
        titulo="Categoría profesional"
        subtitulo={convenioFiltro ? `Las del convenio ${convenioFiltro}. Cambiarla recalcula el sueldo neto y bruto del contrato.` : 'Las de los convenios de esta empleadora. Cambiarla recalcula el sueldo neto y bruto del contrato.'}
        opciones={categoriasOfrecidas.map((c) => ({ codigo: String(c.data?.codigoAfip ?? ''), nombre: c.name || '', etiqueta: String(c.data?.convenio || '').trim() }))}
        valor={valores.categoriaProf}
        guardando={guardando === 'categoria'}
        onElegir={(o) => {
          const elegida = categoriasOfrecidas.find((c) => String(c.data?.codigoAfip ?? '') === o.codigo);
          // Al archivo va el código de 6 dígitos, pero lo que se guarda en el contrato es el id del
          // catálogo: son dos números distintos y confundirlos escribe una categoría que no existe.
          if (elegida?.data?.id != null) {
            guardarEnContrato('categoria', String(elegida.data.id));
            return;
          }
          /*
            La categoría existe en el catálogo pero NO TIENE id numérico, y sin él no se puede guardar:
            el contrato la referencia por número. Le pasa a las creadas en el ABM nuevo, que nacían sin
            ese campo.

            Se dice en voz alta en vez de no hacer nada. El silencio es lo que hacía que esto se
            leyera como «el botón está roto»: la lista la ofrece, se la clickea, y no pasa nada.
          */
          sweetAlert.warningAlert(
            'Esa categoría todavía no se puede elegir',
            `«${elegida?.name || o.nombre}» no tiene número interno, y el contrato guarda la categoría por número. Es un dato que falta en el catálogo, no un error de esta pantalla.\n\nSe arregla de una vez corriendo la numeración de categorías en el servidor: npm run categorias:legacy-id`,
          );
        }}
        vacio={<>No hay categorías para ese convenio en el catálogo. Cargalas en Configuración → ARCA → Categorías.</>}
      />

      {/*
        Acá vivían los pickers de Grupo de tipo de servicio, Tipo de servicio, Modalidad de contrato
        y Modalidad de liquidación. Los tres últimos ya no se editan desde Datos ARCA —son del TIPO
        de contrato, y se editan allá, donde se ve a cuántos contratos alcanza el cambio—. El grupo
        era solo el filtro de uno de ellos, así que se fue con ellos: ahora es el filtro que va
        adentro del selector de Tipo de servicio, en el modal Editar Contrato.
      */}
    </>
  );
};
