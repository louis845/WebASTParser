import { Argument, Attributes, Classes, Comments, FunctionDeclaration, FunctionGroups, Functions, References, SyntaxNode, TopLevel } from "../nodes";
import { compare, Index, indexesToRange, rangeToEndIndex, rangeToStartIndex } from "../utils";
import { ASTGenericTokenizer, TextRange, TokenAction, TreeToken, TreeTokenType } from "./ASTGenericTokenizer";

export enum TokenizationMode {
    NONE, // single token
    TOP_LEVEL_ONLY, // only things immediately in top level will be resolved
    FUNCTIONS_AND_CLASSES, // all functions, classes, and class member functions, and comments of functions
    FUNCTIONS_AND_CLASSES_AND_ARGUMENTS, // same as above, but arguments of functions will also be resolved
    EVERYTHING // everything, including things in function body, except function comments right after the function declaration (e.g Python), which causes potential conflict
}


/**
 * Faithful tokenizer such that it preserves the original text.
 */
export class ASTFaithfulTokenizer extends ASTGenericTokenizer {
    private tokenizationMode: TokenizationMode;
    private prevEndIndex: Index;
    private excludeInnerRangeIfPossible: boolean;

    constructor(mode: TokenizationMode, excludeInnerRangeIfPossible: boolean) {
        super();
        this.tokenizationMode = mode;
        this.excludeInnerRangeIfPossible = excludeInnerRangeIfPossible;
        this.prevEndIndex = {character: 0, line: 0};
    }

    protected pretokenize(tokenString: TreeToken[]): void {
        this.prevEndIndex = this.getGlobalStartIndex();
    }

    protected posttokenize(tokenString: TreeToken[]): void {
        // add remaining stuff to the token string, if exists
        const diff = compare(this.prevEndIndex, this.getGlobalEndIndex());
        if (diff === -1) {
            tokenString.push({
                stringContents: this.getCodeStringFromIndices(this.prevEndIndex, this.getGlobalEndIndex()),
                tokenType: TreeTokenType.OTHERS,
                range: indexesToRange(this.prevEndIndex, this.getGlobalEndIndex())
            });
        } else if (diff === 1) {
            throw Error("Unexpected end index larger than global end!");
        }
    }

    protected convertIntoTokens(node: SyntaxNode, depth: number, previousNode: SyntaxNode | null, tokenText: TextRange, tokenPrefixText: TextRange | null, tokenSuffixText: TextRange | null): { prefixTokens?: TreeToken[]; suffixTokens?: TreeToken[]; action: TokenAction; } {
        switch (this.tokenizationMode) {
            case TokenizationMode.NONE:
                // simply do not resolve the top level node
                this.prevEndIndex = this.getGlobalEndIndex();
                return {prefixTokens: [{stringContents: tokenText.text, tokenType: TreeTokenType.TOP_LEVEL, range: tokenText.range, originalNode: node}], action: TokenAction.TERMINATE};
            case TokenizationMode.TOP_LEVEL_ONLY:
                return this.convertTopLevel(node, depth, previousNode, tokenText, tokenPrefixText, tokenSuffixText);
            case TokenizationMode.FUNCTIONS_AND_CLASSES:
                return this.convertFunctionsAndClasses(node, depth, previousNode, tokenText, tokenPrefixText, tokenSuffixText);
            case TokenizationMode.FUNCTIONS_AND_CLASSES_AND_ARGUMENTS:
                return this.convertFunctionsAndClassesAndArguments(node, depth, previousNode, tokenText, tokenPrefixText, tokenSuffixText);
            case TokenizationMode.EVERYTHING:
                return this.convertEverything(node, depth, previousNode, tokenText, tokenPrefixText, tokenSuffixText);
        }
    }

