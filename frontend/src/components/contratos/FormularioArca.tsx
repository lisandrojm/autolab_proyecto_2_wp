import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ContractOverviewRow } from '../../api/users';
import { AfipCatalogs, AfipValues, MODALIDADES_PLAZO_DETERMINADO, MODALIDADES_TIEMPO_INDETERMINADO } from './afipCompleteness';
import { createSimpleCatalogApi, SimpleCatalogItem } from '../../api/simpleCatalog';
import { contratosAPI, ContratoItem } from '../../api/contratos';
import { projectsAPI } from '../../api/projects';
import { sweetAlert } from '../../utils/sweetAlert';
import { CampoArca, DepGroup } from './CampoArca';
import { useResaltadoDependencias } from './useResaltadoDependencias';
import { CampoObraSocial } from './CampoObraSocial';
import { PickerArca, OpcionPicker } from './PickerArca';

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
const gruposTipoServicioApi = createSimpleCatalogApi('/arca/grupos-tipo-servicio');
const modalidadesContratoApi = createSimpleCatalogApi('/arca/modalidades-contratacion');
const modalidadesLiqApi = createSimpleCatalogApi('/arca/modalidades-liquidacion');

/** Qué campo tiene el picker abierto. */
type CampoAbierto = null | 'sucursal' | 'actividad' | 'modalidadContrato' | 'tipoServicio' | 'modalidadLiq' | 'grupoTipoServicio';

