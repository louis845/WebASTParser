import { Token, NonTerminal, Terminal, SymbolAdditionDirective, SymbolInfo, TokenType, TokenRange } from "../../parsing/ParsingTypes";
import { CodeParsingError } from "../../CodeParsingError";
import { Range } from "../../utils";
import { BracesMatcher } from "../../matchers/BracesMatcher";
import { AbstractParser } from "../../parsing/AbstractParser";
import { Argument, Attributes, Classes, Comments, FunctionDeclaration, Functions, References } from "../../nodes";
import { AbstractTokenizer } from "../../parsing/AbstractTokenizer";
import { TypeScriptTokenizer } from "./TypeScriptTokenizer";
import { TypeScriptVarDeclMatcher } from "./TypeScriptVarDeclMatcher";

enum SpecialTokens {
    FUNCTION_KEYWORD,
    CLASS_KEYWORD,
    ANY_KEYWORD,
    OPENING_BRACKET,
    CLOSING_BRACKET,
    OPENING_BRACE,
    CLOSING_BRACE,
    COLON
}

/**
 * TypeScriptParser class is responsible for parsing Python source code into a tree structure.
 */
export class TypeScriptParser extends AbstractParser {
    private bracesMatcher: BracesMatcher;
    private curlyBracesMatcher: BracesMatcher;
    private argumentMatcher: TypeScriptVarDeclMatcher;

    /**
     * Initializes a new instance of the PythonParser class.
     */
    constructor() {
        super();

        this.parseType = NonTerminal.TOP_LEVEL;
        this.bracesMatcher = new BracesMatcher([
            {opening: "{", closing: "}"},
            {opening: "[", closing: "]"},
            {opening: "(", closing: ")"}
        ]);
        this.curlyBracesMatcher = new BracesMatcher([
            {opening: "{", closing: "}"}
        ]);
        this.argumentMatcher = new TypeScriptVarDeclMatcher();
        this.globalDetectionStartIndex = -1;
        this.mostRecentStatementsEndTokIdx = -1;
        this.continuousSpacingsAfterTerminateStatements = true;


        this.functOpeningBracket = -1;
        this.functClosingBracket = -1;
        this.functOpeningBrace = -1;
        this.functClosingBrace = -1;
        this.functRetTypeBracesMatcher = new BracesMatcher([
            {opening: "{", closing: "}"},
            {opening: "[", closing: "]"},
            {opening: "(", closing: ")"},
            {opening: "<", closing: ">"}
        ]);
        this.functName = "";
        this.functType = null;
        this.functPreviousImmediatelyColon = false;
        this.functPreviousImmediatelyClosingBracket = false;

        this.functBodyHasOthers = false;
        this.functBodyHasPreviousContent = false;

        this.functDeclStartParseIdx = -1;
        this.functDeclParsing = false;

        this.codeBlocksHasComments = false;
        this.codeBlocksSymbolToDetect = Terminal.STATEMENTS_FILLER;
        this.codeBlocksLastSymbolDetectionEnd = -1;
        this.codeBlocksHasContents = false;
        this.codeBlocksStartOfPotentialDetection = -1;

        this.cbSymbSpacesTextsOnly = true;
        this.cbSymbAttemptedDetect = false;
        this.cbSymbStringStream = "";
        this.cbSymbTokenStream = [];

        this.cbSymbClassOpeningBrace = -1;
        this.cbSymbClassClosingBrace = -1;
        this.cbSymbClassDefnText = null;

        this.cbSymbFuncOpeningBracket = -1;
        this.cbSymbFuncClosingBracket = -1;
        this.cbSymbFuncOpeningBrace = -1;
        this.cbSymbFuncClosingBrace = -1;
        this.cbSymbFuncDefnText = null;
        this.cbSymbFuncPreviousImmediatelyColon = false;
        this.cbSymbFuncRetTypeBracesMatcher = new BracesMatcher([
            {opening: "{", closing: "}"},
            {opening: "[", closing: "]"},
            {opening: "(", closing: ")"},
            {opening: "<", closing: ">"}
        ]);

        // Initialize various states
        this.resetDetectionState(0, NonTerminal.TOP_LEVEL);
    }

    protected preparse(codeLines: string[], tokens: Token[]): void {
        
    }

    /**
     * Returns whether comments for functions are placed before or after the function.
     * For TypeScript, comments are typically placed before the function.
     */
    protected isCommentBeforeFunction(): boolean {
        return true;
    }

    /**
     * We use PythonTokenizer
     * @returns A new PythonTokenizer
     */
    protected preparseGetTokenizer(): AbstractTokenizer {
        return new TypeScriptTokenizer();
    }


    protected createArgumentNode(range: Range, nodeCreationInformation: Record<string, any> | undefined): Argument {
        return new Argument(range, nodeCreationInformation!.argumentName!, nodeCreationInformation!.argumentType);
    }
    protected createAttributesNode(range: Range, nodeCreationInformation: Record<string, any> | undefined): Attributes {
        return new Attributes(range, nodeCreationInformation!.attributeName!, nodeCreationInformation!.attributeType);
    }
    protected createCommentsNode(range: Range, isMultiLine: boolean, nodeCreationInformation: Record<string, any> | undefined): Comments {
        return new Comments(range, isMultiLine, nodeCreationInformation!.commentContents!);
    }
    protected createReferencesNode(range: Range, nodeCreationInformation: Record<string, any> | undefined): References {
        return new References(range, nodeCreationInformation!.referenceText!, nodeCreationInformation!.refRelativePath);
    }
    protected createClassesNode(range: Range, nodeCreationInformation: Record<string, any> | undefined): Classes {
        // better to include the inner range, so that it is possible to extract more precisely the minimal "keywords" used to match the class
        const node = new Classes(range, nodeCreationInformation!.classType, nodeCreationInformation!.classDefinitionText!);
        node.overrideInnerRange(nodeCreationInformation!.classInnerRange!);
        return node;
    }
    protected createFunctionsNode(range: Range, nodeCreationInformation: Record<string, any> | undefined): Functions {
        // better to include the inner range, so that it is possible to extract more precisely the minimal "keywords" used to match the function
        const node = new Functions(range, nodeCreationInformation!.functionDefinitionText!);
        node.overrideInnerRange(nodeCreationInformation!.funcInnerRange!);
        return node;
    }
    protected createFunctionDeclarationNode(range: Range, nodeCreationInformation: Record<string, any> | undefined): FunctionDeclaration {
        return new FunctionDeclaration(range, nodeCreationInformation!.functionName!, nodeCreationInformation!.functionReturnType);
    }

