import { AbstractSyntaxTree } from "./AbstractSyntaxTree";
import { Range, Index, getCharacter, getMaxRange, mergeRanges, CharacterRange } from "../utils";
import { Argument, Attributes, Classes, Comments, FunctionDeclaration, FunctionGroups, Functions, References, SyntaxNode, TopLevel } from "../nodes";
import { CodeParsingError } from "../CodeParsingError";
import { CodeParserImplError } from "../CodeParserImplError";
import { Token, TokenRange, NonTerminal, Terminal, isTerminal, SymbolAdditionDirective } from "./ParsingTypes";
import { AbstractTokenizer } from "./AbstractTokenizer";

/**
 * AbstractParser is an abstract class responsible for parsing source code
 * into an AbstractSyntaxTree. It contains the general parsing logic and
 * delegates language-specific parsing to abstract methods.
 */
export abstract class AbstractParser {
    private sourceLines: string[] = [];
    private positionMap: Index[] = [];
    private numChars: number = 0;
    private sourceTokens: Token[] = [];

    /**
     * Parses the given source code lines into an AbstractSyntaxTree.
     * @param codeLines Array of strings representing the source code split by lines.
     * @returns An AbstractSyntaxTree representing the parsed code.
     */
    parse(codeLines: string[]): AbstractSyntaxTree {
        // check empty
        if (codeLines.length === 0 || (codeLines.length === 1 && codeLines[0].length === 0)) {
            throw new CodeParsingError("Cannot parse empty string!");
        }

        // initialize
        this.sourceLines = codeLines;
        const tokenizer: AbstractTokenizer = this.preparseGetTokenizer();
        this.positionMap = [];
        codeLines.forEach((line: string, lineIndex: number) => { // a mapping from the indices of flattened string to the lines and characters.
            for (let character = 0; character <= line.length; character++) {
                this.positionMap.push({line: lineIndex, character: character});

                // call the tokenizer
                if (character < line.length) {
                    tokenizer.next(line.charAt(character));
                } else {
                    tokenizer.next("\n");
                }
            }
        });
        this.numChars = this.positionMap.length; // how many characters there are
        this.positionMap.push({line: codeLines.length, character: 0}); // last character (although resolves to nothing in getCharacter) for completeness, as we need it for closing.
        tokenizer.next(null); // indicate the end
        this.sourceTokens = tokenizer.getTokens();
        this.preparse(codeLines, this.sourceTokens); // initialize any necessary thing

        // prepare args
        const maxRange = getMaxRange(this.sourceLines);
        const rootNode = new TopLevel(maxRange);
        const ast = new AbstractSyntaxTree(rootNode, this.sourceLines);

        // parse now
        this.parseNonTerminal(NonTerminal.TOP_LEVEL, rootNode, {startTok: 0, endTok: this.sourceTokens.length}, 0);
        return ast;
    }

    /**
     * Gets the character range corresponding to the token at the token index.
     * @param tokIdx The index of the token in the tokenized source code.
     * @returns The character range
     */
    getTokenChRange(tokIdx: number): CharacterRange {
        return this.sourceTokens[tokIdx].characterRange;
    }

    /**
     * Converts the character index to the index.
     * @param chIndex The character index.
     * @returns The index.
     */
    getIndex(chIndex: number): Index {
        return this.positionMap[chIndex];
    }

    /**
     * Gets the range with ends start index and end index.
     * @param chStartIdx The character start index.
     * @param chEndIdx The character end index.
     */
    getRange(chStartIdx: number, chEndIdx: number): Range {
        const start = this.getIndex(chStartIdx);
        const end = this.getIndex(chEndIdx);
        return {
            start_line: start.line, start_character: start.character,
            end_line: end.line, end_character: end.character
        };
    }

    /**
     * Gets the substring inside the range starting from start index and ending in end index.
     * @param chStartIdx The character start index.
     * @param chEndIdx The character end index.
     */
    getSubstring(chStartIdx: number, chEndIdx: number): string {
        if (chStartIdx > chEndIdx) {
            throw Error("Invalid start end range!");
        }

        let str: string = "";
        for(let i = chStartIdx; i < chEndIdx; i++) {
            str += this.getCharacterFromIndex(i);
        }
        return str;
    }

    /**
     * Gets the character at the character index.
     * @param chIndex The character index.
     * @returns The character.
     */
    getCharacterFromIndex(chIndex: number): string {
        return getCharacter(this.sourceLines, this.getIndex(chIndex));
    }

    /**
     * Gets the string length of the code.
     * @returns The string length.
     */
    getCodeLength(): number {
        return this.numChars;
    }

