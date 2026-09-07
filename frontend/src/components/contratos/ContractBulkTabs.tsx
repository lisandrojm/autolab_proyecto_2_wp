import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSort, faLock, faCircleCheck, faStethoscope, faFileInvoiceDollar, faFileSignature, faCheck, faTriangleExclamation, faXmark, faFileLines, faGrip, faTable, faUser, faFilePdf, faPaperPlane, faSpinner, faDownload, faCircleInfo, faArrowUpRightFromSquare, faTrash, faUpload } from '@fortawesome/free-solid-svg-icons';
import { usersAPI, ContractOverviewRow, Contract, SinCuitValidacion } from '../../api/users';
import { projectsAPI } from '../../api/projects';
import { companiesAPI, Company } from '../../api/companies';
import { infoAPI, InfoItem } from '../../api/info';
import { ContratoFrameItem } from '../../api/contratosFrame';
import { contratosAPI, ContratoItem } from '../../api/contratos';
import { categoriaSatAPI, CategoriaSatItem } from '../../api/categoriasSat';
import { createSimpleCatalogApi, SimpleCatalogItem } from '../../api/simpleCatalog';
import { arcaSucursalesAPI, ArcaSucursal } from '../../api/arcaSucursales';
import { DatosArcaDetalle, BadgeArca, ProgresoArca } from './DatosArcaDetalle';
import { Release } from '../../api/release';
import { firmaDigitalAPI, FirmaDigitalConfig } from '../../api/firmaDigital';
import { afipAPI } from '../../api/afip';
import { SinCuitValidacionModal, TIPO_DOC_SIN_CUIT_LABEL } from './SinCuitValidacionModal';
import { claveEstado, EstadoBadge, EstadoSecundarioBadge, estadoLabel } from '../EstadoSelect';
import { isContractVigente, formatDate, estadoImpositivoDelContrato, findTemplate, templateHasContent, EmpresaOption } from '../team/ContractCard';
import { getImageUrl, downloadFileFromUrl } from '../../utils/imageHelpers';
import { SearchAndFilters } from '../ui/SearchAndFilters';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EmptyState } from '../ui/EmptyState';
import { Modal } from '../ui/Modal';
import { ContractDocsColumns, ContractDocsHeaders, ContractActionsButtons, ContractActionsCell, ContractActionsHeader, downloadContractRow, downloadReleaseRow, uploadAltaRow } from './ContractRowDocs';
import { resolveAfip, resolveAfipValues, esResuelto, AfipRowResult, AfipValues, AfipCatalogs } from './afipCompleteness';
import { buildAltaRecord, buildAltaTxt, downloadTxt } from './afipTxt';
import { PantallaValidarObrasSociales, FilaConstatacion } from './PantallaValidarObrasSociales';
import { ConstanciaBadge, ArcaBadge, DropboxBadge, BotonArca, BotonConsultarAfipBulk, BotonValidarCuit, constanciaPendiente, cuitEsValido, fmtCuit, cuitDisplay, noPoseeCuit } from './ConstanciaBulk';
import { NombreArca, estadoNombreArca } from '../arca/NombreArca';
import { sweetAlert } from '../../utils/sweetAlert';
import { cachedFetch, invalidateRefCache, updateRefCache } from '../../utils/refCache';
import { arcaDefaultsAPI, ArcaDefaults } from "../../api/arcaDefaults";

const obrasSocialesApi = createSimpleCatalogApi('/obras-sociales');

// Solo para traducir los convenioIds de la empresa a códigos de CCT y validar la Categoría.
const conveniosApi = createSimpleCatalogApi('/convenios');

/**
 * Prefijo de caché del listado de contratos que comparten las pestañas de Gestión. Cada una monta y
 * desmonta su propio componente al cambiar de tab, así que sin esto cada click repite una consulta
 * de varios segundos. Al invalidar por prefijo, cualquier acción que modifique datos refresca las
 * tres pestañas de una.
 */
const CONTRACTS_OVERVIEW_CACHE = 'contracts-overview:';

/** Mismas opciones de rol que el filtro de la pestaña Contratos. */
const MOBILE_ROLE_OPTIONS = [
  { value: 'colaborador', label: 'Mobile-Colaborador' },
  { value: 'coordinador', label: 'Mobile-Coordinador' },
];

/** YYYYMMDD de hoy para el nombre del archivo. */
const hoyStamp = (): string => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};

/** Mismo estilo que las pestañas principales (ContractsPage.tsx) — para el filtro de Empresa como tabs. */
/** Valor de la pestaña "Sin asignar": no es un id de empresa, es la ausencia de una. */
const SIN_EMPRESA = '__sin_asignar__';

const empresaTabClass = (active: boolean): string => `px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${active ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`;

type TipoImpositivo = 'alta_temprana_afip' | 'constancia_cuit';
const TIPO_LABEL: Record<TipoImpositivo, string> = {
  alta_temprana_afip: 'Alta temprana de ARCA',
  constancia_cuit: 'Constancia de CUIT',
};

/**
 * Pestañas de la tabla. "sin_cuit" NO es un trámite impositivo como los otros dos: es un corte
 * transversal por la persona (no tiene CUIT/CUIL argentino), que puede estar en cualquiera de los
 * dos trámites. Esa gente se saca de las pestañas de ARCA —esos trámites no le aplican— y se
 * agrupa acá, donde en vez de "Generar TXT"/"Validar ARCA" se la manda a generar documentos.
 */
type TabTramite = TipoImpositivo | 'sin_cuit';

/** Fila de contrato enriquecida con el trámite impositivo de su estado actual. */
type ImpositivoRow = ContractOverviewRow & { _tipo?: TipoImpositivo; _estadoName: string; /** El estado admite gente sin CUIT: a esa gente el badge le dice "Sin CUIT". */ _aceptaSinCuit?: boolean };

/**
 * Columna "Estado Impositivo": el Estado impositivo (Alta ARCA / Alta Servicios) vinculado al TIPO de
 * contrato — no al estado actual, por eso sigue mostrándose igual en las tres pestañas aunque el
 * contrato ya haya avanzado (p. ej. a "Envío de documentación" o "Firma pendiente"). Mismo criterio
 * que la columna "Estado impositivo" de Gestionar Equipo (ProjectTeamPage.tsx).
 */
/**
 * Celda "Validación" de la pestaña "Sin CUIT": estado de la documentación de respaldo + switch.
 *
 * El switch queda deshabilitado hasta que haya al menos un documento cargado (regla del flujo: la
 * excepción tiene que estar respaldada). El link de abajo abre el modal donde se carga.
 */
