import { BracesMatcher } from "../../matchers/BracesMatcher";
import { Token } from "../../parsing/ParsingTypes";

const typeBraces = [
    { opening: '(', closing: ')' },
    { opening: '{', closing: '}' },
    { opening: '[', closing: ']' },
    { opening: '<', closing: '>' },
];

const assignmentBraces = [
    { opening: '(', closing: ')' },
    { opening: '{', closing: '}' },
    { opening: '[', closing: ']' }
];

function isOpeningBraceType(tok: Token): boolean {
    return typeBraces.some(x => x.opening === tok.stringContents);
}

function isClosingBraceType(tok: Token): boolean {
    return typeBraces.some(x => x.closing === tok.stringContents);
}

function isOpeningBraceAssignment(tok: Token): boolean {
    return assignmentBraces.some(x => x.opening === tok.stringContents);
}

function isClosingBraceAssignment(tok: Token): boolean {
    return assignmentBraces.some(x => x.closing === tok.stringContents);
}

enum State {
    READING_NAME,
    READING_TYPE,
    READING_ASSIGNMENT
}

export class TypeScriptVarDeclMatcher {
    private state: State;
    private nameBuffer: string | null;
    private typeBuffer: string | null;
    private assignmentBuffer: string | null;
    private typeBracesMatcher: BracesMatcher;
    private assignmentBracesMatcher: BracesMatcher;

    constructor() {
        this.typeBracesMatcher = new BracesMatcher(typeBraces);
        this.assignmentBracesMatcher = new BracesMatcher(assignmentBraces);

        // default values
        this.state = State.READING_NAME;
        this.nameBuffer = "";
        this.typeBuffer = null;
        this.assignmentBuffer = null;
    }

    /**
     * Processes the next token in the stream.
     * @param tok - The next token to process.
     * @returns An object with name type and assignment if parsing is complete, otherwise null.
     */
    public next(tok: Token): {name: string, type: string | null, assignment: string | null} | null {
        switch (this.state) {
            case State.READING_NAME:
                return this.handleReadingName(tok);
            case State.READING_TYPE:
                return this.handleReadingType(tok);
            case State.READING_ASSIGNMENT:
                return this.handleReadingAssignment(tok);
            default:
                // Invalid state, reset parser
                this.reset();
                return null;
        }
    }

    /**
     * Resets the internal state of the TypeScriptVarDeclMatcher. Returns the current contents if exists
     */
    public reset(): {name: string, type: string | null, assignment: string | null} | null {
        let retValue: {name: string, type: string | null, assignment: string | null} | null;
        if (this.nameBuffer === null || this.nameBuffer.trim().length === 0) {
            retValue = null;
        } else {
            retValue = {
                name: this.nameBuffer.trim(),
                type: this.typeBuffer === null ? null : this.typeBuffer.trim(),
                assignment: this.assignmentBuffer === null ? null : this.assignmentBuffer.trim()
            };
        }

        this.state = State.READING_NAME;
        this.nameBuffer = null;
        this.typeBuffer = null;
        this.assignmentBuffer = null;
        this.typeBracesMatcher.reset();
        this.assignmentBracesMatcher.reset();

        return retValue;
    }
    
    private handleReadingName(tok: Token): {name: string, type: string | null, assignment: string | null} | null {
        if ([":", "=", ";", ",", ")"].includes(tok.stringContents)) {
            switch (tok.stringContents) {
                case ":":
                    this.state = State.READING_TYPE; // read the type
                    return null;
                case "=":
                    this.state = State.READING_ASSIGNMENT; // direct assignmnet
                    return null;
                case ";": // stopped
                case ",":
                case ")":
                    return this.reset();
                default:
                    throw Error("Shouldn't have happened!");
            }
        } else {
            if (this.nameBuffer !== null) {
                this.nameBuffer += tok.stringContents;
            } else {
                this.nameBuffer = tok.stringContents;
            }
            return null;
        }
    }

    private handleReadingType(tok: Token): {name: string, type: string | null, assignment: string | null} | null {
        if (["=", ";", ",", ")"].includes(tok.stringContents) && this.typeBracesMatcher.currentDepth() === 0) {
            switch (tok.stringContents) {
                case "=":
                    this.state = State.READING_ASSIGNMENT;
                    return null;
                case ";":
                case ",":
                case ")":
                    return this.reset();
            }
        }

        if (this.typeBuffer === null) {
            this.typeBuffer = tok.stringContents;
        } else {
            this.typeBuffer += tok.stringContents;
        }

        if (isOpeningBraceType(tok) || isClosingBraceType(tok)) {
            this.typeBracesMatcher.next(tok.stringContents);
        }
        return null;
    }

    private handleReadingAssignment(tok: Token): {name: string, type: string | null, assignment: string | null} | null {
        if ([";", ",", ")"].includes(tok.stringContents) && this.assignmentBracesMatcher.currentDepth() === 0) {
            return this.reset();
        }

        if (this.assignmentBuffer === null) {
            this.assignmentBuffer = tok.stringContents;
        } else {
            this.assignmentBuffer += tok.stringContents;
        }
        if (isOpeningBraceAssignment(tok) || isClosingBraceAssignment(tok)) {
            this.assignmentBracesMatcher.next(tok.stringContents);
        }
        return null;
    }
}