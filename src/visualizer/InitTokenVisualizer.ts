import { splitIntoLines } from "../utils";

import { TokenVisualizer } from "./TokenVisualizer";
import { TreeTokenVisualizer } from "./TreeTokenVisualizer";

import { Token } from "../parsing/ParsingTypes";
import { PythonTokenizer } from "../impl/python/PythonTokenizer";
import { TypeScriptTokenizer } from "../impl/typescript/TypeScriptTokenizer";

import { PythonParser } from "../impl/python/PythonParser";
import { AbstractSyntaxTree } from "../parsing/AbstractSyntaxTree";
import * as treeTokenizer from "./ASTFlatteningUtils";
import { TypeScriptParser } from "../impl/typescript/TypeScriptParser";

customElements.define("token-visualizer", TokenVisualizer);
customElements.define("tree-token-visualizer", TreeTokenVisualizer);

export function tokenizePython(x: string): Token[] {
    const tokenizer = new PythonTokenizer();
    for (let i = 0; i < x.length; i++) {
        tokenizer.next(x.charAt(i));
    }
    tokenizer.next(null);
    return tokenizer.getTokens();
}

export function tokenizeTypeScript(x: string): Token[] {
    const tokenizer = new TypeScriptTokenizer();
    for (let i = 0; i < x.length; i++) {
        tokenizer.next(x.charAt(i));
    }
    tokenizer.next(null);
    return tokenizer.getTokens();
}

export function parsePython(x: string): AbstractSyntaxTree {
    const lines: string[] = splitIntoLines(x);
    const parser = new PythonParser();
    return parser.parse(lines);
}

export function parseTypeScript(x: string): AbstractSyntaxTree {
    const lines: string[] = splitIntoLines(x);
    const parser = new TypeScriptParser();
    return parser.parse(lines);
}

export { treeTokenizer };