export * from './PlaydateDevice';
export * from './PlaydateTypes';
export * from './Serial';

import { PlaydateDevice, PLAYDATE_VID, PLAYDATE_PID } from './PlaydateDevice';
import { assert } from './utils';

/**
 * Check that webUSB is supported in the current environment
 * Returns true if webUSB is supported, false if not
 */
export function isUsbSupported() {
  return window.isSecureContext && navigator.usb !== undefined;
}

/**
 * Assert that webUSB is supported in the current environment
 * This does the same thing as isUsbSupported, but will instead throw a useful error message detailing why webUSB isn't supported
 */
export function assertUsbSupported() {
  assert(window.isSecureContext, 'WebUSB is only supported in secure contexts\nhttps://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts');
  assert(navigator.usb !== undefined, 'WebUSB is not supported by this browser.\nhttps://developer.mozilla.org/en-US/docs/Web/API/USB#browser_compatibility');
}

/**
 * Request a connection to a Playdate - the browser will prompt the user to select a device. Will throw an error if no device was found or selected
 */
 export async function requestConnectPlaydate(): Promise<PlaydateDevice | null> {
  assertUsbSupported();
  const device = await navigator.usb.requestDevice({
    filters: [{vendorId: PLAYDATE_VID, productId: PLAYDATE_PID }]
  });
  return new PlaydateDevice(device);
}

/**
 * Provides the current version of the playdate-usb library for debugging
 */
export const version = LIBRARY_VERSION; // replaced by @rollup/plugin-replace; see rollup.config.js