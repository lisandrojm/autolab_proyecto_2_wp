import { useEffect, useState } from "react";

type HealthMinimal = { ok?: boolean; ts?: number };

export function useHealth(pollMs = 10000) {
  const API = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
  const [loading, setLoading] = useState(true);
  const [serverOk, setServerOk] = useState<boolean | null>(null);
  const [data, setData] = useState<HealthMinimal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number>(Date.now());

  // Debug: Log API URL on mount
  useEffect(() => {
    console.log("🔍 useHealth - VITE_API_URL:", import.meta.env.VITE_API_URL);
    console.log("🔍 useHealth - API (processed):", API);
  }, []);

  const fetchHealth = async () => {
    if (!API) {
      setLoading(false);
      setServerOk(null);
      setError("VITE_API_URL no configurada");
      setLastCheckedAt(Date.now());
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API}/health`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: HealthMinimal = await res.json();
      setData(json);
      setServerOk(!!json.ok);
    } catch (e: any) {
      setData(null);
      setServerOk(false);
      setError(e?.message || "Error de red");
    } finally {
      setLoading(false);
      setLastCheckedAt(Date.now());
    }
  };

  useEffect(() => {
    fetchHealth();
    const id = window.setInterval(fetchHealth, pollMs);
    return () => window.clearInterval(id);
  }, [API, pollMs]);

  return { loading, serverOk, data, error, refetch: fetchHealth, lastCheckedAt, pollMs };
}
