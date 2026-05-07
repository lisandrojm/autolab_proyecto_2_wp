/**
 * Creates a fuzzy search regex string that ignores spaces between characters.
 * Example: "abc" -> "a\\s*b\\s*c"
 *
 * @param query The search query string
 * @returns A regex string
 */
export const createFuzzySearchRegex = (query) => {
    if (!query)
        return "";
    // Normalize query: lowercase, trim, remove internal spaces, remove accents
    const normalizedQuery = query
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // Escape special regex chars
    // Define accent map
    const accentMap = {
        'a': '[aáàäâ]',
        'e': '[eéèëê]',
        'i': '[iíìïî]',
        'o': '[oóòöô]',
        'u': '[uúùüû]',
        'n': '[nñ]'
    };
    // Create regex with optional whitespace and accent awareness
    return normalizedQuery
        .split("")
        .map(char => accentMap[char] || char)
        .join("\\s*");
};
