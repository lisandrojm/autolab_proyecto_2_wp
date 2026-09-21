import React, { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faPlus, faTrash, faSave, faCircleInfo, faToggleOn, faToggleOff } from '@fortawesome/free-solid-svg-icons';
import { liquidacionAPI, ConceptoMemosoft } from '../../api/liquidacion';
import { companiesAPI } from '../../api/companies';
import { sweetAlert } from '../../utils/sweetAlert';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL CATÁLOGO DE CONCEPTOS DE MEMOSOFT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cada fila dice, para un código, CUÁL de los dos parámetros usa y si lo que va ahí son días u
 * horas o pesos. Es lo que evita el error que no se ve: un 0012 con un 3 en la columna de importe
 * entra en Memosoft como tres PESOS de licencia por enfermedad en vez de tres DÍAS.
 *
 * ES POR EMPRESA. Los códigos de 2030 y FZERO no son un estándar de Memosoft: otra empresa tiene
 * los suyos, y el mismo número puede significar otra cosa.
 *
 * EL CÓDIGO NO SE EDITA. Es la identidad del concepto y los mapeos ya guardados lo referencian por
 * ahí. Para corregir uno se desactiva el viejo y se crea el nuevo.
 */

type Empresa = { _id: string; razonSocial: string };

const selectClass =
  'text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500';
const inputClass = `${selectClass} w-full`;

const vacio = (empresaId: string): Partial<ConceptoMemosoft> => ({
  empresaId,
  codigo: '',
  descripcion: '',
  usaPar1: true,
  usaPar2: false,
  unidadPar1: 'cantidad',
  unidadPar2: null,
  activo: true,
});