    // global indicator states
    private parseType: NonTerminal;
    private globalDetectionStartIndex: number;
    private mostRecentStatementsEndTokIdx: number; // the token which serves as the most recent statement end. its equal to globalDetectionStartIndex - 1 initially (since initially there aren't any statement ends)
    private continuousSpacingsAfterTerminateStatements: boolean; // whether we have continuously met spacings after the end of the statements

    protected resetDetectionState(startTokIndex: number, parsingNonTerminal: NonTerminal): void {
        this.globalDetectionStartIndex = startTokIndex;
        this.parseType = parsingNonTerminal;
        this.bracesMatcher.reset();
        this.curlyBracesMatcher.reset();
        this.argumentMatcher.reset();
        this.mostRecentStatementsEndTokIdx = startTokIndex - 1;
        this.continuousSpacingsAfterTerminateStatements = true;

        if (parsingNonTerminal === NonTerminal.TOP_LEVEL) {
            this.codeBlocksHasComments = false;
            this.codeBlocksSymbolToDetect = Terminal.STATEMENTS_FILLER;
            this.codeBlocksLastSymbolDetectionEnd = startTokIndex - 1; // inclusive
            this.codeBlocksHasContents = false;
            this.codeBlocksStartOfPotentialDetection = -1;
        } else if (parsingNonTerminal === NonTerminal.CLASSES) {
            this.codeBlocksHasComments = false;
            this.codeBlocksSymbolToDetect = Terminal.STATEMENTS_FILLER;
            this.codeBlocksLastSymbolDetectionEnd = startTokIndex - 1; // inclusive
            this.codeBlocksHasContents = false;
            this.codeBlocksStartOfPotentialDetection = -1;
        } else if (parsingNonTerminal === NonTerminal.FUNCTIONS) {
            this.functOpeningBracket = -1;
            this.functClosingBracket = -1;
            this.functOpeningBrace = -1;
            this.functClosingBrace = -1;
            this.functRetTypeBracesMatcher.reset();
            this.functName = "";
            this.functType = null;
            this.functPreviousImmediatelyColon = false;
            this.functPreviousImmediatelyClosingBracket = false;
        } else if (parsingNonTerminal === NonTerminal.FUNCTION_BODY) {
            this.functBodyHasOthers = false;
            this.functBodyHasPreviousContent = false;
        } else if (parsingNonTerminal === NonTerminal.FUNCTION_DECLARATION) {
            this.functDeclStartParseIdx = -1;
            this.functDeclParsing = false;
        }
    }

    protected detectTopLevelSymbol(state: (Terminal | NonTerminal)[], token: Token | null, currentTokIndex: number, depth: number): SymbolAdditionDirective | null {
        return this.detectCodeBlocks(token, currentTokIndex);
    }

    protected detectClassesSymbol(state: (Terminal | NonTerminal)[], token: Token | null, currentTokIndex: number, depth: number): SymbolAdditionDirective | null {
        return this.detectCodeBlocks(token, currentTokIndex);
    }

    private functOpeningBracket: number;
    private functClosingBracket: number;
    private functOpeningBrace: number;
    private functClosingBrace: number;
    private functRetTypeBracesMatcher: BracesMatcher;
    private functName: string;
    private functType: string | null;
    private functPreviousImmediatelyColon: boolean;
    private functPreviousImmediatelyClosingBracket: boolean;
    protected detectFunctionsSymbol(state: (Terminal | NonTerminal)[], token: Token | null, currentTokIndex: number, depth: number): SymbolAdditionDirective | null {
        if (token === null) {
            // final conclusion, the last is a function body with closing brace
            return {
                symbol: {symbolType: NonTerminal.FUNCTION_BODY},
                secondSymbol: {symbolType: Terminal.FILLER},
                secondSymbolLen: 1
            };
        }

        let retValue: SymbolAdditionDirective | null = null;
        // detect the opening and closing bracket pairs, and then the opening and closing braces
        if (this.functOpeningBracket === -1) {
            if (token.tokenType === TokenType.OTHERS) {
                this.functName = token.stringContents; // function name is the token right before the opening bracket
            }
            if (token.stringContents === "(" && this.bracesMatcher.currentDepth() === 0) {
                this.functOpeningBracket = currentTokIndex;
            }
        } else if (this.functClosingBracket === -1) {
            if (token.stringContents === ")" && this.bracesMatcher.currentDepth() === 1) {
                this.functClosingBracket = currentTokIndex;
                this.functPreviousImmediatelyClosingBracket = true;
            }
        } else if (this.functOpeningBrace === -1) {
            // try to detect the opening brace
            if (this.functRetTypeBracesMatcher.currentDepth() === 0 && !this.functPreviousImmediatelyColon && token.stringContents === "{") {
                if (this.functType !== null) {
                    this.functType = this.stripString(this.functType);
                }
                this.functOpeningBrace = currentTokIndex;
                this.functRetTypeBracesMatcher.reset();

                // function declaration detected, and parse range should not include the opening brace
                // unlike Python, we do not include the opening brace at the end too
                retValue = {symbol:  {
                    symbolType: NonTerminal.FUNCTION_DECLARATION,
                    parseRange: {startTok: this.globalDetectionStartIndex, endTok: this.functOpeningBrace}, // end tok is non inclusive on the right
                    nodeCreationInformation: {functionName: this.functName.trim(), functionReturnType: this.functType}
                }, secondSymbolLen: 1, secondSymbol: {symbolType: Terminal.FILLER}};
            } else if (this.functPreviousImmediatelyColon && this.functRetTypeBracesMatcher.currentDepth() === 0) {
                this.functType = token.stringContents; // start of detecting funct type
            } else if (this.functType !== null) {
                this.functType += token.stringContents;
            }

            if (token.tokenType == TokenType.BRACES || token.stringContents === "<" || token.stringContents === ">") {
                try {
                    this.functRetTypeBracesMatcher.next(token.stringContents);
                } catch (e: any) {
                    if (e instanceof Error) {
                        throw new CodeParsingError("Error during brace matching! " + e.message);
                    }
                    throw e;
                }
            }
        } else if (this.functClosingBrace === -1) {
            // try to detect the closing brace
            if (this.curlyBracesMatcher.currentDepth() === 1 && token.stringContents === "}") {
                this.functClosingBrace = currentTokIndex;
            }
        }

        if (token.stringContents === ":") {
            this.functPreviousImmediatelyColon = true;
        } else if (token.tokenType !== TokenType.SPACINGS) {
            this.functPreviousImmediatelyColon = false;
        }
        if (token.tokenType !== TokenType.SPACINGS) {
            this.functPreviousImmediatelyClosingBracket = false;
        }

        this.updateBracesAndTerminateStatementsState(token, currentTokIndex);
        return retValue;
    }