    /**
     * Prepares the parser before parsing starts. Can be used to detect indentation, etc.
     * Must be implemented by subclasses.
     */
    protected abstract preparse(codeLines: string[], tokens: Token[]): void;

    /**
     * Gets the tokenizer for preparsing.
     * @returns The tokenizer used.
     */
    protected abstract preparseGetTokenizer(): AbstractTokenizer;

    /**
     * Parses a non-terminal symbol within the given range and attaches nodes to the parent.
     * @param nonTerminal The non-terminal symbol to parse.
     * @param parent The parent SyntaxNode to attach child nodes.
     * @param tokRange The range within which to parse.
     * @param depth The current depth of the parsing tree.
     * @throws CodeParsingError if there is an error during the code parsing and the API implementation has detected it.
     *         CodeParserImplError if there is an error during the code parsing which is caused by incorrect implementation of the abstract parser functions.
     *         Error if some other errors occur (probably problems or bugs in the WebASTParser library itself)
     */
    private parseNonTerminal(nonTerminal: NonTerminal, parent: SyntaxNode, tokRange: TokenRange, depth: number): void {
        let currentTokIndex: number = tokRange.startTok;
        let parsedEndTokIndex: number = tokRange.startTok; // How much tokens are parsed and accepted into some symbol. The parsed tokens are [startTok, parsedEndTokIndex). Initially no tokens are parsed.
        this.resetDetectionState(tokRange.startTok, nonTerminal); // Reset the detection state

        // things to keep track of when parsing the code
        const state: (Terminal | NonTerminal)[] = []; // The state the parsing (resolving) of the current non terminal. Used to match the production rules
        const ntParseRange: (TokenRange | null)[] = []; // Same length as state. Note that may be null if its non-terminal.
        const symbolRange: TokenRange[] = []; // Same length. Keeps track of the range (in terms of tokens) the symbol has
        const nodeCreationInformation: (Record<string, any> | undefined)[] = [];

        // Loop through the tokens and partition the tokens into contiguous chunks of symbols
        let tokenBuffer: Token[] = [];
        while (currentTokIndex < tokRange.endTok) {
            const token: Token = this.sourceTokens[currentTokIndex];
            tokenBuffer.push(token); // add to the buffer

            // update current token stream state
            ({parsedEndTokIndex, tokenBuffer} = this.updateTokenStreamState(depth, nonTerminal, tokenBuffer, parsedEndTokIndex, currentTokIndex, false, state, ntParseRange, symbolRange, nodeCreationInformation));
            
            // go to next token
            currentTokIndex++;
        }
        // conclude here
        ({parsedEndTokIndex, tokenBuffer} = this.updateTokenStreamState(depth, nonTerminal, tokenBuffer, parsedEndTokIndex, currentTokIndex, true, state, ntParseRange, symbolRange, nodeCreationInformation));

        // Now we check whether there are dangling non-parsed stuff
        if (parsedEndTokIndex !== tokRange.endTok) {
            throw new CodeParsingError("Invalid code syntax! Contains some non-parsed portions.");
        }

        // Validate the parsed symbols
        switch (nonTerminal) {
            case NonTerminal.TOP_LEVEL:
                this.validateParsingStateTopLevel(state);
                break;
            case NonTerminal.CLASSES:
                this.validateParsingStateClasses(state);
                break;
            case NonTerminal.FUNCTIONS:
                this.validateParsingStateFunctions(state);
                break;
            case NonTerminal.FUNCTION_BODY:
                this.validateParsingStateFunctionBody(state);
                break;
            case NonTerminal.FUNCTION_DECLARATION:
                this.validateParsingStateFunctionDeclaration(state);
                break;
            default:
                throw Error("Invalid non terminal! Should not have happened.");
        }

        // Create the nodes if necessary
        const childNodes: (SyntaxNode | null)[] = [];
        for (let i = 0; i < state.length; i++) {
            childNodes.push(this.resolveIntoNode(state[i], symbolRange[i], nodeCreationInformation[i]));
        }


        // Full parse. We add to the tree and recurse.
        if (nonTerminal === NonTerminal.FUNCTIONS){ // special functions case
            // parse function declaration, and then function body
            const results = this.getFirstLast(state);
            parent.addChild(childNodes[results.first]!);
            this.parseNonTerminal(NonTerminal.FUNCTION_DECLARATION, childNodes[results.first]!, ntParseRange[results.first]!, depth + 1);
            this.parseNonTerminal(NonTerminal.FUNCTION_BODY, parent, ntParseRange[results.last]!, depth + 1); // things in the function body will be added directly to the function itself
            // (expect possibly for the first multiline comment, which is added to the function group)
        } else { // the remaining possibly have multiple children or none
            const checkCommentFunctionPair: boolean = this.isCommentBeforeFunction() && (nonTerminal === NonTerminal.TOP_LEVEL || nonTerminal === NonTerminal.CLASSES);
            const checkFirstCommentInFunction: boolean = (!this.isCommentBeforeFunction()) && nonTerminal === NonTerminal.FUNCTION_BODY;
            let danglingMultilineComment: Comments | null = null;
            let isFirst: boolean = true;

            // Add the nodes to the parent
            for (let i = 0; i < state.length; i++) { // Allowed to be empty. Add the syntax nodes to the parent
                if (state[i] === Terminal.FILLER) {
                    continue; // omit filler (e.g whitespaces)
                }

                const ani = childNodes[i];
                if (state[i] === Terminal.STATEMENTS_FILLER) {
                    isFirst = false; // statements filler do affect whether the comment belongs to the function
                    if (nonTerminal === NonTerminal.FUNCTION_BODY && parent instanceof Functions) {
                        (parent as Functions).flagHaveFunctionBody(); // got some statements inside the function, flag it.
                    }
                    continue; // omit statements filler
                }
                
                if (ani instanceof SyntaxNode) {
                    if (nonTerminal === NonTerminal.FUNCTION_BODY && parent instanceof Functions) {
                        // try to check if something to be added, hence flagging the function body
                        if (!(ani instanceof Comments) || !checkFirstCommentInFunction || !ani.isMultiLine || !isFirst) {
                            // ok, the only exception is when the node to add is a multiline comment in the first statement
                            // after function declaration, and detection of first comments is enabled.
                            parent.flagHaveFunctionBody();
                        }
                    }

                    if (ani instanceof Comments) {
                        if (checkCommentFunctionPair && danglingMultilineComment !== null) {
                            // add previous dangling comment
                            parent.addChild(danglingMultilineComment);
                            danglingMultilineComment = null;
                        }

                        if (checkCommentFunctionPair && ani.isMultiLine) {
                            danglingMultilineComment = ani; // we await whether the next is function or not, so we don't immediately add
                        } else if (checkFirstCommentInFunction && ani.isMultiLine && isFirst) {
                            parent.getParent()!.addChild(ani); // when FUNCTION_BODY is being parsed, the parent is a Functions, and its parent is FunctionGroups. The comment belongs to the FunctionGroups.
                        } else {
                            parent.addChild(ani);
                        }
                    } else if (ani instanceof Functions) {
                        if (checkCommentFunctionPair && danglingMultilineComment !== null) {
                            // we have a previous multiline comment before the function.
                            const rangeUnion: Range = mergeRanges([danglingMultilineComment.getRange(), ani.getRange()]);
                            const funcGp: FunctionGroups = new FunctionGroups(rangeUnion); // function group's range is the smallest range containing union of both
                            funcGp.addChild(danglingMultilineComment);
                            funcGp.addChild(ani); // contains both
                            danglingMultilineComment = null; // invalidate
                            parent.addChild(funcGp);
                        } else {
                            // no dangling multiline comment, or is not the correct mode. we directly add
                            const funcGp: FunctionGroups = new FunctionGroups(ani.getRange());
                            funcGp.addChild(ani);
                            parent.addChild(funcGp);
                        }
                    } else {
                        if (checkCommentFunctionPair && danglingMultilineComment !== null) {
                            // add previous dangling comment
                            parent.addChild(danglingMultilineComment);
                            danglingMultilineComment = null;
                        }

                        // add regardless
                        parent.addChild(ani);
                    }
                    isFirst = false;
                }
            }

            // add the dangling comment if it still exists (outside for loop)
            if (danglingMultilineComment !== null) {
                parent.addChild(danglingMultilineComment);
            }

            // Recursion
            for (let i = 0; i < state.length; i++) {
                if (!isTerminal(state[i])) {
                    const symbol: NonTerminal = state[i] as NonTerminal;
                    const ani = childNodes[i];
                    const subnode: SyntaxNode = (ani instanceof SyntaxNode) ? ani: parent; // Directly add to parent if null
                    this.parseNonTerminal(symbol, subnode, ntParseRange[i]!, depth + 1);
                }
            }
        }
    }

