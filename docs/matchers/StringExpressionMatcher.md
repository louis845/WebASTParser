# StringExpressionMatcher

**StringExpressionMatcher** is a TypeScript utility class designed to match predefined string expressions against a continuous stream of input characters. It processes one character at a time, enabling efficient and real-time detection of specific patterns within a data stream.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
  - [Importing the Class](#importing-the-class)
  - [Basic Example](#basic-example)
  - [Advanced Example](#advanced-example)
- [API Documentation](#api-documentation)
  - [Constructor](#constructor)
  - [Methods](#methods)
    - [`next(ch: string): string \| null`](#nextch-string-string--null)
    - [`reset(): void`](#resetvoid)
    - [`getLength(key: string): number`](#getlengthkey-string-number)
    - [`getMaxExpressionLength(): number`](#getmaxexpressionlength-number)
- [Error Handling](#error-handling)
- [Performance Considerations](#performance-considerations)
- [Contributing](#contributing)
- [License](#license)

## Usage

### Importing the Class

First, import the `StringExpressionMatcher` class into your TypeScript file:

```typescript
import { StringExpressionMatcher } from 'webastparser/matchers/StringExpressionMatcher'; // Adjust the path as necessary
```

### Basic Example

Here's a straightforward example demonstrating how to use `webastparser/matchers/StringExpressionMatcher` to detect specific string sequences within an input stream.

```typescript
import { StringExpressionMatcher } from 'webastparser/matchers/StringExpressionMatcher';

// Define expressions with unique keys
const expressions: Record<string, string> = {
    greeting: "hello",
    farewell: "bye",
    question: "how are you",
};

// Initialize the matcher
const matcher = new StringExpressionMatcher(expressions);

// Simulated input stream
const inputStream = "h", "e", "l", "l", "o", "b", "y", "e", "h", "o", "w", " ", "a", "r", "e", " ", "y", "o", "u";

// Array to hold detected matches
const detectedMatches: string[] = [];

// Process each character in the input stream
for (const ch of inputStream) {
    const match = matcher.next(ch);
    if (match) {
        detectedMatches.push(match);
        console.log(`Matched expression: ${match}`);
    }
}

console.log('All Detected Matches:', detectedMatches);
// Output:
// Matched expression: greeting
// Matched expression: farewell
// Matched expression: question
// All Detected Matches: ['greeting', 'farewell', 'question']
```

### Advanced Example

In scenarios where multiple expressions may overlap or where you need to handle large streams efficiently, consider the following advanced usage:

```typescript
import { StringExpressionMatcher } from 'webastparser/matchers/StringExpressionMatcher';

// Define a set of complex expressions
const expressions: Record<string, string> = {
    welcome: "welcome",
    come: "come",
    me: "me",
    helloWorld: "hello world",
    world: "world",
};

// Initialize the matcher
const matcher = new StringExpressionMatcher(expressions);

// Simulated extensive input stream
const inputStream = "h", "e", "l", "l", "o", " ", "w", "o", "r", "l", "d", "c", "o", "m", "e", "m", "e";

// Array to hold detected matches
const detectedMatches: string[] = [];

// Process each character in the input stream
for (const ch of inputStream) {
    const match = matcher.next(ch);
    if (match) {
        detectedMatches.push(match);
        console.log(`Matched expression: ${match}`);
    }
}

console.log('All Detected Matches:', detectedMatches);
// Output:
// Matched expression: helloWorld
// Matched expression: world
// Matched expression: come
// Matched expression: me
// All Detected Matches: ['helloWorld', 'world', 'come', 'me']
```

*Note:* The above example ensures that expressions like `come` and `me` do not conflict with `welcome` or `helloWorld` by adhering to the non-overlapping suffix constraint enforced by the `StringExpressionMatcher`.

## API Documentation

### Constructor

#### `new StringExpressionMatcher(expressions: Record<string, string>)`

Creates a new instance of `StringExpressionMatcher`.

- **Parameters:**
  - `expressions` (`Record<string, string>`): An object mapping unique keys to their respective string expressions.

- **Throws:**
  - An error if:
    - No expressions are provided.
    - Any expression string is empty.
    - Duplicate expressions are detected.
    - One expression is a suffix of another, leading to ambiguity.

- **Example:**

  ```typescript
  const expressions: Record<string, string> = {
      foo: "foobar",
      bar: "bar",
  };
  const matcher = new StringExpressionMatcher(expressions);
  ```

### Methods

#### `next(ch: string): string | null`

Processes the next character in the input stream and checks for any matching expressions.

- **Parameters:**
  - `ch` (`string`): The next character to process. Must be a single character string.

- **Returns:**
  - The key of the matched expression (`string`) if a match is found.
  - `null` if no match is detected.

- **Throws:**
  - An error if the input character is not a single character string.
  - An error if multiple expressions are matched simultaneously, which should not occur if expressions adhere to the non-overlapping suffix constraint.

- **Example:**

  ```typescript
  const match = matcher.next('f');
  if (match) {
      console.log(`Matched: ${match}`);
  }
  ```

#### `reset(): void`

Resets the internal state of the matcher, clearing any ongoing match progress. This is useful to restart the matching process or prevent overlapping matches.

- **Example:**

  ```typescript
  matcher.reset();
  ```

#### `getLength(key: string): number`

Retrieves the length of the expression associated with the given key.

- **Parameters:**
  - `key` (`string`): The key of the expression.

- **Returns:**
  - The length (`number`) of the specified expression string.

- **Throws:**
  - An error if the provided key does not exist.

- **Example:**

  ```typescript
  const length = matcher.getLength('foo');
  console.log(`Length of 'foo': ${length}`); // Output: Length of 'foo': 6
  ```

#### `getMaxExpressionLength(): number`

Gets the maximum length among all registered expressions.

- **Returns:**
  - The maximum expression length (`number`).

- **Example:**

  ```typescript
  const maxLength = matcher.getMaxExpressionLength();
  console.log(`Maximum expression length: ${maxLength}`); // Output: Maximum expression length: 11
  ```

## Error Handling

The `StringExpressionMatcher` class includes several validation checks to ensure robust operation:

1. **Constructor Validations:**
   - **Empty Expressions:** Throws an error if no expressions are provided or if any expression string is empty.
   - **Duplicate Expressions:** Ensures all expression strings are unique.
   - **Suffix Ambiguities:** Prevents one expression from being a suffix of another to avoid ambiguous matches.

   *Example Error:*
   ```typescript
   Error: Ambiguous expressions: "foobar" has "bar" as a suffix.
   ```

2. **`next` Method Validations:**
   - Throws an error if multiple expressions are matched simultaneously, which should not happen if suffix conflicts are properly handled.
   - Throws an error if the input character is not a single character string.

   *Example Errors:*
   ```typescript
   Error: Input to next() must be a single character. Received: "ab"
   Error: Multiple matches detected, which violates non-overlapping suffix constraint.
   ```

3. **Method-Specific Errors:**
   - Methods like `getLength` throw errors if queried with non-existent keys.

   *Example Error:*
   ```typescript
   Error: Expression with key "unknown" does not exist.
   ```

**Handling Errors:**

Ensure to wrap critical sections of your code with try-catch blocks to gracefully handle potential errors.

```typescript
try {
    const matcher = new StringExpressionMatcher(expressions);
    // Further processing...
} catch (error) {
    console.error('Failed to initialize StringExpressionMatcher:', error.message);
}
```
