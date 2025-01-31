export class CodeParsingError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CodeParsingError";
    }
}