    private updateTokenStreamState(depth: number, nonTerminal: NonTerminal, tokenBuffer: Token[], 
                                   parsedEndTokIndex: number, currentTokIndex: number, isConclusion: boolean,
                                   stateHistory: (Terminal | NonTerminal)[], ntParseRange: (TokenRange | null)[],
                                   symbolRange: TokenRange[], nodeCreationInformation: (Record<string, any> | undefined)[]): {parsedEndTokIndex: number, tokenBuffer: Token[]} {
        // detect symbol here
        const token: Token | null = isConclusion ? null : tokenBuffer[tokenBuffer.length - 1];
        let detectionResult: SymbolAdditionDirective | null;
        switch (nonTerminal) {
            case NonTerminal.TOP_LEVEL:
                detectionResult = this.detectTopLevelSymbol(stateHistory, token, currentTokIndex, depth);
                break;
            case NonTerminal.CLASSES:
                detectionResult = this.detectClassesSymbol(stateHistory, token, currentTokIndex, depth);
                break;
            case NonTerminal.FUNCTIONS:
                detectionResult = this.detectFunctionsSymbol(stateHistory, token, currentTokIndex, depth);
                break;
            case NonTerminal.FUNCTION_BODY:
                detectionResult = this.detectFunctionBodySymbol(stateHistory, token, currentTokIndex, depth);
                break;
            case NonTerminal.FUNCTION_DECLARATION:
                detectionResult = this.detectFunctionDeclarationSymbol(stateHistory, token, currentTokIndex, depth);
                break;
            default:
                throw Error("Invalid non terminal! Should not have happened.");
        }

        // now manage the result
        if (detectionResult === null) {
            return {parsedEndTokIndex, tokenBuffer}; // no symbols detected
        }

        // check return correctness
        if (detectionResult.symbol.symbolType === NonTerminal.TOP_LEVEL) {
            throw new CodeParserImplError("Cannot detect TOP_LEVEL since it must be the root!");
        }
        if (detectionResult.secondSymbol !== undefined && detectionResult.secondSymbol.symbolType === NonTerminal.TOP_LEVEL) {
            throw new CodeParserImplError("Cannot detect TOP_LEVEL since it must be the root!");
        }
        if (detectionResult.secondSymbol !== undefined && tokenBuffer.length < 2) {
            throw new CodeParserImplError("The token buffer must have at least length >= 2 to potentially split into two non-empty parts!");
        }
        if ((detectionResult.secondSymbolLen !== undefined) && (detectionResult.secondSymbolLen >= tokenBuffer.length)) {
            throw new CodeParserImplError("The length of the second symbol must be strictly less than the length of the token buffer to split into two non-empty parts!");
        }
        if ((detectionResult.secondSymbolLen !== undefined) && (detectionResult.secondSymbolLen < 1)) {
            throw new CodeParserImplError("The length of the second symbol must be >= 1 to split into two non-empty parts!");
        }
        if (detectionResult.firstTwoSymbolsEndBufferLen !== undefined) {
            if (detectionResult.secondSymbol === undefined || detectionResult.secondSymbolLen === undefined) {
                throw new CodeParserImplError("If it were the case that the remaning buffer length after the first two symbols is specified, it must be the case that the second symbol's information be fully given.");
            }
            if (detectionResult.firstTwoSymbolsEndBufferLen < 1) {
                throw new CodeParserImplError("The length of the remaining buffer has to be >= 1 to split into three non-empty parts!");
            }
            if (detectionResult.firstTwoSymbolsEndBufferLen + detectionResult.secondSymbolLen >= tokenBuffer.length) {
                throw new CodeParserImplError("The secondSymbolLen along with the firstTwoSymbolsEndBufferLen must be that the buffer splits into three non-empty parts, including the first symbol.");
            }
        }

        // manage the buffer now
        if (detectionResult.secondSymbol === undefined && detectionResult.secondSymbolLen === undefined) {
            // only have one symbol, and the only symbol isn't truncated
            stateHistory.push(detectionResult.symbol.symbolType);
            symbolRange.push({startTok: parsedEndTokIndex, endTok: parsedEndTokIndex + tokenBuffer.length});
            if (!isTerminal(detectionResult.symbol.symbolType) && detectionResult.symbol.parseRange === undefined) {
                detectionResult.symbol.parseRange = symbolRange[symbolRange.length - 1]; // set to be equal to the symbol range, if its non-terminal and not given
            }
            ntParseRange.push(detectionResult.symbol.parseRange === undefined ? null : detectionResult.symbol.parseRange);
            nodeCreationInformation.push(detectionResult.symbol.nodeCreationInformation);
            this.assertParseRangeCorrectness(stateHistory[stateHistory.length - 1], ntParseRange[ntParseRange.length - 1], symbolRange[symbolRange.length - 1]);

            // update the end and clear buffer
            parsedEndTokIndex += tokenBuffer.length;
            tokenBuffer = [];
        } else if (detectionResult.firstTwoSymbolsEndBufferLen !== undefined) {
            // two symbols, but we retain the buffer specified by firstTwoSymbolsEndBufferLen
            const firstSymbolStart = 0;
            const firstSecondSymbolSep = 0 + tokenBuffer.length - detectionResult.firstTwoSymbolsEndBufferLen - detectionResult.secondSymbolLen!;
            const secondSymbolEnd = 0 + tokenBuffer.length - detectionResult.firstTwoSymbolsEndBufferLen;
            const allEnd = tokenBuffer.length;

            // push the first symbol
            stateHistory.push(detectionResult.symbol.symbolType);
            symbolRange.push({startTok: parsedEndTokIndex + firstSymbolStart, endTok: parsedEndTokIndex + firstSecondSymbolSep});
            if (!isTerminal(detectionResult.symbol.symbolType) && detectionResult.symbol.parseRange === undefined) {
                detectionResult.symbol.parseRange = symbolRange[symbolRange.length - 1]; // set to be equal to the symbol range, if its non-terminal and not given
            }
            ntParseRange.push(detectionResult.symbol.parseRange === undefined ? null : detectionResult.symbol.parseRange);
            nodeCreationInformation.push(detectionResult.symbol.nodeCreationInformation);
            this.assertParseRangeCorrectness(stateHistory[stateHistory.length - 1], ntParseRange[ntParseRange.length - 1], symbolRange[symbolRange.length - 1]);

            // push the second symbol
            stateHistory.push(detectionResult.secondSymbol!.symbolType);
            symbolRange.push({startTok: parsedEndTokIndex + firstSecondSymbolSep, endTok: parsedEndTokIndex + secondSymbolEnd});
            if (!isTerminal(detectionResult.secondSymbol!.symbolType) && detectionResult.secondSymbol!.parseRange === undefined) {
                detectionResult.secondSymbol!.parseRange = symbolRange[symbolRange.length - 1]; // set to be equal to the symbol range, if its non-terminal and not given
            }
            ntParseRange.push(detectionResult.secondSymbol!.parseRange === undefined ? null : detectionResult.secondSymbol!.parseRange);
            nodeCreationInformation.push(detectionResult.secondSymbol!.nodeCreationInformation);
            this.assertParseRangeCorrectness(stateHistory[stateHistory.length - 1], ntParseRange[ntParseRange.length - 1], symbolRange[symbolRange.length - 1]);

            // update the end and truncate the buffer
            tokenBuffer = tokenBuffer.slice(secondSymbolEnd, allEnd);
            parsedEndTokIndex += secondSymbolEnd;
        } else {
            // two symbols, and the second symbol might be not finished. we further split into cases
            if (detectionResult.secondSymbolLen === undefined) {
                detectionResult.secondSymbolLen = 1;
            }

            stateHistory.push(detectionResult.symbol.symbolType);
            symbolRange.push({startTok: parsedEndTokIndex, endTok: parsedEndTokIndex + tokenBuffer.length - detectionResult.secondSymbolLen});
            if (!isTerminal(detectionResult.symbol.symbolType) && detectionResult.symbol.parseRange === undefined) {
                detectionResult.symbol.parseRange = symbolRange[symbolRange.length - 1]; // set to be equal to the symbol range, if its non-terminal and not given
            }
            ntParseRange.push(detectionResult.symbol.parseRange === undefined ? null : detectionResult.symbol.parseRange);
            nodeCreationInformation.push(detectionResult.symbol.nodeCreationInformation);
            this.assertParseRangeCorrectness(stateHistory[stateHistory.length - 1], ntParseRange[ntParseRange.length - 1], symbolRange[symbolRange.length - 1]);
            if (detectionResult.secondSymbol === undefined) {
                // only use the partial buffer, the rest is still up to parse
                parsedEndTokIndex += (tokenBuffer.length - detectionResult.secondSymbolLen);
                tokenBuffer = tokenBuffer.slice(tokenBuffer.length - detectionResult.secondSymbolLen, tokenBuffer.length);
            } else {
                // conclude two symbols
                stateHistory.push(detectionResult.secondSymbol.symbolType);
                symbolRange.push({startTok: parsedEndTokIndex + tokenBuffer.length - detectionResult.secondSymbolLen, endTok: parsedEndTokIndex + tokenBuffer.length});
                if (!isTerminal(detectionResult.secondSymbol.symbolType) && detectionResult.secondSymbol.parseRange === undefined) {
                    detectionResult.secondSymbol.parseRange = symbolRange[symbolRange.length - 1]; // set to be equal to the symbol range, if its non-terminal and not given
                }
                ntParseRange.push(detectionResult.secondSymbol.parseRange === undefined ? null : detectionResult.secondSymbol.parseRange);
                nodeCreationInformation.push(detectionResult.secondSymbol.nodeCreationInformation);
                this.assertParseRangeCorrectness(stateHistory[stateHistory.length - 1], ntParseRange[ntParseRange.length - 1], symbolRange[symbolRange.length - 1]);

                // update the end and clear buffer
                parsedEndTokIndex += tokenBuffer.length;
                tokenBuffer = [];
            }
        }

        return {parsedEndTokIndex, tokenBuffer};
    }

