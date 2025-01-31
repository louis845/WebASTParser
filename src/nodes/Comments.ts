import { SyntaxNode } from "./SyntaxNode";
import { Range } from "../utils";

export class Comments extends SyntaxNode {
    public isMultiLine: boolean;
    public commentContents: string;
    constructor(
        range: Range,
        isMultiLine: boolean,
        commentContents: string,
        extra_data: Record<string, any> = {}
    ) {
        super(range, extra_data);
        this.isMultiLine = isMultiLine;
        this.commentContents = commentContents;
    }
}