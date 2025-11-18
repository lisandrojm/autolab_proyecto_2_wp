import axios from "./axiosConfig";

/* ------------------------------ Tipos base ------------------------------ */
type ObjectIdString = string & { readonly __objectIdBrand: unique symbol };

export interface TenantRef {
  _id: ObjectIdString;
  slug?: string;
  name?: string;
}

/* ------------------------------ Tipos dominio ------------------------------ */
export interface RagDocument {
  _id: string;

  /** ← ahora viaja como OBJETO (no tenantId string) */
  tenant?: TenantRef;

  source: "upload" | "brief" | "guideline" | "email" | "post";
  title: string;
  assetId?: string;
  language: string;
  labels: string[];
  status: "processing" | "ready" | "failed";
  chunkCount: number;
  meta: {
    clientId?: string;
    campaignId?: string;
    tags?: string[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface RagQueryResult {
  vector: SearchResult[];
  text: SearchResult[];
  hybrid: SearchResult[];
}

export interface SearchResult {
  id: string;
  score: number;
  text: string;
  metadata: Record<string, any>;
  document?: {
    id: string;
    title: string;
    source: string;
    labels: string[];
  };
  chunk?: {
    order: number;
    tokens: number;
  };
  hybridScore?: number;
}

export interface RagDocumentsListResponse {
  documents: RagDocument[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/* ------------------------------ Normalizadores ------------------------------ */
function normalizeTenant(raw: any): TenantRef | undefined {
  // Acepta varias formas: raw.tenant {_id, slug, name} | raw.tenantId | string
  const t = raw?.tenant ?? {};
  const idLike = t?._id ?? raw?.tenantId ?? t?.id ?? (typeof t === "string" ? t : undefined);

  const id = typeof idLike === "string" && /^[a-f\d]{24}$/i.test(idLike) ? (idLike as ObjectIdString) : undefined;

  if (!id) return undefined;

  const slug = t?.slug ?? raw?.tenantSlug ?? undefined;
  const name = t?.name ?? raw?.tenantName ?? undefined;

  return { _id: id, slug, name };
}

function normalizeDoc(raw: any): RagDocument {
  return {
    _id: String(raw?._id ?? ""),
    tenant: normalizeTenant(raw),
    source: raw?.source ?? "upload",
    title: raw?.title ?? "",
    assetId: raw?.assetId ?? undefined,
    language: raw?.language ?? "es",
    labels: Array.isArray(raw?.labels) ? raw.labels : [],
    status: raw?.status ?? "processing",
    chunkCount: Number(raw?.chunkCount ?? 0),
    meta: {
      clientId: raw?.meta?.clientId ?? undefined,
      campaignId: raw?.meta?.campaignId ?? undefined,
      tags: Array.isArray(raw?.meta?.tags) ? raw.meta.tags : [],
    },
    createdAt: String(raw?.createdAt ?? ""),
    updatedAt: String(raw?.updatedAt ?? ""),
  };
}

/* ------------------------------ API ------------------------------ */
class RagAPI {
  private getHeaders() {
    const token = localStorage.getItem("token");
    // Preferí el slug si está cacheado; si no, el _id
    const tenantSlug = localStorage.getItem("tenantSlug");
    const tenantId = localStorage.getItem("tenantId");

    return {
      Authorization: `Bearer ${token}`,
      "X-Tenant-Id": tenantSlug || tenantId || "",
      "Content-Type": "application/json",
    };
  }

  async ingestDocument(data: {
    assetId?: string;
    text?: string;
    title: string;
    labels?: string[];
    language?: string;
    meta?: {
      clientId?: string;
      campaignId?: string;
      tags?: string[];
    };
  }): Promise<RagDocument> {
    const response = await axios.post(`/rag/ingest`, data, { headers: this.getHeaders() });
    return normalizeDoc(response.data);
  }

  async queryDocuments(params: {
    query: string;
    topK?: number;
    filters?: {
      clientId?: string;
      campaignId?: string;
      labels?: string[];
      language?: string;
    };
  }): Promise<RagQueryResult> {
    const response = await axios.post(`/rag/query`, params, { headers: this.getHeaders() });
    // Resultados del RAG suelen no requerir normalización del doc completo
    return response.data as RagQueryResult;
  }

  async listDocuments(
    filters: {
      source?: string;
      labels?: string[];
      status?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<RagDocumentsListResponse> {
    const params = new URLSearchParams();

    if (filters.source) params.append("source", filters.source);
    if (filters.labels) filters.labels.forEach((label) => params.append("labels", label));
    if (filters.status) params.append("status", filters.status);
    if (filters.page) params.append("page", filters.page.toString());
    if (filters.limit) params.append("limit", filters.limit.toString());

    const response = await axios.get(`/rag/docs?${params.toString()}`, { headers: this.getHeaders() });

    const raw = response.data;
    const rows: any[] = Array.isArray(raw?.documents) ? raw.documents : Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : [];

    return {
      documents: rows.map(normalizeDoc),
      pagination: raw?.pagination ?? {
        page: Number(filters.page ?? 1),
        limit: Number(filters.limit ?? rows.length ?? 0),
        total: Number(raw?.total ?? rows.length ?? 0),
        pages: Number(raw?.pages ?? 1),
      },
    };
  }

  async reindexDocument(docId: string): Promise<RagDocument> {
    const response = await axios.post(`/rag/reindex/${docId}`, {}, { headers: this.getHeaders() });
    return normalizeDoc(response.data);
  }

  async deleteDocument(docId: string): Promise<void> {
    await axios.delete(`/rag/docs/${docId}`, { headers: this.getHeaders() });
  }
}

export const ragAPI = new RagAPI();
