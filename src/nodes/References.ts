import { SyntaxNode } from "./SyntaxNode";
import { Range } from "../utils";

export class References extends SyntaxNode {
    public referenceText: string;
    public refRelativePath: string | null;

    constructor(
        range: Range,
        referenceText: string,
        refRelativePath: string | null,
        extra_data: Record<string, any> = {}
    ) {
        super(range, extra_data);
        this.referenceText = referenceText;
        this.refRelativePath = refRelativePath;
    }
}