    private assertParseRangeCorrectness(symbolType: Terminal | NonTerminal, parseRange: TokenRange | null, symbolRange: TokenRange) {
        if (!isTerminal(symbolType)) {
            if (parseRange === null) {
                throw new CodeParserImplError("If detected type is not a terminal, must return parseRange non null to resolve further by recursion.");
            }
            if (!((symbolRange.startTok <= parseRange.startTok) && (parseRange.endTok <= symbolRange.endTok))) {
                throw new CodeParserImplError("The parse range of a non terminal must be contained inside the range used for detection.");
            }
        } else {
            if (parseRange !== null) {
                throw new CodeParserImplError("Terminal types does not have a parseRange since it doesn't have to be resolved.");
            }
        }
    }

    private resolveIntoNode(detectedType: Terminal | NonTerminal, detectedRange: TokenRange, nodeCreationInformation: Record<string, any> | undefined): SyntaxNode | null {
        const range: Range = this.getRange(this.sourceTokens[detectedRange.startTok].characterRange.start, this.sourceTokens[detectedRange.endTok - 1].characterRange.end);
        if (detectedType === Terminal.ARGUMENT) {
            return this.createArgumentNode(range, nodeCreationInformation);
        } else if (detectedType === Terminal.ATTRIBUTES) {
            return this.createAttributesNode(range, nodeCreationInformation);
        } else if (detectedType === Terminal.COMMENT_MULTILINE) {
            return this.createCommentsNode(range, true, nodeCreationInformation);
        } else if (detectedType === Terminal.COMMENT_SINGLELINE) {
            return this.createCommentsNode(range, false, nodeCreationInformation);
        } else if (detectedType === Terminal.REFERENCES) {
            return this.createReferencesNode(range, nodeCreationInformation);
        } else if (detectedType === Terminal.FILLER) {
            return null;
        } else if (detectedType === Terminal.STATEMENTS_FILLER) {
            return null;
        } else if (detectedType === NonTerminal.CLASSES) {
            return this.createClassesNode(range, nodeCreationInformation);
        } else if (detectedType === NonTerminal.FUNCTIONS) {
            return this.createFunctionsNode(range, nodeCreationInformation);
        } else if (detectedType === NonTerminal.FUNCTION_BODY) {
            return null;
        } else if (detectedType === NonTerminal.FUNCTION_DECLARATION) {
            return this.createFunctionDeclarationNode(range, nodeCreationInformation);
        } else {
            throw Error("Invalid detected type! Should not have happened.");
        }
    }