    private functBodyHasOthers: boolean;
    private functBodyHasPreviousContent: boolean;
    protected detectFunctionBodySymbol(state: (Terminal | NonTerminal)[], token: Token | null, currentTokIndex: number, depth: number): SymbolAdditionDirective | null {
        // simply parse the comments and multiline comments, without caring about the indentation
        if (token === null) {
            if (this.functBodyHasPreviousContent) {
                return {symbol: {symbolType: this.functBodyHasOthers ? Terminal.STATEMENTS_FILLER: Terminal.FILLER}};
            }
            return null;
        }

        let retDirective: SymbolAdditionDirective | null = null;
        if (token.tokenType === TokenType.SINGLELINE_COMMENTS) {
            if (this.functBodyHasPreviousContent) {
                retDirective = {
                    symbol: {symbolType: this.functBodyHasOthers ? Terminal.STATEMENTS_FILLER: Terminal.FILLER},
                    secondSymbol: {symbolType: Terminal.COMMENT_SINGLELINE, nodeCreationInformation: {commentContents: token.stringContents.substring(2, token.stringContents.length)}}
                }
            } else {
                retDirective = {symbol: {symbolType: Terminal.COMMENT_SINGLELINE, nodeCreationInformation: {commentContents: token.stringContents.substring(2, token.stringContents.length)}}};
            }

            // reset
            this.functBodyHasOthers = false;
            this.functBodyHasPreviousContent = false;
        } else if (token.tokenType === TokenType.MULTILINE_COMMENTS_OR_STRINGS && token.stringContents.startsWith("/*") && token.stringContents.endsWith("*/")) {
            if (this.functBodyHasPreviousContent) {
                retDirective = {
                    symbol: {symbolType: this.functBodyHasOthers ? Terminal.STATEMENTS_FILLER: Terminal.FILLER},
                    secondSymbol: {symbolType: Terminal.COMMENT_MULTILINE, nodeCreationInformation: {commentContents: token.stringContents.substring(2, token.stringContents.length - 2)}}
                }
            } else {
                retDirective = {symbol: {symbolType: Terminal.COMMENT_MULTILINE, nodeCreationInformation: {commentContents: token.stringContents.substring(2, token.stringContents.length - 2)}}};
            }

            // reset
            this.functBodyHasOthers = false;
            this.functBodyHasPreviousContent = false;
        } else {
            this.functBodyHasPreviousContent = true;
            if (token.tokenType !== TokenType.SPACINGS) {
                this.functBodyHasOthers = true;
            }
        }

        return retDirective;
    }


    private functDeclStartParseIdx: number;
    private functDeclParsing: boolean;
    protected detectFunctionDeclarationSymbol(state: (Terminal | NonTerminal)[], token: Token | null, currentTokIndex: number, depth: number): SymbolAdditionDirective | null {
        // simply separate by commas
        if (token === null) {
            return {symbol: {symbolType: Terminal.FILLER}};
        }

        let retDirective: SymbolAdditionDirective | null = null;
        if (this.functDeclParsing) {
            const action = this.argumentMatcher.next(token);
            if (action !== null) {
                // conclude
                retDirective = {
                    symbol: {symbolType: Terminal.FILLER},
                    secondSymbol: {symbolType: Terminal.ARGUMENT, nodeCreationInformation: {argumentName: action.name, argumentType: action.type}},
                    secondSymbolLen: currentTokIndex - this.functDeclStartParseIdx - 1,
                    firstTwoSymbolsEndBufferLen: 1
                };
                this.functDeclStartParseIdx = currentTokIndex;
            }
        }
        this.updateBracesAndTerminateStatementsState(token, currentTokIndex);
        if (this.functDeclParsing && this.bracesMatcher.currentDepth() === 0) { // function declaration is closed
            this.functDeclParsing = false;

            // conclude, since bracket ended
            const action = this.argumentMatcher.reset();
            if (action !== null) {
                // conclude
                retDirective = {
                    symbol: {symbolType: Terminal.FILLER},
                    secondSymbol: {symbolType: Terminal.ARGUMENT, nodeCreationInformation: {argumentName: action.name, argumentType: action.type}},
                    secondSymbolLen: currentTokIndex - this.functDeclStartParseIdx - 1,
                    firstTwoSymbolsEndBufferLen: 1
                };
                this.functDeclStartParseIdx = currentTokIndex;
            }
        } else if (this.bracesMatcher.currentDepth() > 0 && this.functDeclStartParseIdx === -1) {
            this.functDeclStartParseIdx = currentTokIndex;
            this.functDeclParsing = true;
        }

        return retDirective;
    }

