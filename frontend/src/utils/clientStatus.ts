import { Client } from "../api/clients";

export type BrandKitStatus = "complete" | "partial" | "pending";
export type ClientStatus = "active" | "inactive" | "onboarding";

export const getBrandKitStatus = (client: Client | null | undefined): BrandKitStatus => {
  if (!client?.brandKit) return "pending";

  const brandKit = client.brandKit;
  const hasLogo = brandKit.logos && brandKit.logos.length > 0;
  const hasColors = brandKit.colors && brandKit.colors.length > 0;
  const hasFonts = brandKit.fonts && brandKit.fonts.length > 0;

  if (hasLogo && hasColors && hasFonts) return "complete";
  if (hasLogo || hasColors || hasFonts) return "partial";
  return "pending";
};

export const getBrandKitBadgeVariant = (status: BrandKitStatus): "success" | "warning" | "blue" => {
  switch (status) {
    case "complete":
      return "success";
    case "partial":
      return "warning";
    case "pending":
      return "blue";
    default:
      return "warning";
  }
};

export const getBrandKitLabel = (status: BrandKitStatus): string => {
  switch (status) {
    case "complete":
      return "Completo";
    case "partial":
      return "Parcial";
    case "pending":
      return "Pendiente";
    default:
      return "Desconocido";
  }
};

export const getClientStatusBadgeVariant = (status: ClientStatus): "success" | "warning" | "blue" => {
  switch (status) {
    case "active":
      return "success";
    case "onboarding":
      return "warning";
    case "inactive":
      return "blue";
    default:
      return "warning";
  }
};

export const getClientStatusLabel = (status: ClientStatus | string): string => {
  if (!status) return "Activo";
  return status.charAt(0).toUpperCase() + status.slice(1);
};
