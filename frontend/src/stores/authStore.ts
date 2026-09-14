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
  metadata?: any;
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
  login: (email: string, password: string, tenantSlug?: string, clientId?: string) => Promise<{ requiresTenantSelection?: boolean; tenants?: Tenant[]; redirectTo?: string; user?: User }>;
  checkTenants: (email: string) => Promise<Tenant[]>;
  logout: () => void;
  /** Re-lee el usuario (y sobre todo sus permisos) desde el server. Ver la implementación. */
  refreshSession: () => Promise<void>;
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
      if (!savedUser) return null;
      const parsed = JSON.parse(savedUser);
      // Validar que tenga al menos un ID
      return parsed && (parsed.id || parsed._id) ? parsed : null;
    } catch {
      return null;
    }
  })(),
  token: localStorage.getItem("token"),
  tenantId: localStorage.getItem("tenantId") || "demo-tenant",
  isAuthenticated: (() => {
    const token = localStorage.getItem("token");
    const userStr = localStorage.getItem("user");
    let hasValidUser = false;
    try {
      if (userStr) {
        const u = JSON.parse(userStr);
        hasValidUser = !!(u && (u.id || u._id));
      }
    } catch {
      hasValidUser = false;
    }
    console.log("Auth store init - token:", !!token, "validUser:", hasValidUser);
    return !!(token && hasValidUser);
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
      const redirectTo = data?.redirectTo;

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

      return { redirectTo, user };
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

  /**
   * Vuelve a pedir el usuario al server y pisa el que está cacheado en localStorage.
   *
   * Hace falta porque `user.permissions` se guardaba SOLO en el login y no se refrescaba nunca: si a
   * un rol se le agregaba un permiso (o lo agregaba solo `ensureRole` al levantar el backend), quien
   * ya tenía la sesión abierta seguía sin ver el ítem del navbar hasta desloguearse y volver a
   * entrar. Pasó con Convenios / Sucursales / las tablas de ARCA.
   */
  async refreshSession() {
    const { token, user } = get();
    if (!token || !user) return;

    const base = normalizeBaseUrl(import.meta.env.VITE_API_URL);
    try {
      const res = await fetch(`${base}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": localStorage.getItem("tenantId") || user.tenantId || "",
        },
      });
      if (!res.ok) return; // 401/403 ya los maneja la validación de token del arranque.

      const data = await parseResponseSafely(res);
      const fresco = data?.user as User | undefined;
      if (!fresco?.id) return;

      // `/auth/me` no devuelve `clientId` (lo arma el login según con qué cliente se entró): se conserva.
      const actualizado: User = { ...user, ...fresco, ...(user.clientId && !fresco.clientId ? { clientId: user.clientId } : {}) };
      localStorage.setItem("user", JSON.stringify(actualizado));
      set({ user: actualizado });
    } catch {
      // Server caído o sin red: se sigue con lo cacheado, que es mejor que romper la sesión.
    }
  },

  setTenantId(tenantId: string) {
    localStorage.setItem("tenantId", tenantId);
    set({ tenantId });
  },

  hasPermission(permission: string): boolean {
    const { user } = get();
    if (!user) return false;

    const userRoles = (user.roles || []).map((r) => r.toLowerCase());
    const isSuperAdmin = userRoles.includes("superadmin") || user.primaryRole?.toLowerCase() === "superadmin";

    // SuperAdmin siempre tiene acceso total
    if (isSuperAdmin) {
      return true;
    }

    // Verificar permisos del usuario (incluido Admin)
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

/*
  AL VOLVER A LA APP SE RELEEN LOS PERMISOS.

  `refreshSession` corría una sola vez, al cargar la página. Si a alguien le cambiaban el rol mientras
  tenía la app abierta —en el teléfono pasa todo el tiempo: la app no se recarga, se vuelve a ella—,
  seguía viendo las tarjetas y el badge del rol viejo hasta cerrar sesión. Ahora se relee cada vez que
  la pestaña o la app vuelve a estar a la vista, como mucho una vez cada 30 segundos.
*/
if (typeof window !== "undefined" && typeof document !== "undefined") {
  let ultimoRefresco = 0;
  const refrescarAlVolver = () => {
    if (document.visibilityState !== "visible") return;
    const ahora = Date.now();
    if (ahora - ultimoRefresco < 30000) return;
    ultimoRefresco = ahora;
    void useAuthStore.getState().refreshSession();
  };
  document.addEventListener("visibilitychange", refrescarAlVolver);
  window.addEventListener("focus", refrescarAlVolver);
}