    private codeBlocksHasComments: boolean;
    private codeBlocksSymbolToDetect: Terminal | NonTerminal;
    private codeBlocksLastSymbolDetectionEnd: number; // inclusive
    private codeBlocksHasContents: boolean; // to determine whether there are contents or not (filler or statements filler)
    private codeBlocksStartOfPotentialDetection: number; // inclusive
    private detectCodeBlocks(token: Token | null, currentTokIndex: number): SymbolAdditionDirective | null {
        if (token === null) {
            if (this.codeBlocksSymbolToDetect === Terminal.STATEMENTS_FILLER) {
                const fillerType: Terminal = this.codeBlocksHasContents ? Terminal.STATEMENTS_FILLER : Terminal.FILLER;
                return {symbol: {symbolType: fillerType}};
            }
            // try to conclude
            const action = this.attemptConcludeCodeBlock(this.codeBlocksSymbolToDetect);
            if (action.create === undefined) {
                return {symbol: {symbolType: Terminal.STATEMENTS_FILLER}}; // have something in there which makes it a statements filler
            } else {
                const gap = this.codeBlocksStartOfPotentialDetection - this.codeBlocksLastSymbolDetectionEnd - 1;
                if (gap > 0) {
                    const fillerType: Terminal = this.codeBlocksHasContents ? Terminal.STATEMENTS_FILLER : Terminal.FILLER;
                    return {
                        symbol: {symbolType: fillerType},
                        secondSymbol: action.create,
                        secondSymbolLen: currentTokIndex - this.codeBlocksStartOfPotentialDetection
                    };
                } else {
                    return {symbol: action.create};
                }
            }
        }
        let retValue: SymbolAdditionDirective | null = null;
        const startStatementIdx: number = currentTokIndex - this.mostRecentStatementsEndTokIdx - 1;
        if (startStatementIdx === 0) {
            // needs reset of detection
            if (this.codeBlocksSymbolToDetect !== Terminal.STATEMENTS_FILLER) {
                this.codeBlocksSymbolToDetect = Terminal.STATEMENTS_FILLER;
                this.codeBlocksHasContents = true; // there are contents, since there is probably an incomplete detection
            }
            this.codeBlocksHasComments = false;
        }
        // handle different cases
        if (this.codeBlocksSymbolToDetect === Terminal.STATEMENTS_FILLER) {
            // try to upgrade
            if (!this.codeBlocksHasComments) { // upgrade only if no comments
                if (token.tokenType === TokenType.SINGLELINE_COMMENTS) {
                    const priorFillerLength: number = currentTokIndex - this.codeBlocksLastSymbolDetectionEnd - 1;
                    const comments: string = token.stringContents.substring(2, token.stringContents.length);

                    if (priorFillerLength === 0) {
                        retValue = {symbol: {symbolType: Terminal.COMMENT_SINGLELINE, nodeCreationInformation: {commentContents: comments}}};
                    } else {
                        const fillerType: Terminal = this.codeBlocksHasContents ? Terminal.STATEMENTS_FILLER : Terminal.FILLER;
                        retValue = {
                            symbol: {symbolType: fillerType},
                            secondSymbol: {symbolType: Terminal.COMMENT_SINGLELINE, nodeCreationInformation: {commentContents: comments}}
                        };
                    }

                    // reset
                    this.codeBlocksHasComments = true;
                    this.codeBlocksLastSymbolDetectionEnd = currentTokIndex;
                    this.codeBlocksHasContents = false;
                } else if (token.tokenType === TokenType.MULTILINE_COMMENTS_OR_STRINGS && token.stringContents.startsWith("/*") && token.stringContents.endsWith("*/")) {
                    const priorFillerLength: number = currentTokIndex - this.codeBlocksLastSymbolDetectionEnd - 1;
                    const comments: string = token.stringContents.substring(2, token.stringContents.length - 2);

                    this.codeBlocksHasComments = true;
                    this.codeBlocksLastSymbolDetectionEnd = currentTokIndex;
                    if (priorFillerLength === 0) {
                        retValue = {symbol: {symbolType: Terminal.COMMENT_MULTILINE, nodeCreationInformation: {commentContents: comments}}};
                    } else {
                        const fillerType: Terminal = this.codeBlocksHasContents ? Terminal.STATEMENTS_FILLER : Terminal.FILLER;
                        retValue = {
                            symbol: {symbolType: fillerType},
                            secondSymbol: {symbolType: Terminal.COMMENT_MULTILINE, nodeCreationInformation: {commentContents: comments}}
                        };
                    }

                    // reset
                    this.codeBlocksHasComments = true;
                    this.codeBlocksLastSymbolDetectionEnd = currentTokIndex;
                    this.codeBlocksHasContents = false;
                } else {
                    // await the first non-spacing token.
                    // therefore, the first token must be a non-spacing. afterwards, there is no restriction
                    if (!this.continuousSpacingsAfterTerminateStatements || token.tokenType !== TokenType.SPACINGS) {
                        if (this.continuousSpacingsAfterTerminateStatements) {
                            this.codeBlocksStartOfPotentialDetection = currentTokIndex;
                        }
                        retValue = this.detectSymbolsAsCodeBlocks(token, currentTokIndex, currentTokIndex - this.codeBlocksStartOfPotentialDetection);
                    }
                }
            } else {
                if (token.tokenType === TokenType.SINGLELINE_COMMENTS) {
                    const priorFillerLength: number = currentTokIndex - this.codeBlocksLastSymbolDetectionEnd - 1;
                    const comments: string = token.stringContents.substring(2, token.stringContents.length);

                    if (priorFillerLength === 0) {
                        retValue = {symbol: {symbolType: Terminal.COMMENT_SINGLELINE, nodeCreationInformation: {commentContents: comments}}};
                    } else {
                        const fillerType: Terminal = this.codeBlocksHasContents ? Terminal.STATEMENTS_FILLER : Terminal.FILLER;
                        retValue = {
                            symbol: {symbolType: fillerType},
                            secondSymbol: {symbolType: Terminal.COMMENT_SINGLELINE, nodeCreationInformation: {commentContents: comments}}
                        };
                    }

                    // reset
                    this.codeBlocksLastSymbolDetectionEnd = currentTokIndex;
                    this.codeBlocksHasContents = false;
                } else if (token.tokenType === TokenType.MULTILINE_COMMENTS_OR_STRINGS && token.stringContents.startsWith("/*") && token.stringContents.endsWith("*/")) {
                    const priorFillerLength: number = currentTokIndex - this.codeBlocksLastSymbolDetectionEnd - 1;
                    const comments: string = token.stringContents.substring(2, token.stringContents.length - 2);

                    this.codeBlocksHasComments = true;
                    this.codeBlocksLastSymbolDetectionEnd = currentTokIndex;
                    if (priorFillerLength === 0) {
                        retValue = {symbol: {symbolType: Terminal.COMMENT_MULTILINE, nodeCreationInformation: {commentContents: comments}}};
                    } else {
                        const fillerType: Terminal = this.codeBlocksHasContents ? Terminal.STATEMENTS_FILLER : Terminal.FILLER;
                        retValue = {
                            symbol: {symbolType: fillerType},
                            secondSymbol: {symbolType: Terminal.COMMENT_MULTILINE, nodeCreationInformation: {commentContents: comments}}
                        };
                    }

                    // reset
                    this.codeBlocksLastSymbolDetectionEnd = currentTokIndex;
                    this.codeBlocksHasContents = false;
                } else if (token.tokenType !== TokenType.SPACINGS){
                    // we've detected something else, so we flag it
                    this.codeBlocksHasContents = true;
                }
            }
        } else {
            retValue = this.detectSymbolsAsCodeBlocks(token, currentTokIndex, currentTokIndex - this.codeBlocksStartOfPotentialDetection);
        }
        

        this.updateBracesAndTerminateStatementsState(token, currentTokIndex);
        return retValue;
    }

