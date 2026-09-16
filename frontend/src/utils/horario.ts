/*
  HORARIOS: las cuentas y el formato de una hora, compartidos por la solicitud del móvil y el alta de
  la web, para que las dos pantallas entiendan lo mismo por "08:30" y por "de 22 a 06".
*/

/** Una hora «HH:MM» en minutos desde la medianoche. `null` si no es una hora. */
export const aMinutos = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/*
  HORA DE ENTRADA / SALIDA: se elige de la lista (de a una hora) o se escribe.

  La lista cubre el caso común; lo que no es hora entera («08:30») se tipea. Al salir del campo se
  completa el formato: «8» → 08:00, «830» → 08:30, «8.30» → 08:30. Lo que no es una hora válida queda
  marcado y no se guarda, en vez de mandar un horario que nadie puede leer.
*/
export const normalizarHora = (texto: string): string | null => {
  const t = texto.trim();
  if (!t) return "";
  let h: number;
  let m: number;
  const conSeparador = /^(\d{1,2})[:.h](\d{0,2})$/i.exec(t);
  const soloNumeros = /^(\d{1,4})$/.exec(t);
  if (conSeparador) {
    h = Number(conSeparador[1]);
    m = conSeparador[2] ? Number(conSeparador[2].padEnd(2, "0")) : 0;
  } else if (soloNumeros) {
    const d = soloNumeros[1];
    h = Number(d.length <= 2 ? d : d.slice(0, -2));
    m = d.length <= 2 ? 0 : Number(d.slice(-2));
  } else return null;
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/*
  FORMATO DE HORA MIENTRAS SE TIPEA: los dos puntos aparecen solos.

    «0830» → 08:30 · «8:30» → 08:30 · «9» → 09: (no hay hora 9x) · «14» → 14:

  Al BORRAR no se agregan: si no, borrar los dos puntos los volvería a poner y no se podría corregir
  la hora. Lo que queda incompleto lo termina `normalizarHora` al salir del campo.
*/
export const mascaraHora = (nuevo: string, anterior: string): string => {
  const borrando = nuevo.length < anterior.length;
  const conSeparador = /^(\d{1,2})\s*[:.hH]\s*(\d{0,2})/.exec(nuevo);
  if (conSeparador) return `${conSeparador[1].padStart(2, "0")}:${conSeparador[2]}`;
  let d = nuevo.replace(/\D/g, "").slice(0, 4);
  if (d.length === 1 && Number(d) > 2 && !borrando) d = `0${d}`;
  if (d.length > 2) return `${d.slice(0, 2)}:${d.slice(2)}`;
  if (d.length === 2 && !borrando) return `${d}:`;
  return d;
};

/** Duración de un horario en horas, contando que la salida puede ser del día siguiente (22:00 a 06:00 = 8). */
export const horasDelHorario = (entrada: string, salida: string): number | null => {
  const e = aMinutos(entrada);
  const s = aMinutos(salida);
  if (e === null || s === null) return null;
  return ((s - e + 1440) % 1440 || 1440) / 60;
};
/** "HH:MM" + minutos, dando la vuelta a medianoche. */
export const sumarMinutos = (hhmm: string, minutos: number): string => {
  const base = aMinutos(hhmm);
  if (base === null) return "";
  const total = (((base + Math.round(minutos)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/**
 * Las horas del día, de a una: son las que sugieren los campos de horario. Lo que no es hora entera
 * («08:30») se escribe a mano, y `mascaraHora` lo formatea.
 */
export const HORAS_DEL_DIA: string[] = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);

/*
  ¿EL HORARIO ENTRA DENTRO DEL TURNO?

  El turno dice de cuándo a cuándo se cubre el puesto; el horario, cuándo entra y sale ESTA persona.
  Casi siempre coinciden —el horario se completa con el del turno—, pero alguien puede entrar antes o
  quedarse después, y eso es legítimo: hay que poder pedirlo, avisando que se sale del turno.

  Devuelve `true` cuando el horario está contenido en la ventana del turno (y por lo tanto no hay nada
  que avisar). Los turnos que cruzan la medianoche (18 a 00, 00 a 06) se miden como tales, igual que un
  horario de 22 a 02: por eso se prueba la ventana corrida un día para atrás y para adelante. Sin datos
  suficientes devuelve `true`: no se avisa de algo que no se puede afirmar.
*/
export const horarioDentroDelTurno = (inicioTurno: string, finTurno: string, entrada: string, salida: string): boolean => {
  const d = aMinutos(inicioTurno);
  const f0 = aMinutos(finTurno);
  const e = aMinutos(entrada);
  const s0 = aMinutos(salida);
  if (d === null || f0 === null || e === null || s0 === null) return true;
  const f = f0 <= d ? f0 + 1440 : f0;
  const s = s0 <= e ? s0 + 1440 : s0;
  return [-1440, 0, 1440].some((corrimiento) => d + corrimiento <= e && s <= f + corrimiento);
};
