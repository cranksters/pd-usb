export * from './PlaydateDevice';
export * from './Serial';

import { 
  PlaydateDevice,
  PLAYDATE_VID,
  PLAYDATE_PID,
} from './PlaydateDevice';

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
  assert(window.isSecureContext, `WebUSB is only supported in secure contexts\nhttps://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts`);
  assert(navigator.usb !== undefined, `WebUSB is not supported by this browser.\nhttps://developer.mozilla.org/en-US/docs/Web/API/USB#browser_compatibility`);
}

/**
 * Utility function to detect if a USBDevice is a Playdate, based on its vendor and product IDs
 */
export function isUsbDevicePlaydate(device: USBDevice) {
  return device.vendorId === PLAYDATE_VID && device.productId === PLAYDATE_PID;
}

/**
 * Attempt to find Playdates that are already paired via USB. Will return an array of PlaydateDevice objects
 */
export async function getConnectedPlaydates() {
  assertUsbSupported();
  try {
    const devices = await navigator.usb.getDevices();
    return devices
      .filter(isUsbDevicePlaydate)
      .map(device => new PlaydateDevice(device));
  }
  catch(e) {
    return [];
  }
}

/**
 * Request a connection to a Playdate - the browser will prompt the user to select a device. Will return `null` if no device was found or selected
 */
 export async function requestConnectPlaydate() {
  assertUsbSupported();
  try {
    const device = await navigator.usb.requestDevice({
      filters: [{vendorId: PLAYDATE_VID, productId: PLAYDATE_PID }]
    });
    return new PlaydateDevice(device);
  }
  catch(e) {
    return null;
  }
}

/**
 * Call a function whenever a paired Playdate device is connected
 * This will not detect Playdates that haven't been paired yet
 * @param fn 
 */
export function onPlaydateConnected(fn: (device: PlaydateDevice) => any) {
  assertUsbSupported();
  navigator.usb.addEventListener('connect', (e) => {
    if (isUsbDevicePlaydate(e.device)) {
      fn(new PlaydateDevice(e.device));
    }
  });
}

/**
 * Call a function whenever a paired Playdate device is disconnected
 * This will not detect Playdates that haven't been paired yet
 * @param fn 
 */
export function onPlaydateDisconnect(fn: (device: PlaydateDevice) => any) {
  assertUsbSupported();
  navigator.usb.addEventListener('disconnect', (e) => {
    if (isUsbDevicePlaydate(e.device)) {
      fn(new PlaydateDevice(e.device));
    }
  });
}

/**
 * Provides the current version of the playdate-usb library for debugging
 */
export const version = LIBRARY_VERSION; // replaced by @rollup/plugin-replace; see rollup.config.js