    private cbSymbSpacesTextsOnly: boolean;
    private cbSymbAttemptedDetect: boolean;
    private cbSymbStringStream: string;
    private cbSymbTokenStream: Token[];

    private cbSymbClassOpeningBrace: number;
    private cbSymbClassClosingBrace: number;
    private cbSymbClassDefnText: string | null;

    private cbSymbFuncOpeningBracket: number;
    private cbSymbFuncClosingBracket: number;
    private cbSymbFuncOpeningBrace: number;
    private cbSymbFuncClosingBrace: number;
    private cbSymbFuncDefnText: string | null;
    private cbSymbFuncPreviousImmediatelyColon: boolean;
    private cbSymbFuncRetTypeBracesMatcher: BracesMatcher;
    private detectSymbolsAsCodeBlocks(token: Token, currentTokIndex: number, startStatementIdx: number): SymbolAdditionDirective | null {
        if (startStatementIdx === 0) {
            // reset
            this.cbSymbSpacesTextsOnly = true;
            this.cbSymbAttemptedDetect = false;
            this.cbSymbStringStream = "";
            this.cbSymbTokenStream = [];

            this.cbSymbClassOpeningBrace = -1;
            this.cbSymbClassClosingBrace = -1;
            this.cbSymbClassDefnText = null;

            this.cbSymbFuncOpeningBracket = -1;
            this.cbSymbFuncClosingBracket = -1;
            this.cbSymbFuncOpeningBrace = -1;
            this.cbSymbFuncClosingBrace = -1;
            this.cbSymbFuncDefnText = null;
            this.cbSymbFuncPreviousImmediatelyColon = false;
            this.cbSymbFuncRetTypeBracesMatcher.reset();
        }
        this.cbSymbStringStream += token.stringContents; // add no matter what
        if (token.tokenType !== TokenType.SPACINGS) {
            this.cbSymbTokenStream.push(token);
        }

        let action: {create?: SymbolInfo, invalidate: boolean} | null = null;
        if (this.parseType === NonTerminal.TOP_LEVEL) {
            if (this.codeBlocksSymbolToDetect === Terminal.STATEMENTS_FILLER) {
                // try to upgrade the detection
                if (!this.cbSymbAttemptedDetect) { // upgrade only if its fresh
                    if (startStatementIdx === 0 && token.stringContents === "import") {
                        this.codeBlocksSymbolToDetect = Terminal.REFERENCES;
                        this.cbSymbAttemptedDetect = true;
                    } else if (this.cbSymbTokenStream[0].stringContents === "export" && token.stringContents === "from") { // try export from
                        this.codeBlocksSymbolToDetect = Terminal.REFERENCES;
                        this.cbSymbAttemptedDetect = true;
                    } else if (this.cbSymbSpacesTextsOnly && (token.stringContents === "class" || token.stringContents === "interface")) {
                        this.codeBlocksSymbolToDetect = NonTerminal.CLASSES;
                        this.cbSymbAttemptedDetect = true;
                    } else if (this.cbSymbSpacesTextsOnly && token.stringContents === "function") {
                        this.codeBlocksSymbolToDetect = NonTerminal.FUNCTIONS;
                        this.cbSymbAttemptedDetect = true;
                    }
                }
            } else if (this.codeBlocksSymbolToDetect === Terminal.REFERENCES) {
                if (this.checkCodeEndCondition(token)) {
                    // reached end. check string
                    action = this.attemptConcludeCodeBlock(this.codeBlocksSymbolToDetect);
                }
            } else if (this.codeBlocksSymbolToDetect === NonTerminal.CLASSES) {
                if (this.checkCodeEndCondition(token)) {
                    // reached end. check string
                    action = this.attemptConcludeCodeBlock(this.codeBlocksSymbolToDetect);
                } else {
                    if (this.cbSymbClassOpeningBrace !== -1) {
                        // await the closing brace
                        if (this.cbSymbClassClosingBrace !== -1 && token.tokenType !== TokenType.SPACINGS) {
                            // got non spacing tokens after closed. invalid. downgrade now
                            this.codeBlocksHasContents = true; // failed class. therefore has some unwanted contents
                            this.codeBlocksSymbolToDetect = Terminal.STATEMENTS_FILLER;
                        } else if (token.stringContents === "}" && this.bracesMatcher.currentDepth() === 1) {
                            this.cbSymbClassClosingBrace = currentTokIndex;
                        }
                    } else {
                        // await the opening brace
                        if (token.stringContents === "{" && this.bracesMatcher.currentDepth() === 0) {
                            this.cbSymbClassOpeningBrace = currentTokIndex;

                            // set the class definition text
                            this.cbSymbClassDefnText = this.stripString(this.cbSymbStringStream.substring(0, this.cbSymbStringStream.length - 1));
                        }
                    }
                }
            } else if (this.codeBlocksSymbolToDetect === NonTerminal.FUNCTIONS) {
                if (this.checkCodeEndCondition(token)) {
                    action = this.attemptConcludeCodeBlock(this.codeBlocksSymbolToDetect);
                } else {
                    // detect the opening and closing bracket pairs, and then the opening and closing braces
                    if (this.cbSymbFuncOpeningBracket === -1) {
                        if (token.stringContents === "(" && this.bracesMatcher.currentDepth() === 0) {
                            this.cbSymbFuncOpeningBracket = currentTokIndex;
                        }
                    } else if (this.cbSymbFuncClosingBracket === -1) {
                        if (token.stringContents === ")" && this.bracesMatcher.currentDepth() === 1) {
                            this.cbSymbFuncClosingBracket = currentTokIndex;
                        }
                    } else if (this.cbSymbFuncOpeningBrace === -1) {
                        // try to detect the opening brace
                        if (this.cbSymbFuncRetTypeBracesMatcher.currentDepth() === 0 && !this.cbSymbFuncPreviousImmediatelyColon && token.stringContents === "{") {
                            this.cbSymbFuncDefnText = this.stripString(this.cbSymbStringStream.substring(0, this.cbSymbStringStream.length - 1));
                            this.cbSymbFuncOpeningBrace = currentTokIndex;
                            this.cbSymbFuncRetTypeBracesMatcher.reset();
                        }

                        if (token.tokenType == TokenType.BRACES || token.stringContents === "<" || token.stringContents === ">") {
                            try {
                                this.cbSymbFuncRetTypeBracesMatcher.next(token.stringContents);
                            } catch (e: any) {
                                if (e instanceof Error) {
                                    throw new CodeParsingError("Error during brace matching! " + e.message);
                                }
                                throw e;
                            }
                        }
                    } else if (this.cbSymbFuncClosingBrace === -1) {
                        // try to detect the closing brace
                        if (this.curlyBracesMatcher.currentDepth() === 1 && token.stringContents === "}") {
                            this.cbSymbFuncClosingBrace = currentTokIndex;
                        }
                    } else if (token.tokenType !== TokenType.SPACINGS) {
                        // got non spacing tokens after closed. invalid. downgrade now
                        this.codeBlocksHasContents = true; // failed function. therefore has some unwanted contents
                        this.codeBlocksSymbolToDetect = Terminal.STATEMENTS_FILLER;
                    }

                    if (token.stringContents === ":") {
                        this.cbSymbFuncPreviousImmediatelyColon = true;
                    } else if (token.tokenType !== TokenType.SPACINGS) {
                        this.cbSymbFuncPreviousImmediatelyColon = false;
                    }
                }
            }
        } else if (this.parseType === NonTerminal.CLASSES) {
            if (this.codeBlocksSymbolToDetect === Terminal.STATEMENTS_FILLER) {
                // try to upgrade the detection
                if (!this.cbSymbAttemptedDetect) { // upgrade only if its fresh
                    if (this.cbSymbTokenStream.length >= 2 && token.stringContents === ":" && this.bracesMatcher.currentDepth() === 0 && this.cbSymbSpacesTextsOnly) {
                        this.codeBlocksSymbolToDetect = Terminal.ATTRIBUTES;
                        this.cbSymbAttemptedDetect = true;
                        // upgrade to attributes, and use var decl matcher to match the contents
                        this.argumentMatcher.reset();
                        this.argumentMatcher.next(this.cbSymbTokenStream[this.cbSymbTokenStream.length - 2]);
                        this.argumentMatcher.next(this.cbSymbTokenStream[this.cbSymbTokenStream.length - 1]);
                    } else if (this.cbSymbSpacesTextsOnly && token.stringContents === "(" && this.bracesMatcher.currentDepth() === 0) {
                         // first bracket upgrade to functions
                        this.codeBlocksSymbolToDetect = NonTerminal.FUNCTIONS;
                        this.cbSymbAttemptedDetect = true;
                        this.cbSymbFuncOpeningBracket = currentTokIndex;
                    }
                }
            } else if (this.codeBlocksSymbolToDetect === Terminal.ATTRIBUTES) {
                if (this.checkCodeEndCondition(token)) {
                    // reached end. check string
                    action = this.attemptConcludeCodeBlock(this.codeBlocksSymbolToDetect);
                } else {
                    this.argumentMatcher.next(token);
                }
            } else if (this.codeBlocksSymbolToDetect === NonTerminal.FUNCTIONS) {
                if (this.checkCodeEndCondition(token)) {
                    action = this.attemptConcludeCodeBlock(this.codeBlocksSymbolToDetect);
                } else {
                    // detect the closing bracket pairs, and then the opening and closing braces
                    if (this.cbSymbFuncClosingBracket === -1) {
                        if (token.stringContents === ")" && this.bracesMatcher.currentDepth() === 1) {
                            this.cbSymbFuncClosingBracket = currentTokIndex;
                        }
                    } else if (this.cbSymbFuncOpeningBrace === -1) {
                        // try to detect the opening brace
                        if (this.cbSymbFuncRetTypeBracesMatcher.currentDepth() === 0 && !this.cbSymbFuncPreviousImmediatelyColon && token.stringContents === "{") {
                            this.cbSymbFuncDefnText = this.stripString(this.cbSymbStringStream.substring(0, this.cbSymbStringStream.length - 1));
                            this.cbSymbFuncOpeningBrace = currentTokIndex;
                            this.cbSymbFuncRetTypeBracesMatcher.reset();
                        }

                        if (token.tokenType == TokenType.BRACES || token.stringContents === "<" || token.stringContents === ">") {
                            try {
                                this.cbSymbFuncRetTypeBracesMatcher.next(token.stringContents);
                            } catch (e: any) {
                                if (e instanceof Error) {
                                    throw new CodeParsingError("Error during brace matching! " + e.message);
                                }
                                throw e;
                            }
                        }
                    } else if (this.cbSymbFuncClosingBrace === -1) {
                        // try to detect the closing brace
                        if (this.curlyBracesMatcher.currentDepth() === 1 && token.stringContents === "}") {
                            this.cbSymbFuncClosingBrace = currentTokIndex;
                        }
                    } else if (token.tokenType !== TokenType.SPACINGS) {
                        // got non spacing tokens after closed. invalid. downgrade now
                        this.codeBlocksHasContents = true; // failed function. therefore has some unwanted contents
                        this.codeBlocksSymbolToDetect = Terminal.STATEMENTS_FILLER;
                    }

                    if (token.stringContents === ":") {
                        this.cbSymbFuncPreviousImmediatelyColon = true;
                    } else if (token.tokenType !== TokenType.SPACINGS) {
                        this.cbSymbFuncPreviousImmediatelyColon = false;
                    }
                }
            }
        } else {
            throw Error("Unexpected!");
        }

        let retValue: SymbolAdditionDirective | null = null;
        if (action !== null) {
            if ((action.create === undefined) !== action.invalidate) {
                throw Error("Unexpected!");
            }
            if (action.create === undefined) {
                // need to invalidate. failed detection, therefore has some unwanted contents
                this.codeBlocksHasContents = true;
            } else {
                // check whether two are created or others
                if (this.codeBlocksStartOfPotentialDetection - this.codeBlocksLastSymbolDetectionEnd === 1) {
                    // ok, this means there are no gaps (since start of detection is inclusive, and detection end is inclusive)
                    retValue = {symbol: action.create, secondSymbolLen: 1}; // exclude the current spacing token
                } else {
                    // there are gaps
                    const fillerType: Terminal = this.codeBlocksHasContents ? Terminal.STATEMENTS_FILLER : Terminal.FILLER;
                    retValue = {
                        symbol: {symbolType: fillerType},
                        secondSymbol: action.create,
                        secondSymbolLen: currentTokIndex - this.codeBlocksStartOfPotentialDetection, // not including the current spacing token
                        firstTwoSymbolsEndBufferLen: 1
                    };
                }

                // update the end
                this.codeBlocksLastSymbolDetectionEnd = currentTokIndex - 1;
            }
            this.codeBlocksSymbolToDetect = Terminal.STATEMENTS_FILLER; // downgrade to statements filler
        }

        if (!(token.tokenType === TokenType.SPACINGS || token.tokenType === TokenType.OTHERS)) {
            this.cbSymbSpacesTextsOnly = false;
        }
        return retValue;
    }

