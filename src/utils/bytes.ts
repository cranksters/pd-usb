
/**
 * Convert an Uint8Array of bytes to an ascii string
 */
export function bytesToString(bytes: Uint8Array) {
  let result = '';
  const size = bytes.byteLength;
  for (let i = 0; i < size; i++)
    result += String.fromCharCode(bytes[i]);
  return result;
}

/**
 * Convert an ascii string to an Uint8Array of bytes
 */
export function stringToBytes(str: string) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++)
    bytes[i] = str.charCodeAt(i);
  return bytes;
}

export function bytesPos(haystack: Uint8Array, needle: Uint8Array, ptr = 0) {
  search: while (true) {
    let start = haystack.indexOf(needle[0], ptr);
    if (start === -1)
      return -1;
  
    ptr = start;
    for (let i = 1; i < needle.length; i++) {
      if (haystack[ptr + i] !== needle[i]) {
        ptr += 1;
        continue search;
      }
    }
    // found a match
    return ptr;
  }
}

export function mergeByteChunks(chunks: Uint8Array[]) {
  const size = chunks.reduce((s, bytes) => s + bytes.length, 0);
  const result = new Uint8Array(size);
  for (let ptr = 0, i = 0; i < chunks.length; i++) {
    result.set(chunks[i], ptr);
    ptr += chunks[i].length;
  }
  return result;
}