const KEY_VAL_REGEX = /^\s*([^=]+?)\s*=\s*(.*?)\s*$/;

/**
 * Parse a 'key=value' string into an array of [key, value], or just return the string if it couldn't be parsed
 */
export function parseKeyVal(str: string) {
  if (KEY_VAL_REGEX.test(str)) {
    const match = str.match(KEY_VAL_REGEX);
    return [match[1], match[2]];
  }
  return str;
}

/**
 * Split a string into an array of lines
 */
export function splitLines(str: string) {
  return str.split(/[\r\n]+/).filter(ln => ln !== '')
}

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