    protected handleFirstSuffixTokenIfNecessary(firstSuffixToken: TreeToken): TreeToken | null {
        // add some fillers between the children and the first suffix token, for completeness
        if (firstSuffixToken.range !== undefined) {
            const range = firstSuffixToken.range;
            const comparison: number = compare(this.prevEndIndex, rangeToStartIndex(range));
            if (comparison === 1) {
                throw Error("Invalid comparison! Expected previous end to be less than or equal to the current range.");
            } else if (comparison === -1) {
                const fillRange = indexesToRange(this.prevEndIndex, rangeToStartIndex(range));
                return {stringContents: this.getCodeString(fillRange), range: fillRange, tokenType: TreeTokenType.OTHERS};
            } else {
                return null;
            }
        }
        return null;
    }

    protected handleLastSuffixTokenWithRangeIfNecessary(lastSuffixToken: TreeToken): void {
        // flag the prev end ast the last suffix token
        this.prevEndIndex = rangeToEndIndex(lastSuffixToken.range!);
    }

    private convertTopLevel(node: SyntaxNode, depth: number, previousNode: SyntaxNode | null, tokenText: TextRange, tokenPrefixText: TextRange | null, tokenSuffixText: TextRange | null): { prefixTokens?: TreeToken[]; suffixTokens?: TreeToken[]; action: TokenAction; } {
        if (depth === 0) {
            // no need to add anything, simply resolve
            return {action: TokenAction.RESOLVE};
        }

        // translate the current node to tokens
        if (node instanceof References) {
            return {prefixTokens: this.getPrefixTokens(tokenText, TreeTokenType.REFERENCES, node), action: TokenAction.TERMINATE};
        } else if (node instanceof Comments) {
            // do not include comments that are a part of function groups
            if (node.getParent() instanceof TopLevel) {
                return {prefixTokens: this.getPrefixTokens(tokenText, TreeTokenType.COMMENTS, node), action: TokenAction.TERMINATE};
            } else {
                return {action: TokenAction.TERMINATE};
            }
        } else if (node instanceof Classes) {
            if (this.excludeInnerRangeIfPossible && tokenPrefixText !== null) {
                if (tokenSuffixText !== null) {
                    return {
                        prefixTokens: this.getPrefixTokens(tokenPrefixText, TreeTokenType.CLASS, node),
                        suffixTokens: [{stringContents: tokenSuffixText.text, range: tokenSuffixText.range, tokenType: TreeTokenType.CLASS, originalNode: node}],
                        action: TokenAction.TERMINATE
                    };
                } else {
                    return {prefixTokens: this.getPrefixTokens(tokenPrefixText, TreeTokenType.CLASS, node), action: TokenAction.TERMINATE};
                }
            } else {
                return {prefixTokens: this.getPrefixTokens(tokenText, TreeTokenType.CLASS, node), action: TokenAction.TERMINATE};
            }
            
        } else if (node instanceof FunctionGroups) {
            return {action: TokenAction.RESOLVE};
        } else if (node instanceof Functions) {
            if (this.excludeInnerRangeIfPossible && tokenPrefixText !== null) {
                if (tokenSuffixText !== null) {
                    return {
                        prefixTokens: this.getPrefixTokens(tokenPrefixText, TreeTokenType.FUNCTION, node),
                        suffixTokens: [{stringContents: tokenSuffixText.text, range: tokenSuffixText.range, tokenType: TreeTokenType.FUNCTION, originalNode: node}],
                        action: TokenAction.TERMINATE
                    };
                } else {
                    return {prefixTokens: this.getPrefixTokens(tokenPrefixText, TreeTokenType.FUNCTION, node), action: TokenAction.TERMINATE};
                }
            } else {
                return {prefixTokens: this.getPrefixTokens(tokenText, TreeTokenType.FUNCTION, node), action: TokenAction.TERMINATE};
            }
        }

        throw Error("Some scenarios not explored!");
    }

