import { SyntaxNode } from "./SyntaxNode";
import { Range } from "../utils";

export class Argument extends SyntaxNode {
    public argumentName: string;
    public argumentType: string | null;

    constructor(
        range: Range,
        argumentName: string,
        argumentType: string | null = null,
        extra_data: Record<string, any> = {}
    ) {
        super(range, extra_data);
        this.argumentName = argumentName;
        this.argumentType = argumentType;
    }
}