    /**
     * Validate the parsing state.
     * @param state 
     */
    private validateParsingStateTopLevel(
        state: (Terminal | NonTerminal)[]
    ) {
        // top level has no restrictions except that the elements on the RHS of the production rule must be of some specified subset
        for (const elem of state) {
            if((elem !== Terminal.COMMENT_MULTILINE) && (elem !== Terminal.COMMENT_SINGLELINE) &&
                (elem !== Terminal.FILLER) && (elem !== Terminal.REFERENCES) &&
                (elem !== Terminal.STATEMENTS_FILLER) && (elem !== NonTerminal.CLASSES) &&
                (elem !== NonTerminal.FUNCTIONS)) {
                throw new CodeParserImplError("Apart from the filler types, top level code can only contain comments, references (imports), classes and functions!");
            }
        }
    }

    /**
     * Validate the parsing state.
     * @param state 
     */
    private validateParsingStateClasses(
        state: (Terminal | NonTerminal)[]
    ) {
        // classes has no restrictions except that the elements on the RHS of the production rule must be of some specified subset
        for (const elem of state) {
            if((elem !== Terminal.COMMENT_MULTILINE) && (elem !== Terminal.COMMENT_SINGLELINE) && (elem !== Terminal.STATEMENTS_FILLER) &&
                (elem !== Terminal.FILLER) && (elem !== Terminal.ATTRIBUTES) && (elem !== NonTerminal.FUNCTIONS)) {
                throw new CodeParserImplError("Apart from the filler types, class code can only contain comments, attributes (member variables), and functions!");
            }
        }
    }

