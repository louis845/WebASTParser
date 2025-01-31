import { AbstractTokenizer } from "../../parsing/AbstractTokenizer";
import { Token, TokenType } from "../../parsing/ParsingTypes";

enum StringOrMultilineStatus {
    NONE = "NONE",
    SINGLE_QUOTES = "SINGLE_QUOTES",
    DOUBLE_QUOTES = "DOUBLE_QUOTES",
    TRIPLE_SINGLE_QUOTES = "TRIPLE_SINGLE_QUOTES",
    TRIPLE_DOUBLE_QUOTES = "TRIPLE_DOUBLE_QUOTES"
}

export class PythonTokenizer extends AbstractTokenizer {
    private insideSingleLineComments: boolean;
    private insideStringStatus: StringOrMultilineStatus;
    private previousIsEscape: boolean;
    private contiguousQuotesCount: number;

    constructor() {
        super();

        this.insideStringStatus = StringOrMultilineStatus.NONE;
        this.insideSingleLineComments = false;
        this.previousIsEscape = false;
        this.contiguousQuotesCount = 0;
    }

    protected matchNext(ch: string): {type: TokenType, singleChType?: TokenType} | null {
        if (this.insideSingleLineComments) {
            // await newline
            if (ch === "\n") {
                this.insideSingleLineComments = false;
                return {type: TokenType.SINGLELINE_COMMENTS, singleChType: TokenType.SPACINGS};
            }
            return null;
        } else if (this.insideStringStatus === StringOrMultilineStatus.SINGLE_QUOTES) {
            return this.handleSingleQuoteSituation(ch);
        } else if (this.insideStringStatus === StringOrMultilineStatus.DOUBLE_QUOTES) {
            return this.handleDoubleQuoteSituation(ch);
        } else if (this.insideStringStatus === StringOrMultilineStatus.TRIPLE_SINGLE_QUOTES) {
            return this.handleTripleSingleQuoteSituation(ch);
        } else if (this.insideStringStatus === StringOrMultilineStatus.TRIPLE_DOUBLE_QUOTES) {
            return this.handleTripleDoubleQuoteSituation(ch);
        } else {
            const situation = this.handleOtherSituation(ch); // represents the token type of the single character, if applicable. else null.
            if (this.currentBufferSingleCharacter()) {
                if (situation.tokenType !== null) {
                    // current buffer single character, and we add the single character
                    return {type: situation.tokenType};
                } else {
                    // the current character belongs to a token with possibly more things. can't determine now
                    return null;
                }
            } else {
                if (situation.tokenType === null) {
                    if (situation.isPlainCharacter) {
                        // the current character continues the OTHERS type token.
                        return null;
                    } else {
                        // the current buffer has things before, but the new charcter is a start of
                        // a new stuff. we therefore save the previous, and the current token continues with current character
                        return {type: TokenType.OTHERS, singleChType: TokenType.CONTINUATION};
                    }
                } else {
                    // add both tokens, the previous stuff, and the token representing the current character
                    return {type: TokenType.OTHERS, singleChType: situation.tokenType};
                }
            }
        }
    }

    protected matchEndCharacter(): TokenType {
        if (this.insideSingleLineComments) {
            return TokenType.SINGLELINE_COMMENTS;
        } else if (this.insideStringStatus === StringOrMultilineStatus.SINGLE_QUOTES || this.insideStringStatus === StringOrMultilineStatus.DOUBLE_QUOTES) {
            return TokenType.STRINGS;
        } else if (this.insideStringStatus === StringOrMultilineStatus.TRIPLE_DOUBLE_QUOTES || this.insideStringStatus === StringOrMultilineStatus.TRIPLE_SINGLE_QUOTES) {
            return TokenType.MULTILINE_COMMENTS_OR_STRINGS;
        } else {
            return TokenType.OTHERS;
        }
    }

    protected onReset(): void {
        this.insideStringStatus = StringOrMultilineStatus.NONE;
        this.insideSingleLineComments = false;
        this.previousIsEscape = false;
        this.contiguousQuotesCount = 0;
    }

    private handleSingleQuoteSituation(ch: string): {type: TokenType, singleChType?: TokenType} | null {
        // single quotes. if contiguous, try to upgrade to triple. else await for single closing.
        if (ch === "\'" && !this.previousIsEscape) { // got single quotes but not escaped yet
            this.previousIsEscape = false;
            if (this.contiguousQuotesCount == 2) { // upgrade to triple quotes
                this.insideStringStatus = StringOrMultilineStatus.TRIPLE_SINGLE_QUOTES;
                this.contiguousQuotesCount = 0;
            } else if (this.contiguousQuotesCount == 1){
                this.contiguousQuotesCount = 2; // increment quote count
            } else {
                this.insideStringStatus = StringOrMultilineStatus.NONE;
                return {type: TokenType.STRINGS}; // end the single quotes since we've reached the end. include the full string with quotes at both sides
            }
        } else if (ch === "\n"){
            this.previousIsEscape = false;
            this.contiguousQuotesCount = 0;
            this.insideStringStatus = StringOrMultilineStatus.NONE;
            return {type: TokenType.STRINGS, singleChType: TokenType.SPACINGS}; // actually incorrect syntax here, forgot closing quotes before newline.
        } else { // got any other characters
            if (this.contiguousQuotesCount === 1) {
                // we got other characters when a single quote is given.
                this.contiguousQuotesCount = 0;
            } else if (this.contiguousQuotesCount === 2) {
                // somehow got two quotes and another character. means that an empty string and something else afterwards

                this.contiguousQuotesCount = 0; // reset all stats and move on to next
                this.previousIsEscape = false;
                this.insideStringStatus = StringOrMultilineStatus.NONE;

                const situation = this.handleOtherSituation(ch);
                if (situation.tokenType === null) {
                    // the new character is to be continued into the new token
                    return {type: TokenType.STRINGS, singleChType: TokenType.CONTINUATION}; // end the two single quotes, and do not include the new character
                } else {
                    // the new character's token is complete
                    return {type: TokenType.STRINGS, singleChType: situation.tokenType}; // end the two single quotes as a token, and the new character as a separate token
                }
            }

            // for no more contiguous quotes, the new character doesn't matter. just accept characters until closing. we only need to keep track of escapes now
            if (ch === '\\') {
                this.previousIsEscape = !this.previousIsEscape; // flip it, since double escapes means the second one isn't an escape
            } else {
                this.previousIsEscape = false;
            }
        }
        return null;
    }

    private handleDoubleQuoteSituation(ch: string): {type: TokenType, singleChType?: TokenType} | null {
        // double quotes. if contiguous, try to upgrade to triple. else await for single closing.
        if (ch === "\"" && !this.previousIsEscape) { // got single quotes but not escaped yet
            this.previousIsEscape = false;
            if (this.contiguousQuotesCount == 2) { // upgrade to triple quotes
                this.insideStringStatus = StringOrMultilineStatus.TRIPLE_DOUBLE_QUOTES;
                this.contiguousQuotesCount = 0;
            } else if (this.contiguousQuotesCount == 1){
                this.contiguousQuotesCount = 2; // increment quote count
            } else {
                this.insideStringStatus = StringOrMultilineStatus.NONE;
                return {type: TokenType.STRINGS}; // end the double quotes since we've reached the end. include the full string with quotes at both sides
            }
        } else if (ch === "\n"){
            this.previousIsEscape = false;
            this.contiguousQuotesCount = 0;
            this.insideStringStatus = StringOrMultilineStatus.NONE;
            return {type: TokenType.STRINGS, singleChType: TokenType.SPACINGS}; // actually incorrect syntax here, forgot closing quotes before newline.
        } else { // got any other characters
            if (this.contiguousQuotesCount === 1) {
                // we got other characters when a single quote is given.
                this.contiguousQuotesCount = 0;
            } else if (this.contiguousQuotesCount === 2) {
                // somehow got two quotes and another character. means that an empty string and something else afterwards
                
                this.contiguousQuotesCount = 0; // reset all stats and move on to next
                this.previousIsEscape = false;
                this.insideStringStatus = StringOrMultilineStatus.NONE;

                const situation = this.handleOtherSituation(ch);
                if (situation.tokenType === null) {
                    // the new character is to be continued into the new token
                    return {type: TokenType.STRINGS, singleChType: TokenType.CONTINUATION}; // end the two single quotes, and do not include the new character
                } else {
                    // the new character's token is complete
                    return {type: TokenType.STRINGS, singleChType: situation.tokenType}; // end the two single quotes as a token, and the new character as a separate token
                }
            }

            // for no more contiguous quotes, the new character doesn't matter. just accept characters until closing. we only need to keep track of escapes now
            if (ch === '\\') {
                this.previousIsEscape = !this.previousIsEscape; // flip it, since double escapes means the second one isn't an escape
            } else {
                this.previousIsEscape = false;
            }
        }
        return null;
    }

    private handleTripleSingleQuoteSituation(ch: string): {type: TokenType, singleChType?: TokenType} | null {
        // wait until triple single quotes
        if (ch === "\'" && !this.previousIsEscape) { // got single quotes but not escaped yet
            this.previousIsEscape = false;
            if (this.contiguousQuotesCount == 2) {
                // can end here
                this.contiguousQuotesCount = 0;
                this.insideStringStatus = StringOrMultilineStatus.NONE;
                return {type: TokenType.MULTILINE_COMMENTS_OR_STRINGS}; // end the multiline triple single quotes, include all triple quotes at both sides
            } else {
                this.contiguousQuotesCount++;
            }
        } else { // got any other characters
            this.contiguousQuotesCount = 0;
            if (ch === '\\') {
                this.previousIsEscape = !this.previousIsEscape; // flip it, since double escapes means the second one isn't an escape
            } else {
                this.previousIsEscape = false;
            }
        }
        return null;
    }

    private handleTripleDoubleQuoteSituation(ch: string): {type: TokenType, singleChType?: TokenType} | null {
        // wait until triple double quotes
        if (ch === "\"" && !this.previousIsEscape) { // got single double but not escaped yet
            this.previousIsEscape = false;
            if (this.contiguousQuotesCount == 2) {
                // can end here
                this.contiguousQuotesCount = 0;
                this.insideStringStatus = StringOrMultilineStatus.NONE;
                return {type: TokenType.MULTILINE_COMMENTS_OR_STRINGS}; // end the multiline triple double quotes, include all triple quotes at both sides
            } else {
                this.contiguousQuotesCount++;
            }
        } else { // got any other characters
            this.contiguousQuotesCount = 0;
            if (ch === '\\') {
                this.previousIsEscape = !this.previousIsEscape; // flip it, since double escapes means the second one isn't an escape
            } else {
                this.previousIsEscape = false;
            }
        }
        return null;
    }

    private handleOtherSituation(ch: string): {tokenType: TokenType | null, isPlainCharacter: boolean} {
        if (ch === "{" || ch === "}" || ch === "[" || ch === "]" || ch === "(" || ch === ")") {
            return {tokenType: TokenType.BRACES, isPlainCharacter: false};
        } else if (ch === " " || ch === "\t" || ch === "\n") {
            return {tokenType: TokenType.SPACINGS, isPlainCharacter: false};
        } else if (ch === ":") {
            return {tokenType: TokenType.OTHERS, isPlainCharacter: false};
        } else if (ch === ",") {
            return {tokenType: TokenType.COMMAS, isPlainCharacter: false};
        } else if (ch === "#"){
            this.insideSingleLineComments = true;
            return {tokenType: null, isPlainCharacter: false};
        } else if (ch === "\"") {
            this.insideStringStatus = StringOrMultilineStatus.DOUBLE_QUOTES;
            this.contiguousQuotesCount = 1;
            return {tokenType: null, isPlainCharacter: false};
        } else if (ch === "\'") {
            this.insideStringStatus = StringOrMultilineStatus.SINGLE_QUOTES;
            this.contiguousQuotesCount = 1;
            return {tokenType: null, isPlainCharacter: false};
        }
        return {tokenType: null, isPlainCharacter: true};
    }
}