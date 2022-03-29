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