// api/auth.ts (frontend) — tenant via OBJETO, no mongoose en el browser

// Un tipo útil para _id (sigue siendo string en runtime, pero tipado más estricto)
type ObjectIdString = string & { readonly __objectIdBrand: unique symbol };
const isObjectIdString = (v: unknown): v is ObjectIdString => typeof v === "string" && /^[a-f\d]{24}$/i.test(v);

// Referencia compacta de Tenant que “viaja” como objeto
export interface TenantRef {
  _id: ObjectIdString;
  slug?: string;
  name?: string;
}

export interface RegisterPayload {
  firstName: string;
  lastName: string;
  email: string;
  tenantSlug: string; // en el registro elegís por slug
  password: string;
}

export interface RegisterTenantPayload {
  companyName: string;
  slug: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role: string;
    roles?: string[];
    permissions?: string[];
    // ← ahora viene un OBJETO tenant (no un string suelto)
    tenant: TenantRef;
  };
}

/**
 * Registro: mandamos tenantSlug y el backend resuelve tenantId.
 * Devolvemos user.tenant como objeto {_id, slug, name?}.
 */
export async function apiRegister(payload: RegisterPayload): Promise<AuthResponse> {
  const url = `${import.meta.env.VITE_API_URL}/auth/register`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // En dev tu API puede scopear por este header (slug o id según tu backend)
      "X-Tenant-Id": payload.tenantSlug,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error || errorData.message || `HTTP ${response.status}`;
    throw new Error(message);
  }

  const data = (await response.json()) as AuthResponse;

  // sanity check liviano
  if (!data?.user?.tenant || !isObjectIdString(data.user.tenant._id)) {
    console.warn("AuthResponse.user.tenant._id no parece un ObjectId válido:", data?.user?.tenant);
  }

  return data;
}

/**
 * Chequear disponibilidad de email.
 * Acepta un OBJETO tenant (puede traer slug y/o _id). Se prioriza slug.
 */
export async function checkEmailAvailability(
  email: string,
  tenant: { slug?: string; _id?: string } // objeto, no string
): Promise<{ available: boolean }> {
  const base = `${import.meta.env.VITE_API_URL}/auth/check-email`;
  const params = new URLSearchParams({ email });

  // Priorizar slug para coherencia con el registro
  if (tenant?.slug) params.append("tenantSlug", tenant.slug);
  else if (tenant?._id) params.append("tenantId", tenant._id);

  const response = await fetch(`${base}?${params.toString()}`, {
    headers: {
      "Content-Type": "application/json",
      // En muchos backends este header es obligatorio para el scoping
      "X-Tenant-Id": tenant?.slug || tenant?._id || "",
    },
  });

  if (!response.ok) {
    const txt = await response.text().catch(() => "");
    throw new Error(`Error checking email availability (${response.status}) ${txt}`);
  }

  return response.json();
}

/**
 * Registro de tenant público con creación automática de usuario admin.
 */
export async function apiRegisterTenant(payload: RegisterTenantPayload): Promise<AuthResponse> {
  const url = `${import.meta.env.VITE_API_URL}/auth/register-tenant`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error || errorData.message || `HTTP ${response.status}`;
    throw new Error(message);
  }

  const data = (await response.json()) as AuthResponse;
  return data;
}
