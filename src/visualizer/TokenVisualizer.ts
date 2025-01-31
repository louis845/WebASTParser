import { Token, TokenType } from "../parsing/ParsingTypes";

const TOKEN_COLORS: { [key in TokenType]: string[] } = {
    [TokenType.MULTILINE_COMMENTS_OR_STRINGS]: ["#ffeb3b", "#efdb2b"], // Yellow
    [TokenType.SINGLELINE_COMMENTS]: ["#c8e6c9", "#b8d6b9"], // Light Green
    [TokenType.STRINGS]: ["#bbdefb", "#abceeb"], // Light Blue
    [TokenType.SPACINGS]: ["#f0f0f0", "#e0e0e0"], // Light Gray
    [TokenType.BRACES]: ["#ffcdd2", "#efbdc2"], // Light Red
    [TokenType.COMMAS]: ["#e0ffff", "#d0efef"], // Light Cyan
    [TokenType.OTHERS]: ["#d1c4e9", "#c1b4d9"], // Light Purple
    [TokenType.CONTINUATION]: ["#ff0000", "#ff0000"], // Red, since this is not expected
};

class TokenVisualizer extends HTMLElement {
    private tokens: Token[] = [];
    private container: HTMLElement;

    constructor(initialTokens: Token[] = []) {
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

    // Method to update tokens and re-render
    public update(toks: Token[]) {
        this.tokens = toks;
        this.render();
    }

    // Render the tokens into the container
    private render() {
        // Clear existing content
        this.container.innerHTML = "";

        let count: number = 0;
        this.tokens.forEach(token => {
            const tokenType = token.tokenType;
            const bgColor = TOKEN_COLORS[tokenType] || "#ffffff";
            const borderColor = "#00000033"; // Very soft black border

            // Split the stringContents by '\n' to handle newlines
            const parts = token.stringContents.split("\n");
            parts.forEach((part, index) => {
                const span = document.createElement("span");
                span.textContent = part;

                span.style.backgroundColor = bgColor[count % 2];
                span.style.border = `1px solid ${borderColor}`;
                span.style.borderRadius = "3px";
                span.style.padding = "2px 4px";
                span.style.margin = "1px";
                span.style.display = "inline-block";

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
            count++;
        });
    }
}

// Export the class if needed elsewhere
export { TokenVisualizer };