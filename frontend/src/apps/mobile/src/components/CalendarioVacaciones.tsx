import { useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight, faInfoCircle, faTimes } from '@fortawesome/free-solid-svg-icons';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, subMonths, isSameMonth, isSameDay, parseISO, isWithinInterval, isBefore, isAfter, addDays, subDays, isMonday, isSunday, isFriday, isSaturday, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { sweetAlert } from '../utils/sweetAlert';
import { hastaParaDias, normalizarDiasDeInicio, puedeEmpezar, textoDiasDeInicio } from '@compartido/vacaciones/campania';
import { primerInicioElegible } from '@compartido/vacaciones/pantallaEmpleado';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * EL CALENDARIO DE «MIS VACACIONES», PARA LA CAMPAÑA (16/11/2026)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Copia del calendario de `views/Vacations.tsx` (que queda intacto) adaptada a «Elegí tus vacaciones»:
 * la misma UI y el mismo comportamiento al elegir inicio y fin, días
 * ocupados por el equipo (aprobados en rojo, pendientes en ámbar), el fin sugerido según los días
 * disponibles, el ajuste del fin de semana con días corridos, el día de regreso y el contador.
 *
 * Qué días se pueden elegir lo decide quien lo usa (`permitida`: la ventana anual, la de la campaña, el
 * aviso mínimo); los días pasados, los ocupados y los que exceden `disponibles` los bloquea el calendario.
 * Lo que se valida al confirmar (fraccionamiento, saldo restante) también es de quien lo usa.
 *
 * LAS REGLAS DE LA CAMPAÑA SE AVISAN ACÁ MISMO (24/11/2026): los días se ven todos normales (pedido del
 * usuario: en gris «parece bloqueado»), y al tocar uno que no cumple sale el aviso y no se elige: un día en
 * que no puede empezar un tramo (`diasDeInicio`), o un fin que deja el tramo más corto que el mínimo al
 * fraccionar (`minimo`, con desde qué día sí). Lo que todavía está mal en el tramo (`errores`, calculado por
 * quien lo usa con las mismas reglas que el server) se muestra en rojo y no deja confirmar.
 *
 * POR PASOS (27/11/2026, reemplaza lo del 24/11 para los días de inicio): al elegir el INICIO, los días en que se
 * puede empezar se destacan y el resto se atenúa (sólo el texto, sin fondo: no es el gris de «bloqueado»);
 * al elegir el fin se ven todos normales. Abre en el mes del primer día en que se puede empezar, no en el
 * actual. La leyenda de vacaciones de otros se muestra sólo si hay alguna en el mes que se ve.
 */

export type ModoCalendario = 'start' | 'end';

interface Props {
  modo: ModoCalendario | null;
  setModo: (m: ModoCalendario | null) => void;
  desde: string;
  hasta: string;
  onCambiar: (desde: string, hasta: string) => void;
  /** Los días que se pueden tomar en este período (el tope del fin). */
  disponibles: number;
  diasCorridos: boolean;
  ocupadas: string[];
  pendientes: string[];
  /** Si el día (yyyy-MM-dd) se puede elegir, además de no ser pasado ni ocupado. */
  permitida: (fecha: string) => boolean;
  /** «entre el 1/11 y el 30/4»: para el encabezado y el motivo de los días fuera. */
  textoVentana?: string;
  /** Mes en que abre si no hay nada elegido (yyyy-MM-dd). */
  mesInicial?: string;
  onConfirmar: () => void;
  onInfoPendientes?: () => void;
  /** Días de la semana (0 = domingo) en que puede EMPEZAR el tramo; vacío = cualquier día. Los otros no se eligen como inicio. */
  diasDeInicio?: number[] | null;
  /** Cuántos días tiene que tener este tramo como mínimo (al fraccionar); 0 = nada que avisar. */
  minimo?: number;
  /** Lo que todavía está mal en este tramo con lo elegido: se muestra en rojo y no deja confirmar. */
  errores?: string[];
}

const SWAL_INFO = { confirmButtonText: 'Entendido', confirmButtonColor: '#3b82f6', customClass: { popup: 'mobile-swal-popup', title: 'mobile-swal-title' } };

export function contarDiasSeleccionados(desde: string, hasta: string, diasCorridos: boolean): number {
  if (!desde || !hasta) return 0;
  const s = parseISO(desde);
  const e = parseISO(hasta);
  if (isBefore(e, s)) return 0;
  if (diasCorridos) return differenceInDays(e, s) + 1;
  return eachDayOfInterval({ start: s, end: e }).filter((d) => !isSaturday(d) && !isSunday(d)).length;
}

