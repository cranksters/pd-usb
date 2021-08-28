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
