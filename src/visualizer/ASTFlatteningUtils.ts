import { TreeToken } from "../parsing/ASTGenericTokenizer";
import { ASTFaithfulTokenizer, TokenizationMode } from "../parsing/ASTFaithfulTokenizer";
import { AbstractSyntaxTree } from "../parsing/AbstractSyntaxTree";
import { PythonSimplificationTokenizer } from "../impl/python/PythonSimplificationTokenizer";
import { TypeScriptSimplificationTokenizer } from "../impl/typescript/TypeScriptSimplificationTokenizer";

export function flattenFaithfully(
    tree: AbstractSyntaxTree,
    mode: TokenizationMode,
    excludeInnerRangeIfPossible: boolean
): TreeToken[] {
    const tokenizer = new ASTFaithfulTokenizer(mode, excludeInnerRangeIfPossible);
    return tokenizer.tokenize(tree);
}

export function flattenPython(
    tree: AbstractSyntaxTree,
    indentation?: string
):  TreeToken[] {
    const tokenizer = new PythonSimplificationTokenizer(indentation);
    return tokenizer.tokenize(tree);
}

export function flattenTypeScript(
    tree: AbstractSyntaxTree,
    indentation?: string
): TreeToken[] {
    const tokenizer = new TypeScriptSimplificationTokenizer(indentation);
    return tokenizer.tokenize(tree);
}

export { TokenizationMode };