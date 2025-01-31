/**
 * StringExpressionMatcher class allows matching predefined expressions against
 * a stream of characters, processing one character at a time.
 */
export class StringExpressionMatcher {
    private expressions: Record<string, string>;
    private potentialMatches: Record<string, number[]>;

    /**
     * Constructs an StringExpressionMatcher instance.
     *
     * @param expressions - A record mapping keys to their respective matching strings.
     * @throws Will throw an error if any validation fails:
     *   - Duplicate matching strings.
     *   - One matching string is a suffix of another.
     *   - Matching strings are empty.
     */
    constructor(expressions: Record<string, string>) {
        this.validateExpressions(expressions);
        this.expressions = expressions;
        this.potentialMatches = {} as Record<string, number[]>;

        // Populate reverseMap for quick lookup of keys by their matching strings
        for (const key of Object.keys(expressions)) {
            this.potentialMatches[key] = [];
        }
    }

    /**
     * Processes the next character in the input stream.
     *
     * @param ch - The next character to process. Must be a single character string.
     * @returns A single key if any matches are found; otherwise, `null`.
     * @throws Will throw an error if the input character is not a single character string.
     */
    public next(ch: string): string | null{
        if (ch.length !== 1) {
            throw new Error(`Input to next() must be a single character. Received: "${ch}"`);
        }

        let matched: string | null = null;
        for (const [key, expr] of Object.entries(this.expressions)) { // loop through the expressions
            const progresses: number[] = this.potentialMatches[key];
            progresses.push(0);
            for (let i = progresses.length - 1; i >= 0; i--) { // reverse loop so that removal of an element won't affect the next element in the loop
                if (ch === expr[progresses[i]]) { // matched
                    progresses[i] += 1;
                    // if fully matched, set and remove
                    if (progresses[i] === expr.length) {
                        if (matched !== null) {
                            throw Error("Should not have expected this, since no repeating suffix!");
                        }
                        matched = key;
                        progresses.splice(i, 1);
                    }
                } else { // not match, remove it
                    progresses.splice(i, 1);
                }
            }
        }
        return matched;
    }

    /**
     * Resets the internal potential matches, clearing any ongoing match progress.
     * This can be used to prevent overlapping matches.
     */
    public reset(): void {
        for (const key of Object.keys(this.potentialMatches)) {
            this.potentialMatches[key] = [];
        }
    }

    /**
     * Validates the input expressions to ensure no ambiguities in matching.
     *
     * @param expressions - The expressions to validate.
     * @throws Will throw an error if:
     *   - Any matching string is empty.
     *   - There are duplicate matching strings.
     *   - Any matching string is a suffix of another.
     */
    private validateExpressions(expressions: Record<string, string>): void {
        const values = Object.values(expressions);
        if (values.length === 0) {
            throw new Error("Must have some expression to match.");
        }

        // Check for empty strings
        if (values.some(value => value.length === 0)) {
            throw new Error("Matching strings must be non-empty.");
        }

        // Check for suffix ambiguities
        for (let i = 0; i < values.length; i++) {
            for (let j = 0; j < values.length; j++) {
                if (i === j) continue;
                const strA = values[i];
                const strB = values[j];
                if (strA.endsWith(strB)) {
                    throw new Error(`Ambiguous expressions: "${strA}" has "${strB}" as a suffix.`);
                }
            }
        }
    }

    /**
     * Gets the length of the expression to be matched
     * @param key 
     * @returns The length of the expression to be matched
     */
    public getLength(key: string): number {
        return this.expressions[key].length;
    }

    /**
     * Gets the maximum length of all expressions.
     * @returns The maximum length.
     */
    public getMaxExpressionLength(): number {
        let maxLength = 0;
        for (const key in this.expressions) {
            if (this.expressions.hasOwnProperty(key)) {
                const length = this.expressions[key].length;
                if (length > maxLength) {
                    maxLength = length;
                }
            }
        }
        return maxLength;
    }
}