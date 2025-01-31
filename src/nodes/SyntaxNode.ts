import { Range, mergeRanges, contains, indexesToRange, rangeToIndexes } from "../utils";

export abstract class SyntaxNode {
    protected parent: SyntaxNode | null;
    protected children: SyntaxNode[];
    public extra_data: Record<string, any>;
    private range: Range;
    private innerRangeOverride: Range | null;
    private siblingRank: number;

    constructor(range: Range,
                extra_data: Record<string, any> = {}) {
        this.range = range;
        this.parent = null;
        this.children = [];
        this.extra_data = extra_data;
        this.innerRangeOverride = null;
        this.siblingRank = 0;
    }

    /**
     * Gets the range of this node in the source code.
     * @returns The range, which corresponds to a substring of the source code.
     */
    getRange(): Range {
        return this.range;
    }

    /**
     * Overrides the default computation of inner range.
     * @param range The range to override the inner range with.
     */
    overrideInnerRange(range: Range) {
        if (!contains(this.range, range)) {
            throw Error("Inner range must be (not necessarily strictly) contained inside the full range!");
        }
        this.innerRangeOverride = range;
    }

    /**
     * Gets the inner range of this node, encompassing all immediate children's ranges.
     * Returns null if the node has no children.
     * @returns The inner range.
     */
    getInnerRange(): Range | null {
        if (this.innerRangeOverride !== null) {
            return this.innerRangeOverride;
        }
        if (!this.hasChildren()) return null;
        const childrenRanges = this.children.map(child => child.getRange());
        return mergeRanges(childrenRanges);
    }

    /**
     * Returns the prefix range, which is the first connected component of getRange() - getInnerRange()
     * @returns The prefix range.
     */
    getPrefixRange(): Range | null {
        const innerRange = this.getInnerRange();
        if (innerRange === null) {
            return null;
        }
        return indexesToRange(rangeToIndexes(this.range).start, rangeToIndexes(innerRange).start);
    }

    /**
     * Returns the suffix range, which is the second connected component of getRange() - getInnerRange()
     * @returns The suffix range.
     */
    getSuffixRange(): Range | null {
        const innerRange = this.getInnerRange();
        if (innerRange === null) {
            return null;
        }
        return indexesToRange(rangeToIndexes(innerRange).end, rangeToIndexes(this.range).end);
    }

    /**
     * Determines if the node has children.
     */
    hasChildren(): boolean {
        return this.children.length > 0;
    }

    /**
     * Sets the parent of this node.
     * @param node The parent node.
     */
    setParent(node: SyntaxNode | null): void {
        this.parent = node;
    }

    /**
     * Gets the parent of this node.
     * @returns The parent node or null.
     */
    getParent(): SyntaxNode | null {
        return this.parent;
    }

    /**
     * Adds a child to this node.
     * @param node The child node to add.
     */
    addChild(node: SyntaxNode): void {
        node.setParent(this);
        node.siblingRank = this.children.length;
        this.children.push(node);
    }

    /**
     * Gets the rank among the siblings
     * @returns The rank.
     */
    getSiblingRank(): number {
        return this.siblingRank;
    }

    /**
     * Lists all immediate children of this node.
     * @returns An array of child nodes.
     */
    listChildren(): SyntaxNode[] {
        return this.children.slice();
    }

    /**
     * Asserts the children's ranges are valid.
     */
    assertRangeValid(): void {
        for (const child of this.children) {
            if (!contains(this.range, child.range)) {
                throw Error("Invalid range! Expected child range to be inside this.range.");
            }
        }
    }

    /**
     * Gets the depth of itself in the tree.
     */
    getDepth(): number {
        if (this.parent === null) {
            return 0;
        }
        return this.parent.getDepth() + 1;
    }
}