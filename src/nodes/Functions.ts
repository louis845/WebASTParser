import { SyntaxNode } from "./SyntaxNode";
import { Range } from "../utils";

export class Functions extends SyntaxNode {
    public functionDefinitionText: string;
    private funcBodyNonEmpty: boolean;

    constructor(
        range: Range,
        functionDefinitionText: string,
        extra_data: Record<string, any> = {}
    ) {
        super(range, extra_data);
        this.functionDefinitionText = functionDefinitionText;
        this.funcBodyNonEmpty = false;
    }

    public hasFunctionBody(): boolean {
        return this.funcBodyNonEmpty;
    }

    public flagHaveFunctionBody(): void {
        this.funcBodyNonEmpty = true;
    }
}
