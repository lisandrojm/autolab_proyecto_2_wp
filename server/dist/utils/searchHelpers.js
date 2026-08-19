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
    const queryWords = query.trim().split(/\s+/);
    const accentMap = {
        'a': '[aáàäâ]',
        'e': '[eéèëê]',
        'i': '[iíìïî]',
        'o': '[oóòöô]',
        'u': '[uúùüû]',
        'n': '[nñ]'
    };
    const processWord = (word) => {
        return word
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            .split("")
            .map(char => accentMap[char] || char)
            .join("\\s*");
    };
    if (queryWords.length === 1) {
        return processWord(queryWords[0]);
    }
    // For multiple words, use lookaheads to ensure all words are present in any order
    return queryWords
        .map(word => `(?=.*${processWord(word)})`)
        .join("");
};
