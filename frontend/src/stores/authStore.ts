import { create } from "zustand";

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  roles: string[];
  primaryRole?: string | null; // Nombre del rol principal (primer rol del array)
  clientIds?: string[];
  clientId?: string;
  permissions?: string[];
  tenantId: string;
  tenantSlug?: string;
}

interface Tenant {
  _id: string;
  name: string;
  slug: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  tenantId: string;
  isAuthenticated: boolean;
  login: (email: string, password: string, tenantSlug?: string, clientId?: string) => Promise<{ requiresTenantSelection?: boolean; tenants?: Tenant[] }>;
  checkTenants: (email: string) => Promise<Tenant[]>;
  logout: () => void;
  setTenantId: (tenantId: string) => void;
  hasPermission: (permission: string) => boolean;
  getPrimaryRole: () => string | null;
}

function normalizeBaseUrl(raw?: string): string {
  const base = (raw && raw.trim()) || "/api/v1";
  // evitar dobles barras al concatenar endpoints
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

async function parseResponseSafely(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: (() => {
    try {
      const savedUser = localStorage.getItem("user");
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  })(),
  token: localStorage.getItem("token"),
  tenantId: localStorage.getItem("tenantId") || "demo-tenant",
  isAuthenticated: (() => {
    const token = localStorage.getItem("token");
    const user = localStorage.getItem("user");
    console.log("Auth store init - token:", !!token, "user:", !!user);
    return !!(token && user);
  })(),

  async checkTenants(email) {
    const base = normalizeBaseUrl(import.meta.env.VITE_API_URL);
    const url = `${base}/auth/check-tenants`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await parseResponseSafely(res);

      if (!res.ok) {
        return [];
      }

      return data?.tenants || [];
    } catch (error) {
      console.error("Error checking tenants:", error);
      return [];
    }
  },

  async login(email, password, tenantSlug, clientId) {
    const base = normalizeBaseUrl(import.meta.env.VITE_API_URL);
    const url = `${base}/auth/login`;

    let data: any = null;
    let res: Response | null = null;

    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          ...(tenantSlug ? { tenantSlug } : {}),
          ...(clientId ? { clientId } : {}),
        }),
      });

      data = await parseResponseSafely(res);

      // Si hay múltiples tenants, devolver info para selección
      if (res.status === 300 && data?.requiresTenantSelection) {
        return {
          requiresTenantSelection: true,
          tenants: data.tenants || [],
        };
      }

      if (!res.ok) {
        const err = {
          __api: true,
          status: res.status,
          statusText: res.statusText,
          url,
          method: "POST",
          data,
          message: (data && (data.message || data.error || data.msg)) || `HTTP ${res.status}`,
        };
        throw err;
      }

      // Éxito
      const token = data?.token;
      const user = data?.user as User | undefined;

      if (!token) {
        const err = {
          __api: true,
          status: 500,
          url,
          method: "POST",
          data,
          message: "Missing token in response",
        };
        throw err;
      }

      localStorage.setItem("token", token);
      localStorage.setItem("tenantId", user?.tenantId || "");
      if (user?.tenantSlug) {
        localStorage.setItem("tenantSlug", user.tenantSlug);
      }
      if (user) {
        localStorage.setItem("user", JSON.stringify(user));
      }
      set({
        token,
        tenantId: user?.tenantId || "",
        isAuthenticated: true,
        user: user || null,
      });

      return {};
    } catch (error: any) {
      // Propagamos un error estructurado para que el componente lo muestre bien
      if (error?.__api) {
        throw error;
      }
      // Network / CORS / fetch TypeError
      throw {
        __api: true,
        status: res?.status ?? "ERR",
        url,
        method: "POST",
        data,
        message: error?.message || "Network error (¿CORS? ¿URL del API correcta? ¿Servidor caído?)",
      };
    }
  },

  logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("tenantId");
    localStorage.removeItem("user");
    localStorage.removeItem("tenantSlug");
    set({ user: null, token: null, isAuthenticated: false });
  },

  setTenantId(tenantId: string) {
    localStorage.setItem("tenantId", tenantId);
    set({ tenantId });
  },

  hasPermission(permission: string): boolean {
    const { user } = get();
    if (!user) return false;

    // Verificar permisos del usuario
    const permissions = user.permissions || [];
    const [module, action] = permission.split(":");

    // Sistema simplificado: module:view otorga acceso completo por defecto
    const hasViewPermission = permissions.includes(`${module}:view`);
    const hasWildcard = permissions.includes("*") || permissions.includes(`${module}:*`);
    const hasSpecificPermission = permissions.includes(permission);

    // Si tiene view, tiene acceso completo a menos que requiera permiso específico
    return hasWildcard || hasSpecificPermission || (action !== "view" && hasViewPermission);
  },

  getPrimaryRole(): string | null {
    const { user } = get();
    if (!user) return null;
    // Primero intentar usar primaryRole si existe
    if (user.primaryRole) return user.primaryRole;
    // Si no, usar el primer rol del array (ahora son nombres, no IDs)
    if (user.roles && user.roles.length > 0) return user.roles[0];
    return null;
  },
}));
