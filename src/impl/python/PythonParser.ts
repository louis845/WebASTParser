import { Token, NonTerminal, Terminal, SymbolAdditionDirective, SymbolInfo, TokenType } from "../../parsing/ParsingTypes";
import { CodeParsingError } from "../../CodeParsingError";
import { Range } from "../../utils";
import { BracesMatcher } from "../../matchers/BracesMatcher";
import { AbstractParser } from "../../parsing/AbstractParser";
import { Argument, Attributes, Classes, Comments, FunctionDeclaration, Functions, References } from "../../nodes";
import { AbstractTokenizer } from "../../parsing/AbstractTokenizer";
import { PythonTokenizer } from "./PythonTokenizer";

enum CodeBlockType {
    SINGLE_LINE = "SINGLE_LINE",
    MULTI_LINE = "MULTI_LINE"
}

/**
 * PythonParser class is responsible for parsing Python source code into a tree structure.
 * It detects top-level constructs such as classes, functions, comments, imports, and fillers.
 */
export class PythonParser extends AbstractParser {
    // Indentation settings
    private pythonCodeIndents: string = "";
    private pythonIsTabs: boolean = false;
    private bracesMatcher: BracesMatcher;

    /**
     * @returns The detected indentation.
     */
    public getDetectedIndentation(): string {
        return this.pythonCodeIndents;
    }

    /**
     * Initializes a new instance of the PythonParser class.
     */
    constructor() {
        super();

        this.parseType = NonTerminal.TOP_LEVEL;
        this.continuousIndentAfterNewline = true;
        this.mostRecentLineTokIndex = 0;
        this.lastLineForEndCodeBlockIndex = 0;
        this.indentationCount = 0;
        this.parsingBlockInitiated = false;
        this.prevTokenEndsWithBackslash = false;
        this.detectionType = CodeBlockType.SINGLE_LINE;
        this.detectionSymbol = Terminal.STATEMENTS_FILLER;
        this.bracesMatcher = new BracesMatcher([
            {opening: "{", closing: "}"},
            {opening: "[", closing: "]"},
            {opening: "(", closing: ")"}
        ]);
        this.encounteredComments = false;
        this.singleLineImmediatelyAfterComments = false;

        this.stringStream = "";
        this.tokenStream = [];
        this.prevMultiline = false;
        this.stopAcceptingStringStream = false;
        this.classOrFuncBodyParseStart = -1;
        this.globalDetectionStartIndex = -1;

        this.functDetectingBody = false;
        this.functColonIndex = -1;
        this.functRightAfterDef = false;
        this.functName = null;
        this.functRightAfterArrow = false;
        this.functType = null;

        this.functBodyHasOthers = false;
        this.functBodyHasPreviousContent = false;
        this.functBodyImmediatelyHasMLComments = null;

        this.functDeclStrBuffer = "";
        this.functDeclStartParseIdx = -1;
        this.functDeclParsing = false;

        // Initialize various states
        this.resetDetectionState(0, NonTerminal.TOP_LEVEL);
    }

    /**
     * Prepares the PythonParser before parsing starts.
     * Detects the indentation style used in the Python code,
     * and creates the expression matchers relevant to the indentation.
     */
    protected preparse(codeLines: string[], tokens: Token[]): void {
        /* Detect indentation */
        const spaceIndentCounts: number[] = [];
        let tabIndentCount = 0;

        for (const line of codeLines) {
            // Trim the line to check if it's not empty or only whitespace
            if (line.trim().length === 0) {
                continue; // Skip empty or whitespace-only lines
            }

            // Use regex to match leading whitespace
            const match = line.match(/^([ \t]+)/);
            if (match) {
                const indent = match[1];
                const hasSpaces = indent.includes(' ');
                const hasTabs = indent.includes('\t');

                if (hasSpaces && hasTabs) {
                    throw new CodeParsingError("Python code cannot have mixed spaces and tabs for indentation!");
                }

                if (hasSpaces) {
                    const spaceCount = indent.length;
                    spaceIndentCounts.push(spaceCount);
                } else if (hasTabs) {
                    tabIndentCount++;
                }
            }
        }

        // Check for mixed indentation
        if (spaceIndentCounts.length > 0 && tabIndentCount > 0) {
            throw new CodeParsingError("Python code cannot have mixed spaces and tabs for indentation!");
        }

        // Check if there are any indented lines
        if (spaceIndentCounts.length === 0 && tabIndentCount === 0) {
            this.pythonIsTabs = false;
            this.pythonCodeIndents = ""; // No indented lines, its possible for really small running scripts
        }

        if (tabIndentCount > 0) {
            this.pythonIsTabs = true;
            this.pythonCodeIndents = "\t";
            return;
        }

        // Define the possible indentation factors to test, starting from the largest
        const possibleFactors = [12, 6, 4, 3, 2];

        // Initialize indentStep as undefined; it will be set once a suitable factor is found
        let indentStep: number | undefined;

        // Iterate through each possible factor to find a suitable indent step
        for (const factor of possibleFactors) {
            // Skip if the factor is zero to avoid division by zero
            if (factor === 0) continue;

            // Count how many indentation counts are not multiples of the current factor
            const invalidCount = spaceIndentCounts.filter(count => count % factor !== 0).length;

            // Calculate the ratio of invalid indentation counts
            const invalidRatio = invalidCount / spaceIndentCounts.length;

            // Check if the invalid ratio is within the acceptable threshold (≤ 20%)
            if (invalidRatio <= 0.2) {
                indentStep = factor;
                break; // Exit the loop once a suitable factor is found
            }
        }

        // After testing all factors, ensure that an indent step was found
        if (indentStep === undefined) {
            throw new CodeParsingError("Unable to detect a consistent indentation step within the allowed threshold.");
        }

        this.pythonCodeIndents = " ".repeat(indentStep);
        this.pythonIsTabs = false;
    }

