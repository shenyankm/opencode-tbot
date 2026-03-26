export function stripUtf8ByteOrderMark(input: string): string {
    return input.charCodeAt(0) === 0xfeff
        ? input.slice(1)
        : input;
}
