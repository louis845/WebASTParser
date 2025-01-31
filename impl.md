# Implemented parsers

## 1. **Common Structure**
All three parsers (`PythonParser`, `JavaParser`, and `TypeScriptParser`) extend a common structure based on the provided blueprint. They include:

- **Properties:**
  - `numChars`: Total number of characters in the source code.
  - `code`: The source code string being parsed.
  - Language-specific state variables to manage parsing states.

- **Methods:**
  - `getCharacterFromIndex`: Retrieves a character from the source code based on the provided index.
  - `preparse`: Prepares the parser, typically by detecting indentation.
  - `resetDetectionState`: Resets any language-specific states before parsing a new symbol.
  - `isCommentBeforeFunction`: Determines if comments are placed before function declarations.
  - `detectTopLevelSymbol`, `detectClassesSymbol`, `detectFunctionsSymbol`, `detectFunctionBodySymbol`, `detectFunctionDeclarationSymbol`: Abstract methods implemented to detect specific symbols based on the current character and parsing state.

## 2. **Language-Specific Implementations**

### **PythonParser**
- **Comments:**
  - Single-line comments start with `#`.
  - Multi-line comments are enclosed within `'''` or `"""`.
  
- **Classes:**
  - Defined using the `class` keyword.
  
- **Functions:**
  - Defined using the `def` keyword.
  
- **Attributes:**
  - Detected as assignments within classes.
  
- **Filler:**
  - Covers executable statements and miscellaneous code.

### **JavaParser**
- **Comments:**
  - Single-line comments start with `//`.
  - Multi-line comments are enclosed within `/*` and `*/`.
  
- **Classes:**
  - Defined using access modifiers (`public`, `private`, `protected`) followed by the `class` keyword.
  
- **Functions (Methods):**
  - Methods are defined within classes with access modifiers and may include return types.
  
- **Attributes:**
  - Detected as field declarations within classes.
  
- **Filler:**
  - Covers executable statements and miscellaneous code outside classes.

### **TypeScriptParser**
- **Comments:**
  - Single-line comments start with `//`.
  - Multi-line comments are enclosed within `/*` and `*/`.
  
- **Classes:**
  - Defined using the `class` keyword.
  
- **Functions:**
  - Functions can be top-level and are defined using the `function` keyword.
  
- **Attributes:**
  - Detected as field declarations within classes.
  
- **Filler:**
  - Covers executable statements and miscellaneous code outside classes.

## 3. **Error Handling**
Each parser throws a `CodeParsingError` if it encounters unexpected structures, such as missing opening or closing braces.

## 4. **Info Object**
The `info` object in each detection method contains relevant information about the detected symbol, such as names, types, arguments, and text content. For non-terminal symbols, it also includes the `innerRange` to specify the range of characters that constitute the symbol's internal structure.

## 5. **Parse Range**
For non-terminal symbols (like classes and functions), the `parseRange` defines the range of characters to be parsed in subsequent recursive calls. Terminal symbols have `parseRange` set to `null` as they don't require further parsing.
