import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ContractOverviewRow } from '../api/users';
import { projectsAPI } from '../api/projects';
import { contratoFrameAPI, ContratoFrameItem } from '../api/contratosFrame';
import { infoAPI, InfoItem } from '../api/info';
import { MemberContractsManagerModal } from '../components/team/MemberContractsManagerModal';
import { releasesAPI, Release } from '../api/release';
import { PageLayout } from '../components/ui/PageLayout';
import { Modal } from '../components/ui/Modal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDropbox } from '@fortawesome/free-brands-svg-icons';
import { faFileContract, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { sweetAlert } from '../utils/sweetAlert';
import { ContractBulkAfipTab, ContractBulkContratadosTab, ContractBulkFirmaTab } from '../components/contratos/ContractBulkTabs';
import { ContractDropboxTab, InstructivoParaFirmar } from '../components/contratos/ContractDropboxTabs';
import { AlcanceBanner } from '../components/context/AlcanceBanner';
import { useEmpresaContextStore } from '../stores/empresaContextStore';
import { firmaDigitalAPI, FirmaDigitalConfig } from '../api/firmaDigital';
import { EditarContratoEnModalContext, VerContratoEnModalContext, type ArcaDelContrato, type ContratoAEditar } from '../components/contratos/editarContratoEnModal';
import { ContratoDetalleModal } from '../components/contratos/ContratoDetalleModal';
import { ProjectTeamPage } from './ProjectTeamPage';
import { invalidateRefCache } from '../utils/refCache';
import { bandejaPorClave, contadorDeBandeja, varianteDeQuery, VARIANTES_TRAMITE, type CarpetaFirma, type ClaveBandeja, type VarianteTramite } from '../config/bandejasContratacion';
import { PasoDelFlujo } from '../components/contratos/PasoDelFlujo';
import { useContadoresContratacionStore } from '../stores/contadoresContratacionStore';

/*
  LA PANTALLA DE UNA BANDEJA DE CONTRATACIÓN (11/11/2026, pedido del usuario).

  Hasta acá esto era /admin/contracts con dos pestañas de página —«Gestión de Contratos» y
  «Contratos»— y, adentro de la primera, un stepper con los pasos del circuito. Cada paso es ahora una
  página con URL propia (`/admin/contratacion/…`) que se abre desde el menú lateral, donde está su
  número: ver `config/bandejasContratacion.ts`. Solicitudes, el paso 1, tiene su pantalla
  (`SolicitudesPage`).

  Lo que cada bandeja dibuja es el mismo componente que dibujaba su pestaña, sin tocar: acá queda lo
  que comparten —los catálogos, el resumen y la edición del contrato encima de la tabla— y el
  encabezado. El viejo listado «Contratos» se fusionó con el padrón (la bandeja «Contratos»).
*/

/** Qué es cada variante del trámite impositivo: el ⓘ de cada una y el de la bandeja. */
const INFO_VARIANTE: Record<VarianteTramite, string> = {
  'alta-temprana': 'Vive en la base de datos de la aplicación, no en Dropbox. Son los contratos registrados que todavía necesitan un Alta Temprana en ARCA. No interviene Dropbox Sign.',
  'constancia-cuit': 'Vive en la base de datos, no en Dropbox. Son los contratos a los que hay que verificarles si el CUIT está activo en ARCA. No interviene Dropbox Sign.',
  'sin-cuit':
    'Personas extranjeras que TODAVÍA no tienen CUIT/CUIL argentino: su trámite de ARCA/ANSES queda pendiente hasta que cuenten con la documentación migratoria (DNI precario, residencia en trámite, etc.), así que no aparecen en Alta temprana ni en Constancia de CUIT y se agrupan acá. Se carga la documentación de respaldo, se marca la validación y se las envía a Generar Documentos de forma excepcional: se archiva un comprobante en "WEPRODU/ARCA/Sin cuit", el contrato avanza y desde ahí se le generan el Contrato y el Release.',
};

/** El trámite que le pide cada variante a `ContractBulkAfipTab`. */
const TIPO_DE_VARIANTE: Record<VarianteTramite, 'alta_temprana_afip' | 'constancia_cuit' | 'sin_cuit'> = { 'alta-temprana': 'alta_temprana_afip', 'constancia-cuit': 'constancia_cuit', 'sin-cuit': 'sin_cuit' };

export const ContractsPage: React.FC<{ bandeja: Exclude<ClaveBandeja, 'solicitudes'> }> = ({ bandeja: claveBandeja }) => {
  const navigate = useNavigate();
  const { selectedEmpresa } = useEmpresaContextStore();
  const bandeja = bandejaPorClave(claveBandeja);
  const contenido = bandeja.contenido;
  // Desde Gestionar Equipo se llega con `?projectId=…` para caer filtrado por ese proyecto.
  const [searchParams, setSearchParams] = useSearchParams();
  const initialProjectId = searchParams.get('projectId') || '';
  // Las tres variantes del trámite impositivo quedan adentro de su bandeja; la elegida, en la URL.
  const variante = varianteDeQuery(searchParams.get('variante'));
  const elegirVariante = (v: VarianteTramite) =>
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set('variante', v);
        return n;
      },
      { replace: true },
    );

  const [contratoFrames, setContratoFrames] = useState<ContratoFrameItem[]>([]);
  const [allEstados, setAllEstados] = useState<InfoItem[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  /** Carpetas reales de Dropbox Sign (Outbox/Pendbox/Requested signatures) según la configuración. */
  const [firmaCfg, setFirmaCfg] = useState<FirmaDigitalConfig | null>(null);
  useEffect(() => {
    firmaDigitalAPI
      .config()
      .then(setFirmaCfg)
      .catch(() => setFirmaCfg(null));
    contratoFrameAPI
      .list()
      .then(setContratoFrames)
      .catch(() => setContratoFrames([]));
    infoAPI
      .listEstados()
      .then(setAllEstados)
      .catch(() => setAllEstados([]));
    releasesAPI
      .getAll()
      .then(setReleases)
      .catch(() => setReleases([]));
  }, []);

  const [openInfo, setOpenInfo] = useState(false);
  /** El ⓘ de UNA variante del trámite impositivo. */
  const [infoVariante, setInfoVariante] = useState<VarianteTramite | null>(null);
  // Modal de gestión de TODOS los contratos de una persona (cross-proyecto)
  const [managedUser, setManagedUser] = useState<{ id: string; name: string } | null>(null);

  /*
    LOS NÚMEROS. El del menú lateral sale del almacén compartido (`contadoresContratacionStore`); lo
    que la pantalla acaba de leer —su carpeta de Dropbox, el padrón, la bandeja de generar— se deja
    ahí también, así el menú y el título dicen lo mismo.
  */
  const contadores = useContadoresContratacionStore((st) => st.contadores);
  const informarAlMenu = useContadoresContratacionStore((st) => st.informar);
  const contarEnCarpeta = useMemo(() => {
    const de = (clave: CarpetaFirma) => (cantidad: number) => informarAlMenu({ carpeta: { clave, cantidad } });
    return { para_firmar: de('para_firmar'), enviado_firma: de('enviado_firma'), firmados: de('firmados') };
  }, [informarAlMenu]);
  const alContarPadron = useCallback((cantidad: number) => informarAlMenu({ contratos: cantidad }), [informarAlMenu]);
  const alContarGenerar = useCallback((cantidad: number) => informarAlMenu({ generarDocumentos: cantidad }), [informarAlMenu]);
  /*
    Trámite impositivo: los tres números los informa `ContractBulkAfipTab`, con los filtros que se
    están mirando (p. ej. el proyecto con el que se llegó). `null` = todavía no contó: sin número, no «0».
  */
  const [tramite, setTramite] = useState<{ alta: number; cuit: number; sinCuit: number } | null>(null);
  const refrescoDelMenu = useRef<number | undefined>(undefined);
  const yaConto = useRef(false);
  const informarConteos = useCallback((c: { alta: number; cuit: number; firma: number; sinCuit: number }) => {
    // Cambió la bandeja con la pantalla abierta (se presentó un alta, pasó a generar): el menú recuenta.
    if (yaConto.current) {
      window.clearTimeout(refrescoDelMenu.current);
      refrescoDelMenu.current = window.setTimeout(() => useContadoresContratacionStore.getState().refrescarBase(), 1500);
    }
    yaConto.current = true;
    setTramite({ alta: c.alta, cuit: c.cuit, sinCuit: c.sinCuit });
  }, []);
  useEffect(() => () => window.clearTimeout(refrescoDelMenu.current), []);
  const alEnviarAFirmar = useCallback(() => useContadoresContratacionStore.getState().refrescarBase(), []);

  /*
    El número del título. Trámite impositivo: LAS ALTAS QUE FALTAN (01/11/2026, pedido del usuario),
    Alta temprana de ARCA + Constancia de CUIT con los filtros que se están mirando. El resto, el de
    su ítem del menú.
  */
  const cuenta = contenido.tipo === 'tramite' ? (tramite ? tramite.alta + tramite.cuit : undefined) : (contadorDeBandeja(contadores, bandeja.clave) ?? undefined);

  /**
   * Qué carpetas de Dropbox alimentan la bandeja. Salen de la configuración real, no de una lista fija:
   *  - Generar documentos: las carpetas vigiladas del estado al que llegan los contratos con el
   *    trámite impositivo terminado (Alta temprana de Arca, Constancia de cuit, Sin cuit).
   *  - Para Firmar / Enviado / Firmados: las de Dropbox Sign (Outbox, Pendbox, Requested signatures).
   */
  const carpetas = useMemo<string[]>(() => {
    if (contenido.tipo === 'generar') {
      const estadoEnvio = firmaCfg?.estadoEnvioDocNombre ? allEstados.find((e) => e.name === firmaCfg.estadoEnvioDocNombre) : undefined;
      return ((estadoEnvio?.data as any)?.transicionAutomatica?.carpetas || []).map((c: any) => c?.dropboxCarpeta).filter(Boolean) as string[];
    }
    if (contenido.tipo !== 'dropbox') return [];
    const porCarpeta: Record<CarpetaFirma, string | null | undefined> = { para_firmar: firmaCfg?.outboxCarpeta, enviado_firma: firmaCfg?.pendienteFirmaCarpeta, firmados: firmaCfg?.firmadosCarpeta };
    return [porCarpeta[contenido.carpeta]].filter(Boolean) as string[];
  }, [contenido, firmaCfg, allEstados]);

  /*
    EDITAR SIN SALIR DE LA BANDEJA (01/11/2026, pedido del usuario): el wizard del equipo se abre encima,
    como en Solicitudes al aprobar, con «Editar Miembro» y el comentario de la solicitud si lo tiene. Lo
    usa el lápiz de las tablas (`ContractActionsButtons`, por contexto).
  */
  const [editandoContrato, setEditandoContrato] = useState<{ contrato: ContratoAEditar; alGuardar?: () => void } | null>(null);
  const editarContratoEnModal = useCallback((contrato: ContratoAEditar, alGuardar?: () => void) => setEditandoContrato({ contrato, alGuardar }), []);

  /*
    EL RESUMEN AL TOCAR LA FILA (02/11/2026, pedido del usuario), como en Solicitudes. Lo usan las
    tablas de las bandejas (por contexto). Editar y eliminar desde el resumen refrescan la tabla de
    donde vino (`alCambiar`).
  */
  const [viendoContrato, setViendoContrato] = useState<{ record: ContractOverviewRow; alCambiar?: () => void; arca?: ArcaDelContrato } | null>(null);
  const verContratoEnModal = useCallback((record: ContractOverviewRow, alCambiar?: () => void, arca?: ArcaDelContrato) => setViendoContrato({ record, alCambiar, arca }), []);

  // Eliminar SOLO ese contrato (por índice) del proyecto.
  const handleDeleteContract = async (record: ContractOverviewRow, alBorrar?: () => void) => {
    const res = await sweetAlert.confirm('¿Eliminar contrato?', `Se eliminará este contrato de "${record.projectName}". Esta acción no se puede deshacer.`, 'Sí, eliminar');
    if (!res.isConfirmed) return false;
    try {
      await projectsAPI.deleteMemberContract(record.projectId, record.userId, record.contractIndex);
      invalidateRefCache('contracts-overview:');
      sweetAlert.success('Contrato eliminado', 'El contrato fue eliminado.');
      alBorrar?.();
      return true;
    } catch {
      sweetAlert.error('Error', 'No se pudo eliminar el contrato.');
      return false;
    }
  };

  /* Las tres variantes del trámite impositivo son EXCLUYENTES (el contrato está en una sola): se elige cuál mirar. */
  const filaVariantes = contenido.tipo === 'tramite' && (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 px-3 py-2">
      {VARIANTES_TRAMITE.map((op) => {
        const activo = variante === op.clave;
        const total = tramite ? (op.clave === 'alta-temprana' ? tramite.alta : op.clave === 'constancia-cuit' ? tramite.cuit : tramite.sinCuit) : null;
        return (
          <div key={op.clave} className="flex items-center gap-1">
            <button type="button" onClick={() => elegirVariante(op.clave)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors whitespace-nowrap ${activo ? 'border-blue-500 bg-white text-blue-600 dark:bg-gray-900 dark:text-blue-400' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-900/60'}`}>
              <span className={`h-3.5 w-3.5 rounded-full border-2 shrink-0 ${activo ? 'border-blue-500 bg-blue-500 ring-2 ring-inset ring-white dark:ring-gray-900' : 'border-gray-300 dark:border-gray-600'}`} />
              {op.label}
              {total !== null && ` (${total})`}
            </button>
            <button type="button" onClick={() => setInfoVariante(op.clave)} title={op.label} className="text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-300 shrink-0">
              <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );

  /** El ⓘ de la bandeja: qué hay acá (era el modal «Qué es cada pestaña»), de qué carpetas sale y, en Para Firmar, el instructivo. */
  const infoDeBandeja = (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-300">{bandeja.explicacion}</p>
      {contenido.tipo === 'tramite' && (
        <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1.5 list-disc list-inside">
          {VARIANTES_TRAMITE.map((op) => (
            <li key={op.clave}>
              <strong>{op.label}</strong>: {INFO_VARIANTE[op.clave]}
            </li>
          ))}
        </ul>
      )}
      {carpetas.length > 0 && (
        <div>
          <p className="text-sm font-bold text-gray-900 dark:text-white mb-1">{carpetas.length === 1 ? 'Carpeta de Dropbox' : 'Carpetas de Dropbox'}</p>
          <ul className="space-y-1.5">
            {carpetas.map((c) => (
              <li key={c} className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
                <FontAwesomeIcon icon={faDropbox} className="h-4 w-4 text-blue-500 shrink-0" />
                <span className="font-mono text-xs text-gray-700 dark:text-gray-200 break-all">{c.replace(/^\//, '')}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">Se configuran en Dropbox | Documentos → Configurar transición automática.</p>
        </div>
      )}
      {bandeja.clave === 'para-firmar' && <InstructivoParaFirmar />}
    </div>
  );

  return (
    <EditarContratoEnModalContext.Provider value={editarContratoEnModal}>
      <VerContratoEnModalContext.Provider value={verContratoEnModal}>
        {editandoContrato && (
          <ProjectTeamPage
            soloAprobacion={{
              projectId: editandoContrato.contrato.projectId,
              solicitudId: '',
              editarContrato: { userId: editandoContrato.contrato.userId, contractIndex: editandoContrato.contrato.contractIndex },
              onCerrar: () => setEditandoContrato(null),
              onAprobada: () => {
                const alGuardar = editandoContrato.alGuardar;
                setEditandoContrato(null);
                invalidateRefCache('contracts-overview:');
                alGuardar?.();
              },
            }}
          />
        )}
        <PageLayout
          title={bandeja.label}
          subtitle={bandeja.descripcion}
          faIcon={{ icon: faFileContract }}
          // Solo cuando se entró desde otra pantalla (ej. Gestionar Equipo del proyecto): volver ahí.
          // Se usa la ruta del proyecto y no history(-1) para que también funcione al recargar la URL.
          onBack={initialProjectId ? () => navigate(`/projects/${initialProjectId}/team`) : undefined}
          itemCount={cuenta}
          // DÓNDE SE ESTÁ PARADO, al lado del título (09/11/2026, pedido del usuario), y el link al paso que sigue.
          titleBadge={<PasoDelFlujo clave={bandeja.clave} variante={contenido.tipo === 'tramite' ? VARIANTES_TRAMITE.find((v) => v.clave === variante)?.label : undefined} />}
          infoModal={{ isOpen: openInfo, onOpen: () => setOpenInfo(true), onClose: () => setOpenInfo(false), title: bandeja.label, size: 'md', content: infoDeBandeja }}
          shouldShowInfo
          // Lista los contratos de TODAS las empleadoras. Es el alcance correcto para esta pantalla —acá
          // se asigna la empresa a los que todavía no la tienen—, pero con una empresa activa en el
          // contexto hay que decirlo: es la misma pantalla que su "Contratos", sin el corte.
          preSearchContent={<AlcanceBanner eje="empresa" modo="global" irAlFiltrado={selectedEmpresa ? `/empresas/${selectedEmpresa._id}/contratos` : undefined} />}
          searchAndFilters={filaVariantes || undefined}
        >
          {contenido.tipo === 'dropbox' ? (
            <ContractDropboxTab key={contenido.carpeta} tipo={contenido.carpeta} onCount={contarEnCarpeta[contenido.carpeta]} />
          ) : contenido.tipo === 'padron' ? (
            <ContractBulkContratadosTab allEstados={allEstados} contratoFrames={contratoFrames} releases={releases} onCount={alContarPadron} />
          ) : contenido.tipo === 'generar' ? (
            <ContractBulkFirmaTab allEstados={allEstados} contratoFrames={contratoFrames} releases={releases} onCount={alContarGenerar} onEnviados={alEnviarAFirmar} />
          ) : (
            <ContractBulkAfipTab allEstados={allEstados} contratoFrames={contratoFrames} releases={releases} initialProjectId={initialProjectId} tipo={TIPO_DE_VARIANTE[variante]} onCounts={informarConteos} />
          )}

          {/* Montado sólo abierto: trae sus catálogos al abrirse, no con cada carga de la página. */}
          {viendoContrato && (
            <ContratoDetalleModal
              isOpen
              onClose={() => setViendoContrato(null)}
              record={viendoContrato.record}
              arca={viendoContrato.arca}
              contratoFrames={contratoFrames}
              allEstados={allEstados}
              onEditar={(r) => {
                const alCambiar = viendoContrato.alCambiar;
                setViendoContrato(null);
                editarContratoEnModal({ projectId: r.projectId, userId: r.userId, contractIndex: r.contractIndex }, alCambiar);
              }}
              onEliminar={async (r) => {
                if (await handleDeleteContract(r, viendoContrato.alCambiar)) setViendoContrato(null);
              }}
              onVerTodos={(r) => {
                setViendoContrato(null);
                setManagedUser({ id: r.userId, name: r.userName });
              }}
            />
          )}

          <MemberContractsManagerModal isOpen={!!managedUser} onClose={() => setManagedUser(null)} userId={managedUser?.id || null} userName={managedUser?.name} contratoFrames={contratoFrames} releases={releases} />

          {infoVariante && (
            <Modal isOpen onClose={() => setInfoVariante(null)} title={VARIANTES_TRAMITE.find((v) => v.clave === infoVariante)?.label || ''} size="sm" zIndex={80}>
              <p className="text-sm text-gray-600 dark:text-gray-300">{INFO_VARIANTE[infoVariante]}</p>
            </Modal>
          )}
        </PageLayout>
      </VerContratoEnModalContext.Provider>
    </EditarContratoEnModalContext.Provider>
  );
};