export default function CalendarioVacaciones({ modo, setModo, desde, hasta, onCambiar, disponibles, diasCorridos, ocupadas, pendientes, permitida, textoVentana, mesInicial, onConfirmar, onInfoPendientes, diasDeInicio, minimo = 0, errores = [] }: Props) {
  const [viewDate, setViewDate] = useState(new Date());

  // Al abrir, el mes de lo elegido o el del primer día en que se puede EMPEZAR (no el actual, que suele no tener ninguno).
  useEffect(() => {
    if (!modo) return;
    const manana = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    const base = desde || primerInicioElegible(mesInicial && mesInicial > manana ? mesInicial : manana, diasDeInicio, permitida) || mesInicial;
    const d = base ? parseISO(base) : new Date();
    setViewDate(isBefore(d, new Date()) ? new Date() : d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo === null]);

  const limite = Math.max(0, disponibles);
  const diasQueEmpiezan = normalizarDiasDeInicio(diasDeInicio);
  const textoEmpiezan = diasQueEmpiezan.length > 0 ? `Las vacaciones pueden empezar sólo ${textoDiasDeInicio(diasQueEmpiezan)}.` : '';
  // Al fraccionar, el fin no puede dejar el tramo más corto que el mínimo (recortado a lo disponible, para no trabar el calendario).
  const minimoEfectivo = Math.min(Math.max(0, minimo), limite);

  const returnDate = useMemo(() => {
    if (!hasta) return null;
    let d = addDays(parseISO(hasta), 1);
    while (isSaturday(d) || isSunday(d)) d = addDays(d, 1);
    return d;
  }, [hasta]);

  const suggestedEndDate = useMemo(() => {
    if (!desde || limite <= 0) return null;
    const s = parseISO(desde);
    if (diasCorridos) return addDays(s, limite - 1);
    let needed = limite;
    let current = s;
    while (needed > 0) {
      if (!isSaturday(current) && !isSunday(current)) needed--;
      if (needed > 0) current = addDays(current, 1);
    }
    return current;
  }, [desde, limite, diasCorridos]);

  if (!modo) return null;

  const generateCalendarDays = () => {
    const monthStart = startOfMonth(viewDate);
    return eachDayOfInterval({ start: startOfWeek(monthStart, { weekStartsOn: 0 }), end: endOfWeek(endOfMonth(monthStart), { weekStartsOn: 0 }) });
  };

  const isOccupied = (day: Date) => ocupadas.includes(format(day, 'yyyy-MM-dd'));

  const handleClearSelection = () => {
    onCambiar('', '');
    setModo('start');
  };

  const checkOverlap = (start: string, end: string) => {
    if (!start || !end) return false;
    const s = parseISO(start);
    const e = parseISO(end);
    return ocupadas.some((o) => isWithinInterval(parseISO(o), { start: s, end: e }));
  };

  const handleDateSelect = async (day: Date) => {
    const formattedDate = format(day, 'yyyy-MM-dd');
    if (isOccupied(day) || !permitida(formattedDate)) return;
    // Este toque fija el INICIO (modo inicio, o un día antes del inicio elegido): tiene que ser un día en que se puede empezar.
    const fijaInicio = modo === 'start' || (!!desde && isBefore(day, parseISO(desde)));
    if (fijaInicio && !puedeEmpezar(formattedDate, diasQueEmpiezan)) {
      await Swal.fire({ icon: 'info', title: 'Día de inicio', text: `${textoEmpiezan} Elegí otro día para empezar.`, ...SWAL_INFO });
      return;
    }
    // Este toque fija el FIN: el tramo no puede quedar más corto que el mínimo al fraccionar (contando el fin de
    // semana que se agrega solo si termina viernes o sábado con días corridos).
    if (modo === 'end' && desde && !fijaInicio && minimoEfectivo > 0) {
      const finEfectivo = diasCorridos && isFriday(day) ? addDays(day, 2) : diasCorridos && isSaturday(day) ? addDays(day, 1) : day;
      if (contarDiasSeleccionados(desde, format(finEfectivo, 'yyyy-MM-dd'), diasCorridos) < minimoEfectivo) {
        const primerFin = format(parseISO(hastaParaDias(desde, minimoEfectivo, diasCorridos)), "EEEE d 'de' MMMM", { locale: es });
        await Swal.fire({ icon: 'info', title: `Mínimo ${minimoEfectivo} días`, text: `${minimoEfectivo < minimo ? `Te quedan ${minimoEfectivo} días y van todos juntos` : `Al dividir las vacaciones, cada tramo tiene que tener al menos ${minimoEfectivo} días`}: elegí un fin desde el ${primerFin}.`, ...SWAL_INFO });
        return;
      }
    }

    let newStart = desde;
    let newEnd = hasta;

    if (modo === 'start') {
      newStart = formattedDate;
      if (hasta && isAfter(day, parseISO(hasta))) newEnd = '';
    } else if (desde && isBefore(day, parseISO(desde))) {
      // Un día ANTES del inicio corrige el inicio.
      newStart = formattedDate;
      newEnd = '';
    } else if (diasCorridos && isFriday(day)) {
      const saturday = addDays(day, 1);
      const sunday = addDays(day, 2);
      if (isOccupied(saturday) || isOccupied(sunday)) {
        await sweetAlert.error('Error', 'No se pueden agregar automáticamente el sábado y domingo porque uno de esos días está ocupado por otro miembro del equipo.');
        return;
      }
      await Swal.fire({ icon: 'info', title: 'Días Corridos', text: 'Al finalizar las vacaciones un viernes, se computan automáticamente el sábado y domingo como días corridos.', ...SWAL_INFO });
      newEnd = format(sunday, 'yyyy-MM-dd');
    } else if (diasCorridos && isSaturday(day)) {
      const sunday = addDays(day, 1);
      if (isOccupied(sunday)) {
        await sweetAlert.error('Error', 'No se puede agregar automáticamente el domingo porque está ocupado por otro miembro del equipo.');
        return;
      }
      await Swal.fire({ icon: 'info', title: 'Días Corridos', text: 'Al finalizar las vacaciones un sábado, se computa automáticamente el domingo como día corrido.', ...SWAL_INFO });
      newEnd = format(sunday, 'yyyy-MM-dd');
    } else {
      newEnd = formattedDate;
    }

    if (newStart && newEnd) {
      if (modo === 'end' && (isFriday(day) || isSaturday(day))) {
        const dias = contarDiasSeleccionados(newStart, newEnd, diasCorridos);
        if (dias > limite) {
          // Se corre el inicio para que entre el fin de semana sin pasarse.
          newStart = format(addDays(parseISO(newStart), dias - limite), 'yyyy-MM-dd');
          if (!puedeEmpezar(newStart, diasQueEmpiezan)) {
            await sweetAlert.error('No entra', `Con el fin de semana el tramo se pasa de tus días y el inicio tendría que correrse a un día en que no se puede empezar. ${textoEmpiezan} Elegí otro fin.`);
            return;
          }
          await Swal.fire({ icon: 'info', title: 'Ajuste Automático', text: 'Se ha ajustado la fecha de inicio para incluir el fin de semana sin exceder tus días disponibles.', ...SWAL_INFO });
        }
      }
      if (checkOverlap(newStart, newEnd)) {
        await sweetAlert.error('Conflicto de fechas', 'El rango seleccionado se solapa con vacaciones de otros miembros del equipo. Por favor selecciona otras fechas.');
        return;
      }
    }

    onCambiar(newStart, newEnd);
    if (modo === 'start') setModo('end');
  };

  const seleccionados = contarDiasSeleccionados(desde, hasta, diasCorridos);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diasDelMes = generateCalendarDays();
  // La leyenda de otros usuarios, sólo si hay alguna vacación ajena en el mes que se ve.
  const hayAjenasVisibles = diasDelMes.some((d) => {
    const f = format(d, 'yyyy-MM-dd');
    return ocupadas.includes(f) || pendientes.includes(f);
  });
  // Al elegir el inicio con días de inicio fijados: los que pueden empezar se destacan, el resto se atenúa.
  const destacaInicio = modo === 'start' && diasQueEmpiezan.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-sm overflow-hidden max-h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
          <div className="flex flex-col">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white capitalize">{format(viewDate, 'MMMM yyyy', { locale: es })}</h3>
            {textoVentana && <span className="text-[11px] text-slate-500 dark:text-slate-400">Se pueden pedir {textoVentana}</span>}
            {textoEmpiezan && modo === 'start' && <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{textoEmpiezan}</span>}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded p-1">
              <button type="button" onClick={() => setViewDate(subMonths(viewDate, 1))} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors">
                <FontAwesomeIcon icon={faChevronLeft} className="text-slate-600 dark:text-slate-400 w-4 h-4" />
              </button>
              <button type="button" onClick={() => setViewDate(addMonths(viewDate, 1))} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors">
                <FontAwesomeIcon icon={faChevronRight} className="text-slate-600 dark:text-slate-400 w-4 h-4" />
              </button>
            </div>
            <button type="button" onClick={handleClearSelection} className="px-3 py-1.5 rounded bg-blue-50 dark:bg-blue-600 text-blue-600 dark:text-white hover:bg-blue-100 dark:hover:bg-blue-900/80 transition-colors ml-2 text-xs font-medium" title="Borrar selección">
              Limpiar
            </button>
            <button type="button" onClick={() => setModo(null)} className="w-8 h-8 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors ml-1">
              <FontAwesomeIcon icon={faTimes} className="text-slate-500 dark:text-slate-400" />
            </button>
          </div>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-7 mb-2 text-center">
            {['D', 'L', 'M', 'X', 'J', 'V', 'S'].map((d, i) => (
              <div key={i} className="text-xs font-bold text-slate-400">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {diasDelMes.map((day, idx) => {
              const isCurrentMonth = isSameMonth(day, viewDate);
              const formattedDay = format(day, 'yyyy-MM-dd');
              const isOccupiedDay = isOccupied(day);
              const isPendingOcc = pendientes.includes(formattedDay);
              const prevOcc = isOccupied(subDays(day, 1));
              const nextOcc = isOccupied(addDays(day, 1));

              const isStart = desde === formattedDay;
              const isEnd = hasta === formattedDay;
              let isInRange = false;
              if (desde && hasta) {
                const s = parseISO(desde);
                const e = parseISO(hasta);
                if (isBefore(s, e) || isSameDay(s, e)) isInRange = isWithinInterval(day, { start: s, end: e });
              }

              const isPast = isBefore(day, today);
              // Con el inicio elegido, los días que se pasan de lo disponible (contados como se cuentan: corridos o hábiles).
              const isExceedingLimit = modo === 'end' && !!desde && !isBefore(day, parseISO(desde)) && contarDiasSeleccionados(desde, formattedDay, diasCorridos) > limite;
              const fueraDeVentana = !permitida(formattedDay);
              // Un día que fijaría el inicio (modo inicio, o antes del inicio elegido) tiene que poder empezar, y un fin no
              // puede dejar el tramo más corto que el mínimo: se ven normales y, al tocarlos, avisan (no se deshabilitan).
              const noPuedeEmpezar = (modo === 'start' || (!!desde && isBefore(day, parseISO(desde)))) && !puedeEmpezar(formattedDay, diasQueEmpiezan);
              const demasiadoCorto = modo === 'end' && !!desde && minimoEfectivo > 0 && !isBefore(day, parseISO(desde)) && contarDiasSeleccionados(desde, formattedDay, diasCorridos) < minimoEfectivo;
              const isDisabled = isPast || isExceedingLimit || isOccupiedDay || fueraDeVentana;

              const isSelected = isStart || isEnd || isInRange;
              const isSuggested = !isSelected && !isDisabled && !isOccupiedDay && suggestedEndDate && modo === 'end' && desde && isAfter(day, parseISO(desde)) && (isBefore(day, suggestedEndDate) || isSameDay(day, suggestedEndDate));

              let classes = 'h-10 w-full flex items-center justify-center text-sm font-medium transition-all relative';
              const isReturnDay = returnDate && isSameDay(day, returnDate);

              if (isReturnDay) {
                classes += ' bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded font-bold border-2 border-green-500/20';
                if (isDisabled) classes += ' cursor-not-allowed opacity-75';
              } else if (isDisabled) {
                classes += ' cursor-not-allowed';
                if (isOccupiedDay) {
                  classes += isPendingOcc ? ' bg-amber-200 text-amber-700 dark:bg-amber-800/40 dark:text-amber-300' : ' bg-red-200 text-red-700 dark:bg-red-800/40 dark:text-red-300';
                  classes += !prevOcc || isMonday(day) ? ' rounded-l-lg' : ' rounded-l-none';
                  classes += !nextOcc || isSunday(day) ? ' rounded-r-lg' : ' rounded-r-none';
                } else {
                  classes += ' text-slate-300 dark:text-slate-600 bg-slate-50 dark:bg-slate-800/20';
                }
              } else if (isSelected) {
                classes += ' bg-blue-900 text-white z-10 border border-y-blue-800 dark:border-y-blue-400';
                classes += isStart || isMonday(day) ? ' border-l-blue-800 dark:border-l-blue-400 rounded-l-lg' : ' border-l-transparent rounded-l-none';
                classes += isEnd || isSunday(day) ? ' border-r-blue-800 dark:border-r-blue-400 rounded-r-lg' : ' border-r-transparent rounded-r-none';
              } else if (isSuggested) {
                classes += ' bg-transparent text-sky-600 dark:text-white rounded border border-blue-500 border-dashed';
              } else {
                classes += ' border-transparent border-2';
                if (!isCurrentMonth) classes += ' text-slate-300 dark:text-slate-700';
                else if (destacaInicio) classes += noPuedeEmpezar ? ' text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded' : ' font-bold text-primary ring-1 ring-inset ring-primary/40 hover:bg-primary/10 rounded';
                else classes += ' text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded';
              }

              let dayTitle = '';
              if (isOccupiedDay) dayTitle = isPendingOcc ? 'Vacación pendiente de otro usuario' : 'Vacación aprobada de otro usuario';
              else if (isPast) dayTitle = 'Fecha pasada';
              else if (fueraDeVentana) dayTitle = textoVentana ? `Fuera del período: se pueden pedir ${textoVentana}` : 'Fuera del período';
              else if (isExceedingLimit) dayTitle = 'Excede límite de días';
              else if (noPuedeEmpezar) dayTitle = textoEmpiezan;
              else if (demasiadoCorto) dayTitle = `Este tramo tiene que tener al menos ${minimoEfectivo} días`;

              return (
                <button type="button" key={idx} onClick={() => !isDisabled && handleDateSelect(day)} disabled={isDisabled} className={classes} title={dayTitle}>
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          {returnDate && (
            <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-800 rounded-lg text-xs text-green-700 dark:text-green-300 flex items-center justify-center gap-2">
              <p>
                Volvés a trabajar el{' '}
                <strong className="capitalize">
                  {format(returnDate, "EEEE d 'de' MMMM", { locale: es })}.<br />
                </strong>
                <span>Si corresponde a tu jornada laboral.</span>
              </p>
            </div>
          )}
          <div className="flex justify-between items-center mb-3 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
            <div className="flex flex-col items-center w-full">
              <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Disponibles</span>
              <span className="text-lg font-bold text-blue-500">{limite}</span>
            </div>
            <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 mx-2"></div>
            <div className="flex flex-col items-center w-full">
              <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Seleccionados {diasCorridos ? '(Corr.)' : '(Háb.)'}</span>
              <span className={`text-lg font-bold ${!desde || !hasta ? 'text-slate-400' : seleccionados > disponibles ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>{seleccionados}</span>
            </div>
            {minimoEfectivo > 0 && (
              <>
                <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 mx-2"></div>
                <div className="flex flex-col items-center w-full" title="Al fraccionar, cada tramo lleva al menos el mínimo; el último, los que queden">
                  <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Mínimo</span>
                  <span className={`text-lg font-bold ${desde && hasta && seleccionados < minimoEfectivo ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>{minimoEfectivo}</span>
                </div>
              </>
            )}
          </div>

          {hayAjenasVisibles && (
          <div className="flex flex-col gap-2 mb-4">
            <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider mb-1">Vacaciones de otros usuarios (No seleccionables)</span>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full border border-red-400 bg-red-200 dark:bg-red-800/40"></div>
              <span className="text-xs text-slate-600 dark:text-slate-400">Vacaciones aprobadas / entregadas</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full border border-amber-400 bg-amber-200 dark:bg-amber-800/40"></div>
              <span className="text-xs text-slate-600 dark:text-slate-400">Vacaciones pendientes de aprobación</span>
              {onInfoPendientes && <FontAwesomeIcon icon={faInfoCircle} className="w-3 h-3 text-slate-400 ml-auto" onClick={onInfoPendientes} />}
            </div>
          </div>
          )}

          {errores.length > 0 && (
            <ul className="mb-3 space-y-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-300">
              {errores.map((e) => (
                <li key={e}>· {e}</li>
              ))}
            </ul>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                onCambiar('', '');
                setModo(null);
              }}
              className="flex-1 rounded-lg h-10 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
            >
              Cancelar
            </button>
            <button type="button" onClick={onConfirmar} disabled={errores.length > 0} title={errores.length > 0 ? 'Corregí lo marcado para confirmar' : undefined} className="flex-1 rounded-lg h-10 bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20 disabled:cursor-not-allowed disabled:opacity-50">
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