    private convertFunctionsAndClasses(node: SyntaxNode, depth: number, previousNode: SyntaxNode | null, tokenText: TextRange, tokenPrefixText: TextRange | null, tokenSuffixText: TextRange | null): { prefixTokens?: TreeToken[]; suffixTokens?: TreeToken[]; action: TokenAction; } {
        if (depth === 0) {
            // no need to add anything, simply resolve
            return {action: TokenAction.RESOLVE};
        }

        // translate the current node to tokens
        if (node instanceof References) {
            return {prefixTokens: this.getPrefixTokens(tokenText, TreeTokenType.REFERENCES, node), action: TokenAction.TERMINATE};
        } else if (node instanceof Comments) {
            // when not excluding inner range, the function will cover the contents
            // therefore, we exclude comments directly in function groups, and the sibling rank is > 0 (which means it is a function comment, we exclude it)
            if (this.excludeInnerRangeIfPossible || !(node.getParent() instanceof FunctionGroups) || node.getSiblingRank() === 0) {
                return {prefixTokens: this.getPrefixTokens(tokenText, TreeTokenType.COMMENTS, node), action: TokenAction.TERMINATE};
            } else {
                return {action: TokenAction.TERMINATE};
            }
        } else if (node instanceof Classes) {
            // try to split into prefix and suffix
            if (tokenPrefixText !== null) {
                if (tokenSuffixText !== null) {
                    return {
                        prefixTokens: this.getPrefixTokens(tokenPrefixText, TreeTokenType.CLASS, node),
                        suffixTokens: [{stringContents: tokenSuffixText.text, range: tokenSuffixText.range, tokenType: TreeTokenType.CLASS, originalNode: node}],
                        action: TokenAction.RESOLVE
                    };
                } else {
                    return {prefixTokens: this.getPrefixTokens(tokenPrefixText, TreeTokenType.CLASS, node), action: TokenAction.RESOLVE};
                }
            } else {
                return {prefixTokens: this.getPrefixTokens(tokenText, TreeTokenType.CLASS, node), action: TokenAction.RESOLVE};
            }
            
        } else if (node instanceof Attributes) {
            return {prefixTokens: this.getPrefixTokens(tokenText, TreeTokenType.ATTRIBUTE, node), action: TokenAction.TERMINATE};
        } else if (node instanceof FunctionGroups) {
            // simply resolve, nothing added
            return {action: TokenAction.RESOLVE};
        } else if (node instanceof Functions) {
            // we don't have to resolve the functions
            if (this.excludeInnerRangeIfPossible && tokenPrefixText !== null) {
                if (tokenSuffixText !== null) {
                    return {
                        prefixTokens: this.getPrefixTokens(tokenPrefixText, TreeTokenType.FUNCTION, node),
                        suffixTokens: [{stringContents: tokenSuffixText.text, range: tokenSuffixText.range, tokenType: TreeTokenType.FUNCTION, originalNode: node}],
                        action: TokenAction.TERMINATE
                    };
                } else {
                    return {prefixTokens: this.getPrefixTokens(tokenPrefixText, TreeTokenType.FUNCTION, node), action: TokenAction.TERMINATE};
                }
            } else {
                return {prefixTokens: this.getPrefixTokens(tokenText, TreeTokenType.FUNCTION, node), action: TokenAction.TERMINATE};
            }
        }

        throw Error("Some scenarios not explored!");
    }

