import { Attributes, Classes, Comments, FunctionGroups, Functions, References, SyntaxNode } from "../../nodes";
import { ASTGenericTokenizer, TextRange, TokenAction, TreeToken, TreeTokenType } from "../../parsing/ASTGenericTokenizer";

export class TypeScriptSimplificationTokenizer extends ASTGenericTokenizer {
    private indentation: string;

    constructor(indentation?: string) {
        super();
        if (indentation === undefined) {
            this.indentation = "    ";
        } else {
            this.indentation = indentation;
        }
    }

    protected pretokenize(tokenString: TreeToken[]): void {}
    protected posttokenize(tokenString: TreeToken[]): void {}
    protected convertIntoTokens(node: SyntaxNode, depth: number, previousNode: SyntaxNode | null, tokenText: TextRange, tokenPrefixText: TextRange | null, tokenSuffixText: TextRange | null): { prefixTokens?: TreeToken[]; suffixTokens?: TreeToken[]; action: TokenAction; } {
        if (depth === 0) {
            // no need to add anything, simply resolve
            return {action: TokenAction.RESOLVE};
        }
        const stringEnder: string = "\n" + this.indentation.repeat(depth - 1);

        // translate the current node to tokens
        if (node instanceof References) {
            return {prefixTokens: [
                {stringContents: tokenText.text, range: tokenText.range, tokenType: TreeTokenType.REFERENCES, originalNode: node},
                {stringContents: ";" + stringEnder, tokenType: TreeTokenType.OTHERS}
            ], action: TokenAction.TERMINATE};
        } else if (node instanceof Comments) {
            return {prefixTokens: [
                {stringContents: tokenText.text, range: tokenText.range, tokenType: TreeTokenType.COMMENTS, originalNode: node},
                {stringContents: stringEnder, tokenType: TreeTokenType.OTHERS}
            ], action: TokenAction.TERMINATE};
        } else if (node instanceof Classes) {
            return {
                prefixTokens: [
                    {stringContents: tokenPrefixText!.text, range: tokenPrefixText!.range, tokenType: TreeTokenType.CLASS, originalNode: node},
                    {stringContents: stringEnder + this.indentation, tokenType: TreeTokenType.OTHERS},
                ],
                suffixTokens: [
                    {stringContents: stringEnder, tokenType: TreeTokenType.OTHERS},
                    {stringContents: tokenSuffixText!.text, range: tokenSuffixText!.range, tokenType: TreeTokenType.CLASS, originalNode: node},
                    {stringContents: stringEnder, tokenType: TreeTokenType.OTHERS}
                ],
                action: TokenAction.RESOLVE
            };
        } else if (node instanceof Attributes) {
            return {prefixTokens: [
                {stringContents: tokenText.text, range: tokenText.range, tokenType: TreeTokenType.ATTRIBUTE, originalNode: node},
                {stringContents: ";" + stringEnder, tokenType: TreeTokenType.OTHERS}
            ], action: TokenAction.TERMINATE};
        } else if (node instanceof FunctionGroups) {
            if (node.hasComment()) {
                const children: SyntaxNode[] = node.listChildren();
                if (children.length !== 2) {
                    throw Error("Expected 2 children for a function group with comments!");
                }
                if (!(children[0] instanceof Comments)) {
                    throw Error("Expected first child of function group to be a comment!");
                }
                if (!(children[1] instanceof Functions)) {
                    throw Error("Expected second child of function group to be a Function!");
                }

                // add function and comment
                const comment: Comments = children[0];
                const func: Functions = children[1];
                const commentTexts = this.getTexts(comment);
                const funcTexts = this.getTexts(func);
                return {
                    prefixTokens: [
                        {stringContents: commentTexts.tokenText.text, range: commentTexts.tokenText.range, tokenType: TreeTokenType.COMMENTS, originalNode: comment},
                        {stringContents: stringEnder, tokenType: TreeTokenType.OTHERS},
                        {stringContents: funcTexts.tokenPrefixText!.text, range: funcTexts.tokenPrefixText!.range, tokenType: TreeTokenType.FUNCTION, originalNode: func},
                        {stringContents: funcTexts.tokenSuffixText!.text, range: funcTexts.tokenSuffixText!.range, tokenType: TreeTokenType.FUNCTION, originalNode: func},
                        {stringContents: stringEnder, tokenType: TreeTokenType.OTHERS}
                    ],
                    action: TokenAction.TERMINATE
                };
            } else {
                const children: SyntaxNode[] = node.listChildren();
                if (children.length !== 1) {
                    throw Error("Expected 1 child for a function group without comments!");
                }
                if (!(children[0] instanceof Functions)) {
                    throw Error("Expected first child of function group to be a Function!");
                }

                // add function and pass
                const func: Functions = children[0];
                const funcTexts = this.getTexts(func);
                return {
                    prefixTokens: [
                        {stringContents: funcTexts.tokenPrefixText!.text, range: funcTexts.tokenPrefixText!.range, tokenType: TreeTokenType.FUNCTION, originalNode: func},
                        {stringContents: funcTexts.tokenSuffixText!.text, range: funcTexts.tokenSuffixText!.range, tokenType: TreeTokenType.FUNCTION, originalNode: func},
                        {stringContents: stringEnder, tokenType: TreeTokenType.OTHERS}
                    ],
                    action: TokenAction.TERMINATE
                };
            }
        }

        throw Error("Some scenarios not explored!");
    }

    protected includeIndentation(tokenString: TreeToken[], depth: number): void {
        // push indentation
        tokenString.push({stringContents: this.indentation.repeat(depth - 1), tokenType: TreeTokenType.OTHERS});
    }
}