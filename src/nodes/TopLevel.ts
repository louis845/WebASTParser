import { SyntaxNode } from "./SyntaxNode";
import { Range } from "../utils";

export class TopLevel extends SyntaxNode {
    
    constructor(range: Range, extra_data: Record<string, any> = {}) {
        super(range, extra_data);
    }
    
}
