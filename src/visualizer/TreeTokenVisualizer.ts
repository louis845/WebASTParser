import { TreeToken, TreeTokenType } from "../parsing/ASTGenericTokenizer";
import { Argument, Attributes, Classes, Comments, FunctionDeclaration, Functions, References, SyntaxNode, TopLevel } from "../nodes";

const TOKEN_COLORS: { [key in TreeTokenType]: string[] } = {
    [TreeTokenType.ARGUMENT]: ["#FFF8DC", "#EFE8CC"], // Cornsilk
    [TreeTokenType.ATTRIBUTE]: ["#E0FFFF", "#D0EFEF"], // Light Cyan
    [TreeTokenType.CLASS]: ["#FFE4E1", "#EFD4D1"], // Misty Rose
    [TreeTokenType.COMMENTS]: ["#F0FFF0", "#E0EFE0"], // Honeydew
    [TreeTokenType.FUNCTION]: ["#F5F5DC", "#E5E5CC"], // Beige
    [TreeTokenType.FUNCTION_DEFINITION]: ["#F0F8FF", "#E0E8EF"], // Alice Blue
    [TreeTokenType.FUNCTION_GROUP]: ["#FAFAD2", "#EAEAC2"], // Light Goldenrod Yellow
    [TreeTokenType.OTHERS]: ["#FFFFFF", "#EFEFEF"], // White
    [TreeTokenType.REFERENCES]: ["#FFF0F5", "#EFE0E5"], // Lavender Blush
    [TreeTokenType.TOP_LEVEL]: ["#F5FFFA", "#E5EFEA"]  // Mint Cream
};

class TreeTokenVisualizer extends HTMLElement {
    private tokens: TreeToken[] = [];
    private container: HTMLElement;
    private hoverDiv: HTMLElement | null = null; // Reference to the hover div

    constructor(initialTokens: TreeToken[] = []) {
        super();
        this.attachShadow({ mode: "open" });

        // Create a container for the tokens
        this.container = document.createElement("div");
        this.container.style.fontFamily = "monospace";
        this.container.style.whiteSpace = "pre-wrap"; // Preserve whitespace and line breaks
        this.container.style.padding = "10px";
        this.container.style.border = "1px solid #ccc";
        this.container.style.borderRadius = "4px";
        this.shadowRoot!.appendChild(this.container);

        // Initialize with initial tokens
        if (initialTokens.length > 0) {
            this.tokens = initialTokens;
            this.render();
        }
    }

    public update(toks: TreeToken[]) {
        this.tokens = toks;
        this.render();
    }

    private getHoverText(token: TreeToken): string | null {
        if (token.originalNode !== undefined) {
            const node: SyntaxNode = token.originalNode;
            if (node instanceof Argument) {
                return `Type: Argument   Depth: ${node.getDepth()}   Rank: ${node.getSiblingRank()}
Name: ${node.argumentName}   Type: ${node.argumentType}`;
            } else if (node instanceof Attributes) {
                return `Type: Attributes   Depth: ${node.getDepth()}   Rank: ${node.getSiblingRank()}
Name: ${node.attributeName}   Type: ${node.attributeType}`;
            } else if (node instanceof Classes) {
                return `Type: Classes   Depth: ${node.getDepth()}   Rank: ${node.getSiblingRank()}
Definition: ${node.classDefinitionText}
Class type: ${node.classType}`;
            } else if (node instanceof Comments) {
                return `Type: Comments   Depth: ${node.getDepth()}   Rank: ${node.getSiblingRank()}
Contents: ${node.commentContents}
Is multiline: ${node.isMultiLine}`;
            } else if (node instanceof FunctionDeclaration) {
                return `Type: Funct Decl   Depth: ${node.getDepth()}   Rank: ${node.getSiblingRank()}
Name: ${node.functionName}
Return type: ${node.functionReturnType}`;
            } else if (node instanceof Functions) {
                return `Type: Function   Depth: ${node.getDepth()}   Rank: ${node.getSiblingRank()}
Definition: ${node.functionDefinitionText}
Has body: ${node.hasFunctionBody()}`;
            } else if (node instanceof References) {
                return `Type: References   Depth: ${node.getDepth()}   Rank: ${node.getSiblingRank()}
Reference Text: ${node.referenceText}
Reference Path: ${node.refRelativePath}`;
            } else if (node instanceof TopLevel) {
                return `Type: Top Level   Depth: ${node.getDepth()}   Rank: ${node.getSiblingRank()}`;
            }
        }
        return null;
    }

