import { SyntaxNode, TopLevel } from "../nodes";
import { contains, containsIndex, Range, Index, rangeToIndexes, getMaxRange } from "../utils";

export class AbstractSyntaxTree {
    private root: TopLevel;
    public sourceLines: string[];

    /**
     * Constructs an AbstractSyntaxTree.
     * @param root The top-level node.
     * @param sourceLines The source code split into lines.
     */
    constructor(root: TopLevel, sourceLines: string[]) {
        this.root = root;
        this.sourceLines = sourceLines;
    }

    /**
     * Retrieves the source text within the specified range.
     * @param start_line Starting line number (0-based).
     * @param start_character Starting character number (0-based).
     * @param end_line Ending line number (0-based).
     * @param end_character Ending character number (0-based).
     * @returns The extracted source text.
     */
    getSourceText(
        start_line: number,
        start_character: number,
        end_line: number,
        end_character: number
    ): string {
        if (
            start_line < 0 ||
            end_line > this.sourceLines.length ||
            start_line > end_line ||
            (start_line === end_line && start_character > end_character)
        ) {
            throw new Error("Invalid range specified. The start index must come before the end index, and the start index and end index must be contained inside the total range.");
        }
        if ((end_line === this.sourceLines.length && end_character !== 0)
            || (end_line < this.sourceLines.length && end_character > this.sourceLines[end_line].length)) {
            throw new Error("Invalid range specified. The end character is not a valid character.");
        }
        if (start_character > this.sourceLines[start_line].length) {
            throw new Error("Invalid range specified. The start character is not a valid character.")
        }

        // Need to take minimum because of "virtual" \n at the last line.
        const lines: string[] = this.sourceLines.slice(start_line, Math.min(end_line + 1, this.sourceLines.length));
        if (end_line == this.sourceLines.length) { // Readjust
            lines.push("");
        }

        // Adjust the first and last lines based on character positions
        if (lines.length === 1) {
            return lines[0].substring(start_character, end_character);
        }

        lines[0] = lines[0].substring(start_character);
        lines[lines.length - 1] = lines[lines.length - 1].substring(0, end_character);

        return lines.join("\n");
    }

    /**
     * Gets the source text from range
     * @param range The range
     * @returns The source text
     */
    getSourceTextFromRange(range: Range): string {
        return this.getSourceText(range.start_line, range.start_character, range.end_line, range.end_character);
    }

    /**
     * Gets the root node of the AST.
     */
    public getRoot(): TopLevel {
        return this.root;
    }

    /**
     * Gets the smallest node with .getRange() that contains the range.
     */
    public getSmallestNodeContains(range: Range): SyntaxNode {
        let node: SyntaxNode = this.root;
        outer: while (true) {
            for (const child of node.listChildren()) {
                if (contains(child.getRange(), range)) {
                    node = child;
                    continue outer;
                }
            }
            return node; // can't find, directly return
        }
    }

    /**
     * Gets the smallest node with .getRange() that contains the index, if there are no
     * termination conditions along the way. Otherwise, if some terminate conditions are
     * met, terminate early and immediately return the node that triggered the termination.
     * 
     * @param index The index that the returned node must contain
     * @param terminationCondition A function to evaluate whether the node satisifes the termination condition. Returns true if terminate, or else return false. Can be null if no termination conditions are possible.
     * @returns The found node.
     */
    public getNodeContainsIndex(index: Index, terminationCondition: ((node: SyntaxNode) => boolean) | null): SyntaxNode {
        let node: SyntaxNode = this.root;
        outer: while (true) {
            // see if termination condition met
            if (terminationCondition !== null && terminationCondition(node)) {
                return node; // terminate
            }

            for (const child of node.listChildren()) {
                if (containsIndex(child.getRange(), index)) {
                    node = child;
                    continue outer;
                }
            }
            return node; // can't find, directly return
        }
    }

    /**
     * Gets the max range as indices
     * @returns The max range as start end indices.
     */
    getMaxRangeAsIndices(): {start: Index, end: Index} {
        return rangeToIndexes(getMaxRange(this.sourceLines));
    }
}