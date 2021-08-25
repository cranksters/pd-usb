import { PlaydateDevice } from './PlaydateDevice';

export const version = LIBRARY_VERSION; // replaced by @rollup/plugin-replace; see rollup.config.js

const global = (window as any);

async function usbInit() {
  const device = await PlaydateDevice.requestDevice();
  global.device = device;
  await device.open();
  const version = await device.getVersion();
  console.log(version)
  console.log(device)
}

// navigator.usb.addEventListener('connect', event => {
//   console.log('connected', event.device);
// });

// navigator.usb.addEventListener('disconnect', event => {
//   console.log('disconnected', event.device);
// });


global.usbInit = usbInit;

global.PlaydateDevice = PlaydateDevice;