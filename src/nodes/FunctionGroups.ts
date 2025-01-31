import { Range } from "../utils";
import { SyntaxNode } from "./SyntaxNode";
import { Comments } from "./Comments";

export class FunctionGroups extends SyntaxNode {

    constructor(range: Range, extra_data: Record<string, any> = {}) {
        super(range, extra_data);
    }

    /**
     * Checks if this FunctionGroup contains a Comment node.
     * @returns True if a Comment is present, false otherwise.
     */
    hasComment(): boolean {
        return this.children.some(child => child instanceof Comments);
    }
}
