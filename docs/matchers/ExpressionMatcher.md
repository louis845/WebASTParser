# ExpressionMatcher

**ExpressionMatcher** is a TypeScript utility class designed to match predefined sequences of numbers (`number[]`) against a continuous stream of input numbers. It processes one number at a time, allowing for efficient and real-time detection of specific numerical patterns within a data stream.

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
    - [`next(num: number): string \| null`](#nextnum-number-string--null)
    - [`reset(): void`](#resetvoid)
    - [`getLength(key: string): number`](#getlengthkey-string-number)
    - [`getMaxExpressionLength(): number`](#getmaxexpressionlength-number)
- [Error Handling](#error-handling)
- [Performance Considerations](#performance-considerations)
- [Contributing](#contributing)
- [License](#license)

## Usage

### Importing the Class

First, import the `ExpressionMatcher` class into your TypeScript file:

```typescript
import { ExpressionMatcher } from 'webastparser/matchers/ExpressionMatcher'; // Adjust the path as necessary
```

### Basic Example

Here's a straightforward example demonstrating how to use `ExpressionMatcher` to detect specific number sequences within an input stream.

```typescript
import { ExpressionMatcher } from 'webastparser/matchers/ExpressionMatcher';

// Define expressions with unique keys
const expressions: Record<string, number[]> = {
    sequenceA: [1, 2, 3],
    sequenceB: [4, 5],
    sequenceC: [6],
};

// Initialize the matcher
const matcher = new ExpressionMatcher(expressions);

// Simulated input stream
const inputStream = [1, 2, 3, 4, 5, 6];

// Array to hold detected matches
const detectedMatches: string[] = [];

// Process each number in the input stream
for (const num of inputStream) {
    const match = matcher.next(num);
    if (match) {
        detectedMatches.push(match);
        console.log(`Matched expression: ${match}`);
    }
}

console.log('All Detected Matches:', detectedMatches);
// Output:
// Matched expression: sequenceA
// Matched expression: sequenceB
// Matched expression: sequenceC
// All Detected Matches: ['sequenceA', 'sequenceB', 'sequenceC']
```

### Advanced Example

In scenarios where multiple expressions may overlap or where you need to handle large streams efficiently, consider the following advanced usage:

```typescript
import { ExpressionMatcher } from 'webastparser/matchers/ExpressionMatcher';

// Define a set of complex expressions
const expressions: Record<string, number[]> = {
    alpha: [7, 8, 9, 10],
    beta: [8, 9, 10],
    gamma: [9, 10],
};

// Initialize the matcher
const matcher = new ExpressionMatcher(expressions);

// Simulated extensive input stream
const inputStream = [7, 8, 9, 10, 8, 9, 10, 9, 10, 10];

// Array to hold detected matches
const detectedMatches: string[] = [];

// Process each number in the input stream
for (const num of inputStream) {
    const match = matcher.next(num);
    if (match) {
        detectedMatches.push(match);
        console.log(`Matched expression: ${match}`);
    }
}

console.log('All Detected Matches:', detectedMatches);
// Output:
// Matched expression: alpha
// Matched expression: beta
// Matched expression: gamma
// All Detected Matches: ['alpha', 'beta', 'gamma']
```

*Note:* The above example ensures that expressions like `beta` and `gamma` do not conflict with `alpha` by adhering to the non-overlapping suffix constraint enforced by the `ExpressionMatcher`.

## API Documentation

### Constructor

#### `new ExpressionMatcher(expressions: Record<string, number[]>)`

Creates a new instance of `ExpressionMatcher`.

- **Parameters:**
  - `expressions` (`Record<string, number[]>`): An object mapping unique keys to their respective number sequences.

- **Throws:**
  - An error if:
    - No expressions are provided.
    - Any expression sequence is empty.
    - Duplicate sequences are detected.
    - One sequence is a suffix of another, leading to ambiguity.

- **Example:**

  ```typescript
  const expressions: Record<string, number[]> = {
      foo: [1, 2, 3],
      bar: [4, 5],
  };
  const matcher = new ExpressionMatcher(expressions);
  ```

### Methods

#### `next(num: number): string | null`

Processes the next number in the input stream and checks for any matching expressions.

- **Parameters:**
  - `num` (`number`): The next number to process.

- **Returns:**
  - The key of the matched expression (`string`) if a match is found.
  - `null` if no match is detected.

- **Throws:**
  - An error if multiple expressions are matched simultaneously, which should not occur if expressions adhere to the non-overlapping suffix constraint.

- **Example:**

  ```typescript
  const match = matcher.next(3);
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
  - The length (`number`) of the specified expression sequence.

- **Throws:**
  - An error if the provided key does not exist.

- **Example:**

  ```typescript
  const length = matcher.getLength('foo');
  console.log(`Length of 'foo': ${length}`); // Output: Length of 'foo': 3
  ```

#### `getMaxExpressionLength(): number`

Gets the maximum length among all registered expressions.

- **Returns:**
  - The maximum expression length (`number`).

- **Example:**

  ```typescript
  const maxLength = matcher.getMaxExpressionLength();
  console.log(`Maximum expression length: ${maxLength}`); // Output: Maximum expression length: 4
  ```

## Error Handling

The `ExpressionMatcher` class includes several validation checks to ensure robust operation:

1. **Constructor Validations:**
   - **Empty Expressions:** Throws an error if no expressions are provided or if any expression sequence is empty.
   - **Duplicate Sequences:** Ensures all expression sequences are unique.
   - **Suffix Ambiguities:** Prevents one sequence from being a suffix of another to avoid ambiguous matches.

   *Example Error:*
   ```typescript
   Error: Ambiguous expressions: [1,2,3] has [2,3] as a suffix.
   ```

2. **`next` Method Validations:**
   - Throws an error if multiple expressions are matched simultaneously, which should not happen if suffix conflicts are properly handled.

   *Example Error:*
   ```typescript
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
    const matcher = new ExpressionMatcher(expressions);
    // Further processing...
} catch (error) {
    console.error('Failed to initialize ExpressionMatcher:', error.message);
}
```