    // Render the tokens into the container
    private render() {
        // Clear existing content
        this.container.innerHTML = "";

        const counts: { [key in TreeTokenType]: number } = {
            [TreeTokenType.ARGUMENT]: 0,
            [TreeTokenType.ATTRIBUTE]: 0,
            [TreeTokenType.CLASS]: 0,
            [TreeTokenType.COMMENTS]: 0,
            [TreeTokenType.FUNCTION]: 0,
            [TreeTokenType.FUNCTION_DEFINITION]: 0,
            [TreeTokenType.FUNCTION_GROUP]: 0,
            [TreeTokenType.OTHERS]: 0,
            [TreeTokenType.REFERENCES]: 0,
            [TreeTokenType.TOP_LEVEL]: 0
        };
        const prevNodes: { [key in TreeTokenType]: SyntaxNode | undefined } = {
            [TreeTokenType.ARGUMENT]: undefined,
            [TreeTokenType.ATTRIBUTE]: undefined,
            [TreeTokenType.CLASS]: undefined,
            [TreeTokenType.COMMENTS]: undefined,
            [TreeTokenType.FUNCTION]: undefined,
            [TreeTokenType.FUNCTION_DEFINITION]: undefined,
            [TreeTokenType.FUNCTION_GROUP]: undefined,
            [TreeTokenType.OTHERS]: undefined,
            [TreeTokenType.REFERENCES]: undefined,
            [TreeTokenType.TOP_LEVEL]: undefined
        };
        this.tokens.forEach(token => {
            const tokenType = token.tokenType;
            const bgColor = TOKEN_COLORS[tokenType] || "#ffffff";
            const borderColor = "#00000033"; // Very soft black border
            if (token.originalNode === undefined || token.originalNode !== prevNodes[tokenType]) {
                counts[tokenType]++; // change a bit hue if its undefined or the original node it refers to have changed
            }
            prevNodes[tokenType] = token.originalNode;

            // Split the stringContents by '\n' to handle newlines
            const parts = token.stringContents.split("\n");
            parts.forEach((part, index) => {
                const span = document.createElement("span");
                span.textContent = part;

                span.style.backgroundColor = bgColor[counts[tokenType] % 2];
                span.style.border = `1px solid ${borderColor}`;
                span.style.borderRadius = "3px";
                span.style.padding = "2px 4px";
                span.style.margin = "1px";
                span.style.display = "inline-block";

                // Add hover event listeners to the span
                span.style.position = "relative";

                span.addEventListener("mouseenter", (event) => {
                    const hoverText = this.getHoverText(token);
                    if (hoverText) {
                        this.showHoverDiv(event.currentTarget as HTMLElement, hoverText);
                    }
                });

                span.addEventListener("mouseleave", () => {
                    this.hideHoverDiv();
                });

                if (index < parts.length - 1) {
                    span.textContent = span.textContent + "\\n";
                    this.container.appendChild(span);
                    this.container.appendChild(document.createElement("br"));
                } else {
                    if (span.textContent.length > 0) {
                        this.container.appendChild(span);
                    }
                }
            });
        });
    }

    private showHoverDiv(target: HTMLElement, text: string) {
        // Ensure any existing hoverDiv is removed
        this.hideHoverDiv();
    
        // Create the hover div
        this.hoverDiv = document.createElement("div");
        
        // Split the text into lines
        const lines = text.split('\n');
    
        // Append each line as a separate div
        lines.forEach(line => {
            const lineElement = document.createElement("div");
            lineElement.textContent = line;
            this.hoverDiv!.appendChild(lineElement);
        });
    
        // Style the hover div
        this.hoverDiv.style.position = "absolute";
        this.hoverDiv.style.backgroundColor = "#ffffff";
        this.hoverDiv.style.border = "1px solid #ccc";
        this.hoverDiv.style.borderRadius = "4px";
        this.hoverDiv.style.padding = "8px";
        this.hoverDiv.style.boxShadow = "0px 2px 8px rgba(0, 0, 0, 0.1)";
        this.hoverDiv.style.whiteSpace = "pre-wrap";
        this.hoverDiv.style.textAlign = "left";
        this.hoverDiv.style.zIndex = "10";
        this.hoverDiv.style.width = "auto"; // Allow dynamic width based on content
        this.hoverDiv.style.height = "auto"; // Allow dynamic height based on content
    
        // Optionally, add a smooth transition for dynamic resizing
        this.hoverDiv.style.transition = "all 0.3s ease";
    
        // Position the hover div relative to the target element
        const rect = target.getBoundingClientRect();
        const shadowRect = this.shadowRoot!.host.getBoundingClientRect();
    
        // Calculate the top and left positions
        const topPosition = rect.bottom - shadowRect.top + 5;
        const leftPosition = rect.left - shadowRect.left;
    
        this.hoverDiv.style.top = `${topPosition}px`;
        this.hoverDiv.style.left = `${leftPosition}px`;
    
        // Append the hover div to the shadow root
        this.shadowRoot!.appendChild(this.hoverDiv);
    }
    
    // Method to hide and remove the hover div
    private hideHoverDiv() {
        if (this.hoverDiv) {
            this.hoverDiv.remove();
            this.hoverDiv = null;
        }
    }
}

// Export the class if needed elsewhere
export { TreeTokenVisualizer };