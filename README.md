# WebASTParser

**WebASTParser** is a language-agnostic TypeScript library designed to analyze and summarize source code files from various programming languages. It provides a high-level representation of code structures, making it ideal for documenting and summarizing Git repositories for documentation websites or other purposes.

# Parsing workflow

```
AbstractTokenizer -> AbstractParser -> ASTGenericTokenizer
```

```
string -> Token[] -> AbstractSyntaxTree -> TreeToken[]
```

# Sample implementation of abstract classes
See `src/impl/`

# Sample usage of parsers and tokenizers
See `src/visualizer` and `visualizations/`