    private convertFunctionsAndClassesAndArguments(node: SyntaxNode, depth: number, previousNode: SyntaxNode | null, tokenText: TextRange, tokenPrefixText: TextRange | null, tokenSuffixText: TextRange | null): { prefixTokens?: TreeToken[]; suffixTokens?: TreeToken[]; action: TokenAction; } {
        if (depth === 0) {
            // no need to add anything, simply resolve
            return {action: TokenAction.RESOLVE};
        }

        // translate the current node to tokens
        if (node instanceof References) {
            return {prefixTokens: this.getPrefixTokens(tokenText, TreeTokenType.REFERENCES, node), action: TokenAction.TERMINATE};
        } else if (node instanceof Comments) {
            // do not include comments that are a part of functions
            if (node.getParent() instanceof Functions) {
                return {action: TokenAction.TERMINATE};
            } else {
                return {prefixTokens: this.getPrefixTokens(tokenText, TreeTokenType.COMMENTS, node), action: TokenAction.TERMINATE};
            }
        } else if (node instanceof Classes) {
            // try to split into prefix and suffix
            if (tokenPrefixText !== null) {
                if (tokenSuffixText !== null) {
                    return {
                        prefixTokens: this.getPrefixTokens(tokenPrefixText, TreeTokenType.CLASS, node),
                        suffixTokens: [{stringContents: tokenSuffixText.text, range: tokenSuffixText.range, tokenType: TreeTokenType.CLASS, originalNode: node}],
                        action: TokenAction.RESOLVE
                    };
                } else {
                    return {prefixTokens: this.getPrefixTokens(tokenPrefixText, TreeTokenType.CLASS, node), action: TokenAction.RESOLVE};
                }
            } else {
                return {prefixTokens: this.getPrefixTokens(tokenText, TreeTokenType.CLASS, node), action: TokenAction.RESOLVE};
            }
            
        } else if (node instanceof Attributes) {
            return {prefixTokens: this.getPrefixTokens(tokenText, TreeTokenType.ATTRIBUTE, node), action: TokenAction.TERMINATE};
        } else if (node instanceof FunctionGroups) {
            // simply resolve, nothing added
            return {action: TokenAction.RESOLVE};
        } else if (node instanceof Functions) {
            // simply resolve, nothing added
            return {action: TokenAction.RESOLVE};
        } else if (node instanceof FunctionDeclaration) {
            // resolve into prefix and suffix if possible. it is possible to have no prefixes or suffixes, since the function may have no arguments
            if (tokenPrefixText !== null) {
                if (tokenSuffixText !== null) {
                    return {
                        prefixTokens: this.getPrefixTokens(tokenPrefixText, TreeTokenType.FUNCTION_DEFINITION, node),
                        suffixTokens: [{stringContents: tokenSuffixText.text, range: tokenSuffixText.range, tokenType: TreeTokenType.FUNCTION_DEFINITION, originalNode: node}],
                        action: TokenAction.RESOLVE
                    };
                } else {
                    return {prefixTokens: this.getPrefixTokens(tokenPrefixText, TreeTokenType.FUNCTION_DEFINITION, node), action: TokenAction.RESOLVE};
                }
            } else {
                return {prefixTokens: this.getPrefixTokens(tokenText, TreeTokenType.FUNCTION_DEFINITION, node), action: TokenAction.TERMINATE};
            }
        } else if (node instanceof Argument) {
            return {prefixTokens: this.getPrefixTokens(tokenText, TreeTokenType.ARGUMENT, node), action: TokenAction.TERMINATE};
        }

        throw Error("Some scenarios not explored!");
    }

