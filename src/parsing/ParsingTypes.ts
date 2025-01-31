import { CharacterRange } from "../utils";
import { SyntaxNode } from "../nodes";

export enum TokenType {
    MULTILINE_COMMENTS_OR_STRINGS = "MULTILINE_COMMENTS_OR_STRINGS",
    SINGLELINE_COMMENTS = "SINGLELINE_COMMENTS",
    STRINGS = "STRINGS",
    SPACINGS = "SPACINGS",
    BRACES = "BRACES",
    COMMAS = "COMMAS",
    OTHERS = "OTHERS",
    CONTINUATION = "CONTINUATION" // Dummy value, won't be passed to actual tokens.
};

export type Token = {
    stringContents: string;
    tokenType: TokenType;
    characterRange: CharacterRange
};

export type TokenRange = {
    startTok: number, endTok: number
};

export type SymbolInfo = { symbolType: Terminal | NonTerminal; parseRange?: TokenRange; nodeCreationInformation?: Record<string, any> };

export type SymbolAdditionDirective = {
    symbol: SymbolInfo,
    secondSymbol?: SymbolInfo,
    secondSymbolLen?: number,
    firstTwoSymbolsEndBufferLen?: number
};

export enum NonTerminal {
    TOP_LEVEL = "TOP_LEVEL",
    CLASSES = "CLASSES",
    FUNCTIONS = "FUNCTIONS",
    FUNCTION_DECLARATION = "FUNCTION_DECLARATION",
    FUNCTION_BODY = "FUNCTION_BODY"
}

export enum Terminal {
    COMMENT_SINGLELINE = "COMMENT_SINGLELINE",
    COMMENT_MULTILINE = "COMMENT_MULTILINE",
    REFERENCES = "REFERENCES",
    ARGUMENT = "ARGUMENT",
    ATTRIBUTES = "ATTRIBUTES",
    FILLER = "FILLER",
    STATEMENTS_FILLER = "STATEMENTS_FILLER"
}

export function isTerminal(symbol: string): boolean {
    return Object.values(Terminal).includes(symbol as Terminal);
}