    /**
     * Validate the parsing state.
     * @param state 
     */
    private validateParsingStateFunctions(
        state: (Terminal | NonTerminal)[]
    ) {
        if (state.length < 2) {
            throw new CodeParserImplError("A valid function must contain a function declaration first and then function body afterwards! Therefore expected state length >= 2");
        }

        const results = this.getFirstLast(state);
        let first: Terminal | NonTerminal = results.first === -1 ? Terminal.FILLER : state[results.first];
        let last: Terminal | NonTerminal = results.last === -1 ? Terminal.FILLER : state[results.last];

        if (first !== NonTerminal.FUNCTION_DECLARATION || last !== NonTerminal.FUNCTION_BODY) {
            throw new CodeParserImplError("A valid function must contain a function declaration first and then function body afterwards!");
        }
    }

    private getFirstLast(state: (Terminal | NonTerminal)[]): {first: number, last: number} {
        let first: number = -1;
        let last: number = -1;
        
        for (let i = 0; i < state.length; i++) {
            const s = state[i];
            if (s !== Terminal.FILLER && s !== Terminal.STATEMENTS_FILLER) {
                first = i;
                break;
            }
        }
        for (let i = state.length - 1; i >= 0; i--) {
            const s = state[i];
            if (s !== Terminal.FILLER && s !== Terminal.STATEMENTS_FILLER) {
                last = i;
                break;
            }
        }

        return {first, last};
    }

