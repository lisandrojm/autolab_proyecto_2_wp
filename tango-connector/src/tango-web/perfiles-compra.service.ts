import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorConnector } from '../comun/errores';
import { SesionesWebService } from './sesiones-web.service';

/** El asistente de comprobantes de compra por AI: la web elige ahí el perfil de factura. */
const PROCESO_ASISTENTE = '21508';

export interface PerfilResumen {
  /** `ID_CPA128`. */
  id: number;
  /** `COD_PERFIL`, p. ej. `002`. */
  codigo: string;
  descripcion: string;
}

/** El perfil completo: la fila de `CPA128` tal cual la usa la web (118 campos). */
export type PerfilCompleto = Record<string, unknown> & { ID_CPA128: number; COD_PERFIL: string; DESCRIPCIO: string };

interface RespuestaPerfiles {
  profiles?: { key: number; displayLabel: string }[];
  succeeded?: boolean;
}

interface RespuestaFormulario {
  wizardGlobalContext?: { PERFIL_USUARIO?: PerfilCompleto } | null;
}

/** `001 - FACTURA CONTADO` → { codigo: '001', descripcion: 'FACTURA CONTADO' } */
export function separarEtiqueta(etiqueta: string): { codigo: string; descripcion: string } {
  const i = etiqueta.indexOf(' - ');
  return i < 0 ? { codigo: '', descripcion: etiqueta.trim() } : { codigo: etiqueta.slice(0, i).trim(), descripcion: etiqueta.slice(i + 3).trim() };
}

function cambio(detalle: string): ErrorConnector {
  return new ErrorConnector(HttpStatus.BAD_GATEWAY, 'La web de Tango cambió: el connector no la entiende', [
    detalle,
    'Correr los tests de contrato (npm run test:contrato) y ajustar el connector',
  ]);
}

/**
 * Perfiles de factura de compra (`CPA128`, proceso 27). No están en la API pública: se leen de
 * la web, como lo hace el administrador de comprobantes por AI (docs/tango/perfiles-factura-compra.md).
 */
@Injectable()
export class PerfilesCompraService {
  constructor(private readonly web: SesionesWebService) {}

  async listar(tenant: string, companyId: number): Promise<PerfilResumen[]> {
    const r = await this.web.pedir<RespuestaPerfiles>(tenant, companyId, 'GET', `/processresolver/getprofiles?action=${PROCESO_ASISTENTE}`);
    if (!Array.isArray(r?.profiles)) throw cambio('getprofiles ya no devuelve "profiles"');
    return r.profiles.map((p) => {
      if (typeof p.key !== 'number' || typeof p.displayLabel !== 'string') throw cambio('getprofiles cambió la forma de cada perfil');
      return { id: p.key, ...separarEtiqueta(p.displayLabel) };
    });
  }

  async obtener(tenant: string, companyId: number, id: number): Promise<PerfilCompleto> {
    // Los IDs de CPA128 son positivos. Con 0, Tango devuelve la plantilla vacía (ID_CPA128: 0)
    // y parecería un perfil válido.
    if (id <= 0) throw new ErrorConnector(HttpStatus.NOT_FOUND, `No existe el perfil de factura de compra ${id}`);
    const r = await this.web.pedir<RespuestaFormulario>(tenant, companyId, 'POST', '/processresolver/formdefinition', {
      action: PROCESO_ASISTENTE,
      context: { selectedProfileId: id, companyId },
    });
    const perfil = r?.wizardGlobalContext?.PERFIL_USUARIO;
    if (perfil?.ID_CPA128 === id) return perfil;

    // Con un ID que no existe, Tango devuelve una plantilla vacía (ID_CPA128: 0, todo null).
    // Sin perfil o con otro ID: o el ID no existe, o Tango cambió la respuesta. La lista lo distingue.
    const existe = (await this.listar(tenant, companyId)).some((p) => p.id === id);
    if (!existe) throw new ErrorConnector(HttpStatus.NOT_FOUND, `No existe el perfil de factura de compra ${id}`);
    throw cambio(
      perfil
        ? `formdefinition devolvió el perfil ${String(perfil.ID_CPA128)} en lugar del ${id}`
        : 'formdefinition ya no trae wizardGlobalContext.PERFIL_USUARIO',
    );
  }
}