    /**
     * Returns whether comments for functions are placed before or after the function.
     * For Python, comments are typically placed after the function.
     */
    protected isCommentBeforeFunction(): boolean {
        return false;
    }

    /**
     * We use PythonTokenizer
     * @returns A new PythonTokenizer
     */
    protected preparseGetTokenizer(): AbstractTokenizer {
        return new PythonTokenizer();
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

    // manipulated by updateCodeBlocksBracesAndSpacingsState
    private continuousIndentAfterNewline: boolean;
    private mostRecentLineTokIndex: number;
    private indentationCount: number;    
    private prevTokenEndsWithBackslash: boolean;

    // manipulated by detectCodeBlocks
    private parsingBlockInitiated: boolean;
    private lastLineForEndCodeBlockIndex: number;
    private encounteredComments: boolean;
    private singleLineImmediatelyAfterComments: boolean;

    // manipulated by updateCodeBlocksContentsParseState. the variables with * means that its also resetted by detectCodeBlocks
    private detectionType: CodeBlockType; // *
    private detectionSymbol: NonTerminal | Terminal; // *

    protected resetDetectionState(startTokIndex: number, parsingNonTerminal: NonTerminal): void {
        this.globalDetectionStartIndex = startTokIndex;
        this.parseType = parsingNonTerminal;
        this.bracesMatcher.reset();

        if (parsingNonTerminal === NonTerminal.TOP_LEVEL) {
            this.continuousIndentAfterNewline = true; // at the top level, tokens in the start of the first line is a "continuous" after a new line
            this.mostRecentLineTokIndex = -1;
            this.indentationCount = 0;
            this.prevTokenEndsWithBackslash = false;

            this.parsingBlockInitiated = false;
            this.lastLineForEndCodeBlockIndex = -1;
            this.encounteredComments = false;
            this.singleLineImmediatelyAfterComments = false;

            this.detectionType = CodeBlockType.SINGLE_LINE;
            this.detectionSymbol = Terminal.STATEMENTS_FILLER;
        } else if (parsingNonTerminal === NonTerminal.CLASSES) {
            this.continuousIndentAfterNewline = false; // need to reset the trigger
            this.mostRecentLineTokIndex = -1;
            this.indentationCount = 0;
            this.prevTokenEndsWithBackslash = false;

            this.parsingBlockInitiated = false;
            this.lastLineForEndCodeBlockIndex = -1;
            this.encounteredComments = false;
            this.singleLineImmediatelyAfterComments = false;

            this.detectionType = CodeBlockType.SINGLE_LINE;
            this.detectionSymbol = Terminal.STATEMENTS_FILLER;
        } else if (parsingNonTerminal === NonTerminal.FUNCTIONS) {
            this.functDetectingBody = false;
            this.functColonIndex = -1;
            this.functRightAfterDef = false;
            this.functName = null;
            this.functRightAfterArrow = false;
            this.functType = null;
        } else if (parsingNonTerminal === NonTerminal.FUNCTION_BODY) {
            this.continuousIndentAfterNewline = false;
            this.mostRecentLineTokIndex = -1;
            this.indentationCount = 0;
            this.prevTokenEndsWithBackslash = false;

            this.functBodyHasOthers = false;
            this.functBodyHasPreviousContent = false;
            this.functBodyImmediatelyHasMLComments = null;
        } else if (parsingNonTerminal === NonTerminal.FUNCTION_DECLARATION) {
            this.continuousIndentAfterNewline = false;
            this.mostRecentLineTokIndex = -1;
            this.indentationCount = 0;
            this.prevTokenEndsWithBackslash = false;

            this.functDeclStrBuffer = "";
            this.functDeclStartParseIdx = -1;
            this.functDeclParsing = false;
        }
    }

    protected detectTopLevelSymbol(state: (Terminal | NonTerminal)[], token: Token | null, currentTokIndex: number, depth: number): SymbolAdditionDirective | null {
        return this.detectCodeBlocks(token, depth, currentTokIndex);
    }

    protected detectClassesSymbol(state: (Terminal | NonTerminal)[], token: Token | null, currentTokIndex: number, depth: number): SymbolAdditionDirective | null {
        return this.detectCodeBlocks(token, depth, currentTokIndex);
    }

    private functDetectingBody: boolean;
    private functColonIndex: number;
    private functRightAfterDef: boolean;
    private functName: string | null;
    private functRightAfterArrow: boolean;
    private functType: string | null;
    protected detectFunctionsSymbol(state: (Terminal | NonTerminal)[], token: Token | null, currentTokIndex: number, depth: number): SymbolAdditionDirective | null {
        // simply detect left to right, and then look at a colon
        if (this.functDetectingBody) {
            // we add all until the end. function body itself doesn't have a node class, so there is no need for node creation info
            // the parse range will simply be the full range after the colon
            if (token === null)
                return {symbol: { symbolType: NonTerminal.FUNCTION_BODY }};
        } else {
            if (token === null) {
                throw new CodeParsingError("Expected function to be separated by a colon!");
            }

            if (this.bracesMatcher.currentDepth() === 0 && token.stringContents.indexOf(":") !== -1) {
                // parse range simply does not include the start
                this.functColonIndex = currentTokIndex;
                this.functDetectingBody = true;

                if (this.functName === null) {
                    throw new CodeParsingError("Invalid syntax! Missing function name between def and colon!");
                }
                if (this.functType !== null) {
                    this.functType = this.functType.trim();
                }

                // sub parse range does not include the colon. function type can be null since its optional
                return {symbol: {
                    symbolType: NonTerminal.FUNCTION_DECLARATION,
                    parseRange: {startTok: this.globalDetectionStartIndex, endTok: this.functColonIndex},
                    nodeCreationInformation: {functionName: this.functName.trim(), functionReturnType: this.functType}
                }};
            }
            if (this.functRightAfterDef && token.tokenType === TokenType.OTHERS) { // first token must be def, second is funct name
                this.functRightAfterDef = false;
                this.functName = token!.stringContents;
            } else if (this.functRightAfterDef && token.tokenType !== TokenType.SPACINGS) {
                this.functRightAfterDef = false;
            } else if (currentTokIndex === this.globalDetectionStartIndex) { // must be def
                this.functRightAfterDef = true;
            }
            if (this.functRightAfterArrow && token.tokenType === TokenType.OTHERS) { // right after the arrow ->
                this.functRightAfterArrow = false;
                this.functType = token.stringContents;
            } else if (this.functRightAfterArrow && token.tokenType !== TokenType.SPACINGS) {
                this.functRightAfterArrow = false;
            } else if (token.stringContents === "->" && this.bracesMatcher.currentDepth() === 0) {
                this.functRightAfterArrow = true;
            }

            if (token.tokenType === TokenType.BRACES) {
                try {
                    this.bracesMatcher.next(token.stringContents);
                } catch (e: any) {
                    if (e instanceof Error) {
                        throw new CodeParsingError("Error during brace matching! " + e.message);
                    }
                    throw e;
                }
            }
        }
        return null;
    }

    private functBodyHasOthers: boolean;
    private functBodyHasPreviousContent: boolean;
    private functBodyImmediatelyHasMLComments: string | null;
    protected detectFunctionBodySymbol(state: (Terminal | NonTerminal)[], token: Token | null, currentTokIndex: number, depth: number): SymbolAdditionDirective | null {
        // simply parse the comments and multiline comments, without caring about the indentation
        if (token === null) {
            if (this.functBodyImmediatelyHasMLComments !== null) {
                if (this.functBodyHasPreviousContent) {
                    return {
                        symbol: {symbolType: this.functBodyHasOthers ? Terminal.STATEMENTS_FILLER: Terminal.FILLER},
                        secondSymbol: {symbolType: Terminal.COMMENT_MULTILINE, nodeCreationInformation: {commentContents: this.functBodyImmediatelyHasMLComments}},
                        secondSymbolLen: 1
                    };
                } else {
                    return {
                        symbol: {symbolType: Terminal.COMMENT_MULTILINE, nodeCreationInformation: {commentContents: this.functBodyImmediatelyHasMLComments}}
                    };
                }
            } else {
                if (this.functBodyHasPreviousContent) {
                    return {symbol: {symbolType: this.functBodyHasOthers ? Terminal.STATEMENTS_FILLER: Terminal.FILLER}};
                }
            }
            return null;
        }

        let retDirective: SymbolAdditionDirective | null = null;
        if (token.tokenType === TokenType.SINGLELINE_COMMENTS) {
            if (this.functBodyHasPreviousContent) {
                retDirective = {
                    symbol: {symbolType: this.functBodyHasOthers ? Terminal.STATEMENTS_FILLER: Terminal.FILLER},
                    secondSymbol: {symbolType: Terminal.COMMENT_SINGLELINE, nodeCreationInformation: {commentContents: token.stringContents.substring(1, token.stringContents.length)}}
                }
            } else {
                retDirective = {symbol: {symbolType: Terminal.COMMENT_SINGLELINE, nodeCreationInformation: {commentContents: token.stringContents.substring(1, token.stringContents.length)}}};
            }

            // reset
            this.functBodyHasOthers = false;
            this.functBodyHasPreviousContent = false;
        } else if (token.tokenType === TokenType.MULTILINE_COMMENTS_OR_STRINGS && this.continuousIndentAfterNewline) {
            this.functBodyImmediatelyHasMLComments = token.stringContents.substring(3, token.stringContents.length - 3);
        } else if ((this.functBodyImmediatelyHasMLComments !== null) && token.stringContents === "\n") {
            if (this.functBodyHasPreviousContent) {
                retDirective = {
                    symbol: {symbolType: this.functBodyHasOthers ? Terminal.STATEMENTS_FILLER: Terminal.FILLER},
                    secondSymbol: {symbolType: Terminal.COMMENT_MULTILINE, nodeCreationInformation: {commentContents: this.functBodyImmediatelyHasMLComments}},
                    secondSymbolLen: 1,
                    firstTwoSymbolsEndBufferLen: 1
                }
            } else {
                retDirective = {
                    symbol: {symbolType: Terminal.COMMENT_MULTILINE, nodeCreationInformation: {commentContents: this.functBodyImmediatelyHasMLComments}},
                    secondSymbolLen: 1
                };
            }

             // reset
             this.functBodyHasOthers = false;
             this.functBodyHasPreviousContent = false;
             this.functBodyImmediatelyHasMLComments = null;
        } else {
            this.functBodyHasPreviousContent = true;
            this.functBodyImmediatelyHasMLComments = null;
            if (token.tokenType !== TokenType.SPACINGS) {
                this.functBodyHasOthers = true;
            }
        }

        this.updateCodeBlocksBracesAndSpacingsState(token, currentTokIndex);
        return retDirective;
    }


    private functDeclStrBuffer: string;
    private functDeclStartParseIdx: number;
    private functDeclParsing: boolean;
    protected detectFunctionDeclarationSymbol(state: (Terminal | NonTerminal)[], token: Token | null, currentTokIndex: number, depth: number): SymbolAdditionDirective | null {
        // simply separate by commas
        if (token === null) {
            return {symbol: {symbolType: Terminal.FILLER}};
        }

        let retDirective: SymbolAdditionDirective | null = null;
        if (this.functDeclParsing) {
            if (token.tokenType !== TokenType.COMMAS) {
                // when === 1 and === ")", this means the function declaration is closing. don't add that.
                if (this.bracesMatcher.currentDepth() > 1 || token.stringContents !== ")") {
                    this.functDeclStrBuffer += token.stringContents;
                }
            } else if (this.bracesMatcher.currentDepth() > 1) {
                this.functDeclStrBuffer += token.stringContents; // comma inside braces, we still add
            } else if (this.bracesMatcher.currentDepth() === 1) {
                let argument: string = this.trimReplaceString(this.functDeclStrBuffer);
                if (argument.length === 0) {
                    this.functDeclStrBuffer = "";
                } else {
                    // conclude, since comma reached, with something
                    let idx: number = argument.indexOf("=");
                    if (idx !== -1) {
                        argument = argument.substring(0, idx).trim();
                    }
                    idx = argument.indexOf(":");
                    let argumentName: string;
                    let argumentType: string | null = null;
                    if (idx > 0 && idx < argument.length - 1) {
                        argumentName = argument.substring(0, idx).trim();
                        argumentType = argument.substring(idx + 1, argument.length).trim();
                    } else {
                        argumentName = argument;
                    }

                    retDirective = {
                        symbol: {symbolType: Terminal.FILLER},
                        secondSymbol: {symbolType: Terminal.ARGUMENT, nodeCreationInformation: {argumentName: argumentName, argumentType: argumentType}},
                        secondSymbolLen: currentTokIndex - this.functDeclStartParseIdx - 1,
                        firstTwoSymbolsEndBufferLen: 1
                    };
                    this.functDeclStartParseIdx = currentTokIndex;
                    this.functDeclStrBuffer = "";
                }
            }
        }
        this.updateCodeBlocksBracesAndSpacingsState(token, currentTokIndex);
        if (this.functDeclParsing && this.bracesMatcher.currentDepth() === 0) {
            this.functDeclParsing = false;

            // conclude, since bracket ended
            let argument: string = this.trimReplaceString(this.functDeclStrBuffer);
            if (argument.length === 0) {
                this.functDeclStrBuffer = "";
            } else {
                // conclude, since close brackets reached, with something
                let idx: number = argument.indexOf("=");
                if (idx !== -1) {
                    argument = argument.substring(0, idx).trim();
                }
                idx = argument.indexOf(":");
                let argumentName: string;
                let argumentType: string | null = null;
                if (idx > 0 && idx < argument.length - 1) {
                    argumentName = argument.substring(0, idx).trim();
                    argumentType = argument.substring(idx + 1, argument.length).trim();
                } else {
                    argumentName = argument;
                }

                retDirective = {
                    symbol: {symbolType: Terminal.FILLER},
                    secondSymbol: {symbolType: Terminal.ARGUMENT, nodeCreationInformation: {argumentName: argumentName, argumentType: argumentType}},
                    secondSymbolLen: currentTokIndex - this.functDeclStartParseIdx - 1,
                    firstTwoSymbolsEndBufferLen: 1
                };
                this.functDeclStartParseIdx = currentTokIndex;
                this.functDeclStrBuffer = "";
            }
        } else if (this.bracesMatcher.currentDepth() > 0 && this.functDeclStartParseIdx === -1) {
            this.functDeclStartParseIdx = currentTokIndex;
            this.functDeclParsing = true;
        }

        return retDirective;
    }

    private detectCodeBlocks(token: Token | null, depth: number, currentTokIndex: number): SymbolAdditionDirective | null {
        if (token === null) {
            // try to conclude the tokens
            if (this.parsingBlockInitiated) {
                // try to conclude. note that all single lines are concluded since a "\n" will be added at the end. so this must be multiline, and the end tok is lastLineForEndCodeBlockIndex
                const symbol = this.concludeCodeBlock(currentTokIndex);
                const length: number = currentTokIndex - this.lastLineForEndCodeBlockIndex;
                if (symbol.symbolType === Terminal.FILLER || symbol.symbolType === Terminal.STATEMENTS_FILLER ||
                    length === 0
                ) {
                    return {symbol: symbol};
                } else {
                    return {symbol: symbol,
                        secondSymbol: {symbolType: Terminal.FILLER},
                        secondSymbolLen: length
                    };
                }
            } else {
                if (this.mostRecentLineTokIndex !== -1 || this.indentationCount > 0) {
                    // conclude the filler symbol, but do not include the current token into the filler (has 1 element)
                    return {symbol: {symbolType: Terminal.FILLER}};
                }
            }
            return null;
        }

        const indentationExpected: number = depth * (this.pythonIsTabs ? 1 : this.pythonCodeIndents.length);
        let retDirective: SymbolAdditionDirective | null = null;
        if (this.parsingBlockInitiated) {
            let hasConclusion: boolean = false;

            // try to await for the stopping signal
            if (this.detectionType === CodeBlockType.SINGLE_LINE) {
                if (token.stringContents === "\n" && this.bracesMatcher.currentDepth() === 0 && !this.prevTokenEndsWithBackslash) {
                    // stop single line when we meet a newline not enclosed in braces
                    this.parsingBlockInitiated = false;

                    // if its immediately after a comment (due to being statements filler), there are no contents (tokens) in the buffer (except the current "\n").
                    if (!this.singleLineImmediatelyAfterComments) { // so we need to check
                        // the symbol info will be the first symbol, while the "second" one (starting with the "\n" token) is not concluded yet
                        const symbolInfo: SymbolInfo = this.concludeCodeBlock(-1);
                        retDirective = {
                            symbol: symbolInfo,
                            secondSymbolLen: 1
                        };
                    }

                    // mark that conclusion has been done
                    hasConclusion = true;
                }

                this.singleLineImmediatelyAfterComments = false; // flag false. if its statements filler and we have to handle it, it will be handled below
            } else { // multi line
                if (this.bracesMatcher.currentDepth() === 0) { // not in any braces

                    // check whether we arrive at a new code block (closed the indentation)
                    if (this.continuousIndentAfterNewline && token.tokenType !== TokenType.SPACINGS &&
                            this.indentationCount <= indentationExpected && token.tokenType !== TokenType.SINGLELINE_COMMENTS) {
                        // stop multiline if we encounter a new line that is not enclosed in braces, and the indentation goes back to the "main expected" indentation, and its not a single line comment

                        // there are two symbols, and a single (the most recent) token that remains in the buffer. the first symbol is the multi line code block, while the second is the filler between the two symbols
                        const symbolInfo: SymbolInfo = this.concludeCodeBlock(-1);
                        retDirective = {
                            symbol: symbolInfo,
                            secondSymbol: {symbolType: Terminal.FILLER},
                            secondSymbolLen: currentTokIndex - this.lastLineForEndCodeBlockIndex,
                            firstTwoSymbolsEndBufferLen: 1
                        };

                        // reset new parsing, and by default single line
                        this.parsingBlockInitiated = true;
                        this.detectionType = CodeBlockType.SINGLE_LINE;
                        this.detectionSymbol = Terminal.STATEMENTS_FILLER;
                        this.encounteredComments = false;
                        this.singleLineImmediatelyAfterComments = false;

                        // update the parse state to reset and detect the new code block
                        this.updateCodeBlocksContentsParseState(token, true, currentTokIndex, indentationExpected);

                        // mark that conclusion has been done
                        hasConclusion = true;
                    } else if (token.stringContents === "\n" && !this.prevTokenEndsWithBackslash && !this.continuousIndentAfterNewline) { // check whether we arrived at potential end of multiline block
                        // checks that the line ends, and the line is non-empty
                        this.lastLineForEndCodeBlockIndex = currentTokIndex;
                    }
                }
            }

            if (token.tokenType === TokenType.SINGLELINE_COMMENTS && this.detectionSymbol === Terminal.STATEMENTS_FILLER) {
                // if we encounter a singleline comment, and its wrapped around (previously) with statements fillers, then we add it

                // conclude the statements filler previous symbol, along with the current singleline comment symbol with one token
                retDirective = {
                    symbol: {symbolType: Terminal.STATEMENTS_FILLER},
                    secondSymbol: {symbolType: Terminal.COMMENT_SINGLELINE, nodeCreationInformation: {commentContents: token.stringContents.substring(1, token.stringContents.length)}}
                };

                // lock the state to only allow fillers and statements fillers subsequently, until the code block is completed
                this.encounteredComments = true;
                this.singleLineImmediatelyAfterComments = true; // there will be a \n immediately afterwards. handle in this.detectionType === CodeBlockType.SINGLE_LINE
            } else if (!(this.encounteredComments || hasConclusion)) {
                // continue resolving the states as normal only if no comments have been encountered and no conclusions have been made
                this.updateCodeBlocksContentsParseState(token, false, currentTokIndex, indentationExpected);
            }
        } else {
            // try to await for the initiation signal
            if (this.continuousIndentAfterNewline && token.tokenType !== TokenType.SPACINGS) {
                if (token.tokenType === TokenType.SINGLELINE_COMMENTS) {
                    // second symbol has length 1 in tokens. see if there are filler tokens previously
                    if (this.mostRecentLineTokIndex !== -1 || this.indentationCount > 0) {
                        // conclude both the filler and the contents
                        retDirective = {
                            symbol: {symbolType: Terminal.FILLER},
                            secondSymbol: {symbolType: Terminal.COMMENT_SINGLELINE, nodeCreationInformation: {commentContents: token.stringContents.substring(1, token.stringContents.length)}}
                        };
                    } else {
                        // conclude only the single symbol comments
                        retDirective = {
                            symbol: {symbolType: Terminal.COMMENT_SINGLELINE, nodeCreationInformation: {commentContents: token.stringContents.substring(1, token.stringContents.length)}}
                        };
                    }
                } else {
                    this.parsingBlockInitiated = true;
                    this.detectionType = CodeBlockType.SINGLE_LINE;
                    this.detectionSymbol = Terminal.STATEMENTS_FILLER;
                    this.encounteredComments = false;
                    this.singleLineImmediatelyAfterComments = false;

                    if (this.mostRecentLineTokIndex !== -1 || this.indentationCount > 0) {
                        // conclude the filler symbol, but do not include the current token into the filler (has 1 element)
                        retDirective = {
                            symbol: {symbolType: Terminal.FILLER},
                            secondSymbolLen: 1
                        };
                    } // else we don't have to conclude anything, and this is the start of parsing of a new token
                    this.updateCodeBlocksContentsParseState(token, true, currentTokIndex, indentationExpected);
                }
            }
        }

        // update the state(s) of braces and spacings, with the current newly added token
        this.updateCodeBlocksBracesAndSpacingsState(token, currentTokIndex);
        return retDirective;
    }

    private tokenStream: Token[];
    private stringStream: string;
    private stopAcceptingStringStream: boolean;
    private prevMultiline: boolean;
    private classOrFuncBodyParseStart: number;
    private updateCodeBlocksContentsParseState(token: Token, needsReset: boolean, currentTokIndex: number, indentationExpected: number) {
        if (needsReset) {
            this.tokenStream = [];
            this.stringStream = "";
            this.prevMultiline = false;
            this.stopAcceptingStringStream = false;
            this.classOrFuncBodyParseStart = -1;
        }

        if (this.parseType === NonTerminal.TOP_LEVEL) {
            // only have imports, multiline comments, functions and classes
            if (this.stringStream.length === 0) {
                if (indentationExpected === this.indentationCount) { // check indentation correct level
                    if (token.stringContents === "from" || token.stringContents === "import" || token.stringContents === "from\\" || token.stringContents === "import\\") {
                        this.detectionSymbol = Terminal.REFERENCES;
                    } else if (token.stringContents === "def" || token.stringContents === "def\\") {
                        this.detectionType = CodeBlockType.MULTI_LINE;
                        this.detectionSymbol = NonTerminal.FUNCTIONS;
                    } else if (token.stringContents === "class" || token.stringContents === "class\\") {
                        this.detectionType = CodeBlockType.MULTI_LINE;
                        this.detectionSymbol = NonTerminal.CLASSES;
                    } else if (token.tokenType === TokenType.MULTILINE_COMMENTS_OR_STRINGS) {
                        this.detectionSymbol = Terminal.COMMENT_MULTILINE;
                    }
                }
            } else {
                if (this.detectionSymbol === Terminal.COMMENT_MULTILINE && token.tokenType !== TokenType.SPACINGS) {
                    // there is something after the multiline, which is not expected. we therefore demote it
                    this.detectionSymbol = Terminal.STATEMENTS_FILLER;
                }

                if (this.detectionSymbol === NonTerminal.FUNCTIONS) {
                    // stop recording the string stream when we've reached the colon, and only look at the first
                    if (!this.stopAcceptingStringStream && this.bracesMatcher.currentDepth() === 0 && token.stringContents.indexOf(":") !== -1) {
                        this.stopAcceptingStringStream = true;
                        this.classOrFuncBodyParseStart = currentTokIndex + 1;
                    }
                }

                if (this.detectionSymbol === NonTerminal.CLASSES) {
                    // similar, but also be aware of the class body
                    if (!this.stopAcceptingStringStream && this.bracesMatcher.currentDepth() === 0 && token.stringContents.indexOf(":") !== -1) {
                        this.stopAcceptingStringStream = true;
                        this.classOrFuncBodyParseStart = currentTokIndex + 1; // start parsing from the next token inclusive
                    }
                }
            }

            // add things to the token stream and string stream
            if (token.tokenType !== TokenType.SPACINGS) {
                this.tokenStream.push(token);
            }
            if (!this.stopAcceptingStringStream)
                this.stringStream += token.stringContents;
        } else if (this.parseType === NonTerminal.CLASSES) {
            // only have multiline comments, functions and attributes
            if (this.stringStream.length === 0) {
                if (indentationExpected === this.indentationCount) { // check indentation correct level
                    if (token.stringContents === "def" || token.stringContents === "def\\") {
                        this.detectionType = CodeBlockType.MULTI_LINE;
                        this.detectionSymbol = NonTerminal.FUNCTIONS;
                    } else if (token.tokenType === TokenType.MULTILINE_COMMENTS_OR_STRINGS) {
                        this.detectionSymbol = Terminal.COMMENT_MULTILINE;
                        this.prevMultiline = true;
                    }
                }
            } else {
                if (this.detectionSymbol === Terminal.COMMENT_MULTILINE && token.tokenType !== TokenType.SPACINGS) {
                    // there is something after the multiline, which is not expected. we therefore demote it
                    this.detectionSymbol = Terminal.STATEMENTS_FILLER;
                }

                if (this.detectionSymbol === NonTerminal.FUNCTIONS) {
                    // stop recording the string stream when we've reached the colon
                    if (!this.stopAcceptingStringStream && this.bracesMatcher.currentDepth() === 0 && token.stringContents.indexOf(":") !== -1) {
                        this.stopAcceptingStringStream = true;
                        this.classOrFuncBodyParseStart = currentTokIndex + 1;
                    }
                }
            }

            // upgrade to attributes if previously there weren't a multiline string, and its a filler, and there is a colon in the middle
            if ((!this.prevMultiline) && this.detectionSymbol === Terminal.STATEMENTS_FILLER && this.bracesMatcher.currentDepth() === 0 &&
                indentationExpected === this.indentationCount &&
                ((this.stringStream.length > 0 && token.stringContents.lastIndexOf(":") !== -1) || token.stringContents.lastIndexOf(":") > 0)) {
                this.detectionSymbol = Terminal.ATTRIBUTES;
            }

            // add things to the token stream and string stream
            if (token.tokenType !== TokenType.SPACINGS) {
                this.tokenStream.push(token);
            }
            if (!this.stopAcceptingStringStream)
                this.stringStream += token.stringContents;
        } else {
            throw Error("Not supported!");
        }
    }

    private concludeCodeBlock(reachedGlobalEndIndex: number): SymbolInfo {
        if (reachedGlobalEndIndex !== -1) {
            /* note that this is called only if its multiline or not top level,
             * since top level single lines must be concluded, due to the extra \n
             * at the end of the code string (a \n is always appended at the end).
            */
            if (!this.prevTokenEndsWithBackslash && !this.continuousIndentAfterNewline) {
                // update the end only if there is something in the line
                this.lastLineForEndCodeBlockIndex = reachedGlobalEndIndex;
            }
        }

        if (this.parseType === NonTerminal.TOP_LEVEL) {
            if (this.detectionSymbol === Terminal.STATEMENTS_FILLER) {
                return {symbolType: Terminal.STATEMENTS_FILLER};
            } else if (this.detectionSymbol === Terminal.REFERENCES) {
                const referenceText: string = this.trimReplaceString(this.stringStream);
                let referenceRelativePath: string | null = null;
                if (this.tokenStream.length >= 4 && (this.tokenStream[0].stringContents === "from" || this.tokenStream[0].stringContents === "from\\")
                    && (this.tokenStream[2].stringContents === "import" || this.tokenStream[2].stringContents === "import\\")) {
                    // try to resolve the import
                    const importContents: string = this.tokenStream[1].stringContents;
                    if (importContents.length > 0) {
                        if (importContents.charAt(0) === ".") {
                            // relative import (local file)
                            const lcPath = importContents.substring(1, importContents.length);
                            if (lcPath.length === 0) {
                                referenceRelativePath = "local-file://";
                            } else {
                                let count: number = 0;
                                for (let i = 0; i < lcPath.length; i++) {
                                    if (lcPath.charAt(i) === ".") {
                                        count++;
                                    } else {
                                        break;
                                    }
                                }
                                referenceRelativePath = "local-file://" + "../".repeat(count) + lcPath.substring(count, lcPath.length).replace(/\./g, "/");
                            }
                        } else {
                            // environment import
                            referenceRelativePath = "environment://" + importContents.replace(/\./g, "/");
                        }
                    }
                } else if (this.tokenStream.length >= 2 && (this.tokenStream[0].stringContents === "import" || this.tokenStream[0].stringContents === "import\\")) {
                    // try to resolve the import
                    const importContents: string = this.tokenStream[1].stringContents;
                    if (importContents.length > 0) {
                        referenceRelativePath = "environment://" + importContents.replace(/\./g, "/");
                    }
                }
                return {symbolType: Terminal.REFERENCES, nodeCreationInformation: {
                    referenceText: referenceText,
                    refRelativePath: referenceRelativePath
                }};
            } else if (this.detectionSymbol === Terminal.COMMENT_MULTILINE) {
                // multiline comments can only have spaces before the "\n", and the space
                const trimmed: string = this.trimReplaceString(this.stringStream);
                return {symbolType: Terminal.COMMENT_MULTILINE, nodeCreationInformation: {
                    commentContents: trimmed.substring(3, trimmed.length - 3)
                }};
            } else if (this.detectionSymbol === NonTerminal.FUNCTIONS) {
                if (!this.stopAcceptingStringStream) {
                    // didn't detect the colon, we therefore need to reject it
                    return {symbolType: Terminal.STATEMENTS_FILLER};
                }

                // use the same parse range as the range of the functions
                const functionDefnText: string = this.trimReplaceString(this.stringStream);
                return {symbolType: NonTerminal.FUNCTIONS, nodeCreationInformation: {
                    functionDefinitionText: functionDefnText,
                    funcInnerRange: this.getRange(this.getTokenChRange(this.classOrFuncBodyParseStart).start, this.getTokenChRange(this.lastLineForEndCodeBlockIndex).start)
                }};
            } else if (this.detectionSymbol === NonTerminal.CLASSES) {
                // a different parse range, and also extract the defn text.
                if (this.classOrFuncBodyParseStart === -1 || this.classOrFuncBodyParseStart >= this.lastLineForEndCodeBlockIndex) {
                    // didn't detect the colon. we therefore need to reject it
                    return {symbolType: Terminal.STATEMENTS_FILLER};
                }
                const classDefnText: string = this.trimReplaceString(this.stringStream);
                return {symbolType: NonTerminal.CLASSES, parseRange: {startTok: this.classOrFuncBodyParseStart, endTok: this.lastLineForEndCodeBlockIndex}, nodeCreationInformation: {
                    classType: null, classDefinitionText: classDefnText,
                    classInnerRange: this.getRange(this.getTokenChRange(this.classOrFuncBodyParseStart).start, this.getTokenChRange(this.lastLineForEndCodeBlockIndex).start)
                }};
            } else {
                throw Error("Not supported!");
            }
        } else if (this.parseType === NonTerminal.CLASSES) {
            if (this.detectionSymbol === Terminal.STATEMENTS_FILLER) {
                return {symbolType: Terminal.STATEMENTS_FILLER};
            } else if (this.detectionSymbol === Terminal.ATTRIBUTES) {
                // simply split by the first :
                const trimmed: string = this.trimReplaceString(this.stringStream);
                const idx = trimmed.indexOf(":");
                let attributeName: string;
                let attributeType: string | null;
                if (idx === -1) {
                    attributeName = trimmed;
                    attributeType = null;
                } else {
                    attributeName = trimmed.substring(0, idx).trim();
                    if (idx === trimmed.length - 1) {
                        attributeType = "";
                    } else {
                        attributeType = trimmed.substring(idx + 1, trimmed.length).trim();
                    }
                }
                return {symbolType: Terminal.ATTRIBUTES, nodeCreationInformation: {
                    attributeName: attributeName,
                    attributeType: attributeType
                }};
            } else if (this.detectionSymbol === Terminal.COMMENT_MULTILINE) {
                // multiline comments can only have spaces before the "\n", and the space
                const trimmed: string = this.trimReplaceString(this.stringStream);
                return {symbolType: Terminal.COMMENT_MULTILINE, nodeCreationInformation: {
                    commentContents: trimmed.substring(3, trimmed.length - 3)
                }};
            } else if (this.detectionSymbol === NonTerminal.FUNCTIONS) {
                if (!this.stopAcceptingStringStream) {
                    // didn't detect the colon, we therefore need to reject it
                    return {symbolType: Terminal.STATEMENTS_FILLER};
                }
                // use the same parse range as the range of the functions
                const functionDefnText: string = this.trimReplaceString(this.stringStream);
                return {symbolType: NonTerminal.FUNCTIONS, nodeCreationInformation: {
                    functionDefinitionText: functionDefnText,
                    funcInnerRange: this.getRange(this.getTokenChRange(this.classOrFuncBodyParseStart).start, this.getTokenChRange(this.lastLineForEndCodeBlockIndex).start)
                }};
            } else {
                throw Error("Not supported!");
            }
        } else {
            throw Error("Not supported!");
        }
    }

    private trimReplaceString(str: string): string {
        return str.trim().replace(/\\\n/g, "");
    }

    private updateCodeBlocksBracesAndSpacingsState(token: Token, currentTokIndex: number) {
        if (token.tokenType === TokenType.SPACINGS) {
            // only handle the newlines and indentations if not in any braces
            if (this.bracesMatcher.currentDepth() === 0) {
                // ok, we got spacings. now handle it
                if (token.stringContents === "\n" && !this.prevTokenEndsWithBackslash) {
                    // we have new line. reset indentation
                    this.mostRecentLineTokIndex = currentTokIndex;
                    this.indentationCount = 0;
                    this.continuousIndentAfterNewline = true;
                } else if (this.continuousIndentAfterNewline) { // spaces and tabs
                    // add indentation if continuous after new line
                    this.indentationCount++;
                }
            }
            this.prevTokenEndsWithBackslash = false;
        } else if (token.tokenType === TokenType.BRACES) {
            try {
                this.bracesMatcher.next(token.stringContents);
            } catch (e: any) {
                if (e instanceof Error) {
                    throw new CodeParsingError("Error during brace matching! " + e.message);
                }
                throw e;
            }
            this.continuousIndentAfterNewline = false;
            this.prevTokenEndsWithBackslash = false;
        } else {
            this.continuousIndentAfterNewline = false;

            // handle continued lines correctly
            this.prevTokenEndsWithBackslash = false;
            if (token.stringContents.length > 0 && token.stringContents.charAt(token.stringContents.length - 1) === "\\") {
                this.prevTokenEndsWithBackslash = true;
            }
        }
    }
}
