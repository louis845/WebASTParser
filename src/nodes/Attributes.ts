import { SyntaxNode } from "./SyntaxNode";
import { Range } from "../utils";

export class Attributes extends SyntaxNode {
    public attributeName: string;
    public attributeType: string | null;

    constructor(
        range: Range,
        attributeName: string,
        attributeType: string | null = null,
        extra_data: Record<string, any> = {}
    ) {
        super(range, extra_data);
        this.attributeName = attributeName;
        this.attributeType = attributeType;
    }
}