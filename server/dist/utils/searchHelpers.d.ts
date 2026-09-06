/**
 * Creates a fuzzy search regex string that ignores spaces between characters.
 * Example: "abc" -> "a\\s*b\\s*c"
 *
 * @param query The search query string
 * @returns A regex string
 */
export declare const createFuzzySearchRegex: (query: string) => string;
