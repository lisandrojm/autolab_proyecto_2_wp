import React, { useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faXmark } from '@fortawesome/free-solid-svg-icons';
import { companiesAPI, Company, TipoVinculoArca } from '../../api/companies';
import { sweetAlert } from '../../utils/sweetAlert';

/**
 * QUÉ EMPRESAS TIENEN REGISTRADO ESTE ÍTEM — desde el ítem, no desde cada ficha.
 *
 * Es el bloque que ya tenía el formulario de Convenios, extraído para que Domicilios de Explotación
 * y Obras Sociales funcionen igual. Antes, para dar de alta un domicilio en las cinco empresas que lo
 * usan había que entrar a cinco fichas; el convenio se resolvía en una pantalla y el domicilio en
 * otra, con dos gestos distintos para la misma clase de decisión.
 *
 * SOLO PARA LO QUE ARCA DECLARA POR CUIT. Convenios, domicilios y obras sociales son «Datos del
 * Empleador»: el organismo acepta un alta únicamente si ESE CUIT los tiene registrados. Los tipos de
 * servicio, los grupos y las modalidades son tablas universales, iguales para todos los CUIT, y
 * vincularlas a una empresa no significaría nada ante el organismo.
 *
 * GUARDA CONTRA UN ENDPOINT QUE LIMPIA LO QUE COLGABA DEL VÍNCULO. La versión de Convenios llamaba a
 * `companiesAPI.update` por empresa y no tocaba el resto: quitarle el convenio a una empleadora que
 * lo tenía marcado por defecto dejaba ese default apuntando a algo que ya no estaba registrado, y el
 * alta se precargaba con un dato que ARCA rechaza. Ver `PUT /companies/vinculos`.
 */

interface Props {
  tipo: TipoVinculoArca;
  /** `_id` del ítem del nomenclador. */
  itemId: string;
  /** Cómo se llama, para las etiquetas accesibles y el aviso. */
  itemLabel: string;
  /** Todas las empresas del sistema. */
  empresas: Company[];
  /** Las que hoy lo tienen registrado. */
  asignadas: string[];
  /** Se llama después de guardar, para que la pantalla recargue empresas y conteos. */
  onGuardado: () => void | Promise<void>;
  /**
   * A quién alcanza QUITARLE este ítem a esa empresa. Devolver texto pide confirmación; `null` sigue.
   *
   * Existe porque desvincular no rompe nada en el momento: rompe DESPUÉS, cuando los contratos de esa
   * empleadora generen el TXT y ARCA los rechace por declarar algo que ese CUIT ya no tiene
   * registrado. El número tiene que aparecer ANTES de la baja, no como un error posterior.
   */
  confirmarQuitar?: (empresa: Company) => Promise<string | null>;
}

/** A partir de cuántas empresas aparece el buscador. Con pocas, filtrar es más trabajo que mirar. */
const DESDE_CUANTAS_SE_BUSCA = 8;

export const EmpresasDelItemArca: React.FC<Props> = ({ tipo, itemId, itemLabel, empresas, asignadas, onGuardado, confirmarQuitar }) => {
  const [guardando, setGuardando] = useState('');
  const [q, setQ] = useState('');

  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase();
    if (!texto) return empresas;
    return empresas.filter((e) => `${e.razonSocial} ${e.cuit || ''}`.toLowerCase().includes(texto));
  }, [empresas, q]);

  const alternar = async (empresa: Company, tiene: boolean) => {
    if (tiene && confirmarQuitar) {
      const aviso = await confirmarQuitar(empresa);
      if (aviso) {
        const r = await sweetAlert.confirm(`¿Quitárselo a ${empresa.razonSocial}?`, aviso, 'Sí, quitarlo');
        if (!r.isConfirmed) return;
      }
    }
    setGuardando(empresa._id);
    try {
      // Se manda la lista COMPLETA de las que quedan: así el server sabe a cuáles se les quitó y
      // puede limpiarles el default y las actividades que colgaban de ese vínculo.
      const nuevas = tiene ? asignadas.filter((x) => x !== empresa._id) : [...asignadas, empresa._id];
      const r = await companiesAPI.setVinculos(tipo, itemId, nuevas);
      await onGuardado();
      const extra = r.limpiezas > 0 ? ' Se le quitó también el valor por defecto, que era éste.' : '';
      sweetAlert.success('Guardado', `${tiene ? 'Se quitó' : 'Se registró'} ${itemLabel} en ${empresa.razonSocial}.${extra}`);
    } catch (err: any) {
      sweetAlert.error('Error', err?.response?.data?.error || 'No se pudo cambiar la empresa.');
    } finally {
      setGuardando('');
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-gray-500 dark:text-gray-400">ARCA solo acepta un alta si la empleadora lo tiene registrado en su padrón. Esto refleja cuáles lo tienen; hay que haberlo declarado ante el organismo con cada CUIT.</p>

      {empresas.length >= DESDE_CUANTAS_SE_BUSCA && (
        <div className="relative">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por razón social o CUIT..." className="w-full pl-9 pr-8 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200" />
          {q && (
            <button type="button" onClick={() => setQ('')} title="Limpiar la búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
              <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60">
        {visibles.length === 0 ? (
          <p className="px-3 py-4 text-xs text-gray-400 italic">No hay ninguna empresa que coincida.</p>
        ) : (
          visibles.map((e) => {
            const tiene = asignadas.includes(e._id);
            return (
              <div key={e._id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block text-sm text-gray-800 dark:text-gray-200 truncate">{e.razonSocial}</span>
                  <span className="block text-[11px] font-mono text-gray-400">{e.cuit || '—'}</span>
                </span>
                {/* Mismo switch que el resto de la app: un check se lee como «seleccionar de una
                    lista» y esto es prender o apagar una relación. */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={tiene}
                  aria-label={`${tiene ? 'Quitar' : 'Registrar'} ${itemLabel} en ${e.razonSocial}`}
                  disabled={guardando === e._id}
                  onClick={() => alternar(e, tiene)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${tiene ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${tiene ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
