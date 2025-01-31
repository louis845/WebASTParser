/**
 * ExpressionMatcher class allows matching predefined expressions against
 * a stream of numbers, processing one number at a time.
 */
export class ExpressionMatcher {
    private expressions: Record<string, number[]>;
    private potentialMatches: Record<string, number[]>;

    /**
     * Constructs an ExpressionMatcher instance.
     *
     * @param expressions - A record mapping keys to their respective matching number arrays.
     * @throws Will throw an error if any validation fails:
     *   - Duplicate matching sequences.
     *   - One matching sequence is a suffix of another.
     *   - Matching sequences are empty.
     */
    constructor(expressions: Record<string, number[]>) {
        this.validateExpressions(expressions);
        this.expressions = expressions;
        this.potentialMatches = {} as Record<string, number[]>;

        // Initialize potentialMatches for each key
        for (const key of Object.keys(expressions)) {
            this.potentialMatches[key] = [];
        }
    }

    /**
     * Processes the next number in the input stream.
     *
     * @param num - The next number to process.
     * @returns A single key if any matches are found; otherwise, `null`.
     */
    public next(num: number): string | null {
        let matched: string | null = null;
        for (const [key, expr] of Object.entries(this.expressions)) { // Loop through the expressions
            const progresses: number[] = this.potentialMatches[key];
            progresses.push(0); // Start a new potential match
            for (let i = progresses.length - 1; i >= 0; i--) { // Reverse loop to safely remove items
                const currentProgress = progresses[i];
                if (num === expr[currentProgress]) { // Match found for current position
                    progresses[i] += 1; // Advance the progress
                    // If the expression is fully matched
                    if (progresses[i] === expr.length) {
                        if (matched !== null) {
                            throw Error("Multiple matches detected, which violates non-overlapping suffix constraint.");
                        }
                        matched = key;
                        progresses.splice(i, 1); // Remove completed progress
                    }
                } else { // No match, remove this progress
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
     *   - Any matching sequence is empty.
     *   - There are duplicate matching sequences.
     *   - Any matching sequence is a suffix of another.
     */
    private validateExpressions(expressions: Record<string, number[]>): void {
        const values = Object.values(expressions);
        if (values.length === 0) {
            throw new Error("Must have some expression to match.");
        }

        // Check for empty sequences
        if (values.some(value => value.length === 0)) {
            throw new Error("Matching sequences must be non-empty.");
        }

        // Check for suffix ambiguities
        for (let i = 0; i < values.length; i++) {
            for (let j = 0; j < values.length; j++) {
                if (i === j) continue;
                const seqA = values[i];
                const seqB = values[j];
                if (this.isSuffix(seqA, seqB)) {
                    throw new Error(`Ambiguous expressions: [${seqA}] has [${seqB}] as a suffix.`);
                }
            }
        }

        // Check for duplicate sequences
        const uniqueSequences = new Set(values.map(seq => JSON.stringify(seq)));
        if (uniqueSequences.size !== values.length) {
            throw new Error("Duplicate matching sequences are not allowed.");
        }
    }

    /**
     * Checks if seqB is a suffix of seqA.
     *
     * @param seqA - The potential supersequence.
     * @param seqB - The potential suffix.
     * @returns True if seqB is a suffix of seqA; otherwise, false.
     */
    private isSuffix(seqA: number[], seqB: number[]): boolean {
        if (seqB.length > seqA.length) return false;
        for (let i = 1; i <= seqB.length; i++) {
            if (seqA[seqA.length - i] !== seqB[seqB.length - i]) {
                return false;
            }
        }
        return true;
    }

    /**
     * Gets the length of the expression to be matched.
     *
     * @param key - The key of the expression.
     * @returns The length of the expression to be matched.
     */
    public getLength(key: string): number {
        const expr = this.expressions[key];
        if (!expr) {
            throw new Error(`Expression with key "${key}" does not exist.`);
        }
        return expr.length;
    }

    /**
     * Gets the maximum length of all expressions.
     *
     * @returns The maximum length among all expressions.
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