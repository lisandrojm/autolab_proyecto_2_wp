import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation, faSpinner, faTrash } from '@fortawesome/free-solid-svg-icons';
import { ContractOverviewRow } from '../../api/users';
import { Company } from '../../api/companies';
import { projectsAPI } from '../../api/projects';
import { sweetAlert } from '../../utils/sweetAlert';
import { PickerArca } from './PickerArca';
import { InfoCampo } from './DatosArcaDetalle';

/**
 * Banda de empleador, copiada de la cabecera del formulario de ARCA.
 *
 * La empleadora estaba suelta arriba como un campo más del alta, y no lo es: en ARCA es el CONTEXTO
 * de toda la pantalla. Esa jerarquía es la correcta y además explica la mitad de la UI — define qué
 * sucursales, qué convenios y qué obras sociales se pueden elegir abajo.
 *
 * El CUIT va sí o sí: es lo primero que mira el operador para confirmar que está parado en la
 * empleadora correcta, y es lo que decide en qué archivo cae la persona.
 */
export const BandaEmpleador: React.FC<{
  row: ContractOverviewRow;
  empresas: Company[];
  /** Cantidades de lo que esa empleadora tiene registrado ante ARCA. */
  convenios: number;
  domicilios: number;
  onGuardado: (patch?: Partial<ContractOverviewRow>) => void;
}> = ({ row, empresas, convenios, domicilios, onGuardado }) => {
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const opciones = row.contratoEmpresas || [];
  const elegida = row.empresaContratoId || '';
  const empresa = empresas.find((e) => e._id === elegida);
  const nombre = empresa?.razonSocial || row.nombre_empresa_contrato || '';

  const guardar = async (empresaId: string) => {
    setGuardando(true);
    try {
      const res = await projectsAPI.updateContratoEmpresa(row.projectId, row.userId, row.contractIndex, empresaId);
      onGuardado({ empresaContratoId: res.empresaContratoId || '', nombre_empresa_contrato: res.nombre_empresa_contrato || '' });
      setAbierto(false);
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo guardar la empresa.');
    } finally {
      setGuardando(false);
    }
  };

  /**
   * Quitar la empleadora. Se confirma porque arrastra: sin ella, la Sucursal y la Actividad dejan de
   * poder resolverse (sus opciones salen del padrón de ESE CUIT).
   *
   * Lo elegido NO se borra del contrato: si se vuelve a elegir la misma empleadora, la sucursal y la
   * actividad reaparecen. Si se elige otra, el checklist marca la sucursal como "mal cargada" en vez
   * de arrastrarla en silencio a un alta de la empresa equivocada.
   */
  const quitar = async () => {
    const r = await sweetAlert.confirm('¿Quitar la empleadora?', `Se va a desasignar ${nombre || 'la empresa'} de este contrato. La Sucursal y la Actividad quedan en espera hasta que elijas otra.`, 'Sí, quitar');
    if (!r.isConfirmed) return;
    await guardar('');
  };

  const dato = (rotulo: string, valor: React.ReactNode) => (
    <div className="min-w-0">
      <span className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">{rotulo}</span>
      <span className="block text-[12.5px] text-gray-800 dark:text-gray-200 truncate">{valor}</span>
    </div>
  );

  return (
    <>
      <div className={`rounded-lg border px-3 py-2.5 ${elegida ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40' : 'border-amber-400 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-950/20'}`}>
        {elegida ? (
          <div className="flex items-start gap-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-2 flex-1 min-w-0">
              {dato(
                'Empleador',
              <span className="flex items-center gap-2 min-w-0">
                <span className="truncate font-medium">{nombre}</span>
                <button type="button" onClick={() => setAbierto(true)} className="shrink-0 text-[11px] text-blue-600 dark:text-blue-400 hover:underline">
                  cambiar
                </button>
                <InfoCampo campo="empresa" />
              </span>,
            )}
              {dato('CUIT', <span className="font-mono">{empresa?.cuit || '—'}</span>)}
              {dato('Convenios registrados', convenios > 0 ? convenios : <span className="text-amber-600 dark:text-amber-400">sin cargar</span>)}
              {dato('Domicilios', domicilios > 0 ? domicilios : <span className="text-amber-600 dark:text-amber-400">sin cargar</span>)}
            </div>
            <button
              type="button"
              onClick={quitar}
              disabled={guardando}
              title="Quitar la empleadora de este contrato"
              aria-label="Quitar la empleadora de este contrato"
              className="shrink-0 p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            >
              <FontAwesomeIcon icon={guardando ? faSpinner : faTrash} spin={guardando} className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-start gap-2 min-w-0">
              <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
              <span className="min-w-0">
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
                  Falta elegir la empleadora
                  <InfoCampo campo="empresa" situacion="Este contrato todavía no tiene empleadora asignada. Elegila con «Elegir empleadora»: es el primer dato del alta." estado="falta" />
                </span>
              </span>
            </span>
            <button type="button" onClick={() => setAbierto(true)} disabled={guardando} className="shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-[12.5px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {guardando && <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" />}
              Elegir empleadora
            </button>
          </div>
        )}
      </div>

      <PickerArca
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        titulo="Empleadora del contrato"
        subtitulo="Las empresas habilitadas en este proyecto. El TXT se sube dentro de la sesión de ARCA de una sola, y el organismo atribuye el alta al CUIT con el que estás logueado."
        opciones={opciones.map((e) => {
          const c = empresas.find((x) => x._id === e.id);
          return { codigo: c?.cuit || '—', nombre: c?.razonSocial || e.label };
        })}
        valor={empresa?.cuit}
        guardando={guardando}
        onElegir={(o) => {
          const c = empresas.find((x) => (x.cuit || '—') === o.codigo && x.razonSocial === o.nombre);
          const id = c?._id || opciones.find((e) => e.label === o.nombre)?.id;
          if (id) guardar(id);
        }}
        vacio={<>El proyecto no tiene empresas configuradas para Contrato. Asignáselas en el proyecto y volvé acá.</>}
      />
    </>
  );
};
