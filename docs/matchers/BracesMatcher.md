# BracesMatcher

`BracesMatcher` is a TypeScript utility class designed to help you parse and validate matching braces in a stream of characters. It supports customizable sets of opening and closing brace pairs, ensuring that nested structures are correctly matched.

## Usage

### Importing the Class

```typescript
import { BracesMatcher, Braces } from "webastparser/matchers/BracesMatcher";
```

### Defining Brace Pairs

First, define the pairs of braces you want to match. Each pair consists of an `opening` and a `closing` character.

```typescript
const braces: Braces[] = [
    { opening: '(', closing: ')' },
    { opening: '{', closing: '}' },
    { opening: '[', closing: ']' },
];
```

### Creating an Instance

Initialize the `BracesMatcher` with your defined brace pairs.

```typescript
const matcher = new BracesMatcher(braces);
```

### Processing Characters

Use the `.next(ch: string)` method to process each character in your stream. This method returns the current depth of opened braces after processing the character.

```typescript
const input = "{ [ ( ) ] }";
for (const ch of input) {
    try {
        const depth = matcher.next(ch);
        console.log(`Processed '${ch}': Current Depth = ${depth}`);
    } catch (error) {
        console.error(`Error processing '${ch}': ${(error as Error).message}`);
    }
}
```

### Resetting the Matcher

If you need to reset the internal state of the matcher, use the `.reset()` method.

```typescript
matcher.reset();
console.log(`Matcher reset. Current Depth = ${matcher.currentDepth()}`);
```

### Checking Current Depth

At any point, you can check how many braces are currently open using `.currentDepth()`.

```typescript
const currentDepth = matcher.currentDepth();
console.log(`Current Depth: ${currentDepth}`);
```

## Example

Here's a complete example demonstrating how to use the `BracesMatcher` class:

```typescript
import { BracesMatcher, Braces } from 'webastparser/matchers/BracesMatcher';

type Braces = {
    opening: string;
    closing: string;
};

// Define your braces
const braces: Braces[] = [
    { opening: '(', closing: ')' },
    { opening: '{', closing: '}' },
    { opening: '[', closing: ']' },
];

// Initialize the matcher
const matcher = new BracesMatcher(braces);

// Sample input string
const input = "{ [ ( ) ] }";

// Process each character
for (const ch of input) {
    try {
        const depth = matcher.next(ch);
        console.log(`Processed '${ch}': Current Depth = ${depth}`);
    } catch (error) {
        console.error(`Error processing '${ch}': ${(error as Error).message}`);
    }
}

// Check final depth
console.log(`Final Depth: ${matcher.currentDepth()}`);

// Reset the matcher
matcher.reset();
console.log(`Matcher reset. Current Depth = ${matcher.currentDepth()}`);
```

**Output:**
```
Processed '{': Current Depth = 1
Processed ' ': Current Depth = 1
Processed '[': Current Depth = 2
Processed ' ': Current Depth = 2
Processed '(': Current Depth = 3
Processed ' ': Current Depth = 3
Processed ')': Current Depth = 2
Processed ' ': Current Depth = 2
Processed ']': Current Depth = 1
Processed ' ': Current Depth = 1
Processed '}': Current Depth = 0
Final Depth: 0
Matcher reset. Current Depth = 0
```

## Error Handling

The `BracesMatcher` will throw errors in the following scenarios:

1. **Invalid Brace Definitions:**
   - If any opening or closing brace is not exactly one character long.
   - If there are duplicate opening or closing brace characters.

2. **Invalid Input Characters:**
   - If a character passed to `.next()` is not exactly one character long.

3. **Mismatched Braces:**
   - If a closing brace does not match the most recent opening brace.
   - If a closing brace is encountered without any corresponding opening brace.

**Example of Error Handling:**

```typescript
try {
    matcher.next(']'); // Suppose the last opened brace was '(' expecting ')'
} catch (error) {
    console.error((error as Error).message);
}
```

**Output:**
```
Mismatched closing brace "]". Expected ")" to match opening brace "(".
```
