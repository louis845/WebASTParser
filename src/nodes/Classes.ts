import { SyntaxNode } from "./SyntaxNode";
import { Range } from "../utils";

export class Classes extends SyntaxNode {
    public classType: string | null;
    public classDefinitionText: string;

    constructor(
        range: Range,
        classType: string | null,
        classDefinitionText: string,
        extra_data: Record<string, any> = {}
    ) {
        super(range, extra_data);
        this.classType = classType;
        this.classDefinitionText = classDefinitionText;
    }
}
