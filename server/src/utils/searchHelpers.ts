/**
 * Creates a fuzzy search regex string that ignores spaces between characters.
 * Example: "abc" -> "a\\s*b\\s*c"
 * 
 * @param query The search query string
 * @returns A regex string
 */
export const createFuzzySearchRegex = (query: string): string => {
  if (!query) return "";
  
  // Remove spaces from the query and escape special regex characters
  const normalizedQuery = query.trim().replace(/\s+/g, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  
  // Create a regex that allows optional whitespace between every character
  return normalizedQuery.split("").join("\\s*");
};
