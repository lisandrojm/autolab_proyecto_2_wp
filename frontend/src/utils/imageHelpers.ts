/**
 * Utilidad para gestionar URLs de imágenes del sistema
 */

// Obtener la base URL del servidor (sin /api/v1 porque storage se sirve en la raíz)
const getServerBase = (): string => {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
  // Remover /api/v1 o cualquier path para obtener solo el dominio:puerto
  const base = apiUrl.replace(/\/api\/v\d+$/, '');
  console.log('[imageHelpers] Server base URL:', base, 'from VITE_API_URL:', apiUrl);
  return base;
};

const SERVER_BASE = getServerBase();

/**
 * Convierte una URL de imagen del sistema a una URL utilizable
 * @param imageUrl - URL de imagen (puede ser completa o relativa)
 * @returns URL procesada lista para usar en src de img
 */
export function getImageUrl(imageUrl: string | undefined | null): string | undefined {
  if (!imageUrl) {
    console.log('[getImageUrl] No URL provided');
    return undefined;
  }

  // Si es una URL de datos (data:image) retornar tal cual (para previews)
  if (imageUrl.startsWith('data:')) {
    console.log('[getImageUrl] Data URL detected');
    return imageUrl;
  }

  // Si es una URL completa externa (https://, http://)
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    // Si es del mismo dominio del servidor, usarla tal cual
    if (imageUrl.startsWith(SERVER_BASE)) {
      console.log('[getImageUrl] Same domain URL:', imageUrl);
      return imageUrl;
    }
    // Si es de otro dominio (CDN, externa), retornar tal cual
    console.log('[getImageUrl] External URL:', imageUrl);
    return imageUrl;
  }

  // Si es una ruta relativa que empieza con /storage
  if (imageUrl.startsWith('/storage')) {
    const fullUrl = `${SERVER_BASE}${imageUrl}`;
    console.log('[getImageUrl] Relative storage URL:', imageUrl, '→', fullUrl);
    return fullUrl;
  }

  // Si es una ruta relativa sin /storage
  if (imageUrl.startsWith('/')) {
    const fullUrl = `${SERVER_BASE}${imageUrl}`;
    console.log('[getImageUrl] Relative URL:', imageUrl, '→', fullUrl);
    return fullUrl;
  }

  // Por defecto, asumir que es una ruta relativa y agregar SERVER_BASE
  const fullUrl = `${SERVER_BASE}/${imageUrl}`;
  console.log('[getImageUrl] Default case:', imageUrl, '→', fullUrl);
  return fullUrl;
}

/**
 * Valida si una URL de imagen es válida
 * @param imageUrl - URL a validar
 * @returns true si la URL es válida
 */
export function isValidImageUrl(imageUrl: string | undefined | null): boolean {
  if (!imageUrl) return false;

  // URLs de datos siempre válidas
  if (imageUrl.startsWith('data:')) return true;

  // URLs completas
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) return true;

  // Rutas relativas
  if (imageUrl.startsWith('/')) return true;

  return false;
}

/**
 * Obtiene una URL para abrir la imagen en una nueva pestaña
 * @param imageUrl - URL de imagen
 * @returns URL procesada para abrir en nueva pestaña
 */
export function getImageFullUrl(imageUrl: string | undefined | null): string | undefined {
  // Usar la misma lógica que getImageUrl
  return getImageUrl(imageUrl);
}
