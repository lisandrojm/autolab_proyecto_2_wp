export interface DailyReportEntry {
  employeeId: string;
  employeeName: string;
  attendance: 'present' | 'absent';
  absenceReason?: 'enfermedad' | 'vacaciones' | 'sin_aviso' | 'licencia' | 'otro';
  replacedBy?: string;
  extraHours?: {
    timeIn?: string;
    timeOut?: string;
    totalHours?: number;
  };
}

export interface DailyReport {
  date: string;
  area?: string;
  isHoliday: boolean;
  entries: DailyReportEntry[];
  createdAt: string;
  updatedAt?: string;
}

const reports: Map<string, DailyReport> = new Map();

const generateMockReport = (date: string): DailyReport => {
  return {
    date,
    area: 'Tecnología',
    isHoliday: false,
    entries: [
      {
        employeeId: 'team_001',
        employeeName: 'María González',
        attendance: 'present'
      },
      {
        employeeId: 'team_002',
        employeeName: 'Carlos Rodríguez',
        attendance: 'present',
        extraHours: {
          timeIn: '18:00',
          timeOut: '20:00',
          totalHours: 2
        }
      },
      {
        employeeId: 'team_004',
        employeeName: 'Luis Fernández',
        attendance: 'present'
      },
      {
        employeeId: 'team_008',
        employeeName: 'Diego Morales',
        attendance: 'present'
      }
    ],
    createdAt: new Date().toISOString()
  };
};

export const mockDailyReportService = {
  getReport: async (date: string): Promise<DailyReport> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    if (!reports.has(date)) {
      reports.set(date, generateMockReport(date));
    }
    return reports.get(date)!;
  },

  saveReport: async (date: string, report: DailyReport): Promise<DailyReport> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    report.updatedAt = new Date().toISOString();
    reports.set(date, report);
    return report;
  },

  getReportsByDateRange: async (startDate: string, endDate: string): Promise<DailyReport[]> => {
    await new Promise(resolve => setTimeout(resolve, 400));
    const result: DailyReport[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      if (reports.has(dateStr)) {
        result.push(reports.get(dateStr)!);
      }
    }
    return result;
  }
};