    /**
     * Validate the parsing state.
     * @param state 
     */
    private validateParsingStateFunctionBody(
        state: (Terminal | NonTerminal)[]
    ) {
        for (const elem of state) {
            // function bodies has no restrictions except that the elements on the RHS of the production rule must be of some specified subset
            if((elem !== Terminal.COMMENT_MULTILINE) && (elem !== Terminal.COMMENT_SINGLELINE) &&
                (elem !== Terminal.FILLER) && (elem !== Terminal.STATEMENTS_FILLER)) {
                throw new CodeParserImplError("Apart from the filler types, function body code can only contain comments!");
            }
        }
    }

    /**
     * Validate the parsing state.
     * @param state 
     */
    private validateParsingStateFunctionDeclaration(
        state: (Terminal | NonTerminal)[]
    ) {
        // function declarations has no restrictions except that the elements on the RHS of the production rule must be of some specified subset
        for (const elem of state) {
            if (elem === Terminal.STATEMENTS_FILLER) {
                throw new CodeParserImplError("Cannot have statements filler in function declarations! Code statements cannot be inside declarations.");
            }
            if((elem !== Terminal.COMMENT_MULTILINE) && (elem !== Terminal.COMMENT_SINGLELINE) &&
                (elem !== Terminal.FILLER) && (elem !== Terminal.ARGUMENT)) {
                throw new CodeParserImplError("Apart from the filler types, function body code can only contain comments!");
            }
        }
    }

    /**
     * Creates an Argument node based on the previous nodeCreationInformation supplied as the return value of detectXXXSymbol functions.
     * @param range 
     * @param nodeCreationInformation 
     */
    protected abstract createArgumentNode(range: Range, nodeCreationInformation: Record<string, any> | undefined): Argument;

    /**
     * Creates an Attributes node based on the previous nodeCreationInformation supplied as the return value of detectXXXSymbol functions.
     * @param range 
     * @param nodeCreationInformation 
     */
    protected abstract createAttributesNode(range: Range, nodeCreationInformation: Record<string, any> | undefined): Attributes;

    /**
     * Creates an Comments node based on the previous nodeCreationInformation supplied as the return value of detectXXXSymbol functions.
     * @param range 
     * @param nodeCreationInformation 
     */
    protected abstract createCommentsNode(range: Range, isMultiLine: boolean, nodeCreationInformation: Record<string, any> | undefined): Comments;

    /**
     * Creates an References node based on the previous nodeCreationInformation supplied as the return value of detectXXXSymbol functions.
     * @param range 
     * @param nodeCreationInformation 
     */
    protected abstract createReferencesNode(range: Range, nodeCreationInformation: Record<string, any> | undefined): References;

    /**
     * Creates an Classes node based on the previous nodeCreationInformation supplied as the return value of detectXXXSymbol functions.
     * @param range 
     * @param nodeCreationInformation 
     */
    protected abstract createClassesNode(range: Range, nodeCreationInformation: Record<string, any> | undefined): Classes;