    private attemptConcludeCodeBlock(symbolToDetect: Terminal | NonTerminal): {create?: SymbolInfo, invalidate: boolean} {
        if (this.parseType === NonTerminal.TOP_LEVEL) {
            if (symbolToDetect === Terminal.REFERENCES) {
                if (this.cbSymbTokenStream.length >= 3 && (this.cbSymbTokenStream[0].stringContents === "import" || this.cbSymbTokenStream[0].stringContents === "export")
                    && this.cbSymbTokenStream[this.cbSymbTokenStream.length - 2].stringContents === "from"
                    && this.cbSymbTokenStream[this.cbSymbTokenStream.length - 1].tokenType === TokenType.STRINGS
                ) {
                    // we conclude only if the format is largely correct
                    const referenceText: string = this.stripString(this.cbSymbStringStream.substring(0, this.cbSymbStringStream.length - 1));
                    let referenceLoc: string = this.cbSymbTokenStream[this.cbSymbTokenStream.length - 1].stringContents;
                    referenceLoc = referenceLoc.substring(1, referenceLoc.length - 1);
                    // try to resolve the reference relative path
                    let refRelativePath: string | null = null;
                    if (referenceLoc.startsWith("./")) {
                        referenceLoc = referenceLoc.substring(2, referenceLoc.length);
                        if (referenceLoc.length > 0) {
                            refRelativePath = "local-file://" + referenceLoc;
                        }
                    } else if (referenceLoc.startsWith("../")) {
                        referenceLoc = referenceLoc.substring(3, referenceLoc.length);
                        if (referenceLoc.length > 0) {
                            refRelativePath = "local-file://../" + referenceLoc;
                        }
                    } else {
                        if (referenceLoc.length > 0) {
                            refRelativePath = "environment://" + referenceLoc;
                        }
                    }

                    // ok, set the return type
                    const creationInfo = {referenceText: referenceText, refRelativePath: refRelativePath};
                    const symbol: SymbolInfo = {symbolType: Terminal.REFERENCES, nodeCreationInformation: creationInfo};
                    return {create: symbol, invalidate: false};
                } else {
                    return {invalidate: true};
                }
            } else if (symbolToDetect === NonTerminal.CLASSES) {
                if (this.cbSymbClassOpeningBrace !== -1 && this.cbSymbClassClosingBrace !== -1 && this.cbSymbClassDefnText !== null) {
                    // ok, get the information
                    const tokRange: TokenRange = {startTok: this.cbSymbClassOpeningBrace + 1, endTok: this.cbSymbClassClosingBrace};
                    const range: Range = this.getRange(this.getTokenChRange(tokRange.startTok).start, this.getTokenChRange(tokRange.endTok).start);
                    const creationInfo: {classDefinitionText: string, classType: null, classInnerRange: Range} = {
                        classDefinitionText: this.cbSymbClassDefnText,
                        classType: null,
                        classInnerRange: range
                    };
                    const symbol: SymbolInfo = {symbolType: NonTerminal.CLASSES, nodeCreationInformation: creationInfo, parseRange: tokRange};
                    return {create: symbol, invalidate: false};
                } else {
                    return {invalidate: true};
                }
            } else if (symbolToDetect === NonTerminal.FUNCTIONS) {
                if (this.cbSymbFuncOpeningBracket !== -1 && this.cbSymbFuncClosingBracket !== -1 && this.cbSymbFuncOpeningBrace !== -1 &&
                    this.cbSymbFuncClosingBrace !== -1 && this.cbSymbFuncDefnText !== null && (this.cbSymbFuncClosingBrace - this.cbSymbFuncOpeningBrace > 1)
                ) {
                    const range: Range = this.getRange(this.getTokenChRange(this.cbSymbFuncOpeningBrace + 1).start, this.getTokenChRange(this.cbSymbFuncClosingBrace).start);
                    const creationInfo: {functionDefinitionText: string, funcInnerRange: Range} = {
                        functionDefinitionText: this.cbSymbFuncDefnText,
                        funcInnerRange: range
                    };
                    const symbol: SymbolInfo = {symbolType: NonTerminal.FUNCTIONS, nodeCreationInformation: creationInfo};
                    return {create: symbol, invalidate: false};
                } else {
                    return {invalidate: true};
                }
            } else {
                throw Error("Unexpected!");
            }
        } else if (this.parseType === NonTerminal.CLASSES) {
            if (symbolToDetect === Terminal.ATTRIBUTES) {
                const action = this.argumentMatcher.reset();
                if (action !== null && action.name.length > 0 && action.type !== null) {
                    const creationInfo: {attributeName: string, attributeType: string} = {
                        attributeName: action.name,
                        attributeType: action.type
                    };
                    const symbol: SymbolInfo = { symbolType: Terminal.ATTRIBUTES, nodeCreationInformation: creationInfo };
                    return {create: symbol, invalidate: false};
                } else {
                    return {invalidate: true};
                }
            } else if (symbolToDetect === NonTerminal.FUNCTIONS) {
                if (this.cbSymbFuncOpeningBracket !== -1 && this.cbSymbFuncClosingBracket !== -1 && this.cbSymbFuncOpeningBrace !== -1 &&
                    this.cbSymbFuncClosingBrace !== -1 && this.cbSymbFuncDefnText !== null && (this.cbSymbFuncClosingBrace - this.cbSymbFuncOpeningBrace > 1)
                ) {
                    const range: Range = this.getRange(this.getTokenChRange(this.cbSymbFuncOpeningBrace + 1).start, this.getTokenChRange(this.cbSymbFuncClosingBrace).start);
                    const creationInfo: {functionDefinitionText: string, funcInnerRange: Range} = {
                        functionDefinitionText: this.cbSymbFuncDefnText,
                        funcInnerRange: range
                    };
                    const symbol: SymbolInfo = {symbolType: NonTerminal.FUNCTIONS, nodeCreationInformation: creationInfo};
                    return {create: symbol, invalidate: false};
                } else {
                    return {invalidate: true};
                }
            } else {
                throw Error("Unexpected!");
            }
        } else {
            throw Error("Unexpected!");
        }
    }

