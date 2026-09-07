import { useState } from 'react';
import { companiesAPI, Company } from '../../api/companies';
import { useEmpresaContextStore } from '../../stores/empresaContextStore';
import { sweetAlert } from '../../utils/sweetAlert';

/**
 * Guarda un parche en la empresa y refresca el contexto (el nav muestra sus datos).
 *
 * Vivía dentro de `pages/empresa/EmpresaArcaPages.tsx`. Se extrajo cuando las pantallas de default
 * por ítem pasaron a ser un componente aparte: importarlo desde ahí habría cerrado un ciclo, porque
 * la página también importa al componente.
 */
export const useGuardarEmpresa = (empresa: Company, recargar: () => Promise<void>) => {
  const { refreshSelectedEmpresa } = useEmpresaContextStore();
  const [guardando, setGuardando] = useState(false);
  const guardar = async (patch: Partial<Company>, mensaje: string) => {
    setGuardando(true);
    try {
      await companiesAPI.update(empresa._id, patch as any);
      await recargar();
      await refreshSelectedEmpresa();
      window.dispatchEvent(new Event('empresasChanged'));
      sweetAlert.success('Guardado', mensaje);
      return true;
    } catch (error: any) {
      sweetAlert.error('Error', error?.response?.data?.error || 'No se pudo guardar');
      return false;
    } finally {
      setGuardando(false);
    }
  };
  return { guardar, guardando };
};