    /**
     * Creates an Functions node based on the previous nodeCreationInformation supplied as the return value of detectXXXSymbol functions.
     * @param range 
     * @param nodeCreationInformation 
     */
    protected abstract createFunctionsNode(range: Range, nodeCreationInformation: Record<string, any> | undefined): Functions;

    /**
     * Creates an FunctionDeclaration node based on the previous nodeCreationInformation supplied as the return value of detectXXXSymbol functions.
     * @param range 
     * @param nodeCreationInformation 
     */
    protected abstract createFunctionDeclarationNode(range: Range, nodeCreationInformation: Record<string, any> | undefined): FunctionDeclaration;


    /**
     * Resets the states of the internal detection, to parse a new non-terminal.
     * @param The start of the detection index (inclusive), corresponding to the value in the first call of the detectXXXSymbol.
     * @param The non-terminal that is to be parsed.
     */
    protected abstract resetDetectionState(startTokIndex: number, parsingNonTerminal: NonTerminal): void;

    /**
     * Returns whether comments for functions are placed before or after the function.
     */
    protected abstract isCommentBeforeFunction(): boolean;

    /**
     * Detects a symbol based on the current non-terminal, range, character, and depth.
     * Must be implemented by subclasses.
     * @param state The current state (production rule) that is being matched
     * @param token The current token being inspected, or null if the end is reached.
     * @param currentTokIndex The index of the current character in terms of the flattened string.
     * @param depth The current depth in the parsing tree.
     * @returns A SymbolAdditionDirective, or null if no symbols are detected.
     * @throws CodeParsingError if there is an error during the code parsing and the API implementation has detected it.
     */
    protected abstract detectTopLevelSymbol(
        state: (Terminal | NonTerminal)[],
        token: Token | null,
        currentTokIndex: number,
        depth: number
    ): SymbolAdditionDirective | null;

    /**
     * Detects a symbol based on the current non-terminal, range, character, and depth.
     * Must be implemented by subclasses.
     * @param state The current state (production rule) that is being matched
     * @param token The current token being inspected, or null if the end is reached.
     * @param currentTokIndex The index of the current character in terms of the flattened string.
     * @param depth The current depth in the parsing tree.
     * @returns A SymbolAdditionDirective, or null if no symbols are detected.
     * @throws CodeParsingError if there is an error during the code parsing and the API implementation has detected it.
     */
    protected abstract detectClassesSymbol(
        state: (Terminal | NonTerminal)[],
        token: Token | null,
        currentTokIndex: number,
        depth: number
    ): SymbolAdditionDirective | null;

    /**
     * Detects a symbol based on the current non-terminal, range, character, and depth.
     * Must be implemented by subclasses.
     * @param state The current state (production rule) that is being matched
     * @param token The current token being inspected, or null if the end is reached.
     * @param currentTokIndex The index of the current character in terms of the flattened string.
     * @param depth The current depth in the parsing tree.
     * @returns A SymbolAdditionDirective, or null if no symbols are detected.
     * @throws CodeParsingError if there is an error during the code parsing and the API implementation has detected it.
     */
    protected abstract detectFunctionsSymbol(
        state: (Terminal | NonTerminal)[],
        token: Token | null,
        currentTokIndex: number,
        depth: number
    ): SymbolAdditionDirective | null;

    /**
     * Detects a symbol based on the current non-terminal, range, character, and depth.
     * Must be implemented by subclasses.
     * @param state The current state (production rule) that is being matched
     * @param token The current token being inspected, or null if the end is reached.
     * @param currentTokIndex The index of the current character in terms of the flattened string.
     * @param depth The current depth in the parsing tree.
     * @returns A SymbolAdditionDirective, or null if no symbols are detected.
     * @throws CodeParsingError if there is an error during the code parsing and the API implementation has detected it.
     */
    protected abstract detectFunctionBodySymbol(
        state: (Terminal | NonTerminal)[],
        token: Token | null,
        currentTokIndex: number,
        depth: number
    ): SymbolAdditionDirective | null;

    /**
     * Detects a symbol based on the current non-terminal, range, character, and depth.
     * Must be implemented by subclasses.
     * @param state The current state (production rule) that is being matched
     * @param token The current token being inspected, or null if the end is reached.
     * @param currentTokIndex The index of the current character in terms of the flattened string.
     * @param depth The current depth in the parsing tree.
     * @returns A SymbolAdditionDirective, or null if no symbols are detected.
     * @throws CodeParsingError if there is an error during the code parsing and the API implementation has detected it.
     */
    protected abstract detectFunctionDeclarationSymbol(
        state: (Terminal | NonTerminal)[],
        token: Token | null,
        currentTokIndex: number,
        depth: number
    ): SymbolAdditionDirective | null;
}