export const ConceptosMemosoft: React.FC = () => {
  const [cargando, setCargando] = useState(true);
  const [conceptos, setConceptos] = useState<ConceptoMemosoft[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState('');
  const [nuevo, setNuevo] = useState<Partial<ConceptoMemosoft> | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  const recargar = async () => {
    setConceptos(await liquidacionAPI.getConceptos());
  };

  useEffect(() => {
    (async () => {
      try {
        const [lista, listaEmpresas] = await Promise.all([
          liquidacionAPI.getConceptos(),
          companiesAPI.list({ slim: true }).catch(() => [] as any[]),
        ]);
        setConceptos(lista);
        const emps = (listaEmpresas || []).map((e: any) => ({ _id: e._id, razonSocial: e.razonSocial }));
        setEmpresas(emps);
        setEmpresaId(emps[0]?._id || '');
      } catch (error) {
        console.error(error);
        sweetAlert.error('Error', 'No se pudo cargar el catálogo de conceptos.');
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const deLaEmpresa = useMemo(
    () => conceptos.filter((c) => String(c.empresaId) === empresaId).sort((a, b) => a.codigo.localeCompare(b.codigo)),
    [conceptos, empresaId],
  );

  const cambiar = async (c: ConceptoMemosoft, cambio: Partial<ConceptoMemosoft>) => {
    setGuardando(c._id);
    try {
      const actualizado = await liquidacionAPI.actualizarConcepto(c._id, cambio);
      setConceptos((lista) => lista.map((x) => (x._id === c._id ? actualizado : x)));
    } catch (error: any) {
      sweetAlert.error('Error', error?.response?.data?.error || 'No se pudo guardar el concepto.');
    } finally {
      setGuardando(null);
    }
  };

  const crear = async () => {
    if (!nuevo?.codigo || !nuevo?.descripcion) {
      sweetAlert.error('Faltan datos', 'El código y la descripción son obligatorios.');
      return;
    }
    setGuardando('nuevo');
    try {
      await liquidacionAPI.crearConcepto({ ...nuevo, empresaId } as any);
      await recargar();
      setNuevo(null);
    } catch (error: any) {
      sweetAlert.error('Error', error?.response?.data?.error || 'No se pudo crear el concepto.');
    } finally {
      setGuardando(null);
    }
  };

  const borrar = async (c: ConceptoMemosoft) => {
    const confirmado = await sweetAlert.confirm('¿Borrar el concepto?', `${c.codigo} · ${c.descripcion}`);
    if (!confirmado?.isConfirmed) return;
    try {
      await liquidacionAPI.borrarConcepto(c._id);
      setConceptos((lista) => lista.filter((x) => x._id !== c._id));
    } catch (error: any) {
      // El server no deja borrar uno que algún motivo usa, y el mensaje dice cuántos y qué hacer.
      const datos = error?.response?.data;
      sweetAlert.error('No se puede borrar', [datos?.error, datos?.ayuda].filter(Boolean).join(' ') || 'No se pudo borrar.');
    }
  };

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">
        <FontAwesomeIcon icon={faSpinner} spin className="mr-2" /> Cargando el catálogo…
      </div>
    );
  }

  const filaEditable = (c: Partial<ConceptoMemosoft>, esNuevo: boolean, onCambio: (x: Partial<ConceptoMemosoft>) => void) => (
    <>
      <td className="px-2 py-1.5">
        {esNuevo ? (
          <input className={`${inputClass} w-20 font-mono`} placeholder="0017" value={c.codigo || ''} onChange={(e) => onCambio({ codigo: e.target.value })} />
        ) : (
          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">{c.codigo}</span>
        )}
      </td>
      <td className="px-2 py-1.5">
        <input className={inputClass} placeholder="Descripción" value={c.descripcion || ''} onChange={(e) => onCambio({ descripcion: e.target.value })} />
      </td>
      <td className="px-2 py-1.5 text-center">
        <input type="checkbox" checked={!!c.usaPar1} onChange={(e) => onCambio({ usaPar1: e.target.checked, unidadPar1: e.target.checked ? c.unidadPar1 || 'cantidad' : null })} />
      </td>
      <td className="px-2 py-1.5">
        <select className={selectClass} disabled={!c.usaPar1} value={c.unidadPar1 || ''} onChange={(e) => onCambio({ unidadPar1: (e.target.value || null) as any })}>
          <option value="cantidad">cantidad</option>
          <option value="importe">importe</option>
        </select>
      </td>
      <td className="px-2 py-1.5 text-center">
        <input type="checkbox" checked={!!c.usaPar2} onChange={(e) => onCambio({ usaPar2: e.target.checked, unidadPar2: e.target.checked ? c.unidadPar2 || 'cantidad' : null })} />
      </td>
      <td className="px-2 py-1.5">
        <select className={selectClass} disabled={!c.usaPar2} value={c.unidadPar2 || ''} onChange={(e) => onCambio({ unidadPar2: (e.target.value || null) as any })}>
          <option value="cantidad">cantidad</option>
          <option value="importe">importe</option>
        </select>
      </td>
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <FontAwesomeIcon icon={faCircleInfo} className="text-blue-500 mt-0.5" />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Para cada código, cuál de los dos parámetros usa y qué significa el número que va ahí. Es lo que evita que un día
          termine cargado como un peso. <strong>El catálogo es por empresa</strong>: los códigos no son un estándar de Memosoft.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-gray-600 dark:text-gray-300">
          <span className="block mb-1">Empresa</span>
          <select className={selectClass} value={empresaId} onChange={(e) => { setEmpresaId(e.target.value); setNuevo(null); }}>
            {empresas.map((e) => (
              <option key={e._id} value={e._id}>{e.razonSocial}</option>
            ))}
          </select>
        </label>

        <button
          onClick={() => setNuevo(vacio(empresaId))}
          disabled={!empresaId || nuevo !== null}
          className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
        >
          <FontAwesomeIcon icon={faPlus} className="mr-1.5" />
          Agregar concepto
        </button>

        <span className="text-xs text-gray-400 dark:text-gray-500">{deLaEmpresa.length} conceptos</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-2 py-2 text-left font-semibold">Código</th>
              <th className="px-2 py-2 text-left font-semibold">Descripción</th>
              <th className="px-2 py-2 font-semibold">¿par1?</th>
              <th className="px-2 py-2 text-left font-semibold">Unidad par1</th>
              <th className="px-2 py-2 font-semibold">¿par2?</th>
              <th className="px-2 py-2 text-left font-semibold">Unidad par2</th>
              <th className="px-2 py-2 font-semibold">Activo</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {nuevo && (
              <tr className="bg-blue-50/60 dark:bg-blue-900/10 border-b border-gray-100 dark:border-gray-800">
                {filaEditable(nuevo, true, (x) => setNuevo({ ...nuevo, ...x }))}
                <td className="px-2 py-1.5 text-center">—</td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <button onClick={crear} disabled={guardando === 'nuevo'} className="text-xs px-2 py-1 rounded bg-green-600 hover:bg-green-700 text-white disabled:opacity-50">
                    <FontAwesomeIcon icon={guardando === 'nuevo' ? faSpinner : faSave} spin={guardando === 'nuevo'} />
                  </button>
                  <button onClick={() => setNuevo(null)} className="ml-1 text-xs px-2 py-1 text-gray-500 hover:text-gray-700 dark:text-gray-400">
                    Cancelar
                  </button>
                </td>
              </tr>
            )}

            {deLaEmpresa.map((c) => (
              <tr key={c._id} className={`border-b border-gray-100 dark:border-gray-800 ${c.activo ? '' : 'opacity-50'}`}>
                {filaEditable(c, false, (x) => cambiar(c, x))}
                <td className="px-2 py-1.5 text-center">
                  <button onClick={() => cambiar(c, { activo: !c.activo })} title={c.activo ? 'Desactivar' : 'Activar'}>
                    <FontAwesomeIcon icon={c.activo ? faToggleOn : faToggleOff} className={c.activo ? 'text-green-600' : 'text-gray-400'} />
                  </button>
                </td>
                <td className="px-2 py-1.5 text-center whitespace-nowrap">
                  {guardando === c._id ? (
                    <FontAwesomeIcon icon={faSpinner} spin className="text-gray-400" />
                  ) : (
                    <button onClick={() => borrar(c)} className="text-red-500 hover:text-red-600" title="Borrar">
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  )}
                </td>
              </tr>
            ))}

            {deLaEmpresa.length === 0 && !nuevo && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-400 dark:text-gray-500">
                  Esta empresa no tiene conceptos cargados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
