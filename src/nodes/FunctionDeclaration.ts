import { SyntaxNode } from "./SyntaxNode";
import { Range } from "../utils";
import { Argument } from "./Argument";

export class FunctionDeclaration extends SyntaxNode {
    public functionName: string;
    public functionReturnType: string | null;

    constructor(
        range: Range,
        functionName: string,
        functionReturnType: string | null,
        extra_data: Record<string, any> = {}
    ) {
        super(range, extra_data);
        this.functionName = functionName;
        this.functionReturnType = functionReturnType;
    }

    /**
     * Determines whether this FunctionDeclaration has any arguments.
     * @returns True if there are Argument children, false otherwise.
     */
    hasArguments(): boolean {
        return this.children.some(child => child instanceof Argument);
    }
}
