export type Braces = {
    opening: string;
    closing: string;
};

/**
 * Class representing a Braces Matcher.
 */
export class BracesMatcher {
    private readonly openingToClosing: Map<string, string>;
    private readonly closingToOpening: Map<string, string>;
    private stack: string[];

    /**
     * Initializes a new instance of the BracesMatcher class.
     * @param braces - An array of brace pairs, each with an opening and closing character.
     * @throws Will throw an error if any opening or closing character is not exactly one character long,
     *         or if there are duplicate opening or closing characters.
     */
    constructor(braces: Braces[]) {
        this.openingToClosing = new Map<string, string>();
        this.closingToOpening = new Map<string, string>();
        this.stack = [];

        // Validate and populate the maps
        const tempIntersectionCheck: string[] = [];
        for (const brace of braces) {
            const { opening, closing } = brace;

            // Ensure both opening and closing are single characters
            if (opening.length !== 1) {
                throw new Error(`Opening brace "${opening}" must be exactly one character.`);
            }
            if (closing.length !== 1) {
                throw new Error(`Closing brace "${closing}" must be exactly one character.`);
            }

            // Check for uniqueness
            if (tempIntersectionCheck.includes(opening)) {
                throw new Error(`Opening brace "${opening}" repeated!`);
            }
            tempIntersectionCheck.push(opening);
            if(tempIntersectionCheck.includes(closing)) {
                throw new Error(`Closing brace "${closing}" repeated!`);
            }

            this.openingToClosing.set(opening, closing);
            this.closingToOpening.set(closing, opening);
        }
    }

    /**
     * Processes the next character in the stream.
     * @param ch - The next character to process.
     * @returns The current depth of opened braces after processing the character.
     * @throws Will throw an error if the character length is not one,
     *         or if there is a mismatch in the braces.
     */
    public next(ch: string): number {
        if (ch.length !== 1) {
            throw new Error(`Input character "${ch}" must be exactly one character long.`);
        }

        if (this.openingToClosing.has(ch)) {
            // Character is an opening brace
            this.stack.push(ch);
        } else if (this.closingToOpening.has(ch)) {
            // Character is a closing brace
            if (this.stack.length === 0) {
                throw new Error(`Unmatched closing brace "${ch}" encountered with no corresponding opening brace.`);
            }

            const lastOpening = this.stack[this.stack.length - 1];
            const expectedClosing = this.openingToClosing.get(lastOpening);

            if (ch === expectedClosing) {
                this.stack.pop();
            } else {
                throw new Error(
                    `Mismatched closing brace "${ch}". Expected "${expectedClosing}" to match opening brace "${lastOpening}".`
                );
            }
        } else {
            throw new Error(`Invalid brace: ${ch}`);
        }
        // If character is neither opening nor closing, do nothing

        return this.stack.length;
    }

    /**
     * Resets the internal state of the BracesMatcher.
     */
    public reset(): void {
        this.stack = [];
    }

    /**
     * Gets the current depth of opened braces.
     * @returns The number of currently opened braces awaiting closure.
     */
    public currentDepth(): number {
        return this.stack.length;
    }
}