const CeldaValidacionSinCuit: React.FC<{ row: ContractOverviewRow; onAbrir: () => void; onCambio: (v: SinCuitValidacion) => void }> = ({ row, onAbrir, onCambio }) => {
  const [guardando, setGuardando] = useState(false);
  const validacion = row.sinCuitValidacion;
  const docs = validacion?.documentos?.length || 0;
  const validado = !!validacion?.validado;

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (docs === 0) {
      // Sin respaldo no se puede validar: en vez de un switch muerto, se abre dónde cargarlo.
      onAbrir();
      return;
    }
    setGuardando(true);
    try {
      const r = await afipAPI.sinCuitSetValidado({ projectId: row.projectId, userId: row.userId, contractIndex: row.contractIndex, validado: !validado });
      onCambio(r.sinCuitValidacion);
    } catch (err: any) {
      sweetAlert.error('No se pudo validar', err?.response?.data?.error || 'No se pudo guardar la validación.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="whitespace-nowrap">
      <button
        type="button"
        role="switch"
        aria-checked={validado}
        onClick={toggle}
        disabled={guardando}
        title={docs === 0 ? 'Cargá la documentación de respaldo (columna Documentación) para poder validar' : validado ? 'Quitar la validación' : 'Marcar como validado'}
        className="inline-flex items-center gap-2"
      >
        <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${validado ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'} ${docs === 0 ? 'opacity-50' : ''}`}>
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${validado ? 'translate-x-[1.15rem]' : 'translate-x-0.5'}`} />
        </span>
        <span className={`text-[11px] font-semibold ${validado ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>{guardando ? 'Guardando...' : validado ? 'Validado' : 'Sin validar'}</span>
      </button>
    </div>
  );
};

/**
 * Celda "Documentación" de la pestaña "Sin CUIT": una fila por documento de respaldo, con el mismo
 * juego de íconos que usa la columna Contrato del resto del módulo (ver / descargar / eliminar).
 * Todos los adjuntos se guardan como PDF y con la nomenclatura estándar de documentos del contrato.
 */
const CeldaDocumentacionSinCuit: React.FC<{ row: ContractOverviewRow; onAbrir: () => void; onCambio: (v: SinCuitValidacion) => void }> = ({ row, onAbrir, onCambio }) => {
  const [borrando, setBorrando] = useState<number | null>(null);
  const documentos = row.sinCuitValidacion?.documentos || [];

  const borrar = async (e: React.MouseEvent, docIndex: number) => {
    e.stopPropagation();
    const conf = await sweetAlert.confirm('¿Eliminar el documento?', 'Se va a quitar este respaldo. Si es el último, la validación vuelve a quedar pendiente.', 'Sí, eliminar');
    if (!conf.isConfirmed) return;
    setBorrando(docIndex);
    try {
      const r = await afipAPI.sinCuitBorrarDocumento({ projectId: row.projectId, userId: row.userId, contractIndex: row.contractIndex, docIndex });
      onCambio(r.sinCuitValidacion);
    } catch (err: any) {
      sweetAlert.error('Error', err?.response?.data?.error || 'No se pudo eliminar el documento.');
    } finally {
      setBorrando(null);
    }
  };

  if (documentos.length === 0) {
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); onAbrir(); }} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap">
        <FontAwesomeIcon icon={faUpload} className="h-3 w-3" />
        Cargar
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {documentos.map((d, i) => (
        <div key={i} className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-[11px] text-gray-600 dark:text-gray-300 truncate max-w-[150px]" title={`${TIPO_DOC_SIN_CUIT_LABEL[d.tipo] || d.tipo} ${d.numero}`}>
            {TIPO_DOC_SIN_CUIT_LABEL[d.tipo] || d.tipo}
          </span>
          {d.archivoUrl ? (
            <>
              <a href={getImageUrl(d.archivoUrl)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title={d.archivoNombre || 'Ver PDF'} className="p-1 rounded text-violet-600 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors">
                <FontAwesomeIcon icon={faFilePdf} className="h-4 w-4" />
              </a>
              <a href={getImageUrl(d.archivoUrl)} download={d.archivoNombre || undefined} onClick={(e) => e.stopPropagation()} title="Descargar" className="p-1 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
              </a>
            </>
          ) : (
            <span className="text-[10px] text-gray-400 italic">sin archivo</span>
          )}
          <button type="button" onClick={(e) => borrar(e, i)} disabled={borrando === i} title="Eliminar" className="p-1 rounded text-gray-600 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 transition-colors disabled:opacity-50">
            <FontAwesomeIcon icon={borrando === i ? faSpinner : faTrash} spin={borrando === i} className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={(e) => { e.stopPropagation(); onAbrir(); }} className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline w-fit">
        <FontAwesomeIcon icon={faUpload} className="h-3 w-3" />
        Agregar
      </button>
    </div>
  );
};

/**
 * Acción de la pestaña "Sin CUIT": "Enviar a Generar Documentos".
 *
 * Reemplaza a "Generar TXT" / "Validar ARCA" para la gente que todavía NO tiene CUIT/CUIL argentino:
 * su trámite de ARCA/ANSES queda PENDIENTE hasta que cuente con la documentación migratoria, y sin
 * esto quedaría trabada antes de poder firmar. En su lugar se archiva un comprobante JSON en la carpeta
 * "WEPRODU/ARCA/Sin cuit" de Dropbox, el contrato avanza a Generar Documentos y desde ahí se le generan el
 * Contrato y el Release.
 *
 * Se habilita solo con el switch de la columna Validación en ON.
 */
const BotonHabilitarFirma: React.FC<{
  row: ContractOverviewRow;
  /** Trámite en el que venía el contrato (queda registrado en el comprobante). */
  tramite: TipoImpositivo;
  validado: boolean;
  onHabilitado: () => void;
}> = ({ row, tramite, validado, onHabilitado }) => {
  const [enviando, setEnviando] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const confirm = await sweetAlert.confirm(
      '¿Enviar a Generar Documentos?',
      `${row.userName} todavía no posee CUIT/CUIL. El trámite de ARCA queda PENDIENTE hasta que cuente con la documentación migratoria necesaria. Se va a archivar un comprobante en "WEPRODU/ARCA/Sin cuit" con la documentación de respaldo, y el contrato avanzará a Generar Documentos de forma excepcional.`,
      'Sí, enviar',
    );
    if (!confirm.isConfirmed) return;
    setEnviando(true);
    try {
      const res = await afipAPI.habilitarFirma([{ projectId: row.projectId, userId: row.userId, contractIndex: row.contractIndex }], tramite);
      if (res.habilitados.length > 0) {
        // Si la carpeta "Sin cuit" todavía no está vigilada, el archivo se guardó igual pero el
        // contrato NO va a avanzar solo: hay que decirlo, si no parece que quedó todo listo.
        if (res.aviso) sweetAlert.error('Archivado, pero falta un paso', res.aviso);
        else sweetAlert.success('Enviado', `Se archivó el comprobante de ${row.userName}. En el próximo escaneo de Dropbox el contrato pasa a Generar Documentos.`);
        onHabilitado();
      } else {
        sweetAlert.error('No se pudo enviar', res.omitidos[0]?.motivo || 'No se pudo archivar el comprobante.');
      }
    } catch (err: any) {
      sweetAlert.error('Error', err?.response?.data?.error || 'No se pudo enviar a Generar Documentos.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={enviando || !validado}
      title={validado ? 'Archivar el comprobante y pasar a Generar Documentos' : 'Marcá la validación para poder enviar'}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
        validado ? 'bg-violet-600 text-white hover:bg-violet-700' : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
      } disabled:opacity-60`}
    >
      <FontAwesomeIcon icon={enviando ? faSpinner : faFileSignature} spin={enviando} className="h-3 w-3" />
      Enviar a Generar Documentos
    </button>
  );
};

const EstadoImpositivoCell: React.FC<{ record: ContractOverviewRow; contratoFrames: ContratoFrameItem[]; allEstados: InfoItem[] }> = ({ record, contratoFrames, allEstados }) => {
  const estadoImpositivo = estadoImpositivoDelContrato(record as unknown as Contract, contratoFrames, allEstados);
  if (!estadoImpositivo) return <span className="text-xs text-gray-400">—</span>;
  return estadoImpositivo.data?.etiquetaSecundaria?.trim() ? <EstadoSecundarioBadge estado={estadoImpositivo} className="text-[10px] whitespace-nowrap" /> : <EstadoBadge name={estadoImpositivo.name} className="text-[10px] whitespace-nowrap" />;
};

/**
 * Celda "Empresa Contrato" / "Empresa Release" de la pestaña Alta temprana de ARCA: elegir (o
 * cambiar) la empresa directo desde la tabla, sin abrir el wizard completo de "Configurar Miembro".
 * La de Contrato es obligatoria para poder generar el TXT (un mismo archivo se sube a la sesión de
 * ARCA de UNA sola empresa, así que cada contrato tiene que tener la suya definida antes de poder
 * incluirse); la de Release es opcional.
 */
/** Campos de la fila que cambian al elegir (o quitar) la empresa de un documento. */
/**
 * Parche de fila al cambiar una empresa.
 *
 * Quitar la Empresa CONTRATO arrastra los tres datos que salen del padrón de ESE CUIT: sucursal,
 * actividad y la validación de la obra social. Sin empleadora ninguno tiene sujeto. El server los
 * borra; acá se refleja, o la fila queda mostrando valores que ya no existen en la base — y al
 * recargar aparecerían vacíos sin que nadie entienda por qué.
 *
 * La Empresa RELEASE no toca nada: no interviene en el alta.
 */
export const parcheEmpresa = (campo: 'contrato' | 'release', empresaId: string, label: string): Partial<ContractOverviewRow> =>
  campo === 'contrato'
    ? {
        empresaContratoId: empresaId,
        nombre_empresa_contrato: label,
        ...(empresaId
          ? {}
          : {
              sucursalArcaId: null,
              actividadArca: '',
              osId: null,
              obraSocialOrigen: '' as const,
              obraSocialConstatadaEn: '' as const,
              obraSocialConstatadaEl: '',
              obraSocialNoFigura: false,
              obraSocialBloqueada: false,
            }),
      }
    : { empresaReleaseId: empresaId, nombre_empresa_release: label };

/**
 * Convenio y categoría, resueltos DESDE LA FILA.
 *
 * Existen porque validar la obra social exige tenerlos: la que rige cuando ARCA no devuelve una propia
 * es la del CONVENIO, y el convenio sale de la categoría. Sin esto había que abrir el modal de cada
 * persona para resolver dos selects y volver — y la tabla es justamente donde se trabaja de a muchos.
 *
 * SON DOS COLUMNAS y no una: son dos decisiones distintas, y apiladas en una celda no se podían
 * comparar entre filas — que es para lo que sirve una tabla.
 *
 * El convenio NO se guarda: filtra la lista de categorías, igual que en el modal. Por eso su estado
 * vive en la FILA (`convenioFila`, en el componente de arriba) y no acá: dos celdas hermanas en
 * columnas distintas tienen que compartirlo, y una de ellas no puede ser dueña del estado de la otra.
 */
const ConvenioSelectCell: React.FC<{ record: ContractOverviewRow; valores: AfipValues; cat: AfipCatalogs; convenio: string; onConvenio: (cct: string) => void }> = ({ record, valores, cat, convenio, onConvenio }) => {
  // Con categoría cargada manda ELLA: el convenio del alta es el de su categoría, no una preferencia.
  const efectivo = valores.convenioCategoria || convenio;
  if (!record.empresaContratoId) return <span className="text-xs text-gray-400">Elegí la empleadora</span>;
  if ((valores.conveniosEmpresa || []).length === 0) return <span className="text-xs text-amber-600 dark:text-amber-400">Sin convenios registrados</span>;
  return (
    <select
      value={efectivo}
      onChange={(e) => onConvenio(e.target.value)}
      title="Filtra las categorías. No se guarda: ARCA lo deduce de la categoría."
      className={`text-[11px] rounded border px-1.5 py-1 max-w-[15rem] ${efectivo ? 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200' : 'border-amber-400 dark:border-amber-700 bg-white dark:bg-gray-800 text-amber-700 dark:text-amber-400'}`}
    >
      <option value="">Elegí el convenio…</option>
      {(valores.conveniosEmpresa || []).map((cct) => {
        // El nombre va SIEMPRE: «0322/75» solo no dice nada, y esta empleadora tiene dos convenios
        // de ACTORES y dos de TELEVISIÓN que por código no se distinguen de memoria.
        const nombre = cat.convenios?.find((c) => String(c.externalId || '').trim() === cct)?.name || '';
        return (
          <option key={cct} value={cct}>
            {cct}
            {nombre ? ` — ${nombre}` : ''}
          </option>
        );
      })}
    </select>
  );
};

/**
 * SUCURSAL Y ACTIVIDAD, EN LA GRILLA. Los dos últimos campos editables que solo vivían en el modal.
 *
 * La regla de esta tabla es que todo lo que se puede modificar tenga su columna: se completan quince
 * contratos seguidos, y bajar al modal de cada uno para elegir un domicilio es el mismo viaje quince
 * veces. Empresa, convenio, categoría y obra social ya estaban; faltaban estos dos.
 *
 * SON UN PAR, y en ese orden: las actividades que ARCA acepta son las que la empleadora declaró en
 * ESE domicilio. Por eso Actividad no se puede elegir antes que la Sucursal, y cambiar la sucursal
 * borra la actividad (lo hace el server, y por eso el parche de abajo la limpia también acá).
 */
const SucursalSelectCell: React.FC<{ record: ContractOverviewRow; valores: AfipValues; onGuardado: (patch?: Partial<ContractOverviewRow>) => void }> = ({ record, valores, onGuardado }) => {
  const [guardando, setGuardando] = useState(false);

  const guardar = async (sucursalId: string) => {
    setGuardando(true);
    try {
      const res = await projectsAPI.updateSucursalArca(record.projectId, record.userId, record.contractIndex, sucursalId);
      // La actividad viene en la respuesta porque el server la recalcula: con una sola declarada la
      // hereda, y si cambió el domicilio la limpia. Tomar solo la sucursal dejaría la de antes.
      onGuardado({ sucursalArcaId: res.sucursalArcaId || '', actividadArca: res.actividadArca || '' } as Partial<ContractOverviewRow>);
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo guardar la sucursal.');
    } finally {
      setGuardando(false);
    }
  };

  if (!record.empresaContratoId) return <span className="text-xs text-amber-600 dark:text-amber-400">Elegí la empleadora</span>;
  if (valores.sucursalesDisponibles.length === 0) {
    return (
      <span className="text-xs text-amber-600 dark:text-amber-400" title="Cargá los domicilios de explotación en la ficha de la empresa, en ARCA → Domicilios">
        Sin domicilios
      </span>
    );
  }

  return (
    <select
      value={valores.sucursal ? valores.sucursalesDisponibles.find((s) => s.codigo === valores.sucursal)?._id || '' : ''}
      onChange={(e) => guardar(e.target.value)}
      disabled={guardando}
      className={`input-field py-1 text-xs min-w-[13rem] ${!valores.sucursal ? 'border-amber-400 dark:border-amber-600' : ''}`}
    >
      <option value="">Elegí el domicilio…</option>
      {valores.sucursalesDisponibles.map((s) => (
        <option key={s._id} value={s._id}>
          {s.codigo} — {s.domicilio}
          {s.actividades.length === 0 ? ' (sin actividades)' : ''}
        </option>
      ))}
    </select>
  );
};

/**
 * La actividad SOLO es un selector cuando hay algo que elegir.
 *
 * Con una sola declarada en ese domicilio el valor queda determinado y se hereda: mostrar un combo de
 * una opción sería pedir una decisión que no existe. Es la misma regla que en el modal — acá se ve el
 * valor heredado, en texto, y el selector aparece recién con dos o más.
 */
const ActividadSelectCell: React.FC<{ record: ContractOverviewRow; valores: AfipValues; onGuardado: (patch?: Partial<ContractOverviewRow>) => void }> = ({ record, valores, onGuardado }) => {
  const [guardando, setGuardando] = useState(false);
  const disponibles = valores.actividadesDisponibles;

  const guardar = async (codigo: string) => {
    setGuardando(true);
    try {
      await projectsAPI.updateActividadArca(record.projectId, record.userId, record.contractIndex, codigo);
      onGuardado({ actividadArca: codigo } as Partial<ContractOverviewRow>);
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo guardar la actividad.');
    } finally {
      setGuardando(false);
    }
  };

  if (!valores.sucursal) return <span className="text-xs text-gray-400">Elegí la sucursal</span>;
  if (disponibles.length === 0) {
    return (
      <span className="text-xs text-amber-600 dark:text-amber-400" title="La empleadora no declaró actividades en ese domicilio: cargalas en ARCA → Sucursales">
        Sin actividades
      </span>
    );
  }
  if (disponibles.length === 1) {
    // Heredada: no hay decisión. Se muestra el valor para que la fila no se lea como incompleta.
    return (
      <span className="text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap" title={`${disponibles[0].descripcion || ''} — única declarada en ese domicilio, se hereda`}>
        <span className="font-mono">{disponibles[0].codigo}</span> <span className="text-gray-400">única</span>
      </span>
    );
  }

  return (
    <select
      value={valores.actividad || ''}
      onChange={(e) => guardar(e.target.value)}
      disabled={guardando}
      className={`input-field py-1 text-xs min-w-[13rem] ${!valores.actividad ? 'border-amber-400 dark:border-amber-600' : ''}`}
    >
      <option value="">Elegí la actividad…</option>
      {disponibles.map((a) => (
        <option key={a.codigo} value={a.codigo}>
          {a.codigo} — {a.descripcion}
        </option>
      ))}
    </select>
  );
};

const CategoriaSelectCell: React.FC<{ record: ContractOverviewRow; valores: AfipValues; cat: AfipCatalogs; convenio: string; onGuardado: (patch?: Partial<ContractOverviewRow>) => void }> = ({ record, valores, cat, convenio, onGuardado }) => {
  const [guardando, setGuardando] = useState(false);
  const efectivo = valores.convenioCategoria || convenio;

  const categorias = useMemo(
    () =>
      cat.categorias
        .filter((c: any) => c.isActive !== false)
        .filter((c: any) => {
          const cct = String(c.data?.convenio || '').trim();
          if (!cct) return false;
          return efectivo ? cct === efectivo : (valores.conveniosEmpresa || []).includes(cct);
        }),
    [cat.categorias, efectivo, valores.conveniosEmpresa],
  );

  const guardar = async (id: string) => {
    setGuardando(true);
    try {
      const res = await projectsAPI.updateCategoriaSat(record.projectId, record.userId, record.contractIndex, id === '' ? null : Number(id));
      onGuardado({ categoria_sat_id: res.categoria_sat_id, nombre_categoria_sat: res.nombre_categoria_sat, sueldo_neto: res.sueldo_neto, sueldo_bruto: res.sueldo_bruto } as any);
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo guardar la categoría.');
    } finally {
      setGuardando(false);
    }
  };

  if (!record.empresaContratoId) return <span className="text-xs text-gray-400">—</span>;
  if (!efectivo) return <span className="text-xs text-gray-400">Elegí el convenio</span>;

  return (
    <select
      value={valores.categoriaProf ? String(cat.categorias.find((c: any) => String(c.data?.codigoAfip ?? '') === valores.categoriaProf)?.data?.id ?? '') : ''}
      onChange={(e) => guardar(e.target.value)}
      disabled={guardando}
      title="Categoría profesional: es lo único del encuadre que viaja al archivo (pos. 101-106)."
      className={`text-[11px] rounded border px-1.5 py-1 max-w-[16rem] disabled:opacity-50 ${valores.categoriaProf ? 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200' : 'border-amber-400 dark:border-amber-700 bg-white dark:bg-gray-800 text-amber-700 dark:text-amber-400'}`}
    >
      <option value="">Elegí la categoría…</option>
      {categorias.map((c: any) => (
        <option key={String(c.data?.id)} value={String(c.data?.id ?? '')}>
          {c.data?.codigoArca || c.data?.codigoAfip} — {c.name}
        </option>
      ))}
    </select>
  );
};

const EmpresaSelectCell: React.FC<{ record: ContractOverviewRow; campo: 'contrato' | 'release'; requerido: boolean; onGuardado: (patch?: Partial<ContractOverviewRow>) => void }> = ({ record, campo, requerido, onGuardado }) => {
  const [guardando, setGuardando] = useState(false);
  const empresas = (campo === 'contrato' ? record.contratoEmpresas : record.releaseEmpresas) || [];
  const empresaIdActual = campo === 'contrato' ? record.empresaContratoId : record.empresaReleaseId;

  const guardar = async (empresaId: string) => {
    setGuardando(true);
    try {
      if (campo === 'contrato') await projectsAPI.updateContratoEmpresa(record.projectId, record.userId, record.contractIndex, empresaId);
      else await projectsAPI.updateReleaseEmpresa(record.projectId, record.userId, record.contractIndex, empresaId);
      // Se sabe exactamente qué cambió: se avisa el parche para actualizar SOLO esta fila, en vez de
      // recargar el listado entero por elegir una empresa.
      onGuardado(parcheEmpresa(campo, empresaId, empresas.find((e) => e.id === empresaId)?.label || ''));
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo guardar la empresa.');
    } finally {
      setGuardando(false);
    }
  };

  if (empresas.length === 0) {
    return (
      <span className="text-xs text-gray-400" title={`El proyecto no tiene empresas configuradas para ${campo === 'contrato' ? 'Contrato' : 'Release'}`}>
        Sin empresas
      </span>
    );
  }

  const faltaYEsRequerido = requerido && !empresaIdActual;

  // Un <select> nativo no puede tener un ícono adentro del control: el spinner se superpone
  // encima del select (con padding-left de más para no tapar el texto) para que se vea "dentro".
  return (
    <div className="relative inline-block">
      <select
        value={empresaIdActual || ''}
        disabled={guardando}
        onChange={(e) => guardar(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        title={empresaIdActual ? 'Cambiar la empresa' : requerido ? 'Elegí la empresa — es obligatoria para generar el TXT' : 'Elegí la empresa (opcional)'}
        className={`text-xs rounded-md border py-1.5 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-50 disabled:cursor-wait ${guardando ? 'pl-6 pr-2' : 'px-2'} ${faltaYEsRequerido ? 'border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-400 font-semibold' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200'}`}
      >
        <option value="">{empresaIdActual ? 'Sin empresa' : 'Elegir empresa...'}</option>
        {empresas.map((e) => (
          <option key={e.id} value={e.id}>
            {e.label}
          </option>
        ))}
      </select>
      {guardando && <FontAwesomeIcon icon={faSpinner} spin className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-blue-500 pointer-events-none" title="Guardando..." />}
    </div>
  );
};

/**
 * Estado de la obra social de un contrato. Son TRES, no dos.
 *
 * La distinción que faltaba es la del medio: se consultó ARCA y el organismo **no devolvió ninguna**.
 * Eso no es un pendiente, es una respuesta —esa persona no tiene afiliación registrada, así que la
 * del convenio es la correcta y quedó confirmada—, pero al colapsarlo con "constatada" o dejarlo en
 * "sin constatar" se perdía. Y es el caso MÁS COMÚN: la mayoría no tiene obra social propia. Sin este
 * estado, esas personas quedaban en ámbar para siempre aunque el trabajo ya estuviera hecho.
 *
 *  - `sin_validar`       nadie consultó. Rige la del convenio y el TXT sale igual.
 *  - `validada_default`  se consultó, ARCA no devolvió ninguna → sigue la del convenio, confirmada.
 *  - `validada_arca`     se consultó y ARCA devolvió una → esa reemplaza a la del convenio, y queda fija.
 *  - `no_registrada`     la que rige no está entre las que la empleadora declaró: ARCA rechaza el alta.
 *
 * Vive fuera de la celda porque lo usan CUATRO lugares que tienen que coincidir: la celda, el filtro,
 * el orden y el contador del botón de lote. Con la clasificación repetida en cada uno, el botón decía
 * 26 y el filtro traía 24 — que es exactamente lo que pasaba antes.
 */
export type EstadoObraSocial = 'sin_validar' | 'validada_default' | 'validada_arca' | 'no_registrada';

export const estadoObraSocial = (_row: ContractOverviewRow, v: AfipValues): EstadoObraSocial => {
  // El error va primero: una obra social que la empleadora no registró hace que ARCA rechace el alta,
  // y eso importa más que si además está constatada.
  if (v.rnos && v.obraSocialRegistrada === false) return 'no_registrada';
  if (v.constatacion === 'no_figura') return 'validada_default';
  if (v.constatacion === 'afiliada') return 'validada_arca';
  return 'sin_validar';
};

/** Para ordenar: primero lo que hay que resolver. */
export const ORDEN_ESTADO_OS: Record<EstadoObraSocial, number> = { no_registrada: 0, sin_validar: 1, validada_default: 2, validada_arca: 3 };

export const FILTROS_OBRA_SOCIAL: Array<{ value: EstadoObraSocial; label: string }> = [
  { value: 'sin_validar', label: 'Sin validar en ARCA' },
  { value: 'validada_arca', label: 'Validadas — con obra social propia' },
  { value: 'validada_default', label: 'Validadas — sin afiliación (rige el convenio)' },
  { value: 'no_registrada', label: 'No registradas por la empleadora' },
];

/**
 * Celda "Obra social": qué RNOS (pos. 40-45) lleva este contrato y si está validado contra ARCA.
 *
 * Sin validar, la celda va VACÍA. La cascada del convenio se conoce —está en `rnosSugerido`— pero
 * mostrarla acá haría creer que ese código está confirmado, y es justo lo contrario: nadie lo miró.
 * El valor aparece recién cuando ARCA contesta. La referencia de qué va a quedar se muestra en el
 * modal, junto al botón de validar, donde sirve para anticipar y no para confundir.
 *
 * Solo el código de 6 dígitos: el nombre de la obra social mide hasta 40 caracteres y en una grilla
 * de 16 columnas empujaría todo lo demás fuera de la pantalla. El nombre completo, de dónde sale y
 * cuándo se validó van en el tooltip.
 *
 * NO es editable: validada = fija (el server rechaza sobrescribirla con un 409). Se cambia por
 * Re-constatar, desde el modal, no tipeando en la grilla.
 */
/*
  EL ENCUADRE, COMO UN GRUPO.

  Empresa → Convenio → Categoría → Obra social son una CADENA: cada una define el conjunto de la
  siguiente, y la última no se puede validar sin las tres de arriba. Sueltas entre las demás columnas
  se leen como cuatro datos independientes, y ahí «¿por qué no me deja validar?» no tiene respuesta a
  la vista.

  El grupo se marca con un borde a los costados y un fondo tenue —el mismo azul del rail de
  dependencias del modal, para que sea el mismo idioma en las dos pantallas— y las cabeceras llevan
  una flecha que dice la dirección. Sin la flecha, el borde agrupa pero no dice cuál manda.
*/
const GRUPO_ENCUADRE = 'bg-blue-500/[0.04] dark:bg-blue-400/[0.05]';
const GRUPO_ENCUADRE_INICIO = `${GRUPO_ENCUADRE} border-l-2 border-l-blue-500/40 dark:border-l-blue-400/40`;
const GRUPO_ENCUADRE_FIN = `${GRUPO_ENCUADRE} border-r-2 border-r-blue-500/40 dark:border-r-blue-400/40`;
/** La flecha que va al final de cada cabecera del grupo menos la última. */
/**
 * Cuántas columnas hay antes de que empiece la banda, en la pestaña de Alta temprana.
 *
 * Son: el check, «Datos ARCA», «Alta / Baja», «Alta ARCA», «Usuario» y «CUIT». Lo usa el colSpan
 * de la fila que rotula el grupo: si se agrega una columna a la izquierda y esto no se actualiza,
 * el rótulo se corre y termina titulando columnas que no son.
 */
const COLUMNAS_ANTES_DEL_GRUPO = 6;

const FlechaEncuadre = () => <span className="text-blue-500/70 dark:text-blue-400/70 font-normal ml-1">→</span>;

const ObraSocialCell: React.FC<{
  record: ContractOverviewRow;
  valores: AfipValues;
  onAbrir: () => void;
  onValidar: () => void;
  onSinEmpresa: () => void;
  onQuitado: (patch: Partial<ContractOverviewRow>) => void;
}> = ({ record, valores, onAbrir, onValidar, onSinEmpresa, onQuitado }) => {
  const [quitando, setQuitando] = useState(false);
  const estado = estadoObraSocial(record, valores);
  const codigo = String(valores.rnos || '').replace(/\D/g, '');
  const fecha = valores.constatadaEl ? new Date(valores.constatadaEl).toLocaleDateString('es-AR') : '';
  const nombre = valores.nombreObraSocial || '';
  const delConvenio = valores.convenioCategoria ? `convenio ${valores.convenioCategoria}` : 'convenio';

  /**
   * Quitar la obra social desde la grilla.
   *
   * Va con `forzar` porque lo sellado en ARCA es inmutable para el server (sin eso contesta 409).
   * Estaba solo en el detalle del contrato: para corregir una obra social mal validada había que
   * abrir la ficha de cada persona, cuando la revisión se hace mirando esta columna.
   */
  const quitar = async () => {
    const r = await sweetAlert.confirm(
      '¿Quitar la obra social?',
      `${record.userName}: el contrato vuelve a quedar SIN VALIDAR y no entra en el TXT hasta validarlo de nuevo en ARCA. No se pierde nada: el valor lo devuelve el organismo, no se carga a mano.`,
      'Sí, quitar',
    );
    if (!r.isConfirmed) return;
    setQuitando(true);
    try {
      const ref = record.contratoId || record.contractIndex;
      await projectsAPI.updateObraSocialContrato(record.projectId, record.userId, ref as never, { obraSocialId: null, origen: 'manual', forzar: true });
      onQuitado({ osId: null, obraSocialOrigen: '', obraSocialConstatadaEn: '', obraSocialConstatadaEl: '', obraSocialNoFigura: false, obraSocialBloqueada: false } as Partial<ContractOverviewRow>);
    } catch (e: any) {
      sweetAlert.error('No se pudo', e?.response?.data?.error || 'No se pudo quitar la obra social.');
    } finally {
      setQuitando(false);
    }
  };

  /* Sin validar no lleva ícono: el "?" no agregaba nada al lado de la palabra «sin validar» —el
     estado ya está escrito— y sumaba un tercer glifo en una celda que además tiene el ⓘ. Los
     estados validados sí lo llevan: ahí el ícono ES el estado (candado, tilde, cruz) y lo escrito
     es el código. */
  const { icono, clase, titulo } = {
    sin_validar: {
      icono: null,
      clase: 'text-gray-400 dark:text-gray-500',
      titulo: `Sin validar en ARCA — este contrato todavía no tiene obra social y su TXT no se puede generar.${
        valores.rnosSugerido ? ` Si el organismo no devuelve ninguna, va a quedar la del ${delConvenio}: ${valores.rnosSugerido} · ${valores.nombreObraSocialSugerida}.` : ''
      }${record.empresaContratoId ? '' : ' Elegí la empleadora para poder validarla.'}`,
    },
    validada_default: {
      icono: faCircleCheck,
      clase: 'text-green-700 dark:text-green-400',
      titulo: `${nombre} — por defecto (${delConvenio}) · validada en ARCA${fecha ? ` el ${fecha}` : ''}: el organismo no tiene afiliación propia para esta persona, así que rige la del convenio.`,
    },
    validada_arca: {
      icono: faLock,
      clase: 'text-green-700 dark:text-green-400',
      titulo: `${nombre} — la devolvió ARCA${fecha ? ` el ${fecha}` : ''} · queda fija, no editable.`,
    },
    no_registrada: {
      icono: faXmark,
      clase: 'text-red-600 dark:text-red-400',
      titulo: `${nombre} — no está entre las obras sociales que la empleadora tiene registradas ante ARCA: el organismo va a rechazar el alta.`,
    },
  }[estado];

  /*
    AZUL = esta persona NO lleva la obra social del convenio.

    Es la única fila que hay que mirar de verdad en esta columna. El resto —validadas por defecto,
    validadas y coincidentes— confirman lo que ya se sabía; estas son las que ARCA cambió, y son
    justamente las que el circuito entero existe para no declarar mal.

    En verde y con el candado se distinguía del `validada_default` solo por el glifo, que a la
    velocidad a la que se barre una grilla de 16 columnas es lo mismo que no distinguirse. El color
    se ve sin leer.

    Sin sugerida del convenio también va azul: si el convenio no aporta ninguna, la que quedó no es
    «la de por defecto» — no hay ninguna por defecto.
  */
  const distintaDelConvenio = estado === 'validada_arca' && codigo !== String(valores.rnosSugerido || '').replace(/\D/g, '');
  const claseFinal = distintaDelConvenio ? 'text-blue-600 dark:text-blue-400' : clase;
  const tituloFinal = distintaDelConvenio
    ? `${titulo} DISTINTA de la del ${delConvenio}${valores.rnosSugerido ? ` (${valores.rnosSugerido}${valores.nombreObraSocialSugerida ? ` · ${valores.nombreObraSocialSugerida}` : ''})` : ' — el convenio no aporta ninguna'}: esta es la que va al TXT.`
    : titulo;

  /*
   * Sin validar, la celda es UNA sola cosa según se pueda validar o no:
   *
   *  - con Empresa Contrato → el botón «Validar», solo. Decir «sin validar  Validar» era repetir el
   *    mismo estado dos veces: el botón ya dice qué falta y qué hacer;
   *  - sin ella → «sin validar» + un ⓘ que abre el modal con el motivo. Es un botón y no un
   *    tooltip: el hover no existe en touch y el motivo lleva una instrucción —ir a asignar la
   *    empresa—, no un dato suelto.
   *
   * Al elegir la empresa, esa pareja se reemplaza por el «Validar» pelado.
   */
  /*
    Para validar hacen falta empleadora Y categoría, no solo empleadora.

    La obra social que rige cuando ARCA no devuelve una propia es la del CONVENIO, y el convenio sale
    de la categoría. Validar antes es validar contra un default que todavía puede cambiar: se elige
    otra categoría y esa validación queda hablando de otra obra social. Es la misma cascada del modal.
  */
  const listoParaValidar = !!record.empresaContratoId && !!valores.categoriaProf;

  if (estado === 'sin_validar' && listoParaValidar) {
    /* Mismo botón que «Validar obras sociales» de la barra —mismo ícono, mismo estilo—, en tamaño
       de fila: es la MISMA acción sobre un solo contrato, y escrita como link azul se leía como
       otra cosa. */
    return (
      <button
        type="button"
        onClick={onValidar}
        title={`Validar la obra social de este contrato contra ARCA.${valores.rnosSugerido ? ` Si el organismo no devuelve ninguna, va a quedar la del ${delConvenio}: ${valores.rnosSugerido} · ${valores.nombreObraSocialSugerida}.` : ''}`}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors whitespace-nowrap"
      >
        <FontAwesomeIcon icon={faStethoscope} className="h-3 w-3" />
        Validar obra social
      </button>
    );
  }

  if (estado === 'sin_validar') {
    /*
     * El gemelo apagado del botón de arriba: misma caja y el MISMO ícono, para que las dos filas se
     * lean como el mismo control en dos estados y no como dos cosas distintas. El ⓘ va al final y
     * en el color del texto: es el sufijo "hay algo que explicar", no un estado aparte.
     *
     * Se ve deshabilitado —que es la verdad: todavía no se puede validar— pero SÍ responde al clic,
     * y lo único que hace es abrir el modal con el motivo. Un `disabled` de verdad no recibe
     * eventos y dejaría el porqué sin forma de leerse en touch.
     */
    return (
      <button
        type="button"
        onClick={onSinEmpresa}
        aria-disabled
        title={record.empresaContratoId ? 'Todavía no se puede validar: falta la Categoría (y su convenio). Elegila en la columna de al lado.' : 'Todavía no se puede validar: falta la Empresa Contrato. Tocá para ver por qué.'}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500 opacity-70 hover:opacity-100 cursor-pointer transition-opacity whitespace-nowrap"
      >
        <FontAwesomeIcon icon={faStethoscope} className="h-3 w-3" />
        Sin validar
        <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <button type="button" onClick={onAbrir} title={tituloFinal} className={`inline-flex items-center gap-1.5 font-mono text-xs font-semibold hover:underline ${claseFinal}`}>
        {icono && <FontAwesomeIcon icon={icono} className="h-3 w-3 shrink-0" />}
        {codigo || <span className="font-sans font-normal">sin validar</span>}
      </button>
      {/* Acá abajo solo llegan los validados: quitar con el mismo trash que el detalle del contrato,
          en la fila donde se revisa. */}
      <button
        type="button"
        onClick={quitar}
        disabled={quitando}
        title="Quitar la obra social: el contrato vuelve a quedar sin validar"
        aria-label="Quitar la obra social"
        className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition-colors"
      >
        <FontAwesomeIcon icon={quitando ? faSpinner : faTrash} spin={quitando} className="h-3 w-3" />
      </button>
    </span>
  );
};

/**
 * Asignación MASIVA de la empresa (Contrato o Release) a los contratos tildados.
 *
 * Las empresas disponibles salen de cada PROYECTO (`contratoEmpresas`/`releaseEmpresas`), así que al
 * mezclar filas de proyectos distintos no todas admiten la misma: el select ofrece la unión, y al
 * aplicar se saltean las filas donde esa empresa no está habilitada (se informa cuántas quedaron
 * afuera en vez de fallar en silencio).
 */
/** Valor del select para DESASIGNAR: no es el id de ninguna empresa, es la ausencia de una. */
const SIN_EMPRESA_MASIVO = '__sin_empresa__';

/**
 * Convenio y categoría, en masa. Mismo control que «Empresa Contrato…  Aplicar».
 *
 * DOS COSAS DISTINTAS EN UN MISMO CONTROL, y conviene tenerlo presente:
 *
 *   - El CONVENIO no se guarda. Aplicarlo solo filtra la lista de categorías de las filas tildadas,
 *     que es el paso previo para poder elegir una categoría igual para todas.
 *   - La CATEGORÍA sí se guarda, de a un PATCH por contrato, y arrastra el sueldo de su escala.
 *
 * SE SALTEAN las filas cuya empleadora no tiene ese convenio registrado, y se informa cuántas. ARCA
 * solo acepta categorías de los convenios que ESE CUIT registró: escribirlas igual dejaría altas que
 * el organismo rechaza, con el error apareciendo recién al subir el archivo.
 */
/*
  EL ⓘ DE CADA CONTROL MASIVO.

  Los tres botones de acción de la fila de abajo abren un modal con la explicación; los cuatro
  selects de arriba tenían, a lo sumo, un `title` que solo aparece si la persona deja el mouse
  quieto encima y no entra más que una frase. Convenio y Categoría directamente no tenían nada, que
  es justo donde más falta: son los dos que se comportan distinto entre sí —uno filtra y no guarda,
  el otro escribe y recalcula sueldos— y por fuera se ven idénticos.
*/
const InfoMasivo: React.FC<{ titulo: string; ayuda: string; children: React.ReactNode }> = ({ titulo, ayuda, children }) => {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title={ayuda}
        aria-label={ayuda}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0"
      >
        <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
      </button>
      {abierto && (
        <Modal isOpen={abierto} onClose={() => setAbierto(false)} title={titulo} size="sm" zIndex={80}>
          <div className="space-y-3">{children}</div>
        </Modal>
      )}
    </>
  );
};

/*
  LOS CONTROLES MASIVOS SE VEN COMO UNA SOLA PIEZA, no como dos pastillas sueltas.

  Eran cuatro pares «select + Aplicar» de 12px pegados entre sí, y la fila se leía como ocho controles
  en vez de cuatro: no se veía qué botón aplicaba qué select. Unidos —el select con las esquinas
  izquierdas redondeadas y el botón con las derechas, compartiendo el borde— cada par se lee como un
  control con su acción, que es lo que es.

  El tamaño y el redondeo son los mismos de «Validar obras sociales» y «Cargar en ARCA», que están en
  la fila de abajo: es la misma barra y no hay razón para que la mitad de arriba parezca otra cosa.
*/
const SELECT_MASIVO =
  "text-sm rounded-l-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 pl-3 pr-2 py-2 max-w-[13rem] focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:z-10 disabled:opacity-40 disabled:cursor-not-allowed";
const BOTON_MASIVO =
  "inline-flex items-center gap-1.5 px-3 py-2 rounded-r-lg text-sm font-semibold border border-l-0 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/60 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap";

const AsignarEncuadreMasivo: React.FC<{
  filas: ImpositivoRow[];
  cat: AfipCatalogs;
  bloqueado?: string;
  onConvenio: (cct: string, filas: ImpositivoRow[]) => void;
  onAplicado: (patches: { row: ContractOverviewRow; patch: Partial<ContractOverviewRow> }[]) => void;
}> = ({ filas, cat, bloqueado, onConvenio, onAplicado }) => {
  const [convenio, setConvenio] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [aplicando, setAplicando] = useState(false);

  const sinSeleccion = filas.length === 0;
  const inhabilitado = sinSeleccion || !!bloqueado;

  /** Los convenios que TODAS las tildadas podrían usar salen de la unión: acotar de más escondería opciones. */
  const convenios = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of filas) {
      for (const cct of resolveAfipValues(r, cat).conveniosEmpresa || []) {
        if (!m.has(cct)) m.set(cct, cat.convenios?.find((c) => String(c.externalId || '').trim() === cct)?.name || '');
      }
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filas, cat]);

  const categorias = useMemo(() => (convenio ? cat.categorias.filter((c: any) => c.isActive !== false && String(c.data?.convenio || '').trim() === convenio) : []), [cat.categorias, convenio]);

  const aplicarCategoria = async () => {
    if (!categoriaId) return;
    setAplicando(true);
    try {
      // Solo a quienes ARCA se lo aceptaría: el resto se informa, no se escribe.
      const aptas = filas.filter((r) => (resolveAfipValues(r, cat).conveniosEmpresa || []).includes(convenio));
      const salteadas = filas.length - aptas.length;
      const patches: { row: ContractOverviewRow; patch: Partial<ContractOverviewRow> }[] = [];
      for (const r of aptas) {
        const res = await projectsAPI.updateCategoriaSat(r.projectId, r.userId, r.contractIndex, Number(categoriaId));
        patches.push({ row: r, patch: { categoria_sat_id: res.categoria_sat_id, nombre_categoria_sat: res.nombre_categoria_sat, sueldo_neto: res.sueldo_neto, sueldo_bruto: res.sueldo_bruto } as any });
      }
      onAplicado(patches);
      const nombre = categorias.find((c: any) => String(c.data?.id) === categoriaId)?.name || 'la categoría';
      sweetAlert.success('Categoría asignada', `${patches.length} contrato(s) con «${nombre}».${salteadas > 0 ? ` ${salteadas} se saltearon: su empleadora no tiene registrado el convenio ${convenio}.` : ''}`);
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo asignar la categoría.');
    } finally {
      setAplicando(false);
    }
  };

  return (
    <div className="flex items-center flex-wrap gap-2">
      <div className="flex items-stretch">
        <select
          value={convenio}
          onChange={(e) => {
            setConvenio(e.target.value);
            setCategoriaId('');
          }}
          disabled={inhabilitado}
          title={bloqueado || (sinSeleccion ? 'Tildá contratos para filtrarles el convenio' : 'Filtra las categorías de los contratos tildados. No se guarda.')}
          className={SELECT_MASIVO}
        >
          <option value="">Convenio…</option>
          {convenios.map(([cct, nombre]) => (
            <option key={cct} value={cct}>
              {cct}
              {nombre ? ` — ${nombre}` : ''}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => onConvenio(convenio, filas)} disabled={inhabilitado || !convenio} title={`Filtrar las categorías de ${filas.length} contrato(s) por el convenio ${convenio || ''}`} className={BOTON_MASIVO}>
          <FontAwesomeIcon icon={faCheck} className="h-3.5 w-3.5" />
          Filtrar
        </button>
      </div>
      <InfoMasivo titulo="Convenio en masa" ayuda="Qué hace «Filtrar» en Convenio">
        <p className="text-sm text-gray-700 dark:text-gray-200">
          {/* Lo primero, porque es lo único que lo distingue de los otros tres controles de la fila. */}
          El convenio <strong>no se guarda en el contrato</strong>: acá es un filtro. Tocar «Filtrar» no modifica ninguna fila — solo hace que el select de <strong>Categoría</strong>, al lado, ofrezca únicamente las categorías de ese convenio.
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Hace falta porque las categorías de todos los convenios juntas son cientos, y hay códigos que se repiten entre convenios. El convenio de un contrato queda determinado por la categoría que se le asigna, no al revés.
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Además <strong>condiciona la obra social por defecto</strong>: la que se propone al validar sale del convenio de la categoría asignada.
        </p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">La lista muestra los convenios registrados en las empleadoras de los contratos tildados.</p>
      </InfoMasivo>
      <div className="flex items-stretch">
        <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} disabled={inhabilitado || !convenio} title={convenio ? 'Asignar esta categoría a los contratos tildados' : 'Elegí primero el convenio'} className={SELECT_MASIVO}>
          <option value="">Categoría…</option>
          {categorias.map((c: any) => (
            <option key={String(c.data?.id)} value={String(c.data?.id ?? '')}>
              {c.data?.codigoArca || c.data?.codigoAfip} — {c.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={aplicarCategoria} disabled={inhabilitado || !categoriaId || aplicando} title={categoriaId ? `Asignar a ${filas.length} contrato(s) · cambia el sueldo de cada uno` : 'Elegí una categoría'} className={BOTON_MASIVO}>
          <FontAwesomeIcon icon={aplicando ? faSpinner : faCheck} spin={aplicando} className="h-3.5 w-3.5" />
          Aplicar
        </button>
      </div>
      <InfoMasivo titulo="Categoría en masa" ayuda="Qué hace «Aplicar» en Categoría">
        <p className="text-sm text-gray-700 dark:text-gray-200">
          Le asigna esa categoría a todos los contratos tildados. A diferencia de Convenio, <strong>esto sí escribe</strong> en cada contrato.
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {/* Se avisa antes y no después: es un cambio de plata en muchos contratos a la vez. */}
          Al aplicarla se <strong>recalculan los sueldos</strong> de cada contrato con la escala de la categoría elegida — básico, bruto, neto y el diario. Si la categoría no tiene escala cargada, los importes quedan en cero.
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Se saltean los contratos cuya <strong>empleadora no tenga registrado ese convenio</strong>; el aviso final dice cuántos fueron y por qué. Elegí primero el convenio: hasta entonces el select está bloqueado.
        </p>
      </InfoMasivo>
    </div>
  );
};

const AsignarEmpresaMasivo: React.FC<{
  campo: 'contrato' | 'release';
  /** Filas sobre las que se aplica (las tildadas). Vacío = control visible pero inactivo. */
  filas: ContractOverviewRow[];
  /** De dónde salen las empresas del select: todo el listado, para que se vea aunque no haya selección. */
  filasParaOpciones: ContractOverviewRow[];
  /** Motivo por el que el control está inhabilitado (ej.: hay una validación en ARCA en curso). */
  bloqueado?: string;
  onAplicado: (patches: { row: ContractOverviewRow; patch: Partial<ContractOverviewRow> }[]) => void;
}> = ({ campo, filas, filasParaOpciones, bloqueado, onAplicado }) => {
  const [empresaId, setEmpresaId] = useState('');
  const [aplicando, setAplicando] = useState(false);

  const label = campo === 'contrato' ? 'Empresa Contrato' : 'Empresa Release';
  // Unión de las empresas habilitadas en los proyectos de las filas elegidas.
  const opciones = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of filasParaOpciones) {
      for (const e of (campo === 'contrato' ? r.contratoEmpresas : r.releaseEmpresas) || []) m.set(e.id, e.label);
    }
    return [...m.entries()].map(([id, lbl]) => ({ id, label: lbl })).sort((a, b) => a.label.localeCompare(b.label));
  }, [filasParaOpciones, campo]);

  const sinSeleccion = filas.length === 0;
  const inhabilitado = sinSeleccion || !!bloqueado;

  const aplicar = async () => {
    if (!empresaId) return;
    const quitando = empresaId === SIN_EMPRESA_MASIVO;
    const nombre = quitando ? '' : opciones.find((o) => o.id === empresaId)?.label || '';
    // Quitar aplica a las filas que HOY tienen una asignada; asignar, a las que tengan esa empresa
    // habilitada en su proyecto. En los dos casos el resto se saltea y se dice cuántas fueron.
    const aplicables = quitando
      ? filas.filter((r) => !!(campo === 'contrato' ? r.empresaContratoId : r.empresaReleaseId))
      : filas.filter((r) => ((campo === 'contrato' ? r.contratoEmpresas : r.releaseEmpresas) || []).some((e) => e.id === empresaId));
    const salteadas = filas.length - aplicables.length;
    if (aplicables.length === 0) {
      if (quitando) sweetAlert.error('No hay nada que quitar', `Ninguno de los contratos elegidos tiene ${label} asignada.`);
      else sweetAlert.error('No se puede aplicar', `Ninguno de los contratos elegidos tiene habilitada "${nombre}" en su proyecto.`);
      return;
    }
    const conf = quitando
      ? await sweetAlert.confirm(
          `¿Quitar la ${label}?`,
          `Se va a dejar SIN ${label} a ${aplicables.length} contrato(s).${salteadas > 0 ? ` Se saltean ${salteadas} que no tienen ninguna asignada.` : ''}${
            campo === 'contrato'
              ? ' Ojo: eso borra también lo que sale del padrón de esa empleadora — Sucursal, Actividad y la validación de la Obra Social, que vuelve a quedar SIN VALIDAR—, y esos contratos dejan de poder entrar en el TXT.'
              : ''
          }`,
          'Sí, quitar',
        )
      : await sweetAlert.confirm(
          `¿Asignar ${label}?`,
          `Se va a poner "${nombre}" como ${label} en ${aplicables.length} contrato(s).${salteadas > 0 ? ` Se saltean ${salteadas} porque su proyecto no tiene esa empresa habilitada.` : ''}`,
          'Sí, asignar',
        );
    if (!conf.isConfirmed) return;

    setAplicando(true);
    const patches: { row: ContractOverviewRow; patch: Partial<ContractOverviewRow> }[] = [];
    let fallidas = 0;
    // Por qué falló la PRIMERA: sin esto el error del server se perdía y la barra decía "20 fallaron"
    // sin decir de qué, que se lee como que el botón no anda.
    let motivo = '';
    // El server borra la asignación con string vacío: es el mismo valor que manda el select de la fila.
    const valor = quitando ? '' : empresaId;
    for (const r of aplicables) {
      try {
        if (campo === 'contrato') await projectsAPI.updateContratoEmpresa(r.projectId, r.userId, r.contractIndex, valor);
        else await projectsAPI.updateReleaseEmpresa(r.projectId, r.userId, r.contractIndex, valor);
        patches.push({ row: r, patch: parcheEmpresa(campo, valor, nombre) });
      } catch (e: any) {
        fallidas++;
        if (!motivo) motivo = e?.response?.data?.error || e?.message || '';
      }
    }
    setAplicando(false);
    onAplicado(patches);
    setEmpresaId('');
    if (fallidas > 0) sweetAlert.error('Se actualizaron con errores', `${patches.length} actualizados, ${fallidas} fallaron.${motivo ? ` El primero falló por: ${motivo}` : ''}`);
    else if (quitando) sweetAlert.success('Listo', `${patches.length} contrato(s) quedaron sin ${label}.`);
    else sweetAlert.success('Listo', `${patches.length} contrato(s) actualizados con "${nombre}".`);
  };

  if (opciones.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-stretch">
        <select
          value={empresaId}
          onChange={(e) => setEmpresaId(e.target.value)}
          disabled={inhabilitado}
          title={bloqueado || (sinSeleccion ? `Tildá contratos para asignarles la ${label}` : `Asignar ${label} a los contratos tildados`)}
          className={SELECT_MASIVO}
        >
          <option value="">{label}…</option>
          {/* Quitar en masa, la contracara de asignar: el select de cada fila ya ofrece «Sin empresa»
              y hacerlo de a una para corregir una asignación equivocada era el mismo trabajo que la
              barra existe para evitar. Va primero y separado por eso: no es una empresa más. */}
          <option value={SIN_EMPRESA_MASIVO}>Sin {label}</option>
          {opciones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={aplicar}
          disabled={inhabilitado || !empresaId || aplicando}
          title={
            bloqueado ||
            (sinSeleccion
              ? `Tildá contratos para asignarles la ${label}`
              : empresaId === SIN_EMPRESA_MASIVO
                ? `Dejar sin ${label} a ${filas.length} contrato(s)`
                : empresaId
                  ? `Asignar a ${filas.length} contrato(s)`
                  : 'Elegí una empresa')
          }
          className={BOTON_MASIVO}
        >
          <FontAwesomeIcon icon={aplicando ? faSpinner : faCheck} spin={aplicando} className="h-3.5 w-3.5" />
          Aplicar
        </button>
      </div>
      <InfoMasivo titulo={`${label} en masa`} ayuda={`Qué hace «Aplicar» en ${label}`}>
        <p className="text-sm text-gray-700 dark:text-gray-200">
          Tildá contratos en la lista, elegí una empresa acá y tocá <strong>Aplicar</strong>: se le pone esa <strong>{label}</strong> a todos los tildados de una, igual que si abrieras el select de cada fila. Es la misma escritura, hecha de a muchas.
        </p>
        {campo === 'contrato' ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            La <strong>Empresa Contrato</strong> es la empleadora: su CUIT es contra el que se consulta la obra social y con el que se registra el alta. Un contrato sin ella no se puede validar ni entra en el TXT.
          </p>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            La <strong>Empresa Release</strong> es la que sale impresa en el PDF del release, y puede ser distinta de la empleadora del contrato. No interviene en ARCA: no afecta al TXT, ni al alta, ni a la obra social.
          </p>
        )}
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {/* Es la pregunta que aparece sola cuando el select ofrece menos empresas de las esperadas. */}
          El select ofrece solo las empresas <strong>del proyecto</strong> de los contratos tildados. Si tildás contratos de proyectos distintos, aparecen las de todos, y al aplicar se saltean las filas cuyo proyecto no tenga la empresa elegida.
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Con <strong>«Sin {label}»</strong> —la primera opción de la lista— se los deja sin ella, que es la forma de corregir una asignación equivocada sin ir fila por fila.
        </p>
      </InfoMasivo>
    </div>
  );
};

/**
 * Sub-pestaña "Altas de ARCA | Constancia de CUIT": lista SOLO lectura de los contratos cuyo estado
 * actual es un estado impositivo, con su trámite (Alta temprana de ARCA / Constancia de CUIT),
 * filtros y exportación a CSV.
 */
export const ContractBulkAfipTab: React.FC<{
  allEstados: InfoItem[];
  contratoFrames: ContratoFrameItem[];
  releases: Release[];
  initialProjectId?: string;
  tipo: TabTramite;
  /** Informa al padre la cantidad de contratos de cada trámite, para mostrarla en sus propias pestañas. */
  onCounts?: (counts: { alta: number; cuit: number; firma: number; sinCuit: number }) => void;
}> = ({ allEstados, contratoFrames, releases, initialProjectId = '', tipo: filterTipo, onCounts }) => {
  const [rows, setRows] = useState<ContractOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  /** Motivo por el que falló la carga (vacío = sin error). Ver `load()`. */
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [soloIncompletos, setSoloIncompletos] = useState(false);
  /** Sub-pestaña Constancia de CUIT: mostrar solo las que faltan o ya vencieron (el worklist). */
  const [soloPendientes, setSoloPendientes] = useState(false);

  // Mismo set de filtros que la pestaña Contratos (se aplican del lado del cliente sobre lo ya cargado).
  const [filterUserStatus, setFilterUserStatus] = useState('');
  const [filterVigencia, setFilterVigencia] = useState('');
  const [filterRolMobile, setFilterRolMobile] = useState('');
  const [filterTipoContrato, setFilterTipoContrato] = useState('');
  const [filterEstadoContrato, setFilterEstadoContrato] = useState('');
  /** Filtro por estado de la obra social: convierte la grilla en la cola de trabajo del trámite. */
  const [filterObraSocial, setFilterObraSocial] = useState<EstadoObraSocial | ''>('');
  /** Orden por estado de obra social: agrupa arriba lo que hay que resolver. */
  const [ordenObraSocial, setOrdenObraSocial] = useState(false);
  const [filterReemplazo, setFilterReemplazo] = useState('');
  const [filterClientId, setFilterClientId] = useState('');
  // Preseleccionado cuando se entra desde el proyecto (Gestionar Equipo → Gestión masiva de Contratos).
  const [filterProjectId, setFilterProjectId] = useState(initialProjectId);
  // Empresa (ABM "Empresas"): agrupa/filtra las altas por la empleadora que las va a presentar en ARCA.
  const [filterEmpresaId, setFilterEmpresaId] = useState('');

  // Vista tabla / tarjetas (como Contratos): la tabla solo en pantallas grandes.
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [isLarge, setIsLarge] = useState(window.innerWidth >= 1024);
  useEffect(() => {
    const onResize = () => setIsLarge(window.innerWidth >= 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const effectiveViewMode = isLarge ? viewMode : 'cards';

  // Catálogos para resolver los datos ARCA (completitud).
  const [categorias, setCategorias] = useState<CategoriaSatItem[]>([]);
  const [tipos, setTipos] = useState<ContratoItem[]>([]);
  const [obrasSociales, setObrasSociales] = useState<SimpleCatalogItem[]>([]);
  const [sedes, setSedes] = useState<InfoItem[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  // Catálogo de Sucursales de ARCA: de acá salen el código de sucursal y las actividades del alta.
  const [arcaSucursales, setArcaSucursales] = useState<ArcaSucursal[]>([]);
  /*
    Los defaults de la INSTALACIÓN: el último escalón de la cascada de ARCA.

    Se traen una vez y viajan en el catálogo, igual que los nomencladores: la resolución de cada fila
    es una función pura y no puede ir a buscarlos por su cuenta. Si la request falla se sigue con {},
    que es exactamente el comportamiento anterior (contrato → empresa) — un default global que no
    llegó no puede bloquear la pantalla.
  */
  const [defaultsArcaGlobales, setDefaultsArcaGlobales] = useState<ArcaDefaults>({});
  useEffect(() => {
    arcaDefaultsAPI
      .get()
      .then(setDefaultsArcaGlobales)
      .catch(() => setDefaultsArcaGlobales({}));
  }, []);
  const [convenios, setConvenios] = useState<SimpleCatalogItem[]>([]);
  // Detalle de completitud de una fila (modal).
  /**
   * Detalle de "Datos ARCA" abierto. Se guarda la IDENTIDAD de la fila, no la fila.
   *
   * Guardar `{ row, result }` congelaba una copia del momento en que se abrió el modal: al elegir la
   * empresa (o la obra social) desde adentro, el patch actualizaba la grilla pero el modal seguía
   * mostrando los datos viejos. Con la identidad, `detalle` se recalcula solo de `impositivoRows`.
   */
  const [detalleRef, setDetalleRef] = useState<{ _id: string; contractIndex: number } | null>(null);
  // Detalle de los datos para la Constancia de CUIT/CUIL (único requisito: el CUIT/CUIL).
  const [constancia, setConstancia] = useState<{ row: ImpositivoRow; cuil: string } | null>(null);
  // Explicación de qué hacer en ARCA con el TXT ya generado (modal informativo).
  const [cargarArcaInfoOpen, setCargarArcaInfoOpen] = useState(false);
  // Explicación del flujo completo: Generar TXT → Cargar en ARCA → sincronización automática.
  const [flujoTxtInfoOpen, setFlujoTxtInfoOpen] = useState(false);
  const [validarObrasSocialesInfoOpen, setValidarObrasSocialesInfoOpen] = useState(false);
  /** Fila cuyo ⓘ de Obra Social se tocó: no se puede validar porque todavía no tiene empleadora. */
  const [obraSocialSinEmpresa, setObraSocialSinEmpresa] = useState<ContractOverviewRow | null>(null);
  // Explicación de qué son y de dónde salen los datos que exige la columna "Datos ARCA".
  const [datosAfipInfoOpen, setDatosAfipInfoOpen] = useState(false);
  // Explicación de qué es la columna "Datos CUIT/CUIL" y por qué gatea Validar / Validar ARCA Masivo.
  const [datosCuitInfoOpen, setDatosCuitInfoOpen] = useState(false);
  // Explicación de por qué "Empresa Contrato" es obligatoria (modal informativo).
  const [empresaContratoInfoOpen, setEmpresaContratoInfoOpen] = useState(false);

  useEffect(() => {
    categoriaSatAPI
      .list()
      .then(setCategorias)
      .catch(() => setCategorias([]));
    contratosAPI
      .list()
      .then(setTipos)
      .catch(() => setTipos([]));
    obrasSocialesApi
      .list()
      .then(setObrasSociales)
      .catch(() => setObrasSociales([]));
    infoAPI
      .listSedes()
      .then(setSedes)
      .catch(() => setSedes([]));
    companiesAPI
      .list()
      .then(setCompanies)
      .catch(() => setCompanies([]));
    arcaSucursalesAPI
      .list()
      .then(setArcaSucursales)
      .catch(() => setArcaSucursales([]));
    conveniosApi
      .list()
      .then(setConvenios)
      .catch(() => setConvenios([]));
  }, []);

  // Las empresas entran al catálogo por su obra social por defecto (ver la cascada en resolveAfipValues).
  // `estados` entra al catálogo para que el TXT derive el alta temprana del estado del contrato y no
  // del switch que se eliminó. `allEstados` ya estaba en scope: es la misma lista que arma las bandejas.
  const afipCat = useMemo(() => ({ categorias, tipos, obrasSociales, sedes, empresas: companies, sucursales: arcaSucursales, convenios, estados: allEstados, defaultsArcaGlobales }), [categorias, tipos, obrasSociales, sedes, companies, arcaSucursales, convenios, allEstados, defaultsArcaGlobales]);

  const activeReleases = useMemo(() => releases.filter((r) => r.isActive), [releases]);

  // clave-estado (normalizada) → trámite impositivo, para los estados marcados como impositivos.
  const impositivoPorClave = useMemo(() => {
    const m = new Map<string, { tipo?: TipoImpositivo; name: string; aceptaSinCuit?: boolean }>();
    allEstados.filter((e) => e.data?.esImpositivo).forEach((e) => m.set(claveEstado(e.name), { tipo: e.data?.tipoImpositivo as TipoImpositivo | undefined, name: e.name, aceptaSinCuit: !!e.data?.aceptaSinCuit }));
    return m;
  }, [allEstados]);

  /** Nombres de los estados marcados como impositivos: son los únicos contratos que muestra esta pantalla. */
  const estadosImpositivos = useMemo(() => allEstados.filter((e) => e.data?.esImpositivo && e.name).map((e) => e.name), [allEstados]);

  // Se le piden al server SOLO los contratos con estado impositivo (unas decenas) en vez del padrón
  // entero: traerlo completo para descartarlo acá movía megas al pedo y el endpoint se pasaba del
  // timeout. Y si falla hay que decirlo — quedarse callado dejaba la pantalla igual que cuando no
  // hay contratos impositivos, así que un error de red se leía como "no hay nada que hacer acá".
  //
  // Va por `cachedFetch` porque cambiar de sub-pestaña desmonta el componente: sin caché, volver a
  // "Alta temprana" después de pasar por "Firma digital" repetía una consulta de varios segundos
  // para mostrar exactamente lo mismo. `load(true)` fuerza el refresco y es lo que usan las acciones
  // que modifican datos.
  // Estado que alimenta la bandeja de "Firma digital". Se pide acá —aunque esa pestaña sea otro
  // componente— porque esta es la única que está montada al abrir la página: es lo que permite
  // mostrar su contador sin haber entrado. `null` = todavía resolviéndose.
  const [estadoEnvioDoc, setEstadoEnvioDoc] = useState<string | null>(null);
  useEffect(() => {
    cachedFetch(`${CONTRACTS_OVERVIEW_CACHE}firma-config`, () => firmaDigitalAPI.config())
      .then((cfg) => setEstadoEnvioDoc(cfg?.estadoEnvioDocNombre || ''))
      .catch(() => setEstadoEnvioDoc(''));
  }, []);

  // Los contratos en "Envío de documentación" viajan en la misma consulta que los impositivos: son
  // los que necesita la pestaña de Firma y, de paso, evitan una segunda consulta solo para contarlos.
  const estadosPedidos = useMemo(() => (estadoEnvioDoc ? [...estadosImpositivos, estadoEnvioDoc] : estadosImpositivos), [estadosImpositivos, estadoEnvioDoc]);

  const load = useCallback(
    (force = false) => {
      // Sin la config todavía no se sabe qué estados pedir: esperar evita disparar la consulta
      // pesada dos veces (una sin el estado de envío y otra con él).
      if (estadoEnvioDoc === null) return Promise.resolve();
      if (estadosImpositivos.length === 0) {
        setRows([]);
        setLoading(false);
        return Promise.resolve();
      }
      const key = `${CONTRACTS_OVERVIEW_CACHE}impositivos:${estadosPedidos.join(',')}`;
      if (force) invalidateRefCache(CONTRACTS_OVERVIEW_CACHE);
      setLoading(true);
      setLoadError('');
      return cachedFetch(key, () => usersAPI.listContractsOverview({ limit: 5000, estados: estadosPedidos }))
        .then((res) => setRows(res.rows))
        .catch((e: any) => {
          setRows([]);
          setLoadError(e?.response?.data?.error || e?.message || 'No se pudieron cargar los contratos.');
        })
        .finally(() => setLoading(false));
    },
    [estadosImpositivos, estadosPedidos, estadoEnvioDoc],
  );

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Aplica el cambio de UNA fila sin recargar el listado: con ~800 contratos, releer todo por haber
   * elegido una empresa son varios segundos de espera por cada click. El caché compartido se parchea
   * igual, así las otras pestañas ven el mismo dato sin volver a consultar.
   *
   * Si el que llama no sabe qué cambió (no manda parche), se recarga como antes.
   */
  const aplicarCambio = useCallback(
    (record: ContractOverviewRow, patch?: Partial<ContractOverviewRow>) => {
      if (!patch) return load(true);
      const esLaFila = (r: ContractOverviewRow) => r._id === record._id && r.contractIndex === record.contractIndex;
      setRows((prev) => prev.map((r) => (esLaFila(r) ? { ...r, ...patch } : r)));
      updateRefCache<{ rows: ContractOverviewRow[] }>(`${CONTRACTS_OVERVIEW_CACHE}impositivos:${estadosPedidos.join(',')}`, (data) => ({
        ...data,
        rows: (data.rows || []).map((r) => (esLaFila(r) ? { ...r, ...patch } : r)),
      }));
      return Promise.resolve();
    },
    [load, estadosPedidos],
  );

  const handleDownloadContract = (record: ContractOverviewRow, empresaId?: string) => downloadContractRow(record, contratoFrames, empresaId);
  const handleDownloadRelease = (record: ContractOverviewRow, release: Release, empresaId?: string) => downloadReleaseRow(record, release, empresaId);
  const handleUploadAlta = async (record: ContractOverviewRow, file: File) => {
    await uploadAltaRow(record, file);
    load(true);
  };

  // Genera el TXT de Alta masiva de ARCA para los contratos con datos completos del conjunto dado;
  // omite los incompletos (no se puede armar una línea válida) e informa cuántos quedaron afuera.
  const generarTxt = (items: { row: ImpositivoRow; result: AfipRowResult }[], filenameBase: string) => {
    // Un TXT es de UNA empleadora: se sube logueado con su CUIT. Mezclar produce un archivo
    // rechazado o, peor, altas cargadas bajo la empresa equivocada — que ARCA acepta sin chistar y
    // recién se descubre después. Se corta ANTES de bajar el archivo.
    //
    // Se miran solo las filas que realmente entran: `buildAltaRecord` ya descarta las que no tienen
    // empleadora fija, así que contar las candidatas de un contrato sin decidir daría un falso error.
    const incluidas = items.filter((x) => buildAltaRecord(x.row, afipCat) !== null);
    const empresasDelLote = [...new Set(incluidas.map((x) => String(x.row.empresaContratoId)))];
    if (empresasDelLote.length > 1) {
      const nombres = empresasDelLote.map((id) => companies.find((c) => c._id === id)?.razonSocial || id);
      sweetAlert.error('El TXT sería de más de una empleadora', `El conjunto mezcla altas de ${nombres.join(' y ')}. El archivo se sube logueado con un solo CUIT: elegí una empresa en «Empresa Contrato» —o entrá desde el contexto de esa empresa— y generá un TXT por cada una.`);
      return;
    }

    /**
     * ÚLTIMA BARRERA: solo entran los contratos sin errores de completitud.
     *
     * `buildAltaRecord` arma la línea con lo que hay: le alcanza con que los campos tengan valor. No
     * sabe, por ejemplo, que la obra social resuelta no está entre las registradas por esa empleadora
     * —una validación sobre el PAR (obra social, empresa) que puede romperse después de haber
     * guardado las dos cosas, sacando la obra social de la ficha de la empresa—. Un alta así se
     * genera perfecta y ARCA la rechaza.
     *
     * Por eso se filtra por `result.completo`, que sí mira los errores cruzados, en vez de confiar en
     * que la línea se haya podido armar.
     */
    const conProblemas = items.filter((x) => !x.result.completo);
    const registros = items
      .filter((x) => x.result.completo)
      .map((x) => buildAltaRecord(x.row, afipCat))
      .filter((r): r is string => r !== null);
    if (registros.length === 0) {
      sweetAlert.error('Sin datos completos', 'Ningún contrato del conjunto tiene todos los datos ARCA cargados. Completá los faltantes (columna «Datos ARCA») antes de generar el TXT.');
      return;
    }
    const omitidos = items.length - registros.length;
    // Se nombra el motivo del primero: "se omitieron 3" sin decir por qué manda a abrir tres modales.
    const primerProblema = conProblemas[0]?.result.checks.find((c) => c.estado === 'error' || c.estado === 'falta');
    const detalleOmitidos = primerProblema ? ` El primero es ${conProblemas[0].row.userName}: ${primerProblema.detalle || primerProblema.label}.` : '';
    // El nombre lleva el CUIT de la empleadora, no su razón social: el archivo se sube logueado con
    // ese CUIT y es el dato con el que se coteja. Además dos razones sociales parecidas dan nombres
    // parecidos, y un TXT subido a la sesión equivocada ARCA lo acepta sin chistar.
    const cuitLote = String(companies.find((c) => c._id === empresasDelLote[0])?.cuit ?? '').replace(/\D/g, '');
    downloadTxt(buildAltaTxt(registros), `${filenameBase}${cuitLote ? `_${cuitLote}` : ''}_${hoyStamp()}.txt`);
    // "Cargar en ARCA" se habilita recién ahora: sin archivo generado, ese botón lleva al portal a
    // subir algo que no existe. Se recuerda de qué empleadora era, porque el TXT es de UN CUIT.
    setTxtGeneradoPara(cuitLote || 'sin-cuit');
    if (omitidos > 0) {
      sweetAlert.info('TXT generado', `Se incluyeron ${registros.length} alta(s). Se omitieron ${omitidos} contrato(s) por datos ARCA incompletos o mal cargados.${detalleOmitidos}`);
    } else {
      sweetAlert.success('TXT generado', `Se incluyeron ${registros.length} alta(s) en el archivo.`);
    }
  };

  // Solo los contratos cuyo estado actual es impositivo, con su chequeo de completitud ARCA.
  const impositivoRows = useMemo<{ row: ImpositivoRow; result: AfipRowResult }[]>(() => {
    const out: { row: ImpositivoRow; result: AfipRowResult }[] = [];
    for (const r of rows) {
      const imp = impositivoPorClave.get(claveEstado(r.nombre_estado_empleado || ''));
      if (imp) {
        const row: ImpositivoRow = { ...r, _tipo: imp.tipo, _estadoName: imp.name, _aceptaSinCuit: imp.aceptaSinCuit };
        out.push({ row, result: resolveAfip(row, afipCat) });
      }
    }
    return out;
  }, [rows, impositivoPorClave, afipCat]);

  // Si la fila deja de ser impositiva (le cambiaron el estado), el modal se cierra solo: mostrar el
  // detalle ARCA de un contrato que ya no está en el listado sería peor que cerrarlo.
  const detalle = useMemo(() => (detalleRef ? impositivoRows.find((x) => x.row._id === detalleRef._id && x.row.contractIndex === detalleRef.contractIndex) || null : null), [impositivoRows, detalleRef]);

  /**
   * Constatación de obras sociales EN LOTE.
   *
   * Vive acá y no en una pantalla aparte porque el corte que importa —qué empleadora— ya está hecho
   * por las pestañas de arriba: el padrón se consulta por CUIL, pero el RNOS se declara por contrato
   * y es de la empleadora que presenta el alta.
   */
  /**
   * A QUÉ contratos apunta la corrida de validación. `null` = cerrado.
   *
   * Es un conjunto de claves y no un booleano porque hay tres formas de arrancar el mismo proceso —el
   * botón del contador (todos los pendientes del filtro), la selección de la grilla, y el botón de
   * una fila suelta— y las tres tienen que terminar en el MISMO motor. Un flujo aparte "para una
   * sola" es lo que se viene sacando a propósito: dos caminos por los que un RNOS entra al sistema
   * son dos formas de que diverjan.
   */
  const [loteObrasSociales, setLoteObrasSociales] = useState<Set<string> | null>(null);
  /**
   * El convenio elegido en cada fila. NO se guarda: filtra las categorías de esa fila.
   *
   * Vive acá y no en la celda porque son DOS celdas —dos columnas— y las dos lo necesitan. Se indexa
   * por `rowKey`, que es lo único estable entre renders cuando el listado se reordena.
   */
  const [convenioFila, setConvenioFila] = useState<Record<string, string>>({});
  /**
   * CUIT del último TXT generado en esta sesión, o `''`.
   *
   * "Cargar en ARCA" solo tiene sentido con un archivo en la mano: antes de generarlo manda al portal
   * a subir algo que no existe. Se guarda el CUIT y no un booleano porque el TXT es de UNA
   * empleadora: cambiando de pestaña de empresa, el archivo que se bajó ya no es el que corresponde.
   */
  const [txtGeneradoPara, setTxtGeneradoPara] = useState('');
  /*
   * Cambiar de empleadora invalida el archivo bajado: el TXT se sube logueado con UN CUIT, así que el
   * de la empresa anterior no sirve para esta. Sin esto, "Cargar en ARCA" quedaba habilitado y
   * llevaba al portal a subir el archivo equivocado — que ARCA acepta sin chistar, dando de alta a
   * gente bajo la empresa que no es.
   */
  useEffect(() => setTxtGeneradoPara(''), [filterEmpresaId]);
  /** Progreso de la corrida automática, para no dejar la pantalla muda mientras guarda. */

  // Filtros de la barra superior (búsqueda + filtro avanzado), sin el trámite ni los toggles propios
  // de cada pestaña: se usa tanto para la tabla como para los contadores de las pestañas, que deben
  // reflejar los filtros activos (p. ej. "Contratos: Vigentes") aunque pertenezcan al otro trámite.
  const matchesCommonFilters = useCallback(
    (r: ImpositivoRow): boolean => {
      const q = search.trim().toLowerCase();
      if (filterUserStatus && r.userActivo !== (filterUserStatus === 'active')) return false;
      if (filterVigencia) {
        const vig = isContractVigente(r.fecha_alta_contrato, r.fecha_baja_contrato);
        if (filterVigencia === 'vigente' ? !vig : vig) return false;
      }
      if (filterRolMobile && !(r.userRoles || []).some((rol) => (rol.name || '').toLowerCase().includes(filterRolMobile))) return false;
      if (filterTipoContrato && r.nombre_contrato !== filterTipoContrato) return false;
      if (filterEstadoContrato && estadoLabel(r.nombre_estado_empleado || '') !== filterEstadoContrato) return false;
      if (filterReemplazo && (filterReemplazo === 'con' ? !r.reemplazo : r.reemplazo)) return false;
      if (filterClientId && r.clientId !== filterClientId) return false;
      if (filterProjectId && r.projectId !== filterProjectId) return false;
      if (q) {
        const hay = [r.userName, r.userEmail, r.clientName, r.projectName, r.nombre_contrato].some((v) => (v || '').toLowerCase().includes(q));
        if (!hay) return false;
      }
      return true;
    },
    [search, filterUserStatus, filterVigencia, filterRolMobile, filterTipoContrato, filterEstadoContrato, filterReemplazo, filterClientId, filterProjectId],
  );

  /**
   * La pestaña de empresa muestra SOLO lo de esa empleadora.
   *
   * Antes matcheaba contra las empresas CANDIDATAS del proyecto, así que la pestaña "FZERO" mostraba
   * 24 contratos sin asignar que no eran de FZERO: el número de la pestaña no significaba nada y el
   * TXT "de FZERO" salía vacío. Los que todavía no eligieron empleadora tienen su propia pestaña,
   * que es donde se asignan.
   */
  const matchesEmpresa = useCallback(
    (r: ImpositivoRow) => {
      if (!filterEmpresaId) return true;
      if (filterEmpresaId === SIN_EMPRESA) return !r.empresaContratoId;
      return String(r.empresaContratoId || '') === filterEmpresaId;
    },
    [filterEmpresaId],
  );

  const rowsPorFiltrosComunes = useMemo(() => impositivoRows.filter((x) => matchesCommonFilters(x.row) && matchesEmpresa(x.row)), [impositivoRows, matchesCommonFilters, matchesEmpresa]);

  // Filas del lote de obras sociales: las mismas que se están mirando (filtros + empleadora), con sus
  // valores ya resueltos. Solo se calculan con el lote abierto: son ~500 resoluciones completas de la
  // cascada y no hacen falta para pintar la tabla.
  const filasConstatacion = useMemo<FilaConstatacion[]>(
    () =>
      loteObrasSociales
        ? rowsPorFiltrosComunes
            .filter((x) => x.row._tipo === 'alta_temprana_afip' && loteObrasSociales.has(`${x.row._id}-${x.row.contractIndex}`))
            .map((x) => ({ row: x.row, valores: resolveAfipValues(x.row, afipCat) }))
        : [],
    [loteObrasSociales, rowsPorFiltrosComunes, afipCat],
  );

  /**
   * La empleadora de la tanda sale de las FILAS, no de la pestaña.
   *
   * La validación de "esta obra social está entre las registradas" es por CUIT, así que mezclar dos
   * empleadoras haría que el mismo RNOS sea válido para unas filas e inválido para otras dentro del
   * mismo lote. Si el conjunto no comparte una sola empleadora, el lote no se puede aplicar y la
   * pantalla lo dice — antes eso dependía de estar parado en la pestaña correcta, y desde "Todas" el
   * panel simplemente no aparecía, sin explicar por qué.
   */
  const empresaDelLote = useMemo(() => {
    const ids = new Set(filasConstatacion.map((f) => String(f.row.empresaContratoId || '')));
    return ids.size === 1 ? [...ids][0] : '';
  }, [filasConstatacion]);

  /*
    Acá vivía el disparo de la validación automática por extensión de navegador (Tampermonkey): se
    sembraba una cola en el almacén de la extensión, se abría ARCA y el script iba devolviendo los
    RNOS. Se sacó entero.

    No falló el problema: falló el mecanismo. El sandbox de la extensión, el permiso de Chrome que
    viene apagado, los eventos que no cruzaban, las versiones que había que reinstalar a mano, las
    copias duplicadas peleándose la misma cola, el contenido mixto al traer la lógica. Cada arreglo
    destapaba el siguiente y ninguno tenía que ver con leer una obra social.

    Lo reemplaza `frontend/tools/validar-obras-sociales.mjs`, que se cuelga por CDP del Chrome que el
    operador ya tiene abierto y logueado. Desde esta pantalla, el botón abre el panel de pegado
    —`ConstatarObrasSocialesLote`—, que es donde se pega el `CUIL,RNOS` que devuelve ese script y que
    ya tenía previsualización y validación contra las obras sociales registradas por la empleadora.
  */

  /**
   * Cuántas quedan sin constatar en lo que se está mirando: es el número del botón.
   *
   * Se cuenta con `estadoObraSocial`, la misma función que pinta la celda y filtra la columna. Antes
   * tenía su propia condición y contaba de más —incluía las que no tienen empleadora y las que la
   * empleadora no registró—, así que el botón decía 26 y el filtro traía 24.
   */
  const countSinConstatar = useMemo(
    () => rowsPorFiltrosComunes.filter((x) => x.row._tipo === 'alta_temprana_afip' && !!x.row.empresaContratoId && estadoObraSocial(x.row, resolveAfipValues(x.row, afipCat)) === 'sin_validar').length,
    [rowsPorFiltrosComunes, afipCat],
  );
  /**
   * Pendientes que NO se pueden validar todavía porque les falta la empleadora.
   *
   * Se cuentan aparte y se dicen: si entraran en el número del botón, este abriría una tanda que no
   * puede aplicar ninguna. Y si no se mencionaran, el contador diría 0 con 20 contratos pendientes a
   * la vista, que se lee como que el sistema no los ve.
   */
  /** Total y validadas, para el chip informativo. Misma función que la celda: no pueden discrepar. */
  const countObraSocialTotal = useMemo(() => rowsPorFiltrosComunes.filter((x) => x.row._tipo === 'alta_temprana_afip').length, [rowsPorFiltrosComunes]);
  const countObraSocialValidadas = useMemo(
    () => rowsPorFiltrosComunes.filter((x) => x.row._tipo === 'alta_temprana_afip' && ['validada_arca', 'validada_default'].includes(estadoObraSocial(x.row, resolveAfipValues(x.row, afipCat)))).length,
    [rowsPorFiltrosComunes, afipCat],
  );
  const countSinEmpleadora = useMemo(
    () => rowsPorFiltrosComunes.filter((x) => x.row._tipo === 'alta_temprana_afip' && !x.row.empresaContratoId && estadoObraSocial(x.row, resolveAfipValues(x.row, afipCat)) === 'sin_validar').length,
    [rowsPorFiltrosComunes, afipCat],
  );

  // Los contadores siguen el mismo corte que la tabla: la gente sin CUIT se cuenta aparte y no
  // infla los trámites de ARCA, que no le aplican.
  const countAlta = rowsPorFiltrosComunes.filter((x) => x.row._tipo === 'alta_temprana_afip' && !noPoseeCuit(x.row.cuit, x.row.sinCuit)).length;
  const countCuit = rowsPorFiltrosComunes.filter((x) => x.row._tipo === 'constancia_cuit' && !noPoseeCuit(x.row.cuit, x.row.sinCuit)).length;
  const countSinCuit = rowsPorFiltrosComunes.filter((x) => noPoseeCuit(x.row.cuit, x.row.sinCuit)).length;
  const countCompletos = impositivoRows.filter((x) => x.result.completo).length;
  const countIncompletos = impositivoRows.length - countCompletos;

  // Contador de "Firma digital": los contratos en el estado de envío de documentación, con los mismos
  // filtros de la barra que aplican los otros dos, para que los tres números sean comparables.
  const claveEnvioDoc = estadoEnvioDoc ? claveEstado(estadoEnvioDoc) : '';
  const countFirma = useMemo(
    () => (claveEnvioDoc ? rows.filter((r) => claveEstado(r.nombre_estado_empleado || '') === claveEnvioDoc && matchesCommonFilters(r as ImpositivoRow)).length : 0),
    [rows, claveEnvioDoc, matchesCommonFilters],
  );

  // Ref para no re-disparar el aviso al padre por un `onCounts` con identidad nueva en cada render.
  const onCountsRef = useRef(onCounts);
  onCountsRef.current = onCounts;
  useEffect(() => {
    onCountsRef.current?.({ alta: countAlta, cuit: countCuit, firma: countFirma, sinCuit: countSinCuit });
  }, [countAlta, countCuit, countFirma, countSinCuit]);

  // Constancias de CUIT: vigentes vs. pendientes (las que faltan o ya vencieron, que son las que hay
  // que volver a pedirle a ARCA). Se cuentan sobre todas las de ese trámite, como countAlta/countCuit.
  const constanciaRows = useMemo(() => impositivoRows.filter((x) => x.row._tipo === 'constancia_cuit'), [impositivoRows]);
  const countConstPendientes = constanciaRows.filter((x) => constanciaPendiente(x.row)).length;
  const countConstVigentes = constanciaRows.length - countConstPendientes;

  /** Filtro de la pestaña de trámite. Separado para poder contar las pestañas de empresa con él. */
  const pasaFiltroTramite = useCallback(
    ({ row: r, result }: { row: ImpositivoRow; result: AfipRowResult }) => {
      // "Sin CUIT" agrupa a la gente sin CUIT/CUIL de CUALQUIERA de los dos trámites; las pestañas
      // de ARCA, al revés, la excluyen (esos trámites no le aplican y quedaría trabada ahí).
      if (filterTipo === 'sin_cuit') {
        if (!noPoseeCuit(r.cuit, r.sinCuit)) return false;
      } else {
        if (noPoseeCuit(r.cuit, r.sinCuit)) return false;
        if (filterTipo && r._tipo !== filterTipo) return false;
      }
      if (soloIncompletos && result.completo) return false;
      if (soloPendientes && filterTipo === 'constancia_cuit' && !constanciaPendiente(r)) return false;
      return true;
    },
    [filterTipo, soloIncompletos, soloPendientes],
  );

  const filtered = useMemo(() => {
    const base = rowsPorFiltrosComunes.filter(pasaFiltroTramite);
    // El filtro y el orden se resuelven con `estadoObraSocial`, la MISMA función que pinta la celda:
    // si cada uno clasificara por su cuenta, filtrar "sin constatar" podría traer filas que la celda
    // muestra en verde.
    const conFiltro = filterObraSocial ? base.filter((x) => estadoObraSocial(x.row, resolveAfipValues(x.row, afipCat)) === filterObraSocial) : base;
    if (!ordenObraSocial) return conFiltro;
    return [...conFiltro].sort((a, b) => ORDEN_ESTADO_OS[estadoObraSocial(a.row, resolveAfipValues(a.row, afipCat))] - ORDEN_ESTADO_OS[estadoObraSocial(b.row, resolveAfipValues(b.row, afipCat))]);
  }, [rowsPorFiltrosComunes, pasaFiltroTramite, filterObraSocial, ordenObraSocial, afipCat]);

  /**
   * Cuántos contratos hay detrás de cada pestaña de empresa.
   *
   * Se cuenta SIN el filtro de empresa —si no, cada pestaña mostraría el total de la que está
   * seleccionada— pero CON el resto: el número tiene que coincidir con lo que se ve al entrar.
   */
  const conteoPorEmpresa = useMemo(() => {
    const base = impositivoRows.filter((x) => matchesCommonFilters(x.row) && pasaFiltroTramite(x));
    const porId = new Map<string, number>();
    let sinAsignar = 0;
    for (const { row: r } of base) {
      if (!r.empresaContratoId) sinAsignar++;
      else porId.set(String(r.empresaContratoId), (porId.get(String(r.empresaContratoId)) || 0) + 1);
    }
    return { porId, sinAsignar, total: base.length };
  }, [impositivoRows, matchesCommonFilters, pasaFiltroTramite]);

  // Opciones de los selects del filtro avanzado. Salen de `impositivoRows` y no de `rows` porque en
  // la consulta también vienen los contratos en "Envío de documentación" (para el contador de Firma):
  // ofrecer un cliente o proyecto que solo tiene contratos de esos daría siempre cero resultados acá.
  const clientOptions = useMemo(() => {
    const m = new Map<string, string>();
    impositivoRows.forEach(({ row: r }) => r.clientId && m.set(r.clientId, r.clientName || r.clientId));
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [impositivoRows]);
  const projectOptions = useMemo(() => {
    const m = new Map<string, string>();
    impositivoRows
      .map(({ row }) => row)
      .filter((r) => !filterClientId || r.clientId === filterClientId)
      .forEach((r) => r.projectId && m.set(r.projectId, r.projectName || r.projectId));
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [impositivoRows, filterClientId]);
  const tipoContratoOptions = useMemo(() => {
    const s = new Set<string>();
    impositivoRows.forEach((x) => x.row.nombre_contrato && s.add(x.row.nombre_contrato));
    return [...s].sort().map((v) => ({ value: v, label: v }));
  }, [impositivoRows]);
  const estadoContratoOptions = useMemo(() => {
    const s = new Set<string>();
    impositivoRows.forEach((x) => x.row.nombre_estado_empleado && s.add(estadoLabel(x.row.nombre_estado_empleado)));
    return [...s].map((v) => ({ value: v, label: v }));
  }, [impositivoRows]);
  // Las empresas del filtro son las creadas en el ABM (no solo las ya usadas en algún contrato), para
  // poder elegir de antemano por cuál empresa se va a presentar el alta.
  const empresaOptions = useMemo(() => companies.map((c) => ({ value: c._id, label: c.razonSocial })).sort((a, b) => a.label.localeCompare(b.label)), [companies]);

  // Selección de filas para armar el TXT. Solo se pueden marcar los contratos con datos ARCA completos.
  const rowKey = (r: ContractOverviewRow) => `${r._id}-${r.contractIndex}`;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Pestaña "Sin CUIT": fila cuyo modal de documentación de respaldo está abierto. */
  const [validacionRow, setValidacionRow] = useState<ContractOverviewRow | null>(null);
  /** Refresca la validación de UNA fila (y del modal abierto) sin recargar toda la tabla. */
  const aplicarValidacionSinCuit = useCallback((row: ContractOverviewRow, sinCuitValidacion: SinCuitValidacion) => {
    setRows((prev) => prev.map((x) => (x._id === row._id && x.contractIndex === row.contractIndex ? { ...x, sinCuitValidacion } : x)));
    setValidacionRow((prev) => (prev && prev._id === row._id && prev.contractIndex === row.contractIndex ? { ...prev, sinCuitValidacion } : prev));
  }, []);
  const toggleSel = (k: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  // Qué hace falta para poder tildar una fila depende del trámite: en Alta temprana de ARCA son los
  // datos completos para el TXT; en Constancia de CUIT alcanza con tener el CUIT/CUIL cargado (es lo
  // único que necesita "Validar ARCA Masivo").
  /** "Sin CUIT" usa el MISMO layout de columnas que "Constancia de CUIT" (Datos CUIT/CUIL, ARCA,
   *  Dropbox...). Lo que cambia es el contenido de la acción, no la tabla. */
  const layoutConstancia = filterTipo === 'constancia_cuit' || filterTipo === 'sin_cuit';

  /**
   * EL ENCUADRE —convenio, categoría y obra social— SOLO EXISTE EN LA RELACIÓN LABORAL.
   *
   * Los tres son atributos de un empleado en relación de dependencia: el CCT que lo encuadra, la
   * categoría dentro de ese CCT y la obra social que le corresponde. Una Constancia de CUIT es un
   * contrato con un MONOTRIBUTISTA — locación de servicios, no relación laboral—, así que ahí no hay
   * convenio que lo encuadre, ni categoría, ni obra social que declarar. No es que falten: no existen.
   *
   * Pedirlos igual tenía dos costos, y el segundo es el grave:
   *
   *   - tres columnas por fila diciendo «Elegí la empleadora» sobre datos que nunca van a ir;
   *   - y la invitación a completarlos. Cargarle un convenio y una categoría a un monotributista es
   *     declarar un encuadre que no corresponde, y el sueldo de esa categoría empieza a arrastrarse
   *     por cálculos que no son los suyos.
   *
   * Para el alta lo único que hace falta es la EMPRESA —con qué empleadora se firma— y de ahí ya sale
   * a firmar. El chequeo de completitud ya lo sabía: `resolveAfip` no reporta faltantes cuando el
   * contrato no genera alta temprana. Lo que faltaba era que la tabla dijera lo mismo.
   *
   * `sin_cuit` ya lo tenía resuelto por otro camino, y por eso la condición estaba escrita como
   * «distinto de sin_cuit» en siete lugares. Queda un solo nombre para la regla real.
   */
  const hayEncuadre = filterTipo === 'alta_temprana_afip';

  /**
   * El check es de selección GENERAL: se puede marcar cualquier fila. Cada acción masiva aplica
   * después su propio criterio (el TXT arma solo los completos y avisa cuántos omitió; Validar ARCA
   * solo consulta los que tienen CUIT válido). Antes solo se podían marcar los contratos ya
   * completos, lo que dejaba fuera justo a los que había que corregir — no se podían tildar para
   * asignarles la Empresa en masa porque les faltaba, precisamente, la Empresa.
   */
  /**
   * Modo de la tanda: lo PRIMERO que se tilda decide para qué es la selección.
   *
   *  - una fila CON Empresa Contrato → la tanda es para validar obras sociales;
   *  - una fila SIN empresa → la tanda es para asignarles una.
   *
   * Mezclarlas era el problema: se tildaban 2 y «Validar obras sociales» decía (1), porque las que
   * no tienen empleadora no se pueden validar contra ARCA. Ahora, elegido el modo, el otro grupo
   * queda deshabilitado hasta destildar. Para cambiar la empresa a filas que YA la tienen, están
   * las pestañas de empresa de arriba (o «Sin asignar»), que ya dejan el listado homogéneo.
   */
  const modoSeleccion = useMemo<'con_empresa' | 'sin_empresa' | null>(() => {
    const primera = filtered.find((x) => selected.has(rowKey(x.row)));
    if (!primera) return null;
    return primera.row.empresaContratoId ? 'con_empresa' : 'sin_empresa';
  }, [filtered, selected]);
  const esSeleccionable = useCallback(
    (row: ImpositivoRow, _result: AfipRowResult): boolean => {
      if (filterTipo !== 'alta_temprana_afip' || !modoSeleccion) return true;
      return modoSeleccion === 'con_empresa' ? !!row.empresaContratoId : !row.empresaContratoId;
    },
    [filterTipo, modoSeleccion],
  );
  /**
   * Tildada PERO sin empleadora: «Validar obras sociales» la va a omitir.
   *
   * Se marca —check en ámbar y aviso en la fila— en vez de bloquear el check: tildar filas sin
   * empresa es justamente cómo se les asigna una en masa. Sin la marca, tildar 2 y ver «Validar
   * obras sociales (1)» se leía como que el botón contaba mal.
   */
  const omitidaEnValidacion = (r: ContractOverviewRow) => selected.has(rowKey(r)) && !r.empresaContratoId;
  const tituloCheck = (r: ContractOverviewRow) => {
    if (filterTipo === 'alta_temprana_afip' && modoSeleccion === 'con_empresa' && !r.empresaContratoId)
      return 'No se puede sumar a esta tanda: ya hay tildados contratos CON Empresa Contrato (para validar obras sociales) y este no tiene empresa, así que no se puede validar. Destildá los otros si querés asignarle una empresa.';
    if (filterTipo === 'alta_temprana_afip' && modoSeleccion === 'sin_empresa' && r.empresaContratoId)
      return 'No se puede sumar a esta tanda: ya hay tildados contratos SIN Empresa Contrato (para asignarles una). Destildá los otros si querés validar obras sociales.';
    if (omitidaEnValidacion(r)) return 'Tildada para asignarle una Empresa Contrato. Sin empresa no entra en «Validar obras sociales»: la obra social se valida contra el CUIT de la empleadora.';
    return 'Seleccionar para las acciones masivas (asignar Empresa, generar TXT, validar en ARCA)';
  };
  /**
   * Lo que toma el check de la cabecera. Sin nada tildado todavía no hay modo, así que «todos»
   * tiene que elegir uno: toma los que YA tienen empresa —los que se pueden validar— y solo si no
   * hay ninguno cae en los que no la tienen. Si tomara literalmente todos, el primer clic dejaría
   * la selección mezclada, que es justo lo que el modo evita.
   */
  const selectableFiltered = useMemo(() => {
    const base = filtered.filter((x) => esSeleccionable(x.row, x.result));
    if (filterTipo !== 'alta_temprana_afip' || modoSeleccion) return base;
    const conEmpresa = base.filter((x) => !!x.row.empresaContratoId);
    return conEmpresa.length > 0 ? conEmpresa : base;
  }, [filtered, esSeleccionable, filterTipo, modoSeleccion]);
  const allSel = selectableFiltered.length > 0 && selectableFiltered.every((x) => selected.has(rowKey(x.row)));
  const toggleAll = () =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (allSel) selectableFiltered.forEach((x) => n.delete(rowKey(x.row)));
      else selectableFiltered.forEach((x) => n.add(rowKey(x.row)));
      return n;
    });
  const seleccionados = useMemo(() => filtered.filter((x) => selected.has(rowKey(x.row))), [filtered, selected]);
  /**
   * De lo tildado, lo que efectivamente se puede validar.
   *
   * La obra social se valida contra el CUIT de la empleadora: sin ella no hay contra qué. Se filtra
   * acá en vez de bloquear el check porque el check es de selección GENERAL — tildar filas SIN
   * empresa es justamente cómo se les asigna una en masa, que es el paso anterior a poder validarlas.
   */
  /**
   * Lo tildado que SE PUEDE validar: con empleadora asignada y TODAVÍA SIN VALIDAR.
   *
   * El segundo corte es nuevo y es el que evita gastar consultas al pedo: tildar una fila que ya
   * tiene su obra social no la vuelve a mandar a ARCA. Tildarla sigue sirviendo igual, porque es
   * como se la quita en masa (ver `objetivoBorrado`) — lo que no hace es entrar en la corrida.
   */
  const seleccionadosValidables = useMemo(
    () => seleccionados.filter((x) => !!x.row.empresaContratoId && estadoObraSocial(x.row, resolveAfipValues(x.row, afipCat)) === 'sin_validar'),
    [seleccionados, afipCat],
  );

  /**
   * TODO lo que se puede validar de lo que se está mirando, sin haber tildado nada.
   *
   * Es el mismo corte que `countSinConstatar` —misma función, mismos filtros— pero devolviendo las
   * filas y no el número: el contador y el botón no pueden discrepar.
   */
  const pendientesValidables = useMemo(
    () => rowsPorFiltrosComunes.filter((x) => x.row._tipo === 'alta_temprana_afip' && !!x.row.empresaContratoId && estadoObraSocial(x.row, resolveAfipValues(x.row, afipCat)) === 'sin_validar'),
    [rowsPorFiltrosComunes, afipCat],
  );

  /**
   * A quiénes agarra el botón: SOLO LO TILDADO.
   *
   * Esto REVIERTE lo que hacía antes —sin tildar nada agarraba a todos los pendientes del filtro— por
   * pedido explícito. La corrida no es gratis ni instantánea: abre el navegador del servidor y
   * consulta a ARCA de a una persona, minutos. Arrancarla sobre un conjunto que nadie eligió deja la
   * duda de qué se está por mandar, y esa duda aparece justo cuando ya empezó.
   *
   * `pendientesValidables` sigue vivo, pero ahora es solo para el hover del botón apagado: sirve para
   * decir cuántas hay para tildar, que es la pregunta que queda cuando el botón está en cero.
   */
  const objetivoValidacion = seleccionadosValidables;
  /**
   * A quiénes alcanza el borrado masivo: SOLO lo tildado, y solo lo que está validado.
   *
   * Los dos botones trabajan sobre lo tildado, pero este además exige que ya estén validadas: borrar
   * tira trabajo hecho contra ARCA — cada una de esas obras sociales costó una consulta real al
   * organismo, y recuperarlas es volver a correr la tanda entera. Un botón que sin tildar nada
   * borrara las 843 sería una sola pulsación entre el trabajo de una semana y cero.
   */
  const objetivoBorrado = useMemo(
    () => seleccionados.filter((x) => ['validada_arca', 'validada_default', 'no_registrada'].includes(estadoObraSocial(x.row, resolveAfipValues(x.row, afipCat)))),
    [seleccionados, afipCat],
  );

  const [borrandoOs, setBorrandoOs] = useState(false);

  /**
   * Saca la obra social de los contratos tildados.
   *
   * La confirmación dice el NÚMERO y qué queda después, no un «¿estás seguro?». Y dice lo que hace
   * que sea reversible —el valor lo devuelve ARCA, no se carga a mano— porque sin eso la operación
   * parece más destructiva de lo que es y nadie la usa; con eso, se entiende que el costo es volver
   * a correr la validación.
   */
  const quitarObrasSocialesEnLote = useCallback(async () => {
    if (objetivoBorrado.length === 0) return;
    const r = await sweetAlert.confirm(
      `¿Quitar ${objetivoBorrado.length} obra${objetivoBorrado.length === 1 ? '' : 's'} social${objetivoBorrado.length === 1 ? '' : 'es'}?`,
      `Esos contratos vuelven a quedar SIN VALIDAR y no entran en el TXT hasta validarlos de nuevo en ARCA. No se pierde ningún dato propio: el valor lo devuelve el organismo, así que se recupera volviendo a validar.`,
      'Sí, quitar',
    );
    if (!r.isConfirmed) return;

    setBorrandoOs(true);
    try {
      const res = await projectsAPI.quitarObrasSocialesLote(
        objetivoBorrado.map((x) => ({ projectId: x.row.projectId, userId: x.row.userId, contratoId: String(x.row.contratoId || x.row.contractIndex) })),
      );
      await load(true);
      if (res.fallidos.length > 0) {
        // Se dicen los que NO entraron, no solo cuántos sí: un «listo» sobre un borrado parcial deja
        // a alguien creyendo que la tabla quedó limpia cuando no.
        sweetAlert.error('Quedaron algunos sin quitar', `Se quitaron ${res.quitados}. No se pudo con ${res.fallidos.length}: ${res.fallidos[0].motivo}`);
      } else {
        sweetAlert.success('Listo', `${res.quitados} volvieron a quedar sin validar.`);
      }
    } catch (e: any) {
      sweetAlert.error('No se pudo', e?.response?.data?.error || 'No se pudieron quitar las obras sociales.');
    } finally {
      setBorrandoOs(false);
    }
  }, [objetivoBorrado, load]);

  /** Aplica en la tabla (y en la caché) los cambios de una asignación masiva de empresa. */
  const aplicarPatchesEmpresa = useCallback(
    (patches: { row: ContractOverviewRow; patch: Partial<ContractOverviewRow> }[]) => {
      for (const { row, patch } of patches) aplicarCambio(row, patch);
    },
    [aplicarCambio],
  );
  // El TXT se arma con lo seleccionado; si no hay selección, con todo lo filtrado (comodidad).
  const fuenteTxt = seleccionados.length > 0 ? seleccionados : filtered;
  // `generarTxt` le agrega el CUIT de la empleadora y la fecha: queda `altas_30710295839_20260817.txt`.
  const nombreArchivoTxt = 'altas';

  /**
   * Asignación masiva de Empresa (Contrato/Release). Es el mismo bloque en las tres pestañas del
   * trámite impositivo: la empresa hay que cargarla igual en todas, no solo en Alta temprana.
   */
  /*
    Ya no hace falta bloquear las acciones masivas mientras se valida: la validación dejó de correr
    adentro de esta pantalla. Ahora la hace un script aparte contra el Chrome del operador, y lo que
    vuelve es un pegado de `CUIL,RNOS` — no hay corrida en curso con la que competir.
  */
  const bloqueoPorValidacion = undefined;
  const asignacionMasivaEmpresa = (
    <div className="flex flex-wrap items-center gap-2">
      {/* Solo el dato que cambia. El "tildá contratos para asignar Empresa" pasó al ⓘ de cada
          control: era una instrucción fija ocupando lugar en una barra que ya va apretada. */}
      {seleccionados.length > 0 && <span className="text-xs text-gray-500 dark:text-gray-400">{seleccionados.length} seleccionado(s)</span>}
      <AsignarEmpresaMasivo campo="contrato" filas={seleccionados.map((x) => x.row)} filasParaOpciones={filtered.map((x) => x.row)} bloqueado={bloqueoPorValidacion} onAplicado={aplicarPatchesEmpresa} />
      <AsignarEmpresaMasivo campo="release" filas={seleccionados.map((x) => x.row)} filasParaOpciones={filtered.map((x) => x.row)} bloqueado={bloqueoPorValidacion} onAplicado={aplicarPatchesEmpresa} />
      {/* El encuadre solo existe en Alta temprana: ni «Constancia de CUIT» ni «Sin CUIT» lo tienen. */}
      {hayEncuadre && (
        <AsignarEncuadreMasivo
          filas={seleccionados.map((x) => x.row)}
          cat={afipCat}
          bloqueado={bloqueoPorValidacion}
          onConvenio={(cct, filas) => {
            // El convenio no se guarda: se escribe en el filtro de cada fila tildada, que es lo que
            // deja sus selects de categoría mostrando solo las de ese CCT.
            setConvenioFila((prev) => {
              const n = { ...prev };
              for (const r of filas) n[rowKey(r)] = cct;
              return n;
            });
          }}
          onAplicado={aplicarPatchesEmpresa}
        />
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Buscador + filtro avanzado (mismo que Contratos) + vista + acciones */}
      <div className="flex flex-col lg:flex-row gap-3 lg:items-start justify-between">
        <div className="flex-1 w-full">
          <SearchAndFilters
            searchTerm={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar por usuario, proyecto o contrato..."
            radioFilters={[
              {
                label: 'Estado de usuarios',
                value: filterUserStatus,
                onChange: setFilterUserStatus,
                options: [
                  { label: 'Usuarios Activos', value: 'active' },
                  { label: 'Usuarios Inactivos', value: 'inactive' },
                  { label: 'Todos los usuarios', value: '' },
                ],
              },
              {
                label: 'Contratos',
                value: filterVigencia,
                onChange: setFilterVigencia,
                options: [
                  { label: 'Vigentes', value: 'vigente' },
                  { label: 'No Vigentes', value: 'novigente' },
                  { label: 'Todos los contratos', value: '' },
                ],
              },
            ]}
            selectFilters={[
              { label: 'Cliente', value: filterClientId, onChange: setFilterClientId, placeholder: 'Todos los clientes', options: clientOptions },
              { label: 'Proyecto', value: filterProjectId, onChange: setFilterProjectId, placeholder: 'Todos los proyectos', options: projectOptions },
              // El filtro de Empresa se hace con la columna "Empresa Contrato" de cada fila, no con un select general.
              { label: 'Rol/es', value: filterRolMobile, onChange: setFilterRolMobile, placeholder: 'Todos los roles', options: MOBILE_ROLE_OPTIONS },
              { label: 'Tipo de contrato', value: filterTipoContrato, onChange: setFilterTipoContrato, placeholder: 'Todos los tipos', options: tipoContratoOptions },
              // Solo en Alta temprana: en Constancia de CUIT la obra social no participa del trámite.
              ...(filterTipo === 'alta_temprana_afip'
                ? [{ label: 'Obra social', value: filterObraSocial, onChange: (v: string) => setFilterObraSocial(v as EstadoObraSocial | ''), placeholder: 'Todas', options: FILTROS_OBRA_SOCIAL }]
                : []),
              { label: 'Estado de contrato', value: filterEstadoContrato, onChange: setFilterEstadoContrato, placeholder: 'Todos los estados', options: estadoContratoOptions, renderOption: (opt: { label: string }) => <EstadoBadge name={opt.label} /> },
              {
                label: 'Reemplazo',
                value: filterReemplazo,
                onChange: setFilterReemplazo,
                placeholder: 'Con y sin reemplazo',
                options: [
                  { value: 'con', label: 'Con reemplazo' },
                  { value: 'sin', label: 'Sin reemplazo' },
                ],
              },
            ]}
          />
        </div>
        {isLarge && (
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setViewMode('cards')} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === 'cards' ? 'bg-blue-500 text-white border-blue-500' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} title="Vista de tarjetas">
              <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
            </button>
            <button onClick={() => setViewMode('table')} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === 'table' ? 'bg-blue-500 text-white border-blue-500' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} title="Vista de tabla">
              <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Filtro de Empresa Contrato como tabs — solo en Alta temprana de ARCA (en Constancia de CUIT
          no aplica). Es el corte que decide de qué empleadora sale el TXT: el archivo se sube
          logueado con UN CUIT, así que "Todas" sirve para mirar, no para generar (ver `generarTxt`). */}
      {filterTipo === 'alta_temprana_afip' && empresaOptions.length > 0 && (
        <div className="flex items-center border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
          <span className="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap shrink-0">Empresa Contrato | </span>
          <button onClick={() => setFilterEmpresaId('')} className={empresaTabClass(filterEmpresaId === '')}>
            Todas ({conteoPorEmpresa.total})
          </button>
          {/* Los que todavía no eligieron empleadora tienen pestaña propia: no son de ninguna empresa
              y son, justamente, el trabajo pendiente. Desde acá se los asigna en lote. */}
          <button onClick={() => setFilterEmpresaId(SIN_EMPRESA)} className={empresaTabClass(filterEmpresaId === SIN_EMPRESA)} title="Contratos que todavía no tienen elegida su empleadora">
            Sin asignar ({conteoPorEmpresa.sinAsignar})
          </button>
          {empresaOptions.map((e) => (
            <button key={e.value} onClick={() => setFilterEmpresaId(e.value)} className={empresaTabClass(filterEmpresaId === e.value)}>
              {e.label} ({conteoPorEmpresa.porId.get(e.value) || 0})
            </button>
          ))}
        </div>
      )}

      {/*
        * Barra de acciones masivas, en DOS líneas por familia de trabajo:
        *
        *   1) contadores del listado (qué falta) — solo informan;
        *   2) asignación masiva de Empresa Contrato / Empresa Release;
        *   3) el circuito ARCA: validar obras sociales,
        *      generar el TXT y subirlo a ARCA.
        *
        * Estaban todas en un mismo renglón que envolvía solo: la línea de corte caía donde entrara,
        * y los selectores de empresa terminaban pegados a «Validar obras sociales» como si fueran
        * del mismo trámite. Separadas, cada línea es una decisión.
        */}
      {filterTipo === 'alta_temprana_afip' && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-200/60 dark:border-green-800/60" title="Contratos con todos los datos ARCA cargados">
              <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
              {countCompletos} completos
            </span>
            <button onClick={() => setSoloIncompletos((v) => !v)} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border transition-colors ${soloIncompletos ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200/60 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/30'}`} title="Mostrar solo los contratos con datos ARCA faltantes">
              <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
              {countIncompletos} incompletos
            </button>
            {/*
              * Obras sociales: INFORMATIVO, no una acción.
              *
              * Había acá un botón que arrancaba la corrida sobre "todos los pendientes del filtro".
              * Se sacó: la validación es por selección —se tildan las filas y se usa «Validar obras
              * sociales»—, y tener dos botones que hacen lo mismo con conjuntos distintos hacía que
              * no se supiera cuál se estaba por mandar. Acá solo se dice cómo viene la cosa.
              */}
            {countObraSocialTotal > 0 && (
              <span
                title={`${countObraSocialValidadas} con la obra social validada contra ARCA · ${countSinConstatar} sin validar${
                  countSinEmpleadora > 0 ? ` (de esas, ${countSinEmpleadora} esperan que se les elija la empleadora)` : ''
                }. «Validar obras sociales» agarra solo lo que tildes: las que ya están validadas no se vuelven a consultar.`}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
              >
                <FontAwesomeIcon icon={faStethoscope} className="h-3 w-3" />
                Obras sociales:
                <span className="text-green-700 dark:text-green-400">{countObraSocialValidadas} validadas</span>
                <span aria-hidden className="text-gray-400">·</span>
                <span className={countSinConstatar + countSinEmpleadora > 0 ? 'text-amber-700 dark:text-amber-400' : ''}>{countSinConstatar + countSinEmpleadora} sin validar</span>
              </span>
            )}
          </div>

          {/* Línea 1 — asignación masiva de Empresa (Contrato y Release). */}
          <div className="flex flex-wrap items-center justify-end gap-3">{asignacionMasivaEmpresa}</div>

          {/* Línea 2 — el circuito ARCA, en el orden en que se hace: validar → TXT → subirlo. */}
          <div className="flex flex-wrap items-center justify-end gap-3">

            <button
              type="button"
              /* Deshabilitado SOLO si no hay a quién validar. Y ahí el hover dice por qué es cero, que
                 casi siempre es «les falta la empleadora» — un dato accionable, no una instrucción. */
              disabled={objetivoValidacion.length === 0}
              onClick={() => setLoteObrasSociales(new Set(objetivoValidacion.map((x) => rowKey(x.row))))}
              title={
                objetivoValidacion.length > 0
                  ? `Valida la obra social de los ${objetivoValidacion.length} contratos tildados que están sin validar.`
                  : seleccionados.length === 0
                    ? pendientesValidables.length > 0
                      ? `Tildá los contratos que querés validar. Hay ${pendientesValidables.length} sin validar en lo que se está mirando.`
                      : countSinEmpleadora > 0
                        ? `Los ${countSinEmpleadora} contratos sin validar no tienen Empresa Contrato asignada. La obra social se valida contra el CUIT de la empleadora.`
                        : 'No hay obras sociales pendientes de validar en lo que se está mirando.'
                    : /* Hay filas tildadas y aun así el botón está en cero: los dos motivos son
                         distintos y llevan a acciones distintas, así que se dicen por separado. */
                      objetivoBorrado.length === seleccionados.length
                      ? `Los ${seleccionados.length} contratos tildados ya tienen la obra social validada: no se vuelven a consultar en ARCA.`
                      : 'Ninguno de los contratos tildados se puede validar: sin Empresa Contrato no hay CUIT de empleadora contra el cual consultar.'
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <FontAwesomeIcon icon={faStethoscope} className="h-3.5 w-3.5" />
              {/* El número va ADENTRO de la etiqueta: «Validar obras sociales» a secas no deja saber si
                  son estas 20 o alguna otra cosa, y ese es justamente el dato que decide si apretarlo. */}
              {objetivoValidacion.length > 0 ? `Validar ${objetivoValidacion.length} obras sociales` : 'Validar obras sociales'}
            </button>
            {/*
              Quitar en masa. Aparece SOLO con filas tildadas que tengan obra social.

              No está siempre visible a propósito: es la acción destructiva de esta barra y no tiene
              por qué competir por atención con las tres que se usan todos los días. Cuando hay algo
              que quitar, aparece; el resto del tiempo no ocupa lugar ni tienta.
            */}
            {objetivoBorrado.length > 0 && (
              <button
                type="button"
                onClick={quitarObrasSocialesEnLote}
                disabled={borrandoOs}
                title={`Saca la obra social de los ${objetivoBorrado.length} contratos tildados que la tengan. Vuelven a quedar sin validar.`}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors shrink-0"
              >
                <FontAwesomeIcon icon={borrandoOs ? faSpinner : faTrash} spin={borrandoOs} className="h-3.5 w-3.5" />
                Quitar {objetivoBorrado.length} obra{objetivoBorrado.length === 1 ? '' : 's'} social{objetivoBorrado.length === 1 ? '' : 'es'}
              </button>
            )}
            {/* Mismo tono que el texto del botón al que acompaña: en azul se leía como otra acción,
                independiente de «Validar obras sociales», y no como su explicación. */}
            <button type="button" onClick={() => setValidarObrasSocialesInfoOpen(true)} title="Cómo se validan las obras sociales" className="text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white shrink-0">
              <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
            </button>

            <button
              onClick={() => generarTxt(fuenteTxt, nombreArchivoTxt)}
              disabled={fuenteTxt.every((x) => !x.result.completo)}
              title={bloqueoPorValidacion || (seleccionados.length > 0 ? 'Generar el TXT con los contratos seleccionados (solo los completos)' : 'Generar el TXT con los contratos completos del listado (o marcá algunos con el check)')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <FontAwesomeIcon icon={faFileLines} className="h-4 w-4" />
              Generar TXT Masivo (ARCA){seleccionados.length > 0 ? ` (${seleccionados.length})` : ''}
            </button>
            <button type="button" onClick={() => setFlujoTxtInfoOpen(true)} title="Qué hacer con el TXT" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 shrink-0">
              <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
            </button>
            <button
              onClick={() => window.open('https://www.arca.gob.ar', '_blank', 'noopener,noreferrer')}
              disabled={!txtGeneradoPara}
              title={bloqueoPorValidacion || (txtGeneradoPara ? 'Abrir ARCA para subir el TXT que acabás de generar' : 'Primero generá el TXT: este botón abre ARCA para subir ese archivo')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-4 w-4" />
              Cargar en ARCA
            </button>
            <button
              type="button"
              onClick={() => setCargarArcaInfoOpen(true)}
              title={txtGeneradoPara ? 'Qué hacer en ARCA' : 'Qué hacer en ARCA (se habilita al generar el TXT)'}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0"
            >
              <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Constancia de CUIT: worklist (qué falta pedirle a ARCA). */}
      {/* "Sin CUIT" no tenía barra de acciones masivas: se agrega solo la asignación de Empresa. */}
      {filterTipo === 'sin_cuit' && !loading && filtered.length > 0 && <div className="flex flex-wrap items-center justify-end gap-3">{asignacionMasivaEmpresa}</div>}

      {filterTipo === 'constancia_cuit' && !loading && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-200/60 dark:border-green-800/60" title="Constancias cargadas y todavía vigentes">
              <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
              {countConstVigentes} vigentes
            </span>
            <button onClick={() => setSoloPendientes((v) => !v)} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border transition-colors ${soloPendientes ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200/60 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/30'}`} title="Mostrar solo las constancias que faltan o ya vencieron">
              <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
              {countConstPendientes} pendientes
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {asignacionMasivaEmpresa}
            <span className="hidden sm:block h-6 w-px bg-gray-200 dark:bg-gray-700" />
            <BotonConsultarAfipBulk rows={seleccionados.map((x) => x.row)} onConsultado={() => load(true)} />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner message="Cargando contratos..." />
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 px-4 text-center">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-8 w-8 text-red-500" />
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">No se pudieron cargar los contratos</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md">{loadError}</p>
          <button type="button" onClick={() => load(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
            Reintentar
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={faFileInvoiceDollar} title="Sin contratos impositivos" description={impositivoRows.length === 0 ? 'Ningún contrato tiene hoy un estado impositivo (Alta temprana de ARCA o Constancia de CUIT). Asigná uno de esos estados en el contrato del miembro.' : 'No hay resultados con los filtros aplicados.'} />
      ) : effectiveViewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(({ row: r, result }) => {
            const cuil = cuitEsValido(r.cuit) ? fmtCuit(r.cuit) : '';
            return (
              <div key={`${r._id}-${r.contractIndex}`} className={`bg-white dark:bg-gray-800 rounded-xl border p-4 flex flex-col gap-3 ${selected.has(rowKey(r)) ? 'border-emerald-400 dark:border-emerald-700' : 'border-gray-200 dark:border-gray-700'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <input type="checkbox" checked={selected.has(rowKey(r))} disabled={!esSeleccionable(r, result)} onChange={() => toggleSel(rowKey(r))} title={tituloCheck(r)} className={`rounded border-gray-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 ${omitidaEnValidacion(r) ? 'text-amber-500 focus:ring-amber-500' : 'text-emerald-600 focus:ring-emerald-500'}`} />
                    <FontAwesomeIcon icon={faUser} className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate inline-flex items-center gap-1.5 text-gray-900 dark:text-gray-100">
                        <span className="truncate">{r.userName}</span>
                        <NombreArca estado={estadoNombreArca({ cuit: r.cuit, sinCuit: r.sinCuit, validado: r.userNombreValidadoArca })} conInfo />
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{r.userEmail}</p>
                      {fmtCuit(r.cuit) && <p className="text-[10px] text-gray-400 font-mono truncate">CUIT {fmtCuit(r.cuit)}</p>}
                    </div>
                  </div>
                  {r.nombre_estado_empleado && <EstadoBadge name={r.nombre_estado_empleado} className="shrink-0 text-[10px]" />}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-gray-100 dark:border-gray-700/60">
                  <div className="min-w-0">
                    <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest">Cliente</span>
                    <span className="text-gray-700 dark:text-gray-300 truncate block">{r.clientName || '—'}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest">Proyecto</span>
                    <span className="text-gray-700 dark:text-gray-300 truncate block">{r.projectName || '—'}</span>
                  </div>
                  <div className="min-w-0 col-span-2">
                    <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest">Contrato</span>
                    <span className="text-gray-700 dark:text-gray-300 truncate block">{r.nombre_contrato || '—'}</span>
                  </div>
                </div>

                {r._tipo &&
                  (() => {
                    // Mismo criterio que TramiteImpositivoBadge: si el estado acepta gente sin CUIT y
                    // esta persona no lo tiene, el badge dice "Sin CUIT" (su trámite queda pendiente).
                    const sinCuitBadge = !!r._aceptaSinCuit && noPoseeCuit(r.cuit, r.sinCuit);
                    const cls = sinCuitBadge
                      ? 'bg-violet-100 text-violet-800 border-violet-500 border-dashed dark:bg-violet-500/25 dark:text-violet-200 dark:border-violet-400'
                      : r._tipo === 'alta_temprana_afip'
                        ? 'bg-purple-600 text-white border-purple-600 dark:bg-purple-500 dark:border-purple-500'
                        : 'bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-700';
                    return (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap w-fit ${cls}`}>
                        <FontAwesomeIcon icon={faFileInvoiceDollar} className="h-2.5 w-2.5" />
                        {sinCuitBadge ? 'Sin CUIT' : TIPO_LABEL[r._tipo]}
                      </span>
                    );
                  })()}

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-700/60">
                  {layoutConstancia && (
                    <>
                      {filterTipo !== 'sin_cuit' && (
                        <button onClick={() => setConstancia({ row: r, cuil })} className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors ${cuil ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-100' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-100'}`}>
                          <FontAwesomeIcon icon={cuil ? faCheck : faTriangleExclamation} className="h-2.5 w-2.5" />
                          CUIT/CUIL: {cuil ? 'OK' : 'Falta 1'}
                        </button>
                      )}
                      <ConstanciaBadge row={r} />
                      <BotonValidarCuit row={r} onConsultado={() => load(true)} compacto />
                    </>
                  )}
                  {filterTipo === 'alta_temprana_afip' && (
                    <BadgeArca result={result} onClick={() => setDetalleRef({ _id: r._id, contractIndex: r.contractIndex })} prefijo="ARCA: " />
                  )}
                  <span className="ml-auto">
                    <ContractActionsButtons record={r} onDeleted={() => load(true)} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar max-h-[640px]">
            <table className="w-full text-left border-separate border-spacing-0 min-w-[1650px]">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 shadow-sm">
                {/*
                  LA FILA QUE NOMBRA AL GRUPO. Seis columnas que son una sola cosa.

                  Empresa Contrato, Convenio, Categoría, Obra Social, Sucursal y Actividad no son seis
                  datos sueltos: son los que la EMPLEADORA declaró ante ARCA y los que se eligen dentro
                  de eso. La banda azul ya los pintaba juntos, pero un color no dice de qué son — con
                  quince columnas al lado, había que deducirlo.

                  `COLUMNAS_ANTES_DEL_GRUPO` es el offset hasta ahí. Va como constante y no como número
                  suelto porque si mañana se agrega una columna a la izquierda, el rótulo se corre y
                  queda titulando las columnas equivocadas — un error que se ve pero no se entiende.

                  Las de la derecha no se completan: una fila con menos celdas es válida, y así no hay
                  un segundo número que mantener sincronizado.
                */}
                {hayEncuadre && (
                  <tr>
                    <th colSpan={COLUMNAS_ANTES_DEL_GRUPO} className="p-0 bg-gray-50 dark:bg-gray-900" />
                    <th colSpan={6} className={`px-4 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-widest text-blue-700/80 dark:text-blue-400/80 text-center ${GRUPO_ENCUADRE}`}>
                      Datos que declara la empleadora ante ARCA
                    </th>
                  </tr>
                )}
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="sticky left-0 z-[15] px-4 py-3 w-12 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
                    <input type="checkbox" checked={allSel} onChange={toggleAll} disabled={selectableFiltered.length === 0} title="Seleccionar todos los del listado" className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" />
                  </th>
                  {/*
                    * La columna fija, la que queda a la vista mientras se scrollea a lo ancho:
                    *
                    *  - en Alta temprana, «Datos ARCA»: es el semáforo de la fila —qué falta para
                    *    que esta persona entre en el TXT— y es lo que se está mirando todo el
                    *    tiempo. Acá «Acciones» ocupaba ese lugar con un «Generar TXT» por fila que
                    *    dependía, justamente, de lo que este badge dice (y que se hace en masa);
                    *  - en Constancia de CUIT y Sin CUIT se mantiene «Acciones», porque ahí sí
                    *    lleva la única forma de hacer el trámite de esa fila.
                    */}
                  {filterTipo === 'alta_temprana_afip' ? (
                    <th className="sticky left-12 z-[15] px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900 border-r-2 border-gray-300 dark:border-gray-600 shadow-[4px_0_6px_-4px_rgba(0,0,0,0.25)]">
                      <span className="inline-flex items-center gap-1.5">
                        Datos ARCA
                        <button type="button" onClick={() => setDatosAfipInfoOpen(true)} title="Por qué a veces no se puede generar el TXT" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 normal-case tracking-normal font-normal shrink-0">
                          <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
                        </button>
                      </span>
                    </th>
                  ) : (
                    <th className="sticky left-12 z-[15] px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900 border-r-2 border-gray-300 dark:border-gray-600 shadow-[4px_0_6px_-4px_rgba(0,0,0,0.25)]">Acciones</th>
                  )}
                  {/* Acá vivía «Verificar (Opc)», una columna entera para un botón que copiaba el CUIT
                      y abría el portal de ARCA a mano. Se sacó: al lado de «Validar», que consulta el
                      Padrón sola y deja el resultado archivado, un segundo botón que manda a hacer lo
                      mismo a mano solo hacía dudar de cuál era el que valía. La columna sobrevive solo
                      para «Sin CUIT», donde el contenido es otro. */}
                  {filterTipo === 'sin_cuit' && <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Validación</th>}
                  {filterTipo === 'sin_cuit' && <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Documentación</th>}
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Alta / Baja</th>
                  {layoutConstancia && (
                    <>
                      {filterTipo !== 'sin_cuit' && (
                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            Datos CUIT/CUIL
                            <button type="button" onClick={() => setDatosCuitInfoOpen(true)} title="Por qué a veces no se puede validar" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 normal-case tracking-normal font-normal shrink-0">
                              <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
                            </button>
                          </span>
                        </th>
                      )}
                      {filterTipo !== 'sin_cuit' && (
                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap" title="Estado en el Padrón de ARCA">
                          ARCA
                        </th>
                      )}
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap" title="Si la constancia quedó archivada en Dropbox">
                        DROPBOX
                      </th>
                    </>
                  )}
                  {filterTipo !== 'sin_cuit' && <ContractDocsHeaders showContrato={false} showRelease={false} altaLabel={filterTipo === 'alta_temprana_afip' ? 'Alta ARCA' : 'Alta Servicios'} />}
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Usuario</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">CUIT</th>
                  {/* El fondo y el borde de «grupo encuadre» solo cuando hay grupo: sin las tres
                      columnas de al lado, abrir un grupo en Empresa Contrato lo dejaría sin cerrar. */}
                  <th className={`px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap ${hayEncuadre ? GRUPO_ENCUADRE_INICIO : ''}`}>
                    <span className="inline-flex items-center gap-1.5">
                      Empresa Contrato
                      {filterTipo === 'alta_temprana_afip' && (
                        <>
                          <span className="text-red-500">*</span>
                          <button type="button" onClick={() => setEmpresaContratoInfoOpen(true)} title="Por qué es obligatoria" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 normal-case tracking-normal font-normal shrink-0">
                            <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
                          </button>
                        </>
                      )}
                      {hayEncuadre && <FlechaEncuadre />}
                    </span>
                  </th>
                  {/* Entre Empresa Contrato y Obra Social, que es el orden en que se resuelven: la
                      obra social por defecto sale del convenio, y el convenio de la categoría. */}
                  {hayEncuadre && (
                    <>
                      <th className={`px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap ${GRUPO_ENCUADRE}`}>
                        Convenio
                        <FlechaEncuadre />
                      </th>
                      <th className={`px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap ${GRUPO_ENCUADRE}`}>
                        Categoría
                        <FlechaEncuadre />
                      </th>
                    </>
                  )}
                  {/* Pegada a Empresa Contrato: la obra social se valida contra el CUIT de la
                      empleadora, así que las dos columnas se leen juntas —sin empresa, esta no se
                      puede resolver—. */}
                  {hayEncuadre && (
                    <th className={`px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap ${GRUPO_ENCUADRE}`} title="Código RNOS (pos. 40-45). Ordena por estado: primero lo que hay que resolver.">
                      <button type="button" onClick={() => setOrdenObraSocial((v) => !v)} className={`uppercase tracking-wider font-bold inline-flex items-center gap-1.5 hover:text-gray-700 dark:hover:text-gray-300 ${ordenObraSocial ? 'text-blue-600 dark:text-blue-400' : ''}`}>
                        Obra Social
                        <FontAwesomeIcon icon={faSort} className="h-2.5 w-2.5" />
                      </button>
                    </th>
                  )}
                  {/*
                    SUCURSAL Y ACTIVIDAD, ADENTRO DE LA BANDA. Son datos del alta igual que los otros.

                    Quedaron afuera al agregarlas y eso las hacía leer como algo aparte, cuando salen
                    del mismo lugar: los domicilios de explotación son los que la EMPLEADORA declaró
                    ante ARCA, igual que sus convenios y sus obras sociales registradas. La banda es
                    justamente «todo lo que cuelga de la empleadora», así que el cierre pasa a ser la
                    Actividad y ya no la Obra Social.
                  */}
                  {hayEncuadre && (
                    <>
                      <th className={`px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap ${GRUPO_ENCUADRE}`} title="Domicilio de explotación declarado por la empleadora (pos. 74-78)">
                        Sucursal
                        <FlechaEncuadre />
                      </th>
                      <th className={`px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap ${GRUPO_ENCUADRE_FIN}`} title="Actividad declarada en ese domicilio (pos. 79-84). Con una sola, se hereda.">
                        Actividad
                      </th>
                    </>
                  )}
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Empresa Release</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Cliente</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Proyecto</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Contrato</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Estado</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Estado Impositivo</th>
                  <ContractActionsHeader />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map(({ row: r, result }) => (
                  <tr key={`${r._id}-${r.contractIndex}`} className={`group hover:bg-gray-50 dark:hover:bg-gray-900/20 ${selected.has(rowKey(r)) ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''}`}>
                    <td className={`sticky left-0 z-[5] px-4 py-3 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-[#1c2634] border-r border-gray-200 dark:border-gray-700 ${selected.has(rowKey(r)) ? '!bg-[#f6fefa] dark:!bg-[#1d2d37]' : ''}`}>
                      <input type="checkbox" checked={selected.has(rowKey(r))} disabled={!esSeleccionable(r, result)} onChange={() => toggleSel(rowKey(r))} title={tituloCheck(r)} className={`rounded border-gray-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${omitidaEnValidacion(r) ? 'text-amber-500 focus:ring-amber-500' : 'text-emerald-600 focus:ring-emerald-500'}`} />
                    </td>
                    <td className={`sticky left-12 z-[5] px-4 py-3 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-[#1c2634] border-r-2 border-gray-300 dark:border-gray-600 shadow-[4px_0_6px_-4px_rgba(0,0,0,0.25)] ${selected.has(rowKey(r)) ? '!bg-[#f6fefa] dark:!bg-[#1d2d37]' : ''}`}>
                      {filterTipo === 'alta_temprana_afip' ? (
                        <BadgeArca result={result} onClick={() => setDetalleRef({ _id: r._id, contractIndex: r.contractIndex })} />
                      ) : noPoseeCuit(r.cuit, r.sinCuit) ? (
                        // Sin CUIT los trámites de ARCA no aplican: la salida es generar los documentos.
                        <BotonHabilitarFirma row={r} tramite={r._tipo || 'constancia_cuit'} validado={!!r.sinCuitValidacion?.validado} onHabilitado={() => load(true)} />
                      ) : (
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <BotonValidarCuit row={r} onConsultado={() => load(true)} compacto />
                        </div>
                      )}
                    </td>
                    {filterTipo === 'sin_cuit' && (
                      <td className="px-4 py-3">
                        <CeldaValidacionSinCuit row={r} onAbrir={() => setValidacionRow(r)} onCambio={(v) => aplicarValidacionSinCuit(r, v)} />
                      </td>
                    )}
                    {filterTipo === 'sin_cuit' && (
                      <td className="px-4 py-3">
                        <CeldaDocumentacionSinCuit row={r} onAbrir={() => setValidacionRow(r)} onCambio={(v) => aplicarValidacionSinCuit(r, v)} />
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-500 whitespace-nowrap">
                      {(() => {
                        const vigente = isContractVigente(r.fecha_alta_contrato, r.fecha_baja_contrato);
                        return (
                          <div className="flex flex-col gap-1">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold w-fit ${vigente ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>{vigente ? 'VIGENTE' : 'NO VIGENTE'}</span>
                            <div className="flex flex-col gap-0.5 text-xs">
                              <span>
                                <span className="text-gray-400">Alta:</span> {formatDate(r.fecha_alta_contrato)}
                              </span>
                              <span>
                                <span className="text-gray-400">Baja:</span> {r.fecha_baja_contrato ? formatDate(r.fecha_baja_contrato) : '—'}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    {layoutConstancia && (
                      <>
                        {filterTipo !== 'sin_cuit' && (
                          <td className="px-4 py-3">
                            {(() => {
                              const cuil = cuitEsValido(r.cuit) ? fmtCuit(r.cuit) : '';
                              return (
                                <button onClick={() => setConstancia({ row: r, cuil })} title="Ver los datos necesarios para buscar la Constancia de CUIT/CUIL en ARCA" className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border whitespace-nowrap transition-colors ${cuil ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-100' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-100'}`}>
                                  <FontAwesomeIcon icon={cuil ? faCheck : faTriangleExclamation} className="h-2.5 w-2.5" />
                                  {cuil ? 'Completo' : 'Falta 1'}
                                </button>
                              );
                            })()}
                          </td>
                        )}
                        {/* Estado en ARCA y archivado en Dropbox, por separado (acciones — Validar/ARCA — viven en la columna sticky "Acciones"). */}
                        {filterTipo !== 'sin_cuit' && (
                          <td className="px-4 py-3">
                            <ArcaBadge row={r} />
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <DropboxBadge row={r} />
                        </td>
                      </>
                    )}
                    {filterTipo !== 'sin_cuit' && <ContractDocsColumns record={r} contratoFrames={contratoFrames} allEstados={allEstados} activeReleases={activeReleases} onDownloadContract={handleDownloadContract} onDownloadRelease={handleDownloadRelease} onUploadAlta={handleUploadAlta} showContrato={false} showRelease={false} hideAltaLabel onConstanciaEliminada={() => load(true)} />}
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold whitespace-nowrap inline-flex items-center gap-1.5 text-gray-900 dark:text-white">
                        {r.userName}
                        <NombreArca estado={estadoNombreArca({ cuit: r.cuit, sinCuit: r.sinCuit, validado: r.userNombreValidadoArca })} conInfo />
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{r.userEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap font-mono">{cuitDisplay(r.cuit, r.sinCuit)}</td>
                    <td className={`px-4 py-3 ${hayEncuadre ? GRUPO_ENCUADRE_INICIO : ''}`} onClick={(e) => e.stopPropagation()}>
                      <EmpresaSelectCell record={r} campo="contrato" requerido={filterTipo === 'alta_temprana_afip'} onGuardado={(patch) => aplicarCambio(r, patch)} />
                    </td>
                    {hayEncuadre && (
                      <>
                        <td className={`px-4 py-3 ${GRUPO_ENCUADRE}`} onClick={(e) => e.stopPropagation()}>
                          <ConvenioSelectCell
                            record={r}
                            valores={resolveAfipValues(r, afipCat)}
                            cat={afipCat}
                            convenio={convenioFila[rowKey(r)] || ''}
                            onConvenio={async (cct) => {
                              setConvenioFila((prev) => ({ ...prev, [rowKey(r)]: cct }));
                              // Cambiar de convenio limpia la categoría de otro: misma regla que el
                              // modal. Sin eso queda convenio A con categoría de B, que ARCA rechaza
                              // aunque la fila se vea completa.
                              const v = resolveAfipValues(r, afipCat);
                              const actual = afipCat.categorias.find((c: any) => String(c.data?.codigoAfip ?? '') === v.categoriaProf);
                              if (cct && v.categoriaProf && String(actual?.data?.convenio || '').trim() !== cct) {
                                try {
                                  const res = await projectsAPI.updateCategoriaSat(r.projectId, r.userId, r.contractIndex, null);
                                  aplicarCambio(r, { categoria_sat_id: res.categoria_sat_id, nombre_categoria_sat: res.nombre_categoria_sat, sueldo_neto: res.sueldo_neto, sueldo_bruto: res.sueldo_bruto } as any);
                                } catch (e: any) {
                                  sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo limpiar la categoría.');
                                }
                              }
                            }}
                          />
                        </td>
                        <td className={`px-4 py-3 ${GRUPO_ENCUADRE}`} onClick={(e) => e.stopPropagation()}>
                          <CategoriaSelectCell record={r} valores={resolveAfipValues(r, afipCat)} cat={afipCat} convenio={convenioFila[rowKey(r)] || ''} onGuardado={(patch) => aplicarCambio(r, patch)} />
                        </td>
                      </>
                    )}
                    {hayEncuadre && (
                      <td className={`px-4 py-3 ${GRUPO_ENCUADRE}`} onClick={(e) => e.stopPropagation()}>
                        <ObraSocialCell
                          record={r}
                          valores={resolveAfipValues(r, afipCat)}
                          onAbrir={() => setDetalleRef({ _id: r._id, contractIndex: r.contractIndex })}
                          onValidar={() => setLoteObrasSociales(new Set([rowKey(r)]))}
                          onSinEmpresa={() => setObraSocialSinEmpresa(r)}
                          onQuitado={(patch) => aplicarCambio(r, patch)}
                        />
                      </td>
                    )}
                    {/* Mismo orden que los encabezados: Sucursal y después Actividad, que depende de ella. */}
                    {hayEncuadre && (
                      <>
                        <td className={`px-4 py-3 ${GRUPO_ENCUADRE}`} onClick={(e) => e.stopPropagation()}>
                          <SucursalSelectCell record={r} valores={resolveAfipValues(r, afipCat)} onGuardado={(patch) => aplicarCambio(r, patch)} />
                        </td>
                        <td className={`px-4 py-3 ${GRUPO_ENCUADRE_FIN}`} onClick={(e) => e.stopPropagation()}>
                          <ActividadSelectCell record={r} valores={resolveAfipValues(r, afipCat)} onGuardado={(patch) => aplicarCambio(r, patch)} />
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <EmpresaSelectCell record={r} campo="release" requerido={false} onGuardado={(patch) => aplicarCambio(r, patch)} />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.clientName || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.projectName || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.nombre_contrato || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <EstadoBadge name={r._estadoName} />
                        {r._tipo ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap ${r._tipo === 'alta_temprana_afip' ? 'bg-purple-600 text-white border-purple-600 dark:bg-purple-500 dark:border-purple-500' : 'bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-700'}`}>
                            <FontAwesomeIcon icon={faFileInvoiceDollar} className="h-2.5 w-2.5" />
                            {TIPO_LABEL[r._tipo]}
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-400 italic">Sin trámite definido</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <EstadoImpositivoCell record={r} contratoFrames={contratoFrames} allEstados={allEstados} />
                    </td>
                    <ContractActionsCell record={r} onDeleted={() => load(true)} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detalle && (
        <Modal
          isOpen={!!detalle}
          onClose={() => setDetalleRef(null)}
          title={`Datos ARCA — ${detalle.row.userName}`}
          subtitle={`${detalle.row.projectName} · ${detalle.row.nombre_contrato}`}
          size="lg"
          zIndex={70}
          footer={
            <div className="flex items-center justify-between gap-4 w-full">
              {/*
               * El avance vive acá, no arriba: el pie es lo único que queda fijo mientras se scrollea
               * el formulario, y la barra dice exactamente cuánto falta para que el botón de al lado
               * se habilite. Arriba se comía dos renglones y empujaba los campos fuera de la vista.
               */}
              <ProgresoArca result={detalle.result} />
              {/*
                POR QUÉ ESTÁ GRIS, AL ALCANCE DEL PUNTERO.

                La razón ya está a la vista en el pie —el título dice qué pasa y el segundo renglón
                nombra dónde falta—, pero un botón deshabilitado se mira ANTES que el texto de al lado.
                El `title` contesta ahí mismo, con los campos concretos, y no reemplaza a lo escrito:
                un tooltip solo no serviría para quien navega con teclado ni en una tablet.
              */}
              <button
                onClick={() => generarTxt([detalle], `alta_${detalle.row.userName.replace(/\s+/g, '_')}`)}
                disabled={!detalle.result.completo}
                title={detalle.result.completo ? 'Genera el TXT de alta masiva de esta persona' : `Faltan datos para generar el TXT: ${detalle.result.checks.filter((c) => !esResuelto(c)).map((c) => c.label).join(', ')}.`}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                <FontAwesomeIcon icon={faFileLines} />
                Descargar TXT de esta persona
              </button>
            </div>
          }
        >
          <DatosArcaDetalle row={detalle.row} result={detalle.result} cat={afipCat} empresas={companies} onGuardado={(patch) => aplicarCambio(detalle.row, patch)} onCambioNivel={() => load(true)} onValidarObraSocial={() => setLoteObrasSociales(new Set([`${detalle.row._id}-${detalle.row.contractIndex}`]))} />
        </Modal>
      )}

      {loteObrasSociales && (
        <Modal
          isOpen={!!loteObrasSociales}
          onClose={() => setLoteObrasSociales(null)}
          title={filasConstatacion.length === 1 ? `Validar obra social — ${filasConstatacion[0].row.userName}` : `Validar obras sociales (${filasConstatacion.length})`}
          subtitle={empresaDelLote ? empresaOptions.find((e) => e.value === empresaDelLote)?.label || '' : 'Los contratos elegidos son de más de una empleadora (o no tienen una asignada)'}
          size="95"
          zIndex={70}
        >
          <PantallaValidarObrasSociales
            filas={filasConstatacion}
            empleadora={empresaOptions.find((e) => e.value === empresaDelLote)?.label}
            // El CUIT sale del catálogo de empresas y es el mismo dato con el que ARCA identifica a
            // la empleadora en su selector: con eso el Asistente la elige solo.
            empleadoraCuit={companies.find((c) => c._id === empresaDelLote)?.cuit || ''}
            empresaId={empresaDelLote || undefined}
            onRefrescar={() => load(true)}
            onLoteAplicado={() => load(true)}
          />
        </Modal>
      )}

      {constancia && (
        <Modal
          isOpen={!!constancia}
          onClose={() => setConstancia(null)}
          title={`Constancia de CUIT/CUIL — ${constancia.row.userName}`}
          subtitle={`${constancia.row.projectName} · ${constancia.row.nombre_contrato}`}
          size="sm"
          zIndex={70}
          footer={
            <div className="flex items-center justify-between gap-3 w-full">
              <ConstanciaBadge row={constancia.row} />
              <BotonArca cuit={constancia.row.cuit} />
            </div>
          }
        >
          {(() => {
            // Tres estados distintos, no dos: puede faltar, puede estar cargado pero no ser un CUIT
            // real (ej. 00000000000), o estar bien. El del medio antes se mostraba como "Listo".
            const cargado = fmtCuit(constancia.row.cuit);
            const valido = cuitEsValido(constancia.row.cuit);
            const cfg = valido
              ? { clase: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400', icono: faCheck, texto: 'Listo para buscar la constancia en ARCA.' }
              : cargado
                ? { clase: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400', icono: faTriangleExclamation, texto: 'El CUIT/CUIL cargado no es válido: hay que corregirlo.' }
                : { clase: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400', icono: faTriangleExclamation, texto: 'Falta 1 dato para buscar la constancia.' };
            return (
              <div className="space-y-3">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${cfg.clase}`}>
                  <FontAwesomeIcon icon={cfg.icono} />
                  {cfg.texto}
                </div>
                <ul className="divide-y divide-gray-100 dark:divide-gray-700/60 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <li className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 min-w-0">
                      <FontAwesomeIcon icon={valido ? faCheck : faXmark} className={`h-3.5 w-3.5 shrink-0 ${valido ? 'text-green-500' : 'text-red-500'}`} />
                      <span className="truncate">CUIT / CUIL</span>
                    </span>
                    {cargado ? (
                      <span className={`text-sm font-mono shrink-0 ${valido ? 'text-gray-600 dark:text-gray-300' : 'text-red-600 dark:text-red-400 line-through'}`}>{cargado}</span>
                    ) : (
                      <span className="text-[11px] font-semibold text-red-600 dark:text-red-400 shrink-0">Falta</span>
                    )}
                  </li>
                </ul>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  {valido || !cargado ? (
                    <>
                      Para obtener la <strong>Constancia de Inscripción / CUIT</strong> en ARCA se ingresa el <strong>CUIT/CUIL</strong> de la persona (es el único dato requerido). Si falta, cargalo en los
                      datos personales del usuario.
                    </>
                  ) : (
                    <>
                      Ese número tiene 11 dígitos pero no es un CUIT/CUIL real: no pasa el dígito verificador. Consultarlo en ARCA solo devuelve error. Corregilo en los datos personales de la persona.
                    </>
                  )}
                </p>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* Documentación de respaldo del flujo "Sin CUIT" (trámite de ARCA pendiente). */}
      {validacionRow && (
        <SinCuitValidacionModal
          row={validacionRow}
          isOpen={!!validacionRow}
          onClose={() => setValidacionRow(null)}
          onChange={(v) => aplicarValidacionSinCuit(validacionRow, v)}
        />
      )}

      {cargarArcaInfoOpen && (
        <Modal isOpen={cargarArcaInfoOpen} onClose={() => setCargarArcaInfoOpen(false)} title="Cargar en ARCA" size="sm" zIndex={80}>
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-200">Este botón redirige a la página de ARCA. Una vez ahí:</p>
            <ol className="text-sm text-gray-600 dark:text-gray-300 space-y-2 list-decimal list-inside">
              <li>
                Iniciar sesión con Clave Fiscal en <span className="font-mono text-xs">https://www.arca.gob.ar</span> (dominio oficial actual — es el portal <span className="font-mono text-xs">afip.gob.ar</span> renombrado; si ya tenés abierto <span className="font-mono text-xs">portalcf.cloud.afip.gob.ar/portal/app/</span>, es el mismo portal de acceso).
              </li>
              <li>
                Una vez dentro, abrir el servicio <strong>"Simplificación Registral - Empleadores"</strong>.
              </li>
              <li>
                Ir a <strong>Relaciones Laborales → Carga masiva</strong>, donde se sube el archivo TXT con el formato de campos requerido.
              </li>
            </ol>
          </div>
        </Modal>
      )}

      {obraSocialSinEmpresa && (
        <Modal isOpen={!!obraSocialSinEmpresa} onClose={() => setObraSocialSinEmpresa(null)} title="Todavía no se puede validar la obra social" size="sm" zIndex={80}>
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-200">
              <strong>{obraSocialSinEmpresa.userName}</strong> no tiene asignada una <strong>Empresa Contrato</strong>, y la obra social se consulta en ARCA con el CUIL de la persona <strong>contra el CUIT de la empleadora</strong>: sin empresa no hay contra qué validar.
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Elegí la empresa en la columna <strong>Empresa Contrato</strong> de esta misma fila —o en masa, tildando filas y usando el selector «Empresa Contrato…» + <strong>Aplicar</strong>—. Apenas la tenga, este ⓘ se convierte en el botón <strong>Validar</strong>.
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Hasta validarse, la obra social queda vacía y el contrato no entra en el TXT de Alta temprana.</p>
          </div>
        </Modal>
      )}

      {validarObrasSocialesInfoOpen && (
        <Modal isOpen={validarObrasSocialesInfoOpen} onClose={() => setValidarObrasSocialesInfoOpen(false)} title="Validar obras sociales" size="sm" zIndex={80}>
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-200">
              La obra social no se carga a mano: la devuelve ARCA. La consulta se hace con el CUIL de la persona <strong>contra el CUIT de la empleadora</strong> — por eso el contrato necesita tener asignada una <strong>Empresa Contrato</strong> antes de poder validarse.
            </p>
            <ol className="text-sm text-gray-600 dark:text-gray-300 space-y-2 list-decimal list-inside">
              <li>
                Asigná la <strong>Empresa Contrato</strong>: en la columna de cada fila, o en masa tildando filas y usando el selector «Empresa Contrato…» + <strong>Aplicar</strong>.
              </li>
              <li>
                Tildá los contratos y usá <strong>Validar obras sociales</strong>. El número del botón cuenta solo los que ya tienen empresa: los tildados sin empresa se omiten.
              </li>
              <li>
                Se abre el panel de validación: copiás los CUIL y los corrés contra ARCA. Podés hacerlo a mano —cargando uno por uno en <strong>Registrar Nuevas Altas</strong>— o con el script{" "}
                <code className="font-mono text-[12.5px]">npm run validar-obras-sociales</code>, que se conecta a tu propio Chrome ya logueado y los procesa de a 10. Los pasos están en{" "}
                <a href="/arca/guia-obras-sociales" target="_blank" rel="noreferrer" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                  ARCA → Validar obras sociales
                </a>
                .
              </li>
            </ol>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {/* Se dice explícitamente porque es la pregunta que aparece sola: "¿entonces el script
                  puede dar de alta gente?". No: el único botón que aprieta es el del selector. */}
              El script <strong>nunca registra un alta</strong>: en la pantalla de altas aprieta únicamente «Agregar» y «Reiniciar». El «Aceptar», que es el que registra ante el organismo, no lo toca
              nunca. Las altas salen del TXT, no de ahí.
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              En la columna <strong>Obra Social</strong> —al lado de Empresa Contrato—, las filas que todavía no tienen empresa muestran un <span className="text-amber-600 dark:text-amber-400 font-semibold">ⓘ ámbar</span> en vez del botón «Validar»: tocalo y explica qué falta. Con la empresa asignada, ese ⓘ pasa a ser el botón <strong>Validar</strong>. Lo ya validado se puede quitar con el <strong>tacho</strong> de la misma celda.
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Una vez validada, la obra social queda fija (no editable) y el contrato puede entrar en el TXT.</p>
          </div>
        </Modal>
      )}

      {flujoTxtInfoOpen && (
        <Modal isOpen={flujoTxtInfoOpen} onClose={() => setFlujoTxtInfoOpen(false)} title="Qué hacer con el TXT" size="sm" zIndex={80}>
          <div className="space-y-3">
            <ol className="text-sm text-gray-600 dark:text-gray-300 space-y-2 list-decimal list-inside">
              <li>
                <strong>Generar TXT Masivo (ARCA)</strong>: descarga el archivo TXT con las altas completas, listo para importar.
              </li>
              <li>
                <strong>Cargar en ARCA</strong>: abre el portal de ARCA para importar ese TXT y generar las altas.
              </li>
              <li>
                Cuando ARCA sincronice las altas, se guardarán automáticamente en la carpeta de Dropbox <span className="font-mono text-xs">WEPRODU/ARCA/Alta temprana de Arca</span> y los contratos van a aparecer en la bandeja <strong>Firma Digital</strong>.
              </li>
            </ol>
          </div>
        </Modal>
      )}

      {datosAfipInfoOpen && (
        <Modal isOpen={datosAfipInfoOpen} onClose={() => setDatosAfipInfoOpen(false)} title="Datos ARCA" size="sm" zIndex={80}>
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-200">El TXT de Alta temprana necesita un conjunto fijo de códigos por persona. Si a alguno le "Faltan N", significa que esos códigos no se pudieron armar todavía — y por eso ese contrato queda afuera del TXT hasta completarlos.</p>
            <p className="text-sm text-gray-600 dark:text-gray-300">La N cuenta CONFIGURACIONES, no campos: un tipo de contrato sin códigos es una sola cosa que ir a cargar, aunque deje tres campos vacíos.</p>
            <p className="text-sm text-gray-600 dark:text-gray-300">Los códigos salen de:</p>
            <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1.5 list-disc list-inside">
              <li>
                <strong>Tipo de Contrato</strong>: modalidad, tipo de servicio y modalidad de liquidación.
              </li>
              <li>
                <strong>Categoría</strong>: categoría profesional y sueldo bruto — y de su convenio sale la obra social.
              </li>
              <li>
                <strong>Contrato</strong>: código RNOS de la obra social, constatado en el padrón de la SSS. Se carga desde este mismo detalle.
              </li>
              <li>
                <strong>Domicilios de Explotación de la empresa</strong>: código de sucursal y actividad. No sale de la Sede: son cosas distintas.
              </li>
              <li>
                <strong>Datos personales</strong>: CUIL.
              </li>
            </ul>
            {/* Ni la empresa ni la sucursal son configuración: son opciones que ya están en
                pantalla. Contarlas en el badge duplicaba el pedido y mandaba a "configurar" algo
                que solo hay que elegir. */}
            <p className="text-sm text-gray-600 dark:text-gray-300">
              <strong>La Empresa del Contrato y la Sucursal no entran en esa cuenta</strong>: no hay nada que configurar, solo elegirlas — la empresa en su columna de la grilla, y la sucursal con su actividad acá mismo, en este detalle. Frenan el TXT igual, y el detalle las muestra aparte.
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Tocá el badge de una fila para ver exactamente qué falta.</p>
          </div>
        </Modal>
      )}

      {datosCuitInfoOpen && (
        <Modal isOpen={datosCuitInfoOpen} onClose={() => setDatosCuitInfoOpen(false)} title="Datos CUIT/CUIL" size="sm" zIndex={80}>
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-200">Es el CUIT/CUIL de la persona, cargado en sus datos personales — el único dato que hace falta para buscar la Constancia de Inscripción en ARCA.</p>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Si dice <strong>"Falta 1"</strong> es porque ese usuario todavía no tiene el CUIT/CUIL cargado. Hasta que se cargue, esa fila no se puede tildar y los botones <strong>"Validar"</strong> y <strong>"Validar ARCA Masivo"</strong> quedan deshabilitados para esa persona (no hay CUIT que consultar en el Padrón de ARCA).
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Cargá el CUIT/CUIL en los datos personales del usuario para poder validarlo.</p>
          </div>
        </Modal>
      )}

      {empresaContratoInfoOpen && (
        <Modal isOpen={empresaContratoInfoOpen} onClose={() => setEmpresaContratoInfoOpen(false)} title="Empresa Contrato" size="sm" zIndex={80}>
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-200">
              Es obligatoria porque un mismo TXT se sube a la sesión de ARCA de <strong>una sola empresa</strong>: sin saber a cuál corresponde cada contrato, no se puede armar el archivo (por eso las filas sin Empresa Contrato quedan afuera del TXT hasta que se elija una).
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              La Alta temprana de ARCA se genera con la <strong>misma empresa</strong> que la elegida acá como Empresa del Contrato — no hace falta volver a elegirla en otro lado.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
};

/** Mismo dropdown que `DownloadMenu` (ContractCard.tsx) pero para la acción "Generar" (paso 1): no
 *  descarga nada, solo dispara `onGenerar(empresaId)` — el PDF queda guardado en el server. */
/**
 * Deshace la elección de empresa de un contrato: la borra y la celda vuelve a mostrar "Elegir
 * empresa...". Solo tiene sentido antes de generar el PDF; una vez generado, el documento ya salió
 * con esa empresa y lo que corresponde es eliminarlo.
 */
const QuitarEmpresaBtn: React.FC<{ record: ContractOverviewRow; campo: 'contrato' | 'release'; onQuitado: (patch?: Partial<ContractOverviewRow>) => void }> = ({ record, campo, onQuitado }) => {
  const [quitando, setQuitando] = useState(false);

  const quitar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setQuitando(true);
    try {
      if (campo === 'contrato') await projectsAPI.updateContratoEmpresa(record.projectId, record.userId, record.contractIndex, '');
      else await projectsAPI.updateReleaseEmpresa(record.projectId, record.userId, record.contractIndex, '');
      onQuitado(parcheEmpresa(campo, '', ''));
    } catch (err: any) {
      sweetAlert.error('Error', err?.response?.data?.error || 'No se pudo quitar la empresa.');
    } finally {
      setQuitando(false);
    }
  };

  return (
    <button type="button" onClick={quitar} disabled={quitando} title="Quitar la empresa elegida" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50 shrink-0">
      <FontAwesomeIcon icon={quitando ? faSpinner : faTrash} spin={quitando} className="h-3.5 w-3.5" />
    </button>
  );
};

const GenerarMenu: React.FC<{ empresas: EmpresaOption[]; onGenerar: (empresaId?: string) => void; generando: boolean; label?: string }> = ({ empresas, onGenerar, generando, label = 'Generar' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const btnClass = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-wait transition-colors shrink-0 whitespace-nowrap';

  if (empresas.length <= 1) {
    return (
      <button type="button" onClick={() => onGenerar(empresas[0]?.id)} disabled={generando} title={label} className={btnClass}>
        <FontAwesomeIcon icon={generando ? faSpinner : faFileSignature} spin={generando} className="h-3 w-3" />
        {label}
      </button>
    );
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} disabled={generando} title="Elegir empresa para generar" className={btnClass}>
        <FontAwesomeIcon icon={generando ? faSpinner : faFileSignature} spin={generando} className="h-3 w-3" />
        {label}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 max-h-60 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1">
          <p className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Generar con:</p>
          {empresas.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => {
                setOpen(false);
                onGenerar(e.id);
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {e.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** Si el contrato ya tiene todo lo que se puede generar de este tipo — usado para decidir si la fila
 *  se puede seleccionar para "Enviar a firmar" (hacen falta AMBOS: contrato y release(s), de los que
 *  efectivamente apliquen — ver `contratoRequiereFirma`/`releaseRequiereFirma` más abajo). */
const contratoGenerado = (r: ContractOverviewRow): boolean => !!r.firmaGeneradoAt;
const releasesGenerados = (r: ContractOverviewRow, releasesAplicables: Release[]): boolean => releasesAplicables.length === 0 || !!r.firmaReleasesGeneradoAt;

/** Si el Tipo de Contrato de la plantilla (populado en `template.contratoId`) tiene tildado "Se envía
 *  a firmar" — sin el dato poblado, se asume que sí (comportamiento previo a que existiera el campo). */
const contratoRequiereFirma = (template: ContratoFrameItem | null): boolean => {
  const contratoId = template?.contratoId;
  return typeof contratoId === 'object' && contratoId ? contratoId.data?.requiereFirma !== false : true;
};

/** Mismo criterio que `contratoRequiereFirma`, para el Tipo de Release (`release.releaseTipoId`). */
const releaseRequiereFirma = (release: Release): boolean => {
  const tipo = release.releaseTipoId;
  return typeof tipo === 'object' && tipo ? tipo.requiereFirma !== false : true;
};

/**
 * Si la fila tiene ALGO para enviar a firmar (el Contrato y/o el/los Release(s) que efectivamente
 * apliquen, según "Se envía a firmar") y ya está listo — es decir, generado lo que aplica y todavía
 * no enviado. Si NI el Contrato NI ningún Release de este contrato requieren firma, no hay nada que
 * mandar y la fila nunca se habilita.
 */
const calcularEnviable = (record: ContractOverviewRow, contratoFrames: ContratoFrameItem[], releasesAplicables: Release[]): boolean => {
  if (record.firmaEnviadaAt) return false;
  const template = findTemplate(record as unknown as Contract, contratoFrames);
  const contratoAplica = contratoRequiereFirma(template);
  const contratoOk = !contratoAplica || contratoGenerado(record);
  const releaseOk = releasesAplicables.length === 0 || releasesGenerados(record, releasesAplicables);
  const algoAplica = contratoAplica || releasesAplicables.length > 0;
  return algoAplica && contratoOk && releaseOk;
};

/**
 * Celda "Contrato" de la pestaña Firma digital: botón "Generar" independiente (con menú de empresa si
 * el proyecto tiene más de una) → una vez generado, ícono de PDF (ver) + descargar para revisar el PDF
 * antes de mandarlo a firmar (el envío en sí es la acción bulk "Enviar a firmar", habilitada recién
 * cuando también se generó el/los release(s) — ver `FirmaReleaseCell`). El estado "Enviado" se
 * muestra acá.
 */
const FirmaContratoCell: React.FC<{
  record: ContractOverviewRow;
  contratoFrames: ContratoFrameItem[];
  allEstados: InfoItem[];
  onGenerado: (patch?: Partial<ContractOverviewRow>) => void;
}> = ({ record, contratoFrames, allEstados, onGenerado }) => {
  const [generando, setGenerando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const template = findTemplate(record as unknown as Contract, contratoFrames);
  const puedeGenerar = templateHasContent(template);
  const requiereFirma = contratoRequiereFirma(template);
  const tramite = estadoImpositivoDelContrato(record as unknown as Contract, contratoFrames, allEstados)?.data?.tipoImpositivo as TipoImpositivo | undefined;

  const savedContratoEmpresaId = record.empresaContratoId || '';
  const contratoEmpresas = record.contratoEmpresas || [];
  const empresasParaGenerar: EmpresaOption[] = savedContratoEmpresaId ? [{ id: savedContratoEmpresaId, label: record.nombre_empresa_contrato || contratoEmpresas.find((e) => e.id === savedContratoEmpresaId)?.label || savedContratoEmpresaId }] : contratoEmpresas;

  const generar = async (empresaId?: string) => {
    if (!template) return;
    setGenerando(true);
    try {
      const res = await firmaDigitalAPI.generarContrato({
        projectId: record.projectId,
        userId: record.userId,
        contractIndex: record.contractIndex,
        contratoTemplateId: template._id,
        empresaContratoId: empresaId,
        tramite,
      });
      // La respuesta ya trae los campos que cambian: se parchea la fila en vez de releer el listado.
      onGenerado({ firmaContratoUrl: res.firmaContratoUrl, firmaContratoNombre: res.firmaContratoNombre, firmaGeneradoAt: res.firmaGeneradoAt });
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo generar el contrato.');
    } finally {
      setGenerando(false);
    }
  };

  const descargar = async () => {
    if (!record.firmaContratoUrl) return;
    setDescargando(true);
    try {
      await downloadFileFromUrl(record.firmaContratoUrl, record.firmaContratoNombre || 'Contrato.pdf');
    } catch {
      sweetAlert.error('Error', 'No se pudo descargar el contrato.');
    } finally {
      setDescargando(false);
    }
  };

  const eliminar = async () => {
    const confirm = await sweetAlert.confirm('Eliminar contrato generado', 'Se borra el PDF generado y se puede volver a generar (por ejemplo, para elegir otra empresa). Esto no afecta nada ya enviado a firmar.', 'Sí, eliminar', 'Cancelar');
    if (!confirm.isConfirmed) return;
    setEliminando(true);
    try {
      await firmaDigitalAPI.eliminarContrato({ projectId: record.projectId, userId: record.userId, contractIndex: record.contractIndex });
      onGenerado({ firmaContratoUrl: '', firmaContratoNombre: '', firmaGeneradoAt: '' });
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo eliminar el contrato.');
    } finally {
      setEliminando(false);
    }
  };

  if (!contratoGenerado(record)) {
    return (
      <div className="flex items-center justify-center min-w-[120px]" onClick={(e) => e.stopPropagation()}>
        {!requiereFirma ? (
          <span className="text-xs text-gray-400" title='Este Tipo de Contrato no tiene tildado "Se envía a firmar"'>
            No se envía a Firma
          </span>
        ) : puedeGenerar ? (
          // Sin empresa elegida no se ofrece generar: primero hay que elegirla (en ámbar, como
          // requerida), y recién ahí aparece el botón con el nombre de la empresa a la vista, para
          // que no se genere el PDF con una empresa que no se sabe cuál es.
          !savedContratoEmpresaId && contratoEmpresas.length > 0 ? (
            <EmpresaSelectCell record={record} campo="contrato" requerido onGuardado={onGenerado} />
          ) : (
            <div className="flex items-center gap-1">
              <GenerarMenu empresas={empresasParaGenerar} onGenerar={generar} generando={generando} label={savedContratoEmpresaId ? `Generar Contrato · ${empresasParaGenerar[0]?.label || ''}` : 'Generar Contrato'} />
              {savedContratoEmpresaId && <QuitarEmpresaBtn record={record} campo="contrato" onQuitado={onGenerado} />}
            </div>
          )
        ) : (
          <span className="text-xs text-gray-400" title="La plantilla de este tipo de contrato no tiene contenido redactado">
            Sin plantilla
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1 min-w-[120px]" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-center gap-3">
        <a href={getImageUrl(record.firmaContratoUrl)} target="_blank" rel="noopener noreferrer" title={record.firmaContratoNombre || 'Ver Contrato'} className="p-1 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
          <FontAwesomeIcon icon={faFilePdf} className="h-6 w-6 text-violet-600" />
        </a>
        <button type="button" onClick={descargar} disabled={descargando} title="Descargar contrato" className="p-1 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          <FontAwesomeIcon icon={descargando ? faSpinner : faDownload} spin={descargando} className="h-4 w-4" />
        </button>
        <button type="button" onClick={eliminar} disabled={eliminando} title="Eliminar y volver a generar" className="p-1 rounded text-gray-600 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          <FontAwesomeIcon icon={eliminando ? faSpinner : faTrash} spin={eliminando} className="h-4 w-4" />
        </button>
      </div>
      {record.firmaEnviadaAt && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 whitespace-nowrap w-fit">
          <FontAwesomeIcon icon={faCheck} className="h-2.5 w-2.5" />
          Enviado
        </span>
      )}
    </div>
  );
};

/**
 * Celda "Release" de la pestaña Firma digital: botón "Generar" independiente (mismo patrón que
 * Contrato, con menú de empresa si aplica) → una vez generados, ícono de PDF (ver) + descargar por
 * cada release activo.
 */
const FirmaReleaseCell: React.FC<{
  record: ContractOverviewRow;
  contratoFrames: ContratoFrameItem[];
  allEstados: InfoItem[];
  /** Todos los releases activos del proyecto (para saber si hay alguno, más allá de si aplican). */
  activeReleases: Release[];
  /** Solo los releases activos cuyo Tipo tiene tildado "Se envía a firmar". */
  releasesAplicables: Release[];
  onGenerado: (patch?: Partial<ContractOverviewRow>) => void;
}> = ({ record, contratoFrames, allEstados, activeReleases, releasesAplicables, onGenerado }) => {
  const [generando, setGenerando] = useState(false);
  const [descargando, setDescargando] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const firmaReleases = record.firmaReleases || [];
  const tramite = estadoImpositivoDelContrato(record as unknown as Contract, contratoFrames, allEstados)?.data?.tipoImpositivo as TipoImpositivo | undefined;

  const savedReleaseEmpresaId = record.empresaReleaseId || '';
  const releaseEmpresas = record.releaseEmpresas || [];
  const empresasParaGenerar: EmpresaOption[] = savedReleaseEmpresaId ? [{ id: savedReleaseEmpresaId, label: record.nombre_empresa_release || releaseEmpresas.find((e) => e.id === savedReleaseEmpresaId)?.label || savedReleaseEmpresaId }] : releaseEmpresas;

  const generar = async (empresaId?: string) => {
    setGenerando(true);
    try {
      const res = await firmaDigitalAPI.generarRelease({
        projectId: record.projectId,
        userId: record.userId,
        contractIndex: record.contractIndex,
        releaseIds: releasesAplicables.map((r) => r._id),
        empresaReleaseId: empresaId,
        tramite,
      });
      onGenerado({ firmaReleases: res.firmaReleases, firmaReleasesGeneradoAt: res.firmaReleasesGeneradoAt });
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudieron generar los release(s).');
    } finally {
      setGenerando(false);
    }
  };

  const descargar = async (url: string, nombre: string) => {
    setDescargando(url);
    try {
      await downloadFileFromUrl(url, nombre);
    } catch {
      sweetAlert.error('Error', 'No se pudo descargar el release.');
    } finally {
      setDescargando(null);
    }
  };

  const eliminar = async () => {
    const confirm = await sweetAlert.confirm('Eliminar release(s) generados', 'Se borran los PDFs generados (todos juntos, se generan como grupo) y se puede volver a generar. Esto no afecta nada ya enviado a firmar.', 'Sí, eliminar', 'Cancelar');
    if (!confirm.isConfirmed) return;
    setEliminando(true);
    try {
      await firmaDigitalAPI.eliminarRelease({ projectId: record.projectId, userId: record.userId, contractIndex: record.contractIndex });
      onGenerado({ firmaReleases: [], firmaReleasesGeneradoAt: '' });
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudieron eliminar los release(s).');
    } finally {
      setEliminando(false);
    }
  };

  if (activeReleases.length === 0) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  if (releasesAplicables.length === 0) {
    return (
      <span className="text-xs text-gray-400" title='Ningún Tipo de Release de este proyecto tiene tildado "Se envía a firmar"'>
        No se envía a Firma
      </span>
    );
  }

  if (!releasesGenerados(record, releasesAplicables)) {
    return (
      <div className="flex items-center justify-center min-w-[120px]" onClick={(e) => e.stopPropagation()}>
        {/* Mismo criterio que el Contrato: la empresa se elige antes de generar, no en el momento. */}
        {!savedReleaseEmpresaId && releaseEmpresas.length > 0 ? (
          <EmpresaSelectCell record={record} campo="release" requerido onGuardado={onGenerado} />
        ) : (
          <div className="flex items-center gap-1">
            <GenerarMenu empresas={empresasParaGenerar} onGenerar={generar} generando={generando} label={savedReleaseEmpresaId ? `Generar Release · ${empresasParaGenerar[0]?.label || ''}` : 'Generar Release'} />
            {savedReleaseEmpresaId && <QuitarEmpresaBtn record={record} campo="release" onQuitado={onGenerado} />}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1 min-w-[150px]" onClick={(e) => e.stopPropagation()}>
      {firmaReleases.map((r) => {
        const label = activeReleases.find((ar) => ar._id === r.releaseId)?.name || 'Release';
        return (
          <div key={r.releaseId} className="flex items-center justify-center gap-3">
            <a href={getImageUrl(r.url)} target="_blank" rel="noopener noreferrer" title={r.nombre} className="p-1 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
              <FontAwesomeIcon icon={faFilePdf} className="h-6 w-6 text-violet-600" />
            </a>
            <button type="button" onClick={() => descargar(r.url, r.nombre)} disabled={descargando === r.url} title={`Descargar ${label}`} className="p-1 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <FontAwesomeIcon icon={descargando === r.url ? faSpinner : faDownload} spin={descargando === r.url} className="h-4 w-4" />
            </button>
            <button type="button" onClick={eliminar} disabled={eliminando} title="Eliminar y volver a generar" className="p-1 rounded text-gray-600 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <FontAwesomeIcon icon={eliminando ? faSpinner : faTrash} spin={eliminando} className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

/**
 * Celda "Acciones" de la pestaña Firma digital: "Enviar a firmar" individual, por fila — mismo
 * criterio de habilitación que la selección para el envío masivo (lo que efectivamente aplique según
 * "Se envía a firmar" — Contrato y/o Release(s) — generado, todavía no enviado). Una vez enviado,
 * muestra el mismo badge "Enviado" que ya se ve en la celda de Contrato.
 */
const FirmaEnviarCell: React.FC<{
  record: ContractOverviewRow;
  contratoAplica: boolean;
  releasesAplicables: Release[];
  tipoImpositivo?: TipoImpositivo;
  onEnviado: (patch?: Partial<ContractOverviewRow>) => void;
}> = ({ record, contratoAplica, releasesAplicables, tipoImpositivo, onEnviado }) => {
  const [enviando, setEnviando] = useState(false);
  const contratoOk = !contratoAplica || contratoGenerado(record);
  const releaseOk = releasesAplicables.length === 0 || releasesGenerados(record, releasesAplicables);
  const puedeEnviar = (contratoAplica || releasesAplicables.length > 0) && contratoOk && releaseOk && !record.firmaEnviadaAt;

  const enviar = async () => {
    const confirm = await sweetAlert.confirm('Enviar a firmar', 'Se van a subir el Contrato y el/los Release(s) de esta persona a la carpeta "Outbox" de Dropbox para que Dropbox Sign los importe. ¿Continuar?', 'Sí, enviar', 'Cancelar');
    if (!confirm.isConfirmed) return;
    setEnviando(true);
    try {
      const res = await firmaDigitalAPI.enviar([{ projectId: record.projectId, userId: record.userId, contractIndex: record.contractIndex, tipoImpositivo, incluirContrato: contratoAplica }]);
      const resultado = res.resultados[0];
      if (resultado && !resultado.ok) {
        sweetAlert.error('No se pudo enviar', resultado.error || 'Error desconocido.');
      } else {
        sweetAlert.success('Enviado', 'Se envió a firmar correctamente.');
      }
      onEnviado();
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo enviar a firmar.');
    } finally {
      setEnviando(false);
    }
  };

  if (record.firmaEnviadaAt) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 whitespace-nowrap">
        <FontAwesomeIcon icon={faCheck} className="h-2.5 w-2.5" />
        Enviado
      </span>
    );
  }

  return (
    <button type="button" onClick={enviar} disabled={!puedeEnviar || enviando} title={puedeEnviar ? 'Enviar a firmar esta persona' : 'Generá primero el Contrato y el/los Release(s)'} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap">
      <FontAwesomeIcon icon={enviando ? faSpinner : faPaperPlane} spin={enviando} className="h-3 w-3" />
      Enviar a firmar
    </button>
  );
};

/**
 * Sub-pestaña "Firma digital": lista los contratos que ya terminaron su trámite impositivo (Alta
 * temprana de ARCA archivada, o Constancia de CUIT archivada — el cron de Dropbox ya los movió solo
 * al estado "Envío de documentación", ver `estadoDropboxCronService.ts`). Flujo en dos pasos:
 * 1) "Generar" arma el Contrato + Release(s) y los deja para revisar (ojito) — no envía nada.
 * 2) "Enviar a firmar" (bulk, o individual desde la columna "Acciones") sube los ya generados a la
 *    carpeta Dropbox "Outbox" que vigila Dropbox Sign (+ el Alta temprana de ARCA ya cargada, si ese
 *    fue el trámite de origen). La Constancia de CUIT nunca se sube: ya cumplió su función al mover
 *    al contrato a este estado.
 */
export const ContractBulkFirmaTab: React.FC<{
  allEstados: InfoItem[];
  contratoFrames: ContratoFrameItem[];
  releases: Release[];
}> = ({ allEstados, contratoFrames, releases }) => {
  const [rows, setRows] = useState<ContractOverviewRow[]>([]);
  const [config, setConfig] = useState<FirmaDigitalConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterClientId, setFilterClientId] = useState('');
  const [filterProjectId, setFilterProjectId] = useState('');
  const [filterEmpresaId, setFilterEmpresaId] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    companiesAPI
      .list()
      .then(setCompanies)
      .catch(() => setCompanies([]));
  }, []);

  const activeReleases = useMemo(() => releases.filter((r) => r.isActive), [releases]);
  // Solo los releases activos cuyo Tipo tiene tildado "Se envía a firmar" — los demás no se generan
  // ni se mandan a firmar acá, aunque sigan existiendo como release del proyecto.
  const releasesQueFirman = useMemo(() => activeReleases.filter(releaseRequiereFirma), [activeReleases]);

  // Mismo caché compartido que las otras pestañas de Gestión (ver CONTRACTS_OVERVIEW_CACHE):
  // volver acá desde otra sub-pestaña no repite la consulta. `load(true)` fuerza el refresco.
  const load = useCallback((force = false) => {
    if (force) invalidateRefCache(CONTRACTS_OVERVIEW_CACHE);
    setLoading(true);
    return Promise.all([cachedFetch(`${CONTRACTS_OVERVIEW_CACHE}todos`, () => usersAPI.listContractsOverview({ limit: 5000 })), firmaDigitalAPI.config()])
      .then(([res, cfg]) => {
        setRows(res.rows);
        setConfig(cfg);
      })
      .catch(() => {
        /* noop */
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Igual que en la otra pestaña: se parchea solo la fila tocada en vez de releer todo. */
  const aplicarCambio = useCallback(
    (record: ContractOverviewRow, patch?: Partial<ContractOverviewRow>) => {
      if (!patch) return load(true);
      const esLaFila = (r: ContractOverviewRow) => r._id === record._id && r.contractIndex === record.contractIndex;
      setRows((prev) => prev.map((r) => (esLaFila(r) ? { ...r, ...patch } : r)));
      updateRefCache<{ rows: ContractOverviewRow[] }>(`${CONTRACTS_OVERVIEW_CACHE}todos`, (data) => ({
        ...data,
        rows: (data.rows || []).map((r) => (esLaFila(r) ? { ...r, ...patch } : r)),
      }));
      return Promise.resolve();
    },
    [load],
  );

  // Trámite impositivo de ORIGEN del contrato (por su tipo/plantilla, no por el estado actual —
  // sigue siendo válido aunque el contrato ya haya avanzado a "Envío de documentación").
  const tipoDelRow = useCallback(
    (r: ContractOverviewRow): TipoImpositivo | undefined => {
      const estado = estadoImpositivoDelContrato(r as unknown as Contract, contratoFrames, allEstados);
      return estado?.data?.tipoImpositivo as TipoImpositivo | undefined;
    },
    [contratoFrames, allEstados],
  );

  const claveEnvio = config?.estadoEnvioDocNombre ? claveEstado(config.estadoEnvioDocNombre) : null;
  const rowsEnEnvio = useMemo(() => (claveEnvio ? rows.filter((r) => claveEstado(r.nombre_estado_empleado || '') === claveEnvio) : []), [rows, claveEnvio]);

  const empresasDelContrato = (r: ContractOverviewRow): string[] => (r.empresaContratoId ? [r.empresaContratoId] : (r.contratoEmpresas || []).map((e) => e.id));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rowsEnEnvio.filter((r) => {
      if (filterClientId && r.clientId !== filterClientId) return false;
      if (filterProjectId && r.projectId !== filterProjectId) return false;
      if (filterEmpresaId && !empresasDelContrato(r).includes(filterEmpresaId)) return false;
      if (q) {
        const hay = [r.userName, r.userEmail, r.clientName, r.projectName, r.nombre_contrato].some((v) => (v || '').toLowerCase().includes(q));
        if (!hay) return false;
      }
      return true;
    });
  }, [rowsEnEnvio, search, filterClientId, filterProjectId, filterEmpresaId]);

  const clientOptions = useMemo(() => {
    const m = new Map<string, string>();
    rowsEnEnvio.forEach((r) => r.clientId && m.set(r.clientId, r.clientName || r.clientId));
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rowsEnEnvio]);
  const projectOptions = useMemo(() => {
    const m = new Map<string, string>();
    rowsEnEnvio.filter((r) => !filterClientId || r.clientId === filterClientId).forEach((r) => r.projectId && m.set(r.projectId, r.projectName || r.projectId));
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rowsEnEnvio, filterClientId]);
  const empresaOptions = useMemo(() => companies.map((c) => ({ value: c._id, label: c.razonSocial })).sort((a, b) => a.label.localeCompare(b.label)), [companies]);

  const rowKey = (r: ContractOverviewRow) => `${r._id}-${r.contractIndex}`;
  const toggleSel = (k: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  // Solo se pueden marcar (y enviar) los contratos con Contrato Y Release(s) ya generados (botones
  // independientes) y todavía no enviados.
  const enviables = useMemo(() => filtered.filter((r) => calcularEnviable(r, contratoFrames, releasesQueFirman)), [filtered, contratoFrames, releasesQueFirman]);
  const allSel = enviables.length > 0 && enviables.every((r) => selected.has(rowKey(r)));
  const toggleAll = () =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (allSel) enviables.forEach((r) => n.delete(rowKey(r)));
      else enviables.forEach((r) => n.add(rowKey(r)));
      return n;
    });
  const seleccionados = useMemo(() => enviables.filter((r) => selected.has(rowKey(r))), [enviables, selected]);
  // Igual criterio que "Generar TXT (ARCA)": sin selección, se manda todo lo filtrado (comodidad).
  const fuenteEnvio = seleccionados.length > 0 ? seleccionados : enviables;

  const handleEnviar = async () => {
    if (fuenteEnvio.length === 0) return;
    const confirm = await sweetAlert.confirm('Enviar a firmar', `Se van a subir los documentos de ${fuenteEnvio.length} contrato(s) a la carpeta "Outbox" de Dropbox para que Dropbox Sign los importe. ¿Continuar?`, 'Sí, enviar', 'Cancelar');
    if (!confirm.isConfirmed) return;
    setEnviando(true);
    try {
      const targets = fuenteEnvio.map((r) => ({
        projectId: r.projectId,
        userId: r.userId,
        contractIndex: r.contractIndex,
        tipoImpositivo: tipoDelRow(r),
        incluirContrato: contratoRequiereFirma(findTemplate(r as unknown as Contract, contratoFrames)),
      }));
      const res = await firmaDigitalAPI.enviar(targets);
      const fallidos = res.resultados.filter((x) => !x.ok);
      if (fallidos.length > 0) {
        sweetAlert.error(
          'Algunos envíos fallaron',
          `${res.enviados} enviado(s) correctamente. ${fallidos.length} fallaron: ${fallidos
            .map((f) => f.error)
            .slice(0, 3)
            .join(' · ')}`,
        );
      } else {
        sweetAlert.success('Enviado', `${res.enviados} contrato(s) enviado(s) a firmar.`);
      }
      setSelected(new Set());
      load(true);
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo enviar a firmar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-start justify-between">
        <div className="flex-1 w-full">
          <SearchAndFilters
            searchTerm={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar por usuario, proyecto o contrato..."
            selectFilters={[
              { label: 'Cliente', value: filterClientId, onChange: setFilterClientId, placeholder: 'Todos los clientes', options: clientOptions },
              { label: 'Proyecto', value: filterProjectId, onChange: setFilterProjectId, placeholder: 'Todos los proyectos', options: projectOptions },
              { label: 'Empresa', value: filterEmpresaId, onChange: setFilterEmpresaId, placeholder: 'Todas las empresas', options: empresaOptions },
            ]}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {!loading && config && !config.outboxCarpeta && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/60">
              <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
              No se encontró la carpeta "Outbox" configurada (Documentos → Configurar transición automática)
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {seleccionados.length > 0 && <span className="text-xs text-gray-500 dark:text-gray-400">{seleccionados.length} seleccionado(s)</span>}
          <button onClick={handleEnviar} disabled={enviando || fuenteEnvio.length === 0 || !config?.outboxCarpeta} title={seleccionados.length > 0 ? 'Enviar a firmar los contratos seleccionados' : 'Enviar a firmar todos los contratos generados del listado (o marcá algunos con el check)'} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0">
            <FontAwesomeIcon icon={enviando ? faSpinner : faPaperPlane} spin={enviando} className="h-4 w-4" />
            Enviar a firmar{fuenteEnvio.length > 0 ? ` (${fuenteEnvio.length})` : ''}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner message="Cargando contratos..." />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={faFileSignature} title="Sin contratos para firmar" description={rowsEnEnvio.length === 0 ? 'Ningún contrato está hoy en el estado de "Envío de documentación" (se llega ahí automáticamente al archivar el Alta temprana de ARCA o la Constancia de CUIT).' : 'No hay resultados con los filtros aplicados.'} />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar max-h-[640px]">
            <table className="w-full text-left border-separate border-spacing-0 min-w-[1600px]">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 shadow-sm">
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="sticky top-0 left-0 z-[15] px-4 py-3 w-12 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
                    <input type="checkbox" checked={allSel} onChange={toggleAll} disabled={enviables.length === 0} title="Seleccionar todos los generados" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" />
                  </th>
                  <th className="sticky top-0 left-12 z-[15] px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900 border-r-2 border-gray-300 dark:border-gray-600 shadow-[4px_0_6px_-4px_rgba(0,0,0,0.25)]">Acciones</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Alta / Baja</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Trámite</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Contrato</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Release</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Usuario</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">CUIT</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Cliente</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Proyecto</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Tipo de Contrato</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Estado</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Estado Impositivo</th>
                  <ContractActionsHeader />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map((r) => {
                  const tipo = tipoDelRow(r);
                  const template = findTemplate(r as unknown as Contract, contratoFrames);
                  const contratoAplica = contratoRequiereFirma(template);
                  const enviable = calcularEnviable(r, contratoFrames, releasesQueFirman);
                  return (
                    <tr key={rowKey(r)} className={`group hover:bg-gray-50 dark:hover:bg-gray-900/20 ${selected.has(rowKey(r)) ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                      <td className={`sticky left-0 z-[5] px-4 py-3 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-[#1c2634] border-r border-gray-200 dark:border-gray-700 ${selected.has(rowKey(r)) ? '!bg-[#f7faff] dark:!bg-[#1f2b3f]' : ''}`}>
                        <input type="checkbox" checked={selected.has(rowKey(r))} disabled={!enviable} onChange={() => toggleSel(rowKey(r))} title={enviable ? 'Incluir en el envío a firmar' : r.firmaEnviadaAt ? 'Ya se envió a firmar' : 'Generá primero el Contrato y el/los Release(s) ("Generar")'} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" />
                      </td>
                      <td className={`sticky left-12 z-[5] px-4 py-3 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-[#1c2634] border-r-2 border-gray-300 dark:border-gray-600 shadow-[4px_0_6px_-4px_rgba(0,0,0,0.25)] ${selected.has(rowKey(r)) ? '!bg-[#f7faff] dark:!bg-[#1f2b3f]' : ''}`}>
                        <FirmaEnviarCell record={r} contratoAplica={contratoAplica} releasesAplicables={releasesQueFirman} tipoImpositivo={tipo} onEnviado={(patch) => aplicarCambio(r, patch)} />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-500 whitespace-nowrap">
                        {(() => {
                          const vigente = isContractVigente(r.fecha_alta_contrato, r.fecha_baja_contrato);
                          return (
                            <div className="flex flex-col gap-1">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold w-fit ${vigente ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>{vigente ? 'VIGENTE' : 'NO VIGENTE'}</span>
                              <div className="flex flex-col gap-0.5 text-xs">
                                <span>
                                  <span className="text-gray-400">Alta:</span> {formatDate(r.fecha_alta_contrato)}
                                </span>
                                <span>
                                  <span className="text-gray-400">Baja:</span> {r.fecha_baja_contrato ? formatDate(r.fecha_baja_contrato) : '—'}
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        {tipo ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap ${tipo === 'alta_temprana_afip' ? 'bg-purple-600 text-white border-purple-600 dark:bg-purple-500 dark:border-purple-500' : 'bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-700'}`}>
                            <FontAwesomeIcon icon={faFileInvoiceDollar} className="h-2.5 w-2.5" />
                            {TIPO_LABEL[tipo]}
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-400 italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <FirmaContratoCell record={r} contratoFrames={contratoFrames} allEstados={allEstados} onGenerado={(patch) => aplicarCambio(r, patch)} />
                      </td>
                      <td className="px-4 py-3">
                        <FirmaReleaseCell record={r} contratoFrames={contratoFrames} allEstados={allEstados} activeReleases={activeReleases} releasesAplicables={releasesQueFirman} onGenerado={(patch) => aplicarCambio(r, patch)} />
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold whitespace-nowrap inline-flex items-center gap-1.5 text-gray-900 dark:text-white">
                        {r.userName}
                        <NombreArca estado={estadoNombreArca({ cuit: r.cuit, sinCuit: r.sinCuit, validado: r.userNombreValidadoArca })} conInfo />
                      </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{r.userEmail}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap font-mono">{cuitDisplay(r.cuit, r.sinCuit)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.clientName || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.projectName || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.nombre_contrato || '—'}</td>
                      <td className="px-4 py-3">
                        <EstadoBadge name={r.nombre_estado_empleado || ''} />
                      </td>
                      <td className="px-4 py-3">
                        <EstadoImpositivoCell record={r} contratoFrames={contratoFrames} allEstados={allEstados} />
                      </td>
                      <ContractActionsCell record={r} onDeleted={() => load(true)} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContractBulkAfipTab;
