export interface Range {
    start_line: number;
    start_character: number;
    end_line: number;
    end_character: number;
}

export interface Index {
    line: number;
    character: number;
}

export type CharacterRange = {
    start: number, end: number
}

/**
 * Splits a code string into an array of lines, handling different newline characters.
 * @param codeString The source code as a single string.
 * @returns An array of strings, each representing a line of the source code.
 */
export function splitIntoLines(codeString: string): string[] {
    // Handle both Windows (\r\n) and Unix (\n) newline characters
    return codeString.split(/\r?\n/);
}

/**
 * Converts a Range to start and end Index objects.
 * @param range The range to convert.
 * @returns An object containing start and end Index.
 */
export function rangeToIndexes(range: Range): { start: Index; end: Index } {
    return {
        start: { line: range.start_line, character: range.start_character },
        end: { line: range.end_line, character: range.end_character },
    };
}

/**
 * Extracts the start index from the range
 * @param range The range
 * @returns The start index
 */
export function rangeToStartIndex(range: Range): Index {
    return { line: range.start_line, character: range.start_character };
}

/**
 * Extracts the end index from the range
 * @param range The range
 * @returns The end index
 */
export function rangeToEndIndex(range: Range): Index {
    return { line: range.end_line, character: range.end_character };
}

/**
 * Converts start and end Index objects to a Range.
 * @param start The starting Index.
 * @param end The ending Index.
 * @returns The corresponding Range.
 */
export function indexesToRange(start: Index, end: Index): Range {
    return {
        start_line: start.line,
        start_character: start.character,
        end_line: end.line,
        end_character: end.character,
    };
}

/**
 * Retrieves the character at the specified Index.
 * @param codeLines The source code split into lines.
 * @param index The Index specifying the position.
 * @returns The character at the Index, or "\n" if at the end of a line.
 */
export function getCharacter(codeLines: string[], index: Index): string {
    const { line, character } = index;
    if (line < 0 || line >= codeLines.length) {
        throw new Error(`Invalid line number: ${line}`);
    }
    const lineContent = codeLines[line];
    if (character < 0 || character > lineContent.length) {
        throw new Error(`Invalid character position: ${character} in line ${line}`);
    }
    if (character === lineContent.length) {
        return "\n";
    }
    return lineContent.charAt(character);
}

/**
 * Retrieves the maximum range of the source code.
 * @param codeLines The source code split into lines.
 * @returns The maximum Range covering the entire source code.
 */
export function getMaxRange(codeLines: string[]): Range {
    if (codeLines.length === 0) {
        return {
            start_line: 0,
            start_character: 0,
            end_line: 0,
            end_character: 0,
        };
    }
    return {
        start_line: 0,
        start_character: 0,
        end_line: codeLines.length,
        end_character: 0,
    };
}

/**
 * Gets the next Index after the given Index. If the next index is (codeLines.length, 0), this is supported (dummy end index that if passed to getCharacter throws error).
 * @param codeLines The source code split into lines.
 * @param index The current Index.
 * @returns The next Index.
 */
export function next(codeLines: string[], index: Index): Index {
    const { line, character } = index;
    if (line >= codeLines.length) {
        throw Error("The next index will be completely out of bounds!");
    }
    if (line < 0) {
        throw Error("Invalid line!");
    }

    if (character < codeLines[line].length) {
        return { line, character: character + 1 };
    } else if (character === codeLines[line].length) {
        return { line: line + 1, character: 0 };
    } else {
        throw new Error(`Invalid character position: ${character} in line ${line}`);
    }
}

/**
 * Utility function to check if two ranges are adjacent.
 * @param range1 First range.
 * @param range2 Second range.
 * @returns True if range1 is immediately before range2, false otherwise.
 */
export function areRangesAdjacent(range1: Range, range2: Range): boolean {
    return (
        range1.end_line === range2.start_line &&
        range1.end_character === range2.start_character
    );
}

/**
 * Utility function to compare two indices.
 * @param index1 The first index
 * @param index2 The second index
 * @returns Returns -1,0,1, when index1 < index2, index1 == index2, index1 > index2 respectively
 */
export function compare(index1: Index, index2: Index): number {
    if (index1.line < index2.line) {
        return -1;
    } else if (index2.line < index1.line) {
        return 1;
    } else {
        if (index1.character < index2.character) {
            return -1;
        } else if (index2.character < index1.character) {
            return 1;
        } else {
            return 0;
        }
    }
}

/**
 * Utility function to merge multiple ranges into a single range.
 * Assumes that the ranges are sorted and contiguous.
 * @param ranges Array of ranges to merge.
 * @returns A single merged range.
 */
export function mergeRanges(ranges: Range[]): Range {
    if (ranges.length === 0) {
        throw new Error("No ranges to merge.");
    }

    let {start, end} : {start: Index, end: Index} = rangeToIndexes(ranges[0]);
    for (let i = 1; i < ranges.length; i++) {
        let {start: start2, end: end2} : {start: Index, end: Index} = rangeToIndexes(ranges[i]);
        if (compare(start2, start) == -1) { // start2 < start
            start = start2;
        }
        if (compare(end, end2) == -1) { // end < end2
            end = end2;
        }
    }

    return {
        start_line: start.line,
        start_character: start.character,
        end_line: end.line,
        end_character: end.character,
    };
}

/**
 * Utility function to see if a range (not necessarily strictly) contains another range.
 * @param biggerRange The bigger range
 * @param insideRange The inside range
 * @returns Whether biggerRange (not necessarily strictly) contains insideRange.
 */
export function contains(biggerRange: Range, insideRange: Range) {
    return (compare(rangeToIndexes(biggerRange).start, rangeToIndexes(insideRange).start) <= 0) && // biggerRange.start <= insideRange.start
        (compare(rangeToIndexes(insideRange).end, rangeToIndexes(biggerRange).end) <= 0) // insideRange.end <= biggerRange.end
}

/**
 * Returns whether the range contains the index.
 * @param range Range
 * @param index Index
 * @returns Whether range contains index.
 */
export function containsIndex(range: Range, index: Index): boolean {
    return (compare(rangeToIndexes(range).start, index) <= 0) // range.start <= index
        && (compare(index, rangeToIndexes(range).end) < 0) // index < range.end
}