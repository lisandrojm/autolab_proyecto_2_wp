export interface OvertimeSettings {
  weekdayDayStart: string;
  weekdayDayEnd: string;
  satDayStart: string;
  satDayEnd: string;
  pct50: number;
  pct100: number;
  baseWorkdayHours: number;
}

const STORAGE_KEY = "@autolab/overtime_glossary";

export const DEFAULT_GLOSSARY: OvertimeSettings = {
  weekdayDayStart: "06:00",
  weekdayDayEnd: "20:59",
  satDayStart: "06:00",
  satDayEnd: "12:59",
  pct50: 50,
  pct100: 100,
  baseWorkdayHours: 8,
};

export const overtimeUtils = {
  getGlossary: (): OvertimeSettings => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_GLOSSARY;
    try {
      return JSON.parse(stored);
    } catch {
      return DEFAULT_GLOSSARY;
    }
  },
  saveGlossary: (glossary: OvertimeSettings) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(glossary));
  },
};