const opcion = (c: SimpleCatalogItem, etiqueta?: string): OpcionPicker => ({ codigo: String(c.externalId || '').trim(), nombre: c.name, etiqueta });

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
  const [gruposTS, setGruposTS] = useState<SimpleCatalogItem[]>([]);
  const [modalidadesContrato, setModalidadesContrato] = useState<SimpleCatalogItem[]>([]);
  const [modalidadesLiq, setModalidadesLiq] = useState<SimpleCatalogItem[]>([]);
  /**
   * El filtro arranca en el grupo que la empleadora dejó como default (ARCA → Defaults).
   *
   * Es solo el punto de partida del combo, no un valor del alta: el grupo no viaja al TXT. Se puede
   * cambiar o poner en «sin filtrar» acá mismo, y no toca lo que la empresa tenga guardado.
   */
  const [grupoTS, setGrupoTS] = useState<string>(() => {
    const empresa = row.empresaContratoId ? cat.empresas?.find((e) => e._id === row.empresaContratoId) : undefined;
    return (empresa as { defaultsArca?: { grupoTipoServicio?: string } } | undefined)?.defaultsArca?.grupoTipoServicio || '';
  });

  useEffect(() => {
    tiposServicioApi.list().then(setTiposServicio).catch(() => setTiposServicio([]));
    gruposTipoServicioApi.list().then(setGruposTS).catch(() => setGruposTS([]));
    modalidadesContratoApi.list().then(setModalidadesContrato).catch(() => setModalidadesContrato([]));
    modalidadesLiqApi.list().then(setModalidadesLiq).catch(() => setModalidadesLiq([]));
  }, []);

  /** El tipo de contrato de esta fila y a cuántos contratos afecta tocarlo. */
  const tipo: ContratoItem | undefined = useMemo(() => cat.tipos.find((t) => t.name === row.nombre_contrato), [cat.tipos, row.nombre_contrato]);
  const nombreTipo = row.nombre_contrato || 'este tipo de contrato';

  const alcanceTipo = (
    <>
      Este valor vive en el <strong>tipo de contrato «{nombreTipo}»</strong>. Al guardarlo se aplica a <strong>todos los contratos</strong> que lo usan, no solo a esta persona.
    </>
  );

  /** Guarda uno de los tres códigos del tipo de contrato, preservando el resto de sus campos. */
  const guardarEnTipo = async (campo: 'afipModalidadContrato' | 'afipTipoServicio' | 'afipModalidadLiquidacion', valor: string) => {
    if (!tipo) return sweetAlert.error('Error', 'No se encontró el tipo de contrato de este contrato.');
    setGuardando(campo);
    try {
      // Se manda el item completo: `update` reemplaza, así que mandar solo el código borraría el resto.
      await contratosAPI.update(tipo._id, {
        nombre: tipo.name,
        cantidadJornadas: tipo.data?.cantidadJornadas,
        multiplicadorDiario: tipo.data?.multiplicadorDiario,
        esTiempoIndeterminado: tipo.data?.esTiempoIndeterminado,
        requiereFirma: tipo.data?.requiereFirma,
        isActive: tipo.isActive,
        afipModalidadContrato: tipo.data?.afipModalidadContrato || '',
        afipTipoServicio: tipo.data?.afipTipoServicio || '',
        afipModalidadLiquidacion: tipo.data?.afipModalidadLiquidacion || '',
        [campo]: valor,
      } as never);
      setAbierto(null);
      onCambioNivel?.();
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo guardar el código.');
    } finally {
      setGuardando(null);
    }
  };

  const guardarEnContrato = async (campo: 'sucursal' | 'actividad', valor: string) => {
    setGuardando(campo);
    try {
      if (campo === 'sucursal') {
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
   * Lo único que bloquea es la EMPLEADORA. La obra social no bloquea nada.
   *
   * Antes acá también entraba `constatacion === 'sin_constatar'`, como un orden de trabajo impuesto:
   * primero la empleadora, después la validación en ARCA, y recién ahí el resto. Era una decisión y no
   * un descuido —el comentario viejo hasta enumeraba el costo—, pero en uso resultó al revés de lo que
   * buscaba: convertía el paso MÁS LENTO y más externo del formulario, el único que obliga a salir a
   * ARCA con clave fiscal, en prerrequisito de cinco campos que no tienen nada que ver con él.
   *
   * Ninguno de esos cinco depende de la obra social. Sucursal sale de los domicilios de la
   * empleadora; Actividad, de la sucursal; Grupo/Tipo de Servicio, Modalidad de Contrato y Modalidad
   * de Liquidación, del TIPO DE CONTRATO. Y la obra social nunca deja al contrato sin dato: si ARCA no
   * devuelve una propia, rige la del convenio.
   *
   * La empleadora sí bloquea, y por una razón distinta: sin ella no existe el conjunto de sucursales,
   * convenios ni obras sociales elegibles. No es un orden preferido, es que no hay entre qué elegir.
   */
  const bloqueadoPorPrevios = !hayEmpresa;
  const motivoBloqueo = <>se habilita al elegir la empleadora</>;
  const sucursalElegida = valores.sucursalesDisponibles.find((s) => s._id === row.sucursalArcaId);

  // La fecha de fin depende de la modalidad: sin modalidad no se sabe si corresponde.
  const exigeFin = MODALIDADES_PLAZO_DETERMINADO.includes(valores.modalidadContrato);
  const prohibeFin = MODALIDADES_TIEMPO_INDETERMINADO.includes(valores.modalidadContrato);

  const nombreDe = (lista: SimpleCatalogItem[], codigo: string) => lista.find((x) => String(x.externalId || '').trim() === codigo)?.name || '';

  /*
   * El tipo de servicio se filtra por grupo: sin filtrar, 98 nombres se repiten y son
   * indistinguibles.
   *
   * El grupo vive en la RAÍZ del documento (`t.grupo`), no adentro de `data`. Estaba leído como
   * `t.data.grupo`, que es siempre `undefined`: elegir un grupo dejaba la lista vacía y la columna
   * del grupo en blanco, o sea que el filtro no filtraba nada y encima parecía roto. Ver
   * `server/src/models/ArcaTipoServicio.ts`, donde `grupo` es un campo del esquema.
   */
  const tiposServicioFiltrados = useMemo(() => {
    const conGrupo = tiposServicio.map((t) => ({ item: t, grupo: String((t as { grupo?: unknown }).grupo ?? '') }));
    const lista = grupoTS ? conGrupo.filter((x) => x.grupo === grupoTS) : conGrupo;
    return lista.map((x) => opcion(x.item, x.grupo ? nombreDe(gruposTS, x.grupo) || x.grupo : undefined));
  }, [tiposServicio, gruposTS, grupoTS]);

  return (
    <>
      {/* Obra Social va a lo ancho y no en una columna: es el único campo con un trámite propio —el
          valor lo pone ARCA, no un catálogo— y adentro de una columna no entraban ni el nombre de la
          obra social ni su línea de estado. Con el mismo formato que la banda de Empleador, el trash
          queda alineado donde el ojo ya lo busca. */}
      <div ref={camposRef}>
        <div data-campo="obraSocial" data-depende-de="convenio">
          <CampoObraSocial row={row} valores={valores} onGuardado={onGuardado} onValidarEnPantalla={onValidarObraSocial} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-5">
          {/* ── Columna 1: relación laboral ─────────────────────────────────────── */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Relación laboral</h4>

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
              origen={bloqueadoPorPrevios ? motivoBloqueo : <>de los domicilios declarados por la empleadora</>}
            />

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
              onEditar={valores.actividadesDisponibles.length > 1 ? () => setAbierto('actividad') : undefined}
              origen={bloqueadoPorPrevios ? motivoBloqueo : valores.sucursal ? <>declarada en <strong>{valores.nombreSucursal || 'la sucursal'}</strong>{valores.actividadesDisponibles.length === 1 ? ' · única, se hereda' : ''}</> : <>se habilita al elegir la sucursal</>}
            />

            <DepGroup etiqueta="Convenio y categoría">
              <CampoArca
                rotulo="Convenio"
                campo="convenio"
                info="convenioCategoria"
                rol="filtra"
                etiqueta="filtra categoría"
                valor={valores.convenioCategoria}
                nombre={cat.convenios?.find((c) => String(c.externalId || '').trim() === valores.convenioCategoria)?.name}
                falta={!valores.convenioCategoria}
                origen={<>de la categoría · <strong>no va al archivo</strong></>}
              />

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
                origen={valores.convenioCategoria ? <>del convenio <strong>{valores.convenioCategoria}</strong> · se cambia en el contrato del miembro</> : <>se define en el contrato del miembro</>}
              />
            </DepGroup>

            <CampoArca rotulo="Puesto Desemp." rol="no_va" etiqueta="no va" origen={<>el registro de 130 lo deja vacío</>} />
          </div>

          {/* ── Columna 2: servicio y liquidación ───────────────────────────────── */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Servicio y liquidación</h4>

            <DepGroup etiqueta="Grupo tipo de servicio y tipo de servicio">
              <CampoArca
                rotulo="Grupo Tipo Servicio"
                campo="grupoTipoServicio"
                rol="filtra"
                etiqueta="filtra tipo"
                valor={grupoTS}
                nombre={grupoTS ? nombreDe(gruposTS, grupoTS) : 'sin filtrar'}
                enEspera={bloqueadoPorPrevios}
                onEditar={() => setAbierto('grupoTipoServicio')}
                origen={bloqueadoPorPrevios ? motivoBloqueo : <>solo filtra la lista de abajo · <strong>no se guarda</strong></>}
              />

              <CampoArca
                rotulo="Tipo Servicio"
                campo="tipoServicio"
                dependeDe="grupoTipoServicio"
                info="tipoServicio"
                rol="campo"
                etiqueta="107–109"
                valor={valores.tipoServicio}
                nombre={nombreDe(tiposServicio, valores.tipoServicio)}
                falta={!valores.tipoServicio}
                guardando={guardando === 'afipTipoServicio'}
                enEspera={bloqueadoPorPrevios}
                onEditar={() => setAbierto('tipoServicio')}
                origen={bloqueadoPorPrevios ? motivoBloqueo : <>del tipo de contrato <strong>«{nombreTipo}»</strong></>}
              />
            </DepGroup>

            <CampoArca
              rotulo="Modalidad Contrato"
              campo="modalidadContrato"
              info="modalidadContrato"
              rol="campo"
              etiqueta="17–19"
              valor={valores.modalidadContrato}
              nombre={nombreDe(modalidadesContrato, valores.modalidadContrato)}
              falta={!valores.modalidadContrato}
              guardando={guardando === 'afipModalidadContrato'}
              enEspera={bloqueadoPorPrevios}
              onEditar={() => setAbierto('modalidadContrato')}
              origen={bloqueadoPorPrevios ? motivoBloqueo : <>del tipo de contrato <strong>«{nombreTipo}»</strong> · define si va la fecha de fin</>}
            />

            <CampoArca rotulo="Situación Revista" rol="no_va" etiqueta="no va" origen={<>el registro de 130 lo deja vacío</>} />

            <CampoArca
              rotulo="Mod. Liquidación"
              campo="modalidadLiq"
              info="modalidadLiq"
              rol="campo"
              etiqueta="73"
              valor={valores.modalidadLiq}
              nombre={nombreDe(modalidadesLiq, valores.modalidadLiq)}
              falta={!valores.modalidadLiq}
              guardando={guardando === 'afipModalidadLiquidacion'}
              enEspera={bloqueadoPorPrevios}
              onEditar={() => setAbierto('modalidadLiq')}
              origen={bloqueadoPorPrevios ? motivoBloqueo : <>del tipo de contrato <strong>«{nombreTipo}»</strong></>}
            />

            <CampoArca
              rotulo="Retribución pactada"
              info="retribucion"
              rol="campo"
              etiqueta="58–72"
              valor={valores.retribucion > 0 ? valores.retribucion.toLocaleString('es-AR', { minimumFractionDigits: 2 }) : ''}
              falta={!valores.retribucionOk}
              origen={<>del grupo salarial del convenio · se actualiza por paritaria</>}
            />
          </div>

          {/* ── Columna 3: vigencia ─────────────────────────────────────────────── */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Vigencia</h4>

            <CampoArca rotulo="Trab. agropecuario" rol="constante" etiqueta="constante" valor="N" nombre="no aplica a una productora" origen={<>posición 16, siempre <strong>N</strong></>} />

            <CampoArca rotulo="Fecha de Inicio" info="fechaInicio" rol="campo" etiqueta="20–29" valor={valores.fechaInicio} falta={!valores.fechaInicio} origen={<>del contrato del miembro</>} />

            <CampoArca
              rotulo="Fecha de Fin"
              campo="fechaFin"
              dependeDe="modalidadContrato"
              info="fechaFin"
              rol="campo"
              etiqueta="30–39"
              valor={valores.fechaFin}
              nombre={!valores.fechaFin && prohibeFin ? 'en blanco, correcto' : undefined}
              falta={exigeFin && !valores.fechaFin}
              error={prohibeFin && !!valores.fechaFin}
              enEspera={!valores.modalidadContrato}
              origen={!valores.modalidadContrato ? <>se habilita al elegir la modalidad de contrato</> : exigeFin ? <>la modalidad <strong>{valores.modalidadContrato}</strong> es a plazo determinado: es obligatoria</> : prohibeFin ? <>la modalidad <strong>{valores.modalidadContrato}</strong> es indeterminada: va en blanco</> : <>del contrato del miembro</>}
            />

            <CampoArca rotulo="Lic. COVID / CCG" rol="constante" etiqueta="constante" valor="0" nombre="sin Lic. COVID / no asociado a CCG" origen={<>posición 130, siempre <strong>0</strong></>} />
          </div>
        </div>
      </div>

      {/* ── Pickers ─────────────────────────────────────────────────────────── */}
      <PickerArca
        abierto={abierto === 'sucursal'}
        onCerrar={() => setAbierto(null)}
        titulo="Sucursal"
        subtitulo="Domicilios de explotación declarados por esta empleadora ante ARCA."
        opciones={valores.sucursalesDisponibles.map((s) => ({ codigo: s.codigo, nombre: s.domicilio, etiqueta: s.actividades.length === 0 ? 'sin actividades' : undefined }))}
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

      <PickerArca
        abierto={abierto === 'grupoTipoServicio'}
        onCerrar={() => setAbierto(null)}
        titulo="Grupo de tipo de servicio"
        subtitulo="Solo filtra la lista de tipos de servicio. No se guarda ni va al archivo."
        opciones={[{ codigo: '', nombre: 'Sin filtrar — ver todos' }, ...gruposTS.map((g) => opcion(g))]}
        valor={grupoTS}
        onElegir={(o) => {
          setGrupoTS(o.codigo);
          setAbierto(null);
        }}
      />

      <PickerArca
        abierto={abierto === 'tipoServicio'}
        onCerrar={() => setAbierto(null)}
        titulo="Tipo de servicio"
        subtitulo={grupoTS ? `Los del grupo ${nombreDe(gruposTS, grupoTS) || grupoTS}.` : 'Todos los tipos de servicio. Hay nombres repetidos entre grupos: mirá el código y el grupo de la derecha.'}
        opciones={tiposServicioFiltrados}
        valor={valores.tipoServicio}
        guardando={guardando === 'afipTipoServicio'}
        onElegir={(o) => guardarEnTipo('afipTipoServicio', o.codigo)}
        alcance={alcanceTipo}
      />

      <PickerArca
        abierto={abierto === 'modalidadContrato'}
        onCerrar={() => setAbierto(null)}
        titulo="Modalidad de contrato"
        subtitulo="Define si la fecha de fin corresponde: las de plazo determinado la exigen y las indeterminadas la prohíben."
        opciones={modalidadesContrato.map((m) => opcion(m))}
        valor={valores.modalidadContrato}
        guardando={guardando === 'afipModalidadContrato'}
        onElegir={(o) => guardarEnTipo('afipModalidadContrato', o.codigo)}
        alcance={alcanceTipo}
      />

      <PickerArca
        abierto={abierto === 'modalidadLiq'}
        onCerrar={() => setAbierto(null)}
        titulo="Modalidad de liquidación"
        subtitulo="Cada cuánto se liquida la retribución."
        opciones={modalidadesLiq.map((m) => opcion(m))}
        valor={valores.modalidadLiq}
        guardando={guardando === 'afipModalidadLiquidacion'}
        onElegir={(o) => guardarEnTipo('afipModalidadLiquidacion', o.codigo)}
        alcance={alcanceTipo}
      />
    </>
  );
};
