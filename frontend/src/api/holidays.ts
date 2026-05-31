import axios from "./axiosConfig";

export interface Holiday {
  _id: string;
  tenantId: string;
  date: string; // ISO Date String
  name: string;
  type: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

class HolidaysAPI {
  private getHeaders() {
    const token = localStorage.getItem("token");
    const tenantSlug = localStorage.getItem("tenantSlug");
    const tenantId = localStorage.getItem("tenantId");

    return {
      Authorization: `Bearer ${token}`,
      "X-Tenant-Id": tenantSlug || tenantId || "",
    };
  }

  async list(params: { name?: string; year?: string } = {}): Promise<Holiday[]> {
    const searchParams = new URLSearchParams();
    if (params.name) searchParams.append("name", params.name);
    if (params.year) searchParams.append("year", params.year);

    const { data } = await axios.get(`/holidays?${searchParams.toString()}`, {
      headers: this.getHeaders(),
    });

    return Array.isArray(data?.holidays) ? data.holidays : [];
  }

  async create(data: { date: string; name: string; type: string; description?: string }): Promise<Holiday> {
    const { data: created } = await axios.post(`/holidays`, data, {
      headers: {
        ...this.getHeaders(),
        "Content-Type": "application/json",
      },
    });
    return created;
  }

  async update(
    id: string,
    data: { date?: string; name?: string; type?: string; description?: string }
  ): Promise<Holiday> {
    const { data: updated } = await axios.put(`/holidays/${id}`, data, {
      headers: {
        ...this.getHeaders(),
        "Content-Type": "application/json",
      },
    });
    return updated;
  }

  async remove(id: string): Promise<void> {
    await axios.delete(`/holidays/${id}`, {
      headers: this.getHeaders(),
    });
  }

  async downloadTemplate(): Promise<Blob> {
    const { data } = await axios.get(`/holidays/template`, {
      headers: this.getHeaders(),
      responseType: "blob",
    });
    return data;
  }

  async importExcel(file: File): Promise<{ message: string; count: number }> {
    const formData = new FormData();
    formData.append("file", file);

    const { data } = await axios.post(`/holidays/import`, formData, {
      headers: {
        ...this.getHeaders(),
        "Content-Type": "multipart/form-data",
      },
    });
    return data;
  }
}

export const holidaysAPI = new HolidaysAPI();
