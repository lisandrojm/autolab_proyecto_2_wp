import { eachDayOfInterval, format, parseISO } from "date-fns";
import { useState, useEffect } from "react";
import { personnelAPI } from "../../../../api/personnel";
import { vacationsAPI, VacationRequest } from "../../../../api/vacations";

export const useVacations = () => {
  const [vacations, setVacations] = useState<VacationRequest[]>([]);
  const [availableDays, setAvailableDays] = useState<{ total: number; used: number; available: number; pending?: number } | null>(null);
  const [occupiedDates, setOccupiedDates] = useState<string[]>([]); // All blocked dates
  const [pendingDates, setPendingDates] = useState<string[]>([]);
  const [approvedDates, setApprovedDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVacations = async () => {
    try {
      setLoading(true);
      setError(null);
      const [vacationsData, profileStats, availabilityData] = await Promise.all([vacationsAPI.getAll({ mine: true }), personnelAPI.getProfileStats(), vacationsAPI.getAvailability()]);
      setVacations(vacationsData);
      setAvailableDays(profileStats.vacations);

      const pendingSet = new Set<string>();
      const approvedSet = new Set<string>();

      // 1. Process received availability (from text blocks by others)
      // availabilityData is now { date: string, status: string }[]
      availabilityData.forEach((item: any) => {
        if (item.status === "pending") {
          pendingSet.add(item.date);
        } else {
          approvedSet.add(item.date);
        }
      });

      // 2. Process user's own vacations
      vacationsData.forEach((v) => {
        if (["pending", "pre_approved", "approved", "delivered"].includes(v.status) && v.startDate && v.endDate) {
          try {
            const start = parseISO(v.startDate);
            const end = parseISO(v.endDate);
            const days = eachDayOfInterval({ start, end });

            days.forEach((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              if (v.status === "pending") {
                pendingSet.add(dateStr);
              } else {
                approvedSet.add(dateStr);
              }
            });
          } catch (e) {
            console.error("Error parsing vacation dates:", e);
          }
        }
      });

      // Merge: If a date is in BOTH sets (e.g. strict overlap or self-overlap logic),
      // prioritized status? Pending implies "might get free", Approved implies "occupied".
      // But typically a date won't be in both for a single user context unless checking availability logic.
      // If backend says Pending and local says Approved... unlikely.
      // We expose both sets.

      const allOccupied = Array.from(new Set([...pendingSet, ...approvedSet]));
      setOccupiedDates(allOccupied);
      setPendingDates(Array.from(pendingSet));
      setApprovedDates(Array.from(approvedSet));

      console.log("Occupied Dates received (merged):", allOccupied);
    } catch (err: any) {
      setError(err.response?.data?.error || "Error al cargar vacaciones");
      console.error("Error fetching vacations:", err);
    } finally {
      setLoading(false);
    }
  };

  const createVacation = async (vacationData: { startDate: string; endDate: string; reason: string }) => {
    try {
      setError(null);
      const newVacation = await vacationsAPI.create(vacationData);
      await fetchVacations();
      return newVacation;
    } catch (err: any) {
      setError(err.response?.data?.error || "Error al crear solicitud de vacaciones");
      throw err;
    }
  };

  const deleteVacation = async (id: string) => {
    try {
      setError(null);
      await vacationsAPI.delete(id);
      await fetchVacations();
    } catch (err: any) {
      setError(err.response?.data?.error || "Error al eliminar solicitud");
      throw err;
    }
  };

  useEffect(() => {
    fetchVacations();
  }, []);

  return {
    vacations,
    availableDays,
    occupiedDates,
    pendingDates,
    approvedDates,
    loading,
    error,
    refetch: fetchVacations,
    createVacation,
    deleteVacation,
  };
};