    private convertEverything(node: SyntaxNode, depth: number, previousNode: SyntaxNode | null, tokenText: TextRange, tokenPrefixText: TextRange | null, tokenSuffixText: TextRange | null): { prefixTokens?: TreeToken[]; suffixTokens?: TreeToken[]; action: TokenAction; } {
        if (depth === 0) {
            // no need to add anything, simply resolve
            return {action: TokenAction.RESOLVE};
        }

        // translate the current node to tokens
        if (node instanceof References) {
            return {prefixTokens: this.getPrefixTokens(tokenText, TreeTokenType.REFERENCES, node), action: TokenAction.TERMINATE};
        } else if (node instanceof Comments) {
            // the other comments inside the function will cover the first comment belonging to a function (e.g Python docstring).
            // therefore, we exclude comments directly in function groups, and the sibling rank is > 0 (which means it is a function comment, we exclude it)
            if (!(node.getParent() instanceof FunctionGroups) || node.getSiblingRank() === 0) {
                return {prefixTokens: this.getPrefixTokens(tokenText, TreeTokenType.COMMENTS, node), action: TokenAction.TERMINATE};
            } else {
                return {action: TokenAction.TERMINATE};
            }
        } else if (node instanceof Classes) {
            // try to split into prefix and suffix
            if (tokenPrefixText !== null) {
                if (tokenSuffixText !== null) {
                    return {
                        prefixTokens: this.getPrefixTokens(tokenPrefixText, TreeTokenType.CLASS, node),
                        suffixTokens: [{stringContents: tokenSuffixText.text, range: tokenSuffixText.range, tokenType: TreeTokenType.CLASS, originalNode: node}],
                        action: TokenAction.RESOLVE
                    };
                } else {
                    return {prefixTokens: this.getPrefixTokens(tokenPrefixText, TreeTokenType.CLASS, node), action: TokenAction.RESOLVE};
                }
            } else {
                return {prefixTokens: this.getPrefixTokens(tokenText, TreeTokenType.CLASS, node), action: TokenAction.RESOLVE};
            }
            
        } else if (node instanceof Attributes) {
            return {prefixTokens: this.getPrefixTokens(tokenText, TreeTokenType.ATTRIBUTE, node), action: TokenAction.TERMINATE};
        } else if (node instanceof FunctionGroups) {
            // simply resolve, nothing added
            return {action: TokenAction.RESOLVE};
        } else if (node instanceof Functions) {
            // simply resolve, nothing added
            return {action: TokenAction.RESOLVE};
        } else if (node instanceof FunctionDeclaration) {
            // resolve into prefix and suffix if possible
            if (tokenPrefixText !== null) {
                if (tokenSuffixText !== null) {
                    return {
                        prefixTokens: this.getPrefixTokens(tokenPrefixText, TreeTokenType.FUNCTION_DEFINITION, node),
                        suffixTokens: [{stringContents: tokenSuffixText.text, range: tokenSuffixText.range, tokenType: TreeTokenType.FUNCTION_DEFINITION, originalNode: node}],
                        action: TokenAction.RESOLVE
                    };
                } else {
                    return {prefixTokens: this.getPrefixTokens(tokenPrefixText, TreeTokenType.FUNCTION_DEFINITION, node), action: TokenAction.RESOLVE};
                }
            } else {
                return {prefixTokens: this.getPrefixTokens(tokenText, TreeTokenType.FUNCTION_DEFINITION, node), action: TokenAction.TERMINATE};
            }
        } else if (node instanceof Argument) {
            return {prefixTokens: this.getPrefixTokens(tokenText, TreeTokenType.ARGUMENT, node), action: TokenAction.TERMINATE};
        }

        throw Error("Some scenarios not explored!");
    }

    private getPrefixTokens(tokenText: TextRange, tokenType: TreeTokenType, originalNode?: SyntaxNode): TreeToken[] {
        const comparison: number = compare(this.prevEndIndex, rangeToStartIndex(tokenText.range));

        let retTokens: TreeToken[];
        if (comparison === 1) {
            throw Error("Invalid comparison! Expected previous end to be less than or equal to the current range.");
        } else if (comparison === -1) {
            const fillRange = indexesToRange(this.prevEndIndex, rangeToStartIndex(tokenText.range));
            retTokens = [
                {stringContents: this.getCodeString(fillRange), range: fillRange, tokenType: TreeTokenType.OTHERS},
                {stringContents: tokenText.text, range: tokenText.range, tokenType: tokenType, originalNode: originalNode}
            ];
        } else {
            retTokens = [{stringContents: tokenText.text, range: tokenText.range, tokenType: tokenType, originalNode: originalNode}];
        }
        this.prevEndIndex = rangeToEndIndex(tokenText.range); // update the previous end
        return retTokens;
    }

    protected disableSubtreeParsing(): boolean {
        return true;
    }

    protected includeIndentation(tokenString: TreeToken[], depth: number): void {
        throw Error("Indentation not supported for faithful tokenizer!");
    }
}