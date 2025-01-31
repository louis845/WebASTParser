import { Token, TokenType } from "./ParsingTypes";

export abstract class AbstractTokenizer {
    private tokenString: Token[];
    private stringBuffer: string;
    private charIdx: number;
    private tokStartIdx: number;
    private ended: boolean;

    constructor() {
        this.tokenString = [];
        this.stringBuffer = "";
        this.charIdx = 0;
        this.tokStartIdx = 0;
        this.ended = false;
    }

    public reset(): void {
        this.tokenString = [];
        this.stringBuffer = "";
        this.charIdx = 0;
        this.tokStartIdx = 0;
        this.ended = false;
        this.onReset();
    }


    /**
     * Gives the next character in the character stream, with null indicating the end of the sequence.
     * @param ch The new character.
     */
    public next(ch: string | null) {
        if (this.ended) {
            throw Error("Cannot call next when already ended! Must reset with .reset().");
        }
        if (ch === null) {
            // handle remanining 
            if (this.charIdx > this.tokStartIdx) {
                this.tokenString.push({tokenType: this.matchEndCharacter(), stringContents: this.stringBuffer, characterRange: {start: this.tokStartIdx, end: this.charIdx}});
            }
            this.ended = true;
        } else {
            if (ch.length !== 1) {
                throw Error("Character stream to be fed into AbstractTokenizer must have length 1!");
            }

            this.stringBuffer += ch;
            this.charIdx++;
            const matchResult: {type: TokenType, singleChType?: TokenType, numSplitCharacters?: number} | null = this.matchNext(ch);
            if (matchResult !== null) {
                if (matchResult.type === TokenType.CONTINUATION) {
                    throw Error("Only singleChType can be continuation!");
                }

                const length: number = this.charIdx - this.tokStartIdx;
                if (matchResult.singleChType === undefined) {
                    // Add a single token with string encapsulating the entire string buffer.
                    this.tokenString.push({tokenType: matchResult.type,
                        stringContents: this.stringBuffer,
                        characterRange: {start: this.tokStartIdx, end: this.charIdx}});
                    
                    // Full reset
                    this.tokStartIdx = this.charIdx;
                    this.stringBuffer = "";
                } else {
                    // We need to split the current string buffer into two parts
                    if (matchResult.numSplitCharacters === undefined) {
                        matchResult.numSplitCharacters = 1; // default value 1
                    }
                    if (matchResult.numSplitCharacters < 1) {
                        throw Error("numSplitCharacters should be >= 1!");
                    }
                    if (length < matchResult.numSplitCharacters + 1) {
                        throw Error("The length of the buffer (including the newly added character) must be > numSplitCharacters! This is to allow splitting the buffer into two parts which are non-empty.");
                    }

                    // Now we split the buffer into two parts. If the buffer is [0, buf_len), then the two parts are [0, buf_len - numSplitCharacters), [buf_len - numSplitCharacters, buf_len)
                    if (matchResult.singleChType === TokenType.CONTINUATION) {
                        // Add a single token as the first split, while the second split will be stored as the new buffer
                        this.tokenString.push({tokenType: matchResult.type,
                            stringContents: this.stringBuffer.substring(0, this.stringBuffer.length - matchResult.numSplitCharacters),
                            characterRange: {start: this.tokStartIdx, end: this.charIdx - matchResult.numSplitCharacters}});

                        // Partial reset, keep the last token.
                        this.tokStartIdx = this.charIdx - matchResult.numSplitCharacters;
                        this.stringBuffer = this.stringBuffer.substring(this.stringBuffer.length - matchResult.numSplitCharacters, this.stringBuffer.length);
                    } else {
                        // Add two tokens corresponding to the split
                        this.tokenString.push({tokenType: matchResult.type,
                            stringContents: this.stringBuffer.substring(0, this.stringBuffer.length - matchResult.numSplitCharacters),
                            characterRange: {start: this.tokStartIdx, end: this.charIdx - matchResult.numSplitCharacters}});
                        this.tokenString.push({tokenType: matchResult.singleChType,
                                                stringContents: this.stringBuffer.substring(this.stringBuffer.length - matchResult.numSplitCharacters, this.stringBuffer.length),
                                                characterRange: {start: this.charIdx - matchResult.numSplitCharacters, end: this.charIdx}});
                        
                        // Full reset
                        this.tokStartIdx = this.charIdx;
                        this.stringBuffer = "";
                    }
                }
            }
        }
    }

    public getTokens(): Token[] {
        return this.tokenString;
    }

    public currentBufferSingleCharacter(): boolean {
        return this.stringBuffer.length === 1;
    }

    public currentBufferLength(): number {
        return this.stringBuffer.length;
    }

    /**
     * Depending on the next character in the string, either take some action on the
     * character buffer, or do nothing (return null). For an action, when including
     * the whole character buffer (including the newest character) into a token,
     * return an object with singleChType and numSplitCharacters undefined.
     * 
     * When excluding the newest character as an independent token, return an object
     * with type and singleChType given, but numSplitCharacters undefined.
     * 
     * When excluding a fixed length as an independent token, and adding two tokens,
     * give type (first token), singleChType (for second token) and numSplitCharacters
     * that specify the length of the second token.
     * 
     * To tell the tokenizer to keep a suffix specified by a fixed length in the buffer,
     * and conclude the rest into a token (exactly one token is created), and then the
     * aforementioned suffix will be the new buffer, set singleChType to CONTINUATION
     * @param ch The next character in the string.
     * @returns The action to be taken.
     */
    protected abstract matchNext(ch: string): {type: TokenType, singleChType?: TokenType, numSplitCharacters?: number} | null;
    protected abstract matchEndCharacter(): TokenType;
    protected abstract onReset(): void;
}