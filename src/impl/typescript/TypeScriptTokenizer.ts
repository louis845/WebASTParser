import { StringExpressionMatcher } from "../../matchers/StringExpressionMatcher";
import { AbstractTokenizer } from "../../parsing/AbstractTokenizer";
import { TokenType } from "../../parsing/ParsingTypes";

enum Status {
    NONE = "NONE",
    SINGLE_QUOTES = "SINGLE_QUOTES",
    DOUBLE_QUOTES = "DOUBLE_QUOTES",
    MULTILINE_BACKTICKS = "MULTILINE_BACKTICKS",
    MULTILINE_COMMENTS = "MULTILINE_COMMENTS",
    EQUALS = "EQUALS"
}

export class TypeScriptTokenizer extends AbstractTokenizer {
    private insideSingleLineComments: boolean;
    private insideStringStatus: Status;
    private previousIsEscape: boolean;
    private stringMatcher: StringExpressionMatcher;

    constructor() {
        super();

        this.insideStringStatus = Status.NONE;
        this.insideSingleLineComments = false;
        this.previousIsEscape = false;
        this.stringMatcher = new StringExpressionMatcher({
            COMMENT_START: "//",
            MULTILINE_COMMENT_START: "/*",
            MULTILINE_COMMENT_END: "*/"
        });
    }

    protected matchNext(ch: string): {type: TokenType, singleChType?: TokenType, numSplitCharacters?: number} | null {
        const matchedExpression: string | null = this.stringMatcher.next(ch);
        if (matchedExpression !== null) {
            this.stringMatcher.reset(); // ensure separated
        }

        if (this.insideSingleLineComments) {
            // await newline
            if (ch === "\n") {
                this.insideSingleLineComments = false;
                return {type: TokenType.SINGLELINE_COMMENTS, singleChType: TokenType.SPACINGS};
            }
            return null;
        } else if (this.insideStringStatus === Status.SINGLE_QUOTES) {
            return this.handleSingleQuoteSituation(ch);
        } else if (this.insideStringStatus === Status.DOUBLE_QUOTES) {
            return this.handleDoubleQuoteSituation(ch);
        } else if (this.insideStringStatus === Status.MULTILINE_BACKTICKS) {
            return this.handleMultilineBackticksSituation(ch);
        } else if (this.insideStringStatus === Status.MULTILINE_COMMENTS) {
            return this.handleMultilineCommentsSituation(ch, matchedExpression);
        } else if (this.insideStringStatus === Status.EQUALS) {
            return this.handleEqualsSituation(ch, matchedExpression);
        } else {
            const situation = this.handleOtherSituation(ch, matchedExpression); // represents the token type of the single character, if applicable. else null.
            if (situation.needsResetSplitChars === 0) {
                // no need reset, continue the current token building
                return null;
            } else if (this.currentBufferLength() === situation.needsResetSplitChars) {
                if (situation.tokenType === null) {
                    // continue
                    return null;
                }
                // detect a full token, and is equal to the current buffer length.
                return {type: situation.tokenType};
            } else {
                // current buffer length strictly larger to the number of characters to be included into the current token. therefore we indicate splitting is needed
                if (situation.tokenType === null) {
                    // we still need to detect more characters to conclude the current token
                    return {type: TokenType.OTHERS, singleChType: TokenType.CONTINUATION};
                } else {
                    // we don't have to detect more characters. conclude it.
                    return {type: TokenType.OTHERS, singleChType: situation.tokenType};
                }
            }
        }
    }

    protected matchEndCharacter(): TokenType {
        if (this.insideSingleLineComments) {
            return TokenType.SINGLELINE_COMMENTS;
        } else if (this.insideStringStatus === Status.SINGLE_QUOTES || this.insideStringStatus === Status.DOUBLE_QUOTES) {
            return TokenType.STRINGS;
        } else if (this.insideStringStatus === Status.MULTILINE_BACKTICKS) {
            return TokenType.MULTILINE_COMMENTS_OR_STRINGS;
        } else if (this.insideStringStatus === Status.MULTILINE_COMMENTS) {
            return TokenType.MULTILINE_COMMENTS_OR_STRINGS;
        } else if (this.insideStringStatus === Status.EQUALS) {
            return TokenType.OTHERS;
        }
        return TokenType.OTHERS;
    }

    protected onReset(): void {
        this.insideStringStatus = Status.NONE;
        this.insideSingleLineComments = false;
        this.previousIsEscape = false;
        this.stringMatcher.reset();
    }

    private handleSingleQuoteSituation(ch: string): {type: TokenType, singleChType?: TokenType} | null {
        if (ch === "\'" && !this.previousIsEscape) { // got single quotes but not escaped yet
            this.previousIsEscape = false;
            this.insideStringStatus = Status.NONE;
            return {type: TokenType.STRINGS}; // end the single quotes since we've reached the end. include the full string with quotes at both sides
        } else if (ch === "\n"){
            this.previousIsEscape = false;
            this.insideStringStatus = Status.NONE;
            return {type: TokenType.STRINGS, singleChType: TokenType.SPACINGS}; // actually incorrect syntax here, forgot closing quotes before newline.
        } else { // got any other characters
            if (ch === '\\') {
                this.previousIsEscape = !this.previousIsEscape; // flip it, since double escapes means the second one isn't an escape
            } else {
                this.previousIsEscape = false;
            }
        }
        return null;
    }

    private handleDoubleQuoteSituation(ch: string): {type: TokenType, singleChType?: TokenType} | null {
        if (ch === "\"" && !this.previousIsEscape) { // got double quotes but not escaped yet
            this.previousIsEscape = false;
            this.insideStringStatus = Status.NONE;
            return {type: TokenType.STRINGS}; // end the double quotes since we've reached the end. include the full string with quotes at both sides
        } else if (ch === "\n"){
            this.previousIsEscape = false;
            this.insideStringStatus = Status.NONE;
            return {type: TokenType.STRINGS, singleChType: TokenType.SPACINGS}; // actually incorrect syntax here, forgot closing quotes before newline.
        } else { // got any other characters
            if (ch === '\\') {
                this.previousIsEscape = !this.previousIsEscape; // flip it, since double escapes means the second one isn't an escape
            } else {
                this.previousIsEscape = false;
            }
        }
        return null;
    }

    private handleMultilineBackticksSituation(ch: string): {type: TokenType, singleChType?: TokenType} | null {
        if (ch === "`" && !this.previousIsEscape) { // got backticks but not escaped yet
            this.previousIsEscape = false;
            this.insideStringStatus = Status.NONE;
            return {type: TokenType.MULTILINE_COMMENTS_OR_STRINGS}; // end the backticks since we've reached the end. include the full string with backticks at both sides
        } else { // got any other characters
            if (ch === '\\') {
                this.previousIsEscape = !this.previousIsEscape; // flip it, since double escapes means the second one isn't an escape
            } else {
                this.previousIsEscape = false;
            }
        }
        return null;
    }

    private handleMultilineCommentsSituation(ch: string, matchedExpression: string | null): {type: TokenType, singleChType?: TokenType} | null {
        // no need to handle escapes since multiline comments doesn't have that
        if (matchedExpression === "MULTILINE_COMMENT_END") { // got multiline comment end
            this.insideStringStatus = Status.NONE;
            return {type: TokenType.MULTILINE_COMMENTS_OR_STRINGS}; // end the multiline comments
        }
        return null;
    }

    private handleEqualsSituation(ch: string, matchedExpression: string | null): {type: TokenType, singleChType?: TokenType} | null {
        this.insideStringStatus = Status.NONE;
        if (ch === ">") {
            // conclude full
            return {type: TokenType.OTHERS};
        }
        // conclude the equal sign along with another one
        const action = this.handleOtherSituation(ch, matchedExpression);
        const newChType: TokenType = action.tokenType === null ? TokenType.CONTINUATION : action.tokenType;
        return {
            type: TokenType.OTHERS,
            singleChType: newChType
        };
    }

    private handleOtherSituation(ch: string, matchedExpression: string | null): {tokenType: TokenType | null, needsResetSplitChars: number} {
        if (ch === "{" || ch === "}" || ch === "[" || ch === "]" || ch === "(" || ch === ")") {
            return {tokenType: TokenType.BRACES, needsResetSplitChars: 1};
        } else if (ch === " " || ch === "\t" || ch === "\n" || ch === ";") {
            return {tokenType: TokenType.SPACINGS, needsResetSplitChars: 1};
        } else if (ch === ",") {
            return {tokenType: TokenType.COMMAS, needsResetSplitChars: 1};
        } else if (ch === ":" || ch === "<" || ch === ">") {
            return {tokenType: TokenType.OTHERS, needsResetSplitChars: 1};
        } else if (ch === "=") {
            this.insideStringStatus = Status.EQUALS;
            return {tokenType: null, needsResetSplitChars: 1};
        } else if (ch === "`") {
            this.insideStringStatus = Status.MULTILINE_BACKTICKS;
            return {tokenType: null, needsResetSplitChars: 1};
        } else if (ch === "\'") {
            this.insideStringStatus = Status.SINGLE_QUOTES;
            return {tokenType: null, needsResetSplitChars: 1};
        } else if (ch === "\"") {
            this.insideStringStatus = Status.DOUBLE_QUOTES;
            return {tokenType: null, needsResetSplitChars: 1};
        } else if (matchedExpression === "MULTILINE_COMMENT_START"){
            this.insideStringStatus = Status.MULTILINE_COMMENTS;
            return {tokenType: null, needsResetSplitChars: 2};
        } else if (matchedExpression === "COMMENT_START") {
            this.insideSingleLineComments = true;
            return {tokenType: null, needsResetSplitChars: 2};
        }
        return {tokenType: null, needsResetSplitChars: 0};
    }
}