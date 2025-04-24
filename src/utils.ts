import * as mm from "micromatch";

export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function enumKeys<O extends object, K extends keyof O = keyof O>(
    obj: O
): K[] {
    return Object.keys(obj).filter((k) => Number.isNaN(+k)) as K[];
}

export function generateRandomString(n: number): string {
    let result = '';
    const characters = '0123456789abcdef';

    for (let i = 0; i < n; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters[randomIndex];
    }

    return result;
}

export function isMatchBetweenPathAndPatterns(
    path: string,
    patterns: string[],
): boolean {
    patterns = patterns
        .map(p => p.trim())
        .filter((p) => p.length > 0);
    if (patterns.length === 0) {
        return false;
    }

    const exclusionPatterns = patterns.filter((p) => p.startsWith('!')).map(p => p.slice(1));
    const inclusionPatterns = patterns.filter((p) => !p.startsWith('!'));

    return mm.some(path, inclusionPatterns) && !mm.some(path, exclusionPatterns);
}

export function extractNextWordAndRemaining(suggestion: string): [string | undefined, string | undefined] {
    const leadingWhitespacesMatch = suggestion.match(/^(\s*)/);
    const leadingWhitespaces = leadingWhitespacesMatch ? leadingWhitespacesMatch[0] : '';
    const trimmedSuggestion = suggestion.slice(leadingWhitespaces.length);


    let nextWord: string | undefined;
    let remaining: string | undefined = undefined;

    const whitespaceAfterNextWordMatch = trimmedSuggestion.match(/\s+/);
    if (!whitespaceAfterNextWordMatch) {
        nextWord = trimmedSuggestion || undefined;
    } else {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const whitespaceAfterNextWordStartingIndex = whitespaceAfterNextWordMatch.index!;
        const whitespaceAfterNextWord = whitespaceAfterNextWordMatch[0];
        const whitespaceLength = whitespaceAfterNextWord.length;
        const startOfWhitespaceAfterNextWordIndex = whitespaceAfterNextWordStartingIndex + whitespaceLength;

        nextWord = trimmedSuggestion.substring(0, whitespaceAfterNextWordStartingIndex);
        if (startOfWhitespaceAfterNextWordIndex < trimmedSuggestion.length) {
            remaining = trimmedSuggestion.slice(startOfWhitespaceAfterNextWordIndex);
            nextWord += whitespaceAfterNextWord;
        }
    }

    return [nextWord ? leadingWhitespaces + nextWord : undefined, remaining];
}

