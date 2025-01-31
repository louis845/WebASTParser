import { Classes, Functions, SyntaxNode } from "../nodes";
import { AbstractSyntaxTree } from "./AbstractSyntaxTree";
import { contains, compare, Range, Index, rangeToStartIndex, rangeToEndIndex, rangeToIndexes, indexesToRange, getMaxRange } from "../utils";
import { CodeParserImplError } from "../CodeParserImplError";

export enum TreeTokenType {
    TOP_LEVEL,
    REFERENCES,
    FUNCTION_GROUP,
    FUNCTION,
    FUNCTION_DEFINITION,
    COMMENTS,
    CLASS,
    ATTRIBUTE,
    ARGUMENT,
    OTHERS
};

export type TreeToken = {
    stringContents: string;
    tokenType: TreeTokenType;
    range?: Range;
    originalNode?: SyntaxNode;
};

export enum TokenAction {
    TERMINATE, // stop resolving child nodes
    RESOLVE // keep resolving child nodes
};

export type TextRange = {
    text: string,
    range: Range
};

export abstract class ASTGenericTokenizer {
    public static tokensToString(tokens: TreeToken[]): string {
        let result = "";
        for (const tok of tokens) {
            result += tok.stringContents;
        }
        return result;
    }

    private tree: AbstractSyntaxTree | null;
    private tokenString: TreeToken[];
    private start: Index;
    private end: Index;

    private subtreeRestrictionPath: SyntaxNode[] | null;
    private nodeToReplace: SyntaxNode | null;
    private replacementString: string | null;

    private nodeToReplaceTokenIdx: number;
    private fillTokens: boolean;

    constructor() {
        this.tree = null;
        this.tokenString = [];
        this.start = {line: 0, character: 0};
        this.end = {line: 0, character: 0};

        this.subtreeRestrictionPath = null;
        this.nodeToReplace = null;
        this.replacementString = null;

        this.nodeToReplaceTokenIdx = -1;
        this.fillTokens = true;
    }

    /**
     * Uses a tree recursion algorithm to tokenize the tree.
     * @param tree
     * @param fillContents Whether to fill the contents of functions. Ignored if using ASTFaithfulTokenizer.
     */
    tokenize(tree: AbstractSyntaxTree, fillTokens: boolean=true): TreeToken[] {
        this.tree = tree;
        this.tokenString = [];
        ({start: this.start, end: this.end} = tree.getMaxRangeAsIndices());
        this.subtreeRestrictionPath = null;
        this.nodeToReplace = null;
        this.replacementString = null;

        this.nodeToReplaceTokenIdx = -1;
        this.fillTokens = fillTokens;

        this.pretokenize(this.tokenString);
        this.recursivelyTokenize(tree.getRoot(), 0, null);
        this.posttokenize(this.tokenString);

        return this.tokenString;
    }

    /**
     * Tokenizes the subtree starting at the starting node.
     * @param tree The AST
     * @param start The root node
     * @param includeParents Whether to include also the parents of the token.
     * @param fillContents Whether to fill the contents of functions. Ignored if using ASTFaithfulTokenizer.
     */
    tokenizeSubtree(tree: AbstractSyntaxTree, start: SyntaxNode, includeParents: boolean, fillTokens: boolean=true): TreeToken[] {
        if (start === tree.getRoot()) {
            return this.tokenize(tree); // not really a subtree
        }

        if (this.disableSubtreeParsing()) {
            throw Error("Subtree parsing is not allowed for this AST tokenizer!");
        }

        this.tree = tree;
        this.tokenString = [];
        ({start: this.start, end: this.end} = tree.getMaxRangeAsIndices());
        this.nodeToReplace = null;
        this.replacementString = null;

        this.nodeToReplaceTokenIdx = -1;
        this.fillTokens = fillTokens;

        if (includeParents) {
            this.subtreeRestrictionPath = [];
            const tempList: SyntaxNode[] = [];
            for (let i = 0; i < start.getDepth(); i++) {
                if (i === 0) {
                    tempList.push(start);
                } else {
                    tempList.push(tempList[tempList.length - 1].getParent()!);
                }
            }
            for (let i = 0; i < tempList.length; i++) {
                this.subtreeRestrictionPath.push(tempList[tempList.length - 1 - i]);
            }

            // recursively tokenize from the root, but along the specified path, and then into the desired token
            this.pretokenize(this.tokenString);
            this.recursivelyTokenize(tree.getRoot(), 0, null, this.subtreeRestrictionPath[0]);
            this.posttokenize(this.tokenString);
        } else {
            this.subtreeRestrictionPath = null;
            this.pretokenize(this.tokenString);
            this.includeIndentation(this.tokenString, start.getDepth());
            this.recursivelyTokenize(start, start.getDepth(), null);
            this.posttokenize(this.tokenString);
        }

        return this.tokenString;
    }

