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
 * Resolve promise after a given number of milliseconds
 */
export async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Trigger an instant download of a File blob with a given filename
 */
export const saveAs = (function () {
  const anchor = document.createElement("a");
  return function (blob: Blob, filename:string) {
    const url = window.URL.createObjectURL(blob);
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.URL.revokeObjectURL(url);
  };
})();

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

/**
 * Show a warning in a nicely formatted way
 */
export function warn(msg: string) {
  console.warn(msg);
}

/**
 * Throw an error in a nicely formatted way
 */
export function error(msg: string) {
  console.trace(msg);
  throw new Error(msg);
}

/**
 * Assert condition is true
 */
export function assert(condition: boolean, errMsg = 'Assert failed'): asserts condition {
  if (!condition)
    error(errMsg);
}

/**
 * Assert that a value exists
 */
export function assertExists<T, S = T | null | undefined>(value: S, name=''): S {
  if (value === undefined || value === null)
    error(`Missing object ${ name }`);
  return value;
}

/**
 * Assert that a numerical value is between upper and lower bounds
 */
export function assertRange(value: number, min: number, max: number, name=''): asserts value {
  assert(value >= min && value <= max, `${ name || 'value'} ${ value } should be between ${ min } and ${ max }`);
}