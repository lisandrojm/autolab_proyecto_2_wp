export interface OvertimeSettings {
  weekdayDayStart: string;
  weekdayDayEnd: string;
  satDayStart: string;
  satDayEnd: string;
  pct50: number;
  pct100: number;
  salaryDivisorPercentage: number;
}

const STORAGE_KEY = "@autolab/overtime_glossary";

export const DEFAULT_GLOSSARY: OvertimeSettings = {
  weekdayDayStart: "06:00",
  weekdayDayEnd: "20:59",
  satDayStart: "06:00",
  satDayEnd: "12:59",
  pct50: 50,
  pct100: 100,
  salaryDivisorPercentage: 150,
};

export const overtimeUtils = {
  getGlossary: (): OvertimeSettings => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_GLOSSARY;
    try {
      const parsed = JSON.parse(stored);
      // Migrate old data on the fly if needed
      if (parsed.salaryDivisorPercentage === undefined) {
        parsed.salaryDivisorPercentage = 150;
      }
      return parsed;
    } catch {
      return DEFAULT_GLOSSARY;
    }
  },
  saveGlossary: (glossary: OvertimeSettings) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(glossary));
  },
};

export const splitOvertime = (
  date: string,
  startTime: string,
  endTime: string,
  totalHours: number,
  glossary: OvertimeSettings,
  contractStart?: string,
  contractEnd?: string
) => {
  const d = new Date(date + "T00:00:00");
  const dayOfWeek = d.getDay(); // 0 Sunday, 1-5 Mon-Fri, 6 Sat

  // Sundays are always 100%
  if (dayOfWeek === 0) return { h50: 0, h100: totalHours, pct: glossary.pct100 };

  if (!startTime || !endTime || totalHours <= 0) {
    if (dayOfWeek >= 1 && dayOfWeek <= 5) return { h50: totalHours, h100: 0, pct: glossary.pct50 };
    return { h50: 0, h100: totalHours, pct: glossary.pct100 };
  }

  const timeToMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };

  let p50Start = 0;
  let p50End = 0;

  if (dayOfWeek >= 1 && dayOfWeek <= 5) {
    p50Start = timeToMinutes(glossary.weekdayDayStart);
    p50End = timeToMinutes(glossary.weekdayDayEnd);
  } else if (dayOfWeek === 6) {
    p50Start = timeToMinutes(glossary.satDayStart);
    p50End = timeToMinutes(glossary.satDayEnd);
  }

  if (p50End % 60 === 59) p50End += 1;

  let otStart = timeToMinutes(startTime);
  let otEnd = timeToMinutes(endTime);
  if (otEnd < otStart) {
    otEnd += 24 * 60; // Next day
  }

  const get50Overlap = (start: number, end: number) => {
    if (end <= start) return 0;
    const overlap1 = Math.max(0, Math.min(end, p50End) - Math.max(start, p50Start));
    const overlap2 = Math.max(0, Math.min(end, p50End + 1440) - Math.max(start, p50Start + 1440));
    const overlap3 = Math.max(0, Math.min(end, p50End - 1440) - Math.max(start, p50Start - 1440));
    return overlap1 + overlap2 + overlap3;
  };

  let mins50 = 0;
  let computedTotalMins = 0;

  if (contractStart && contractEnd) {
    const cStart = timeToMinutes(contractStart);
    let cEnd = timeToMinutes(contractEnd);
    if (cEnd < cStart) {
      cEnd += 24 * 60;
    }

    let cStartAligned = cStart;
    let cEndAligned = cEnd;

    // Align contract start/end with overtime start/end to minimize absolute difference
    const diff1 = Math.abs(cStartAligned - otStart);
    const diff2 = Math.abs((cStartAligned - 1440) - otStart);
    const diff3 = Math.abs((cStartAligned + 1440) - otStart);

    if (diff2 < diff1 && diff2 < diff3) {
      cStartAligned -= 1440;
      cEndAligned -= 1440;
    } else if (diff3 < diff1 && diff3 < diff2) {
      cStartAligned += 1440;
      cEndAligned += 1440;
    }

    // Calculate the overtime intervals (before contract start, and after contract end)
    const minsBefore = Math.max(0, Math.min(otEnd, cStartAligned) - otStart);
    const minsAfter = Math.max(0, otEnd - Math.max(otStart, cEndAligned));
    computedTotalMins = minsBefore + minsAfter;

    if (computedTotalMins > 0) {
      const overlapBefore = get50Overlap(otStart, Math.min(otEnd, cStartAligned));
      const overlapAfter = get50Overlap(Math.max(otStart, cEndAligned), otEnd);
      mins50 = overlapBefore + overlapAfter;
    }
  }

  // Fallback if no contract schedule or no overtime minutes calculated outside contract shift
  if (computedTotalMins <= 0) {
    mins50 = get50Overlap(otStart, otEnd);
    computedTotalMins = otEnd - otStart;
  }

  if (computedTotalMins <= 0) {
    if (dayOfWeek >= 1 && dayOfWeek <= 5) return { h50: totalHours, h100: 0, pct: glossary.pct50 };
    return { h50: 0, h100: totalHours, pct: glossary.pct100 };
  }

  const ratio50 = mins50 / computedTotalMins;
  const h50 = totalHours * ratio50;
  const h100 = totalHours - h50;

  return {
    h50: parseFloat(h50.toFixed(2)),
    h100: parseFloat(h100.toFixed(2)),
    pct: h100 > h50 ? glossary.pct100 : glossary.pct50,
  };
};