    private updateBracesAndTerminateStatementsState(token: Token, currentTokIndex: number) {
        if (token.tokenType === TokenType.SPACINGS) {
            if (this.checkCodeEndCondition(token)) {
                if (token.stringContents === ";" && this.bracesMatcher.currentDepth() > 0) {
                    // ok, there is probably syntax error in the code
                    // however, we allow the ; to "hard reset" the braces
                    this.bracesMatcher.reset();
                }
                // we have new line or statement end. reset indentation
                this.mostRecentStatementsEndTokIdx = currentTokIndex;
                this.continuousSpacingsAfterTerminateStatements = true;
            }
        } else if (token.tokenType === TokenType.BRACES) {
            try {
                this.bracesMatcher.next(token.stringContents);
            } catch (e: any) {
                if (e instanceof Error) {
                    throw new CodeParsingError("Error during brace matching! " + e.message);
                }
                throw e;
            }
            if (token.stringContents === "{" || token.stringContents === "}") {
                try {
                    this.curlyBracesMatcher.next(token.stringContents);
                } catch (e: any) {
                    if (e instanceof Error) {
                        throw new CodeParsingError("Error during curly brace matching! " + e.message);
                    }
                    throw e;
                }
            }
            this.continuousSpacingsAfterTerminateStatements = false;
        } else {
            this.continuousSpacingsAfterTerminateStatements = false;
        }
    }

    private checkCodeEndCondition(token: Token): boolean {
        return (token.stringContents === "\n" && this.bracesMatcher.currentDepth() === 0) ||
                (token.stringContents === ";" && this.curlyBracesMatcher.currentDepth() === 0);
    }

    private stripString(str: string): string {
        return str.replace(/\r\n|\r|\n|\t/g, " ").trim();
    }
}