    /**
     * Uses a tree recursion algorithm to tokenize the tree. When the nodeToReplace is being resolved, instead of resolving the
     * node as usual, replace its contents entirely with replacementString and terminate resolving the subtree of nodeToReplace.
     * @param tree The tree
     * @param nodeToReplace The node to replace
     * @param replacementString The string it should be replaced with
     */
    tokenizeReplaceNode(tree: AbstractSyntaxTree, nodeToReplace: SyntaxNode, replacementString: string): TreeToken[] {
        this.tree = tree;
        this.tokenString = [];
        ({start: this.start, end: this.end} = tree.getMaxRangeAsIndices());
        this.subtreeRestrictionPath = null;
        this.nodeToReplace = nodeToReplace;
        this.replacementString = replacementString;

        this.nodeToReplaceTokenIdx = -1;
        this.fillTokens = true;

        this.pretokenize(this.tokenString);
        this.recursivelyTokenize(tree.getRoot(), 0, null);
        this.posttokenize(this.tokenString);

        return this.tokenString;
    }

    /**
     * Uses a tree recursion algorithm to tokenize the tree. When the nodeToReplace is being resolved, instead of resolving the
     * node as usual, replace its contents with a placeholder, and record the index. Returns the token list and the placeholder token idx.
     * @param tree The tree
     * @param nodeToReplace The node to replace
     * @returns The token list and the placeholder token index. If not found, foundTokenIdx will be -1.
     */
    tokenizeTargetNode(tree: AbstractSyntaxTree, nodeToReplace: SyntaxNode): {tokList: TreeToken[], foundTokenIdx: number} {
        this.tree = tree;
        this.tokenString = [];
        ({start: this.start, end: this.end} = tree.getMaxRangeAsIndices());
        this.subtreeRestrictionPath = null;
        this.nodeToReplace = nodeToReplace;
        this.replacementString = null;

        this.nodeToReplaceTokenIdx = -1;
        this.fillTokens = true;

        this.pretokenize(this.tokenString);
        this.recursivelyTokenize(tree.getRoot(), 0, null);
        this.posttokenize(this.tokenString);

        return {tokList: this.tokenString, foundTokenIdx: this.nodeToReplaceTokenIdx};
    }

    protected needsFillTokens(): boolean {
        return this.fillTokens;
    }

    /**
     * Gets the different texts from the syntax node.
     * @param node The syntax node
     * @returns tokenText, tokenPrefixText and tokenSuffixText
     */
    public getTexts(node: SyntaxNode): { tokenText: TextRange, tokenPrefixText: TextRange | null, tokenSuffixText: TextRange | null } {
        const range: Range = node.getRange();
        const prefixRange: Range | null = node.getPrefixRange();
        const suffixRange: Range | null = node.getSuffixRange();

        if ((node instanceof Functions) || (node instanceof Classes)) {
            if (prefixRange === null || suffixRange === null) {
                throw new CodeParserImplError("The Parser must implement and resolve the inner range for Functions and Classes! This is the maximal inner range so that when taken away, the class/function is still a valid class/function (with no body).");
            }
        }

        const tokenText: string = this.tree!.getSourceTextFromRange(range);
        let tokenPrefixText: TextRange | null = null;
        let tokenSuffixText: TextRange | null = null;
        if (prefixRange !== null && compare(rangeToStartIndex(prefixRange), rangeToEndIndex(prefixRange)) === -1) {
            tokenPrefixText = {text: this.tree!.getSourceTextFromRange(prefixRange), range: prefixRange};
        }
        if (suffixRange !== null && compare(rangeToStartIndex(suffixRange), rangeToEndIndex(suffixRange)) === -1) {
            tokenSuffixText = {text: this.tree!.getSourceTextFromRange(suffixRange), range: suffixRange};
        }

        return { tokenText: {text: tokenText, range: range}, tokenPrefixText: tokenPrefixText, tokenSuffixText: tokenSuffixText };
    }


