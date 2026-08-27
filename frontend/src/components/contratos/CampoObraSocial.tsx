import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faSpinner, faCheck, faCopy, faArrowUpRightFromSquare, faChevronRight, faTrash, faRotateRight } from '@fortawesome/free-solid-svg-icons';
import { ContractOverviewRow } from '../../api/users';
import { projectsAPI } from '../../api/projects';
import { sweetAlert } from '../../utils/sweetAlert';
import { AfipValues } from './afipCompleteness';
import { InfoCampo } from './DatosArcaDetalle';

/**
 * El campo Obra Social del formulario, con la validación adentro.
 *
 * Antes la obra social estaba DOS VECES en el modal: este campo, que solo decía "Falta", y un panel
 * entero abajo con el CUIL, el instructivo y la acción. Dos representaciones del mismo dato, y la que
 * tenía el valor no era la que tenía el botón. Ahora todo vive acá: el estado, el valor, la nota de
 * qué va a quedar, y el click que lo resuelve.
 *
 * No es un campo que se tipea, como Modalidad: el valor lo pone ARCA. Por eso no abre un picker sino
 * el flujo de validación, y una vez validado queda con candado — el server rechaza sobrescribirlo.
 *
 * El motor es el mismo del lote (`aplicarObrasSocialesLote`): acá se usa con una cola de uno. Un
 * segundo camino "para el caso puntual" es lo que se viene sacando a propósito — dos caminos por los
 * que un RNOS entra al sistema son dos formas de que diverjan.
 */

const LOGIN_AFIP_URL = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

const soloDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const formatCuil = (v: string): string => {
  const d = soloDigitos(v);
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : String(v || '');
};
const fechaCorta = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const CampoObraSocial: React.FC<{
  row: ContractOverviewRow;
  valores: AfipValues;
  onGuardado: (patch?: Partial<ContractOverviewRow>) => void;
  /**
   * Abre la pantalla de validación con ESTA persona sola.
   *
   * Es el mismo trámite que el masivo y ahora es la misma pantalla: lo único que cambia es que
   * trae una fila y el botón dice «Validar 1». Antes acá se desplegaba un panel propio DENTRO del
   * formulario, que empujaba Sucursal, Actividad y Convenio hacia abajo —se perdía de vista lo que
   * se estaba mirando— y que además era una segunda UX para la misma tarea: en dos semanas volvían
   * a divergir.
   *
   * Sin esta prop se cae al panel de antes, que sigue funcionando: es lo que ve quien renderice
   * este campo fuera de la grilla, donde no hay dónde abrir un modal.
   */
  onValidarEnPantalla?: () => void;
  /**
   * El convenio que se eligió en el filtro pero que TODAVÍA no rige, porque la categoría guardada es
   * de otro. Vacío cuando coinciden.
   *
   * La obra social por defecto cuelga del convenio de la CATEGORÍA, no del filtro: cambiar el filtro
   * no cambia el default hasta elegir una categoría del convenio nuevo. Sin este aviso, alguien
   * cambia el gremio, valida, y fija la obra social del convenio anterior creyendo que cambió.
   */
  convenioPendiente?: string;
}> = ({ row, valores, onGuardado, onValidarEnPantalla, convenioPendiente }) => {
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [pegado, setPegado] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  const validada = valores.constatacion !== 'sin_constatar';

  /**
   * Se avisa QUÉ VA A QUEDAR si ARCA no devuelve una afiliación propia, antes de arrancar.
   *
   * Es la respuesta más común del organismo —la persona no tiene obra social propia— y en ese caso
   * rige la del CONVENIO. Quien aprieta «Validar» está por fijar ese valor sin haberlo elegido: no
   * hay una segunda pantalla donde confirmarlo, la corrida guarda sola al llegar. Decirlo acá es la
   * única oportunidad de que se entere antes y no después.
   *
   * El default sale de la misma cascada que el resto del formulario (`rnosSugerido`): obra social
   * propia → excepción de la empleadora para ese convenio → la del convenio → la de la empresa si es
   * «excluido de convenio». Por eso se nombra el convenio: es de dónde viene el valor.
   */
  const confirmarYValidar = async () => {
    const arrancar = onValidarEnPantalla || empezar;
    const rnosDefault = soloDigitos(valores.rnosSugerido);
    const cuerpo = rnosDefault
      ? `Si ARCA no devuelve una afiliación propia para esta persona, va a quedar la del convenio ${valores.convenioCategoria || '—'}:\n\n${rnosDefault} · ${valores.nombreObraSocialSugerida || 'sin nombre en el catálogo'}\n\nSe guarda sola al terminar la consulta.`
      : `Si ARCA no devuelve una afiliación propia, esta persona va a quedar SIN obra social: el convenio ${valores.convenioCategoria || '—'} no tiene una cargada.\n\nSe puede validar igual, pero el alta va a salir sin ese dato.`;
    const aviso = convenioPendiente
      ? `\n\n⚠ Elegiste el convenio ${convenioPendiente}, pero la categoría guardada sigue siendo del ${valores.convenioCategoria || '—'}. El default que se aplica es el del convenio de la CATEGORÍA: elegí una categoría del ${convenioPendiente} antes de validar si querés su obra social.`
      : '';
    const r = await sweetAlert.confirm('¿Validar la obra social en ARCA?', cuerpo + aviso, 'Sí, validar');
    if (r.isConfirmed) arrancar();
  };
  const fecha = fechaCorta(valores.constatadaEl || '');
  const delConvenio = valores.convenioCategoria ? `convenio ${valores.convenioCategoria}` : 'convenio';

  const copiarCuil = async () => {
    try {
      await navigator.clipboard.writeText(formatCuil(row.cuit || ''));
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      sweetAlert.error('No se pudo copiar', 'El navegador bloqueó el portapapeles. Copiá el CUIL a mano.');
    }
  };

  /** Abre el flujo: copia el CUIL y lleva a ARCA, que es lo primero que hay que hacer igual. */
  const empezar = async () => {
    setAbierto(true);
    await copiarCuil();
    window.open(LOGIN_AFIP_URL, '_blank', 'noopener,noreferrer');
  };

  /**
   * Aplica lo que devolvió ARCA para ESTA persona.
   *
   * Acepta el `CUIL,RNOS` completo o solo el código: el operador puede venir del script —que copia
   * el par— o de mirar la pantalla, donde lo único que ve es el número. Exigir un formato cuando ya
   * se sabe de quién se trata sería pedir trabajo por nada.
   */
  const aplicar = async () => {
    const empresaId = String(row.empresaContratoId || '');
    if (!empresaId) return;
    const cuil = soloDigitos(row.cuit);
    // Si vienen dos columnas se toma la segunda; si viene una sola, esa es el RNOS.
    const partes = pegado.split(/[,;\t\s]+/).map(soloDigitos).filter(Boolean);
    const rnos = partes.length > 1 ? partes[partes.length - 1] : partes[0] || '';
    if (rnos && rnos.length !== 6) {
      sweetAlert.error('Código inválido', `«${rnos}» no es un código RNOS de 6 dígitos. Copiá el que muestra ARCA, o dejá el campo vacío si no devolvió ninguna.`);
      return;
    }
    setTrabajando(true);
    try {
      const r = await projectsAPI.aplicarObrasSocialesLote(empresaId, [{ cuil, rnos }], false);
      if (r.aplicados === 0) {
        // El server enumera por qué no entró: sin contrato en esa empleadora, código fuera del
        // catálogo, o una obra social que la empleadora no tiene registrada ante ARCA.
        const motivo = r.noRegistrada.length
          ? `${r.noRegistrada[0].nombre} no está entre las obras sociales que esta empleadora registró ante ARCA: el organismo rechazaría el alta.`
          : r.rnosDesconocido.length
            ? `El código ${r.rnosDesconocido[0].rnos} no está en el catálogo de Obras Sociales.`
            : r.yaBloqueados.length
              ? 'Este contrato ya está validado y queda fijo. Usá Re-validar.'
              : 'No se pudo aplicar.';
        sweetAlert.error('No se aplicó', motivo);
        return;
      }
      setAbierto(false);
      setPegado('');
      onGuardado();
    } catch (e: any) {
      sweetAlert.error('No se pudo', e?.response?.data?.error || 'No se pudo aplicar el resultado.');
    } finally {
      setTrabajando(false);
    }
  };

  /**
   * Borra la validación y devuelve el contrato a "sin validar".
   *
   * Va con `forzar` porque lo sellado en ARCA es inmutable para el server: sin eso contesta 409. Es
   * el único punto que escribe ese borrado, y lo comparten los dos botones de abajo — que se
   * diferencian solo en qué pasa DESPUÉS.
   */
  const desfijar = async (): Promise<boolean> => {
    setTrabajando(true);
    try {
      const ref = row.contratoId || row.contractIndex;
      await projectsAPI.updateObraSocialContrato(row.projectId, row.userId, ref as never, { obraSocialId: null, origen: 'manual', forzar: true });
      onGuardado({ osId: null, obraSocialOrigen: '', obraSocialConstatadaEn: '', obraSocialConstatadaEl: '', obraSocialNoFigura: false, obraSocialBloqueada: false });
      return true;
    } catch (e: any) {
      sweetAlert.error('No se pudo', e?.response?.data?.error || 'No se pudo quitar la obra social.');
      return false;
    } finally {
      setTrabajando(false);
    }
  };

  /** Re-validar: borra y sigue de largo a ARCA, para volver a validar en el momento. */
  const reValidar = async () => {
    const r = await sweetAlert.confirm(
      '¿Volver a validar en ARCA?',
      'Se borra lo que había y este contrato vuelve a quedar sin obra social hasta que ARCA devuelva una nueva.',
      'Sí, re-validar',
    );
    if (!r.isConfirmed) return;
    if (await desfijar()) onValidarEnPantalla ? onValidarEnPantalla() : await empezar();
  };

  /**
   * Quitar: borra y se queda ahí.
   *
   * Existe aparte de Re-validar porque hay un caso en que no se quiere ir a ARCA: el dato quedó mal y
   * primero hay que arreglar otra cosa —elegir la empleadora, por ejemplo—. Sin esto, la única forma
   * de sacar una obra social sellada era arrancar una consulta que todavía no se puede completar.
   */
  const quitar = async () => {
    const r = await sweetAlert.confirm(
      '¿Quitar la obra social?',
      'Este contrato vuelve a quedar SIN VALIDAR y no va a entrar en el TXT hasta que se valide de nuevo en ARCA. No se pierde nada más: el valor sale del organismo, no se carga a mano.',
      'Sí, quitar',
    );
    if (r.isConfirmed) await desfijar();
  };

  return (
    <div className="mb-3">
      {/*
        * Banda de ancho completo, con el mismo formato que la del Empleador.
        *
        * Estaba como un campo más de la primera columna y no entraba: el nombre de la obra social
        * mide hasta 40 caracteres y quedaba cortado, con la línea de estado —origen, fecha, acciones—
        * apretada abajo en tres renglones. Es además el único campo del formulario que tiene un
        * trámite propio; al ancho completo, ese trámite tiene lugar y el trash cae donde el ojo ya lo
        * busca, alineado con el de Empleador.
        */}
      <div className={`rounded-lg border px-3 py-2.5 ${validada ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/40'}`}>
        <div className="flex items-start gap-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-2 flex-1 min-w-0">
            <div className="min-w-0">
              <span className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
                Obra Social
                <InfoCampo campo="rnos" />
                <span className="text-[9.5px] px-1.5 py-px rounded border tracking-wide bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800/70">40–45</span>
              </span>
              <span className="block text-[12.5px] text-gray-800 dark:text-gray-200 truncate mt-0.5">
                {validada ? (
                  <span className="flex items-baseline gap-2 min-w-0">
                    <FontAwesomeIcon icon={faLock} className="h-2.5 w-2.5 text-gray-400 self-center shrink-0" />
                    <span className="font-mono font-semibold shrink-0">{soloDigitos(valores.rnos)}</span>
                    <span className="truncate">{valores.nombreObraSocial}</span>
                  </span>
                ) : (
                  <span className="text-gray-400 dark:text-gray-500">— sin validar</span>
                )}
              </span>
            </div>

            <div className="min-w-0 md:col-span-2">
              <span className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">{validada ? 'Estado' : 'Qué va a quedar'}</span>
              <span className="block text-[12.5px] text-gray-600 dark:text-gray-400 mt-0.5">
                {validada ? (
                  <span className="flex items-center gap-2 flex-wrap">
                    <span>
                      {row.obraSocialNoFigura ? <>validada · ARCA sin afiliación → del {delConvenio}</> : <>validada en ARCA</>}
                      {fecha ? ` · ${fecha}` : ''}
                    </span>
                    {/* Ícono y no texto: al lado del trash, dos acciones escritas competían por la
                        lectura de una línea que ya dice el estado. La flecha circular es la de
                        "volver a consultar" en cualquier interfaz; el rótulo va en el hover. */}
                    <button
                      type="button"
                      disabled={trabajando}
                      onClick={reValidar}
                      title="Re-validar: vuelve a consultar el CUIL en ARCA"
                      aria-label="Re-validar en ARCA"
                      className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50 transition-colors"
                    >
                      <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3" />
                    </button>
                  </span>
                ) : !row.empresaContratoId ? (
                  <>elegí la empleadora para poder validarla</>
                ) : valores.rnosSugerido ? (
                  <>
                    por defecto iría <span className="font-mono">{soloDigitos(valores.rnosSugerido)}</span> · {valores.nombreObraSocialSugerida} ({delConvenio})
                  </>
                ) : (
                  <>sin validar el contrato no entra en el TXT</>
                )}
              </span>
            </div>
          </div>

          {/*
            * La acción que destraba el campo, con el mismo peso que «Elegir empleadora»: botón azul,
            * a la derecha, en la misma posición. Eran las dos cosas que hay que hacer para que el
            * contrato entre al TXT, y una escrita como link se leía como opcional al lado de la otra.
            */}
          {!validada && !!row.empresaContratoId && !abierto && (
            <button
              type="button"
              onClick={confirmarYValidar}
              /* `self-center`: la banda crece con el texto de «Qué va a quedar» —que envuelve en dos
                 renglones— y el botón, alineado arriba con el resto, quedaba colgando de la primera
                 línea. Centrado, queda a la altura del bloque que explica lo que va a validar. */
              className="shrink-0 self-center inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-[12.5px] font-semibold bg-blue-600 text-white hover:bg-blue-700"
            >
              Validar en ARCA
              <FontAwesomeIcon icon={faChevronRight} className="h-2.5 w-2.5" />
            </button>
          )}

          {/* Trash a la derecha, alineado con el de Empleador. Solo con algo que borrar. */}
          {validada && (
            <button
              type="button"
              onClick={quitar}
              disabled={trabajando}
              title="Quitar la obra social: vuelve a quedar sin validar"
              aria-label="Quitar la obra social de este contrato"
              className="shrink-0 p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            >
              <FontAwesomeIcon icon={trabajando ? faSpinner : faTrash} spin={trabajando} className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* El flujo de validar: aparece al pedirlo, no como sección permanente. */}
      {abierto && !validada && (
        <div className="mt-1.5 rounded-md border border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/20 px-2.5 py-2 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[12px] font-bold text-gray-800 dark:text-gray-100">{formatCuil(row.cuit || '')}</span>
            <button type="button" onClick={copiarCuil} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-800">
              <FontAwesomeIcon icon={copiado ? faCheck : faCopy} className="h-2.5 w-2.5" />
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
            <a href={LOGIN_AFIP_URL} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[10.5px] font-semibold text-blue-700 dark:text-blue-400 hover:underline">
              Abrir ARCA
              <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2 w-2" />
            </a>
          </div>
          <p className="text-[10.5px] text-gray-600 dark:text-gray-400">Relaciones Laborales → Registrar Nuevas Altas: pegá el CUIL y copiá acá el código que precompleta. Si no devuelve ninguna, dejalo vacío.</p>
          <div className="flex items-center gap-2">
            <input value={pegado} onChange={(e) => setPegado(e.target.value)} placeholder="código, o vacío si no devolvió" className="input-field flex-1 text-[12px] font-mono py-1" />
            <button type="button" disabled={trabajando} onClick={aplicar} className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {trabajando ? <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" /> : <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />}
              Aplicar
            </button>
            <button type="button" onClick={() => setAbierto(false)} className="shrink-0 text-[10.5px] text-gray-500 hover:underline">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
