export * from './PlaydateDevice';
export * from './PlaydateTypes';
export * from './Serial';

import { PDButton } from './PlaydateTypes';
import { PlaydateDevice } from './PlaydateDevice';
import { assert } from './utils';

/**
 * Check that Web Serial is supported in the current environment
 * Returns true if Web Serial is supported, false if not
 */
export function isUsbSupported() {
  return window.isSecureContext && navigator.serial !== undefined;
}

/**
 * Assert that Web Serial is supported in the current environment
 * This does the same thing as isUsbSupported, but will instead throw a useful error message detailing why Web Serial isn't supported
 */
export function assertUsbSupported() {
  assert(window.isSecureContext, 'Web Serial is only supported in secure contexts\nhttps://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts');
  assert(navigator.serial !== undefined, 'Web Serial is not supported by this browser.\nhttps://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API#browser_compatibility');
}

/**
 * Request a connection to a Playdate - the browser will prompt the user to select a device. Will throw an error if no device was found or selected
 */
export async function requestConnectPlaydate() {
  assertUsbSupported();
  return await PlaydateDevice.requestDevice();
}

/**
 * Button constants for input state methods
 */
export const kButtonLeft = PDButton.kButtonLeft;
export const kButtonRight = PDButton.kButtonRight;
export const kButtonUp = PDButton.kButtonUp;
export const kButtonDown = PDButton.kButtonDown;
export const kButtonB = PDButton.kButtonB;
export const kButtonA = PDButton.kButtonA;
export const kButtonMenu = PDButton.kButtonMenu;
export const kButtonLock = PDButton.kButtonLock;

/**
 * Provides the current version of the pd-usb library for debugging
 */
export const version = LIBRARY_VERSION; // replaced by @rollup/plugin-replace; see rollup.config.js