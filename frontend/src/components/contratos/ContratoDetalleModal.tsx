import React, { useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBolt, faCommentDots, faEdit, faFileContract, faTrash } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { Contract, ContractOverviewRow } from "../../api/users";
import { InfoItem } from "../../api/info";
import { ContratoFrameItem } from "../../api/contratosFrame";
import { EstadoBadge } from "../EstadoSelect";
import { estadoImpositivoDelContrato, isContractVigente, formatDate } from "../team/ContractCard";
import { fechaISO } from "../../utils/contratoVigencia";
import { cuitDisplay } from "./ConstanciaBulk";
import { useCatalogosDeSolicitudes } from "../solicitudes/SolicitudesTable";
import { Fila, ResumenDelAlta } from "../solicitudes/ResumenDelAlta";
import { BadgeArca } from "./DatosArcaDetalle";
import type { ArcaDelContrato } from "./editarContratoEnModal";

/*
  EL RESUMEN DE UN CONTRATO, al tocar su fila (02/11/2026, pedido del usuario).

  En Solicitudes la fila abre el detalle; en Contratos no hacía nada y para ver el contrato completo
  había que abrir el wizard de edición. Éste es el mismo resumen que el de la solicitud
  (`ResumenDelAlta`): la fila se pasa a la forma de `metadata` de una solicitud y sale por las mismas
  cuentas de importes. Es SÓLO LECTURA: editar sigue siendo el wizard, que se abre desde acá.

  No pide nada al server: la fila de `contracts-overview` ya trae todo lo que se muestra.
*/

/** La fila de Contratos con la forma de `metadata` de una solicitud, para `ResumenDelAlta`. */
const metadataDelContrato = (r: ContractOverviewRow, tipoImpositivo: string | undefined) => ({
  fullName: r.userName,
  projectIds: [],
  nombre_rol_frame: r.nombreRolFrame,
  empresaContratoId: r.empresaContratoId,
  nombre_empresa_contrato: r.nombre_empresa_contrato,
  contratoId: r.tipoContratoId,
  nombre_contrato: r.nombre_contrato,
  tipoImpositivo,
  categoriaSatId: r.categoria_sat_id != null ? String(r.categoria_sat_id) : "",
  startDate: fechaISO(r.fecha_alta_contrato),
  dueDate: fechaISO(r.fecha_baja_contrato),
  schedule: r.hora_inicio ? `${r.hora_inicio} - ${r.hora_fin || ""}` : "",
  diasSemana: r.dias_semana || [],
  diasPorSemana: r.dias_por_semana,
  diasRotativos: r.dias_rotativos,
  fechasTrabajadas: r.fechas_trabajadas || [],
  workdaysCount: r.cantidad_jornadas_laborales,
  dailyRate: r.sueldo_jornada,
  areaShiftAssignments: r.areaShiftAssignments || [],
  isReplacement: !!r.reemplazo,
  nombre_reemplazado: r.nombre_reemplazado,
  empleado_id_reemplezado: r.empleado_id_reemplezado,
});

interface Props {
  isOpen: boolean;
  onClose: () => void;
  record: ContractOverviewRow | null;
  contratoFrames: ContratoFrameItem[];
  allEstados: InfoItem[];
  onEditar: (r: ContractOverviewRow) => void;
  onEliminar: (r: ContractOverviewRow) => void;
  /** Todos los contratos de la persona (lo que antes abría el clic de la fila en la pestaña Contratos). */
  onVerTodos?: (r: ContractOverviewRow) => void;
  /** Sólo desde Alta temprana de ARCA: el estado de los datos y «Forzar Alta A.R.C.A». */
  arca?: ArcaDelContrato;
}

export const ContratoDetalleModal: React.FC<Props> = ({ isOpen, onClose, record, contratoFrames, allEstados, onEditar, onEliminar, onVerTodos, arca }) => {
  const catalogos = useCatalogosDeSolicitudes();
  const estadoImpositivo = useMemo(() => (record ? estadoImpositivoDelContrato(record as unknown as Contract, contratoFrames, allEstados) : null), [record, contratoFrames, allEstados]);
  const m = useMemo(() => (record ? metadataDelContrato(record, estadoImpositivo?.data?.tipoImpositivo) : null), [record, estadoImpositivo]);
  if (!record || !m) return null;

  const vigente = isContractVigente(record.fecha_alta_contrato, record.fecha_baja_contrato);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      // Más ancho que el de Solicitudes: el pie lleva hasta seis botones y tienen que entrar en una fila.
      size="xl"
      title={
        <span className="flex items-center gap-2">
          {record.userName || "Contrato"}
          {record.esRenovacion && <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Renovación</span>}
        </span>
      }
      subtitle={`Contrato${record.nombre_contrato ? ` ${record.nombre_contrato}` : ""}${record.fecha_carga ? ` · cargado el ${formatDate(record.fecha_carga)}` : ""}`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 shrink-0">
            {record.nombre_estado_empleado ? <EstadoBadge name={record.nombre_estado_empleado} className="text-[11px]" /> : null}
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-bold ${vigente ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{vigente ? "VIGENTE" : "NO VIGENTE"}</span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button onClick={onClose} className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
              Cerrar
            </button>
            {onVerTodos && (
              <button onClick={() => onVerTodos(record)} className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2" title="Todos los contratos de la persona, en cualquier proyecto">
                <FontAwesomeIcon icon={faFileContract} className="text-[11px]" />
                Todos sus contratos
              </button>
            )}
            {arca?.onPresentar && (
              <button
                onClick={() => {
                  onClose();
                  arca.onPresentar!();
                }}
                disabled={!!arca.presentarDeshabilitado}
                title={arca.presentarDeshabilitado || `Presentar sólo a ${record.userName} en ARCA`}
                className="px-3 py-2 text-sm font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <FontAwesomeIcon icon={faBolt} className="text-[11px]" />
                Forzar Alta A.R.C.A
              </button>
            )}
            <button onClick={() => onEliminar(record)} className="px-3 py-2 text-sm font-medium rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
              <FontAwesomeIcon icon={faTrash} className="text-[11px]" />
              Eliminar
            </button>
            <button onClick={() => onEditar(record)} className="px-3 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm flex items-center gap-2">
              <FontAwesomeIcon icon={faEdit} className="text-[11px]" />
              Editar
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Lo que escribió quien pidió el alta, si el contrato salió de una solicitud. */}
        {record.solicitudComentarios && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
            <p className="flex items-start gap-2">
              <FontAwesomeIcon icon={faCommentDots} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-pre-wrap">{record.solicitudComentarios}</span>
            </p>
          </div>
        )}

        <ResumenDelAlta
          m={m}
          catalogos={catalogos}
          proyectos={[{ _id: record.projectId, name: record.projectName, clienteNombre: record.clientName || undefined }]}
          persona={<span className="font-mono">{cuitDisplay(record.cuit, record.sinCuit) || "—"}</span>}
          tramite={estadoImpositivo}
          filasContrato={
            <>
              <Fila label="Estado del contrato" valor={record.nombre_estado_empleado ? <EstadoBadge name={record.nombre_estado_empleado} /> : ""} />
              <Fila label="Sede" valor={record.nombre_sede} />
              {/* El badge abre el detalle de los datos ARCA de la pestaña, como en la columna Acciones. */}
              {arca && (
                <Fila
                  label="Datos ARCA"
                  valor={
                    <BadgeArca
                      result={arca.result}
                      onClick={() => {
                        onClose();
                        arca.onVerDatos();
                      }}
                    />
                  }
                />
              )}
              {record.solicitante?.nombre && <Fila label="Solicitó" valor={record.solicitante.nombre} />}
            </>
          }
        />
      </div>
    </Modal>
  );
};
