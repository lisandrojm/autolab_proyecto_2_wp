/**
 * Checks if a target string matches a search query, ignoring spaces and case.
 * 
 * @param target The string to search within
 * @param query The search query
 * @returns boolean
 */
export const fuzzyMatch = (target: string | null | undefined, query: string): boolean => {
  if (!query) return true;
  if (!target) return false;
  
  const normalize = (str: string) => 
    str.toLowerCase()
       .normalize("NFD")
       .replace(/[\u0300-\u036f]/g, "")
       .replace(/\s+/g, "");

  const normalizedQuery = normalize(query);
  const normalizedTarget = normalize(target);
  
  return normalizedTarget.includes(normalizedQuery);
};
