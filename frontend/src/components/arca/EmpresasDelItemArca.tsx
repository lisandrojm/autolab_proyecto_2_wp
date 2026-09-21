import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faXmark } from '@fortawesome/free-solid-svg-icons';
import { companiesAPI, Company, TipoVinculoArca, CAMPO_IDS_DE_VINCULO } from '../../api/companies';
import { Modal } from '../ui/Modal';
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

  /** Lo que se ve ahora: con el buscador puesto, las acciones en masa operan sobre eso y no sobre todo. */
  const visiblesAsignadas = visibles.filter((e) => asignadas.includes(e._id));
  const visiblesSinAsignar = visibles.filter((e) => !asignadas.includes(e._id));
  const filtrando = q.trim().length > 0;
  /** Cualquier acción en masa bloquea todos los switches, no uno. */
  const TODAS = '__todas__';

  /**
   * REGISTRARLO EN TODAS DE UNA. Una sola llamada, no una por empresa: `setVinculos` ya recibe la
   * lista completa de las que quedan, así que mandar el conjunto entero es un request y un estado
   * consistente, en vez de N requests que pueden cortarse por la mitad.
   */
  const registrarEnTodas = async () => {
    if (visiblesSinAsignar.length === 0) return;
    setGuardando(TODAS);
    try {
      const nuevas = [...new Set([...asignadas, ...visiblesSinAsignar.map((e) => e._id)])];
      const r = await companiesAPI.setVinculos(tipo, itemId, nuevas);
      await onGuardado();
      const extra = r.limpiezas > 0 ? ' Se limpiaron valores por defecto que ya no correspondían.' : '';
      sweetAlert.success('Guardado', `Se registró ${itemLabel} en ${visiblesSinAsignar.length} empresa(s).${extra}`);
    } catch (err: any) {
      sweetAlert.error('Error', err?.response?.data?.error || 'No se pudo registrar en todas las empresas.');
    } finally {
      setGuardando('');
    }
  };

  /**
   * QUITARLO DE TODAS. Va con UNA confirmación que junta los avisos de cada empresa, no con una por
   * empresa: encadenar diez diálogos se contesta que sí sin leer ninguno, que es justo lo contrario
   * de para qué está el aviso. Y el aviso importa: desvincular no rompe nada hoy, rompe cuando esos
   * contratos generen el TXT y ARCA los rechace.
   */
  const quitarDeTodas = async () => {
    if (visiblesAsignadas.length === 0) return;

    if (confirmarQuitar) {
      // Texto plano con saltos de línea: `sweetAlert.confirm` usa `text`, no `html`, así que
      // cualquier etiqueta se vería literal.
      const avisos: string[] = [];
      for (const empresa of visiblesAsignadas) {
        const aviso = await confirmarQuitar(empresa);
        if (aviso) avisos.push(`${empresa.razonSocial}: ${aviso}`);
      }
      const detalle = avisos.length > 0 ? avisos.join('\n') : `Se le quitará a: ${visiblesAsignadas.map((e) => e.razonSocial).join(', ')}.`;
      const r = await sweetAlert.confirm(`¿Quitárselo a ${visiblesAsignadas.length} empresa(s)?`, detalle, 'Sí, quitarlo');
      if (!r.isConfirmed) return;
    }

    setGuardando(TODAS);
    try {
      const aQuitar = new Set(visiblesAsignadas.map((e) => e._id));
      const nuevas = asignadas.filter((x) => !aQuitar.has(x));
      const r = await companiesAPI.setVinculos(tipo, itemId, nuevas);
      await onGuardado();
      const extra = r.limpiezas > 0 ? ' Se quitaron también los valores por defecto que eran éste.' : '';
      sweetAlert.success('Guardado', `Se quitó ${itemLabel} de ${aQuitar.size} empresa(s).${extra}`);
    } catch (err: any) {
      sweetAlert.error('Error', err?.response?.data?.error || 'No se pudo quitar de todas las empresas.');
    } finally {
      setGuardando('');
    }
  };

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

      {/*
        EL CONTEO Y LAS DOS ACCIONES EN MASA.

        «Seleccionar todas» es el gesto habitual —un ítem que se declara ante todas las empleadoras—
        y hacerlo switch por switch son diez clicks y diez requests. «Quitar todas» va al lado porque
        es la misma operación al revés, pero pide confirmación: dar de alta de más no rompe nada, dar
        de baja sí (ver `quitarDeTodas`).

        Cada botón aparece sólo cuando tiene algo para hacer: con todas prendidas, «Seleccionar
        todas» no haría nada y ofrecerlo es prometer un cambio que no ocurre.
      */}
      {visibles.length > 0 && (
        <div className="flex items-center justify-between gap-3 px-1">
          <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
            {visiblesAsignadas.length} de {visibles.length}
            {filtrando && ' (filtradas)'}
          </span>
          <div className="flex items-center gap-3">
            {visiblesSinAsignar.length > 0 && (
              <button
                type="button"
                onClick={registrarEnTodas}
                disabled={!!guardando}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2 disabled:opacity-50"
              >
                {filtrando ? `Seleccionar las ${visiblesSinAsignar.length} filtradas` : 'Seleccionar todas'}
              </button>
            )}
            {visiblesAsignadas.length > 0 && (
              <button
                type="button"
                onClick={quitarDeTodas}
                disabled={!!guardando}
                className="text-[11px] font-semibold text-gray-400 hover:text-red-500 underline underline-offset-2 disabled:opacity-50"
              >
                {filtrando ? 'Quitar las filtradas' : 'Quitar todas'}
              </button>
            )}
          </div>
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
                    lista» y esto es prender o apagar una relación.

                    Se deshabilita con CUALQUIER guardado en curso, no sólo el suyo: cada cambio
                    manda la lista completa de vínculos, así que dos a la vez se pisarían. */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={tiene}
                  aria-label={`${tiene ? 'Quitar' : 'Registrar'} ${itemLabel} en ${e.razonSocial}`}
                  disabled={!!guardando}
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

/**
 * LAS EMPRESAS DE UN CATÁLOGO, PARA TODA UNA PANTALLA.
 *
 * Cada nomenclador necesita lo mismo: la lista de empresas, saber cuáles tienen ESTE ítem, y poder
 * recargar después de un cambio. Repetirlo en cada página dejaba seis copias del mismo `useEffect`
 * y seis formas distintas de olvidarse de recargar el conteo después de guardar.
 */
export const useVinculoArca = (tipo: TipoVinculoArca) => {
  const [empresas, setEmpresas] = useState<Company[]>([]);
  const recargar = useCallback(async () => {
    setEmpresas(await companiesAPI.list().catch(() => []));
  }, []);
  useEffect(() => {
    void recargar();
  }, [recargar]);

  const campo = CAMPO_IDS_DE_VINCULO[tipo];
  /** Las empresas que tienen ese ítem, por `_id`. */
  const asignadasDe = useCallback((itemId: string) => empresas.filter((e) => ((e[campo] as string[] | undefined) || []).map(String).includes(itemId)).map((e) => e._id), [empresas, campo]);

  return { empresas, recargar, asignadasDe };
};

/**
 * La celda de la columna «Empresas»: el conteo, y detrás los switches para cambiarlo.
 *
 * En Convenios el número abría un modal de SOLO LECTURA y para editar había que ir al formulario del
 * ítem: dos caminos para lo mismo, y el que estaba a mano no servía. Acá el número es el editor —se
 * ve cuántas son y se cambia en el mismo gesto—, que es lo que se viene a hacer mirando esa columna.
 */
export const ColumnaEmpresasArca: React.FC<{
  tipo: TipoVinculoArca;
  itemId: string;
  itemLabel: string;
  empresas: Company[];
  asignadas: string[];
  onGuardado: () => void | Promise<void>;
}> = ({ tipo, itemId, itemLabel, empresas, asignadas, onGuardado }) => {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAbierto(true);
        }}
        title={`${asignadas.length} de ${empresas.length} empresa(s) lo usan. Click para cambiarlo.`}
        className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-blue-400 dark:hover:border-blue-600 transition-colors"
      >
        <span className="text-sm font-bold tabular-nums">{asignadas.length || '—'}</span>
      </button>

      {abierto && (
        <Modal isOpen onClose={() => setAbierto(false)} title="Empresas que lo usan" subtitle={itemLabel} size="md" footer={<div className="flex justify-end w-full"><button onClick={() => setAbierto(false)} className="btn-primary">Cerrar</button></div>}>
          {/* Cada switch guarda solo, así que no hay «Guardar»: el botón del pie solo cierra. */}
          <EmpresasDelItemArca tipo={tipo} itemId={itemId} itemLabel={itemLabel} empresas={empresas} asignadas={asignadas} onGuardado={onGuardado} />
        </Modal>
      )}
    </>
  );
};