    private recursivelyTokenize(node: SyntaxNode, depth: number, previousNode: SyntaxNode | null, resolveRestrictionNode: SyntaxNode | null = null): void {
        if (this.nodeToReplace !== null && node === this.nodeToReplace) {
            // ok, simply replace with replacement string
            const repStr: string = (this.replacementString === null) ? "[PLACEHOLDER/ERROR: Didn't provide replacement string!]" : this.replacementString;
            this.tokenString.push({stringContents: repStr, tokenType: TreeTokenType.OTHERS});
            this.nodeToReplaceTokenIdx = this.tokenString.length - 1;
            return;
        }

        const { tokenText, tokenPrefixText, tokenSuffixText } = this.getTexts(node);
        const {prefixTokens, suffixTokens, action } = this.convertIntoTokens(node, depth, previousNode, tokenText, tokenPrefixText, tokenSuffixText);
        if (prefixTokens !== undefined) {
            for (const tok of prefixTokens) {
                this.tokenString.push(tok);
            }
        }

        if (action === TokenAction.RESOLVE) {
            let prevChild: SyntaxNode | null = null;
            for (const child of node.listChildren()) {
                if (resolveRestrictionNode === null || child === resolveRestrictionNode) { // resolve the child only if there are no restrictions, or if it is the resolve restriction node
                    let subRestrictionNode: SyntaxNode | null = null;
                    if (this.subtreeRestrictionPath !== null && depth + 1 < this.subtreeRestrictionPath.length) {
                        subRestrictionNode = this.subtreeRestrictionPath[depth + 1];
                    }
                    this.recursivelyTokenize(child, depth + 1, prevChild, subRestrictionNode);
                    prevChild = child;
                }
            }
        }

        if (suffixTokens !== undefined) {
            if (suffixTokens.length > 0) {
                const additionalToken: TreeToken | null = this.handleFirstSuffixTokenIfNecessary(suffixTokens[0]);
                if (additionalToken !== null)
                    this.tokenString.push(additionalToken);
            }

            let lstWithRange: TreeToken | null = null;
            for (const tok of suffixTokens) {
                this.tokenString.push(tok);
                if (tok.range !== undefined) {
                    lstWithRange = tok;
                }
            }

            if (lstWithRange !== null) {
                this.handleLastSuffixTokenWithRangeIfNecessary(lstWithRange);
            }
        }
    }

    /**
     * Whether to disable subtree parsing. Override this and return true if its not allowed.
     * @returns Whether to disable subtree parsing.
     */
    protected disableSubtreeParsing(): boolean {
        return false;
    }

    /**
     * Gets the code string from the range
     * @param range The range
     * @returns The source text within the range
     */
    protected getCodeString(range: Range): string {
        return this.tree!.getSourceTextFromRange(range);
    }

    /**
     * Gets the code string within the start and end indices.
     * @param start The start index (inclusive)
     * @param end The end index (non-inclusive)
     * @returns The source text
     */
    protected getCodeStringFromIndices(start: Index, end: Index): string {
        return this.getCodeString(indexesToRange(start, end));
    }

    /**
     * Gets the global start index of the code which is always (0, 0).
     * @returns The global start index.
     */
    protected getGlobalStartIndex(): Index {
        return this.start;
    }

    /**
     * Gets the global end index of the code which is always (numCodeLines, 0).
     * @returns The global end index
     */
    protected getGlobalEndIndex(): Index {
        return this.end;
    }

    /**
     * Add a token before the first suffix token if necessary. Does not have to be overridden.
     * Default behaviour returns null, which means no token is needed to be added.
     * @param firstSuffixToken The first suffix token to be added after the returned (if any) token.
     * @returns A TreeToken or null.
     */
    protected handleFirstSuffixTokenIfNecessary(firstSuffixToken: TreeToken): TreeToken | null {
        return null;
    }

    /**
     * Add a token before the first suffix token if necessary. Does not have to be overridden.
     * Default behaviour returns null, which means no token is needed to be added.
     * @param lastSuffixTokenWithRange The last suffix token with range
     */
    protected handleLastSuffixTokenWithRangeIfNecessary(lastSuffixTokenWithRange: TreeToken): void {
        
    }

    /**
     * Convert the node to tokens. If action is TERMINATE, the subnodes of the node won't be resolved. In this case, there is no difference between prefixTokens and suffixTokens, they
     * will be appended together in sequential fashion from prefixTokens to suffixTokens. If action is RESOLVE, the subnodes of the node will be resolved. The prefixTokens will be appended
     * first, and then the tokens because of the resolvation of the subnodes, and then the suffixTokens. 
     * @param node The syntax node being resolved. Use .getParent() to get its parent if depth >= 1.
     * @param depth The depth of the current node.
     * @param previousNode The previous sibling node being resolved, if exists.
     * @param tokenText The text of the current node, obtained with .getRange(). Also contains the range.
     * @param tokenPrefixText The prefix text of the current node, if exists, obtained with .getPrefixRange(). Also contains the corresponding range.
     * @param tokenSuffixText The suffix text of the current node, if exists, obtained with .getSuffixRange(). Also contains the corresponding range.
     */
    protected abstract convertIntoTokens(
        node: SyntaxNode,
        depth: number,
        previousNode: SyntaxNode | null,
        tokenText: TextRange,
        tokenPrefixText: TextRange | null,
        tokenSuffixText: TextRange | null
    ): {prefixTokens?: TreeToken[], suffixTokens?: TreeToken[], action: TokenAction};

    protected abstract pretokenize(tokenString: TreeToken[]): void;
    protected abstract posttokenize(tokenString: TreeToken[]): void;
    protected abstract includeIndentation(tokenString: TreeToken[], depth: number): void;
}