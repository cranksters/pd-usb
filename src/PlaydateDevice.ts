import { Serial } from './Serial';
import { warn, error, assert, splitLines, parseKeyVal, saveAs, bytesToString } from './utils';

// Playdate USB vendor and product IDs
const PLAYDATE_VID = 0x1331;
const PLAYDATE_PID = 0x5740;
// Playdate screen dimensions
const PLAYDATE_WIDTH = 400;
const PLAYDATE_HEIGHT = 240;

export interface PlaydateVersion {
  sdk: string;
  build: string;
  bootBuild: string;
  cc: string;
  pdxVersion: string;
  serial: string;
  target: string;
};

export class PlaydateDevice {

  device: USBDevice;
  serial: Serial;
  logCommandResponse = false;

  constructor(device: USBDevice) {
    this.device = device;
    this.serial = new Serial(device);
  }

  /**
   * Attempt to pair a Playdate device connected via USB.
   * Returns a PlaydateDevice instance upon connection. If no connection could be made, null will be returned instead.
   * @returns 
   */
  static async requestDevice() {
    try {
      assert(window.isSecureContext, `WebUSB is only supported in secure contexts\nhttps://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts`);
      assert(navigator.usb !== undefined, `WebUSB is not supported by this browser.\nhttps://developer.mozilla.org/en-US/docs/Web/API/USB#browser_compatibility`);
      const device = await navigator.usb.requestDevice({
        filters: [{vendorId: PLAYDATE_VID, productId: PLAYDATE_PID }]
      });
      return new PlaydateDevice(device);
    }
    catch(e) {
      warn(`Could not connect to Playdate: ${ e.message }`);
      return null;
    }
  }

  async open() {
    await this.serial.open();
    await this.setEcho('off');
  }

  async close() {
    await this.serial.close();
  }

  async runCommand(command: string) {
    await this.serial.writeAscii(`${ command }\n`);
    const str = await this.serial.readAscii();
    if (this.logCommandResponse) {
      const lines = splitLines(str);
      console.log(lines.join('\n'));
    }
    return str;
  }

  async help() {
    return await this.runCommand('help');
  }

  async setEcho(echoState: 'on' | 'off') {
    const str = await this.runCommand(`echo ${ echoState }`);
    assert(str.startsWith('\r\n'), `Invalid echo command response`);
  }

  async getVersion(): Promise<PlaydateVersion> {
    const str = await this.runCommand(`version`);
    const lines = splitLines(str);
    const parsed: Record<string, string> = {};
    // split key=value lines into object
    lines.forEach(line => {
      const kv = parseKeyVal(line);
      if (Array.isArray(kv)) {
        const key = kv[0];
        const value = kv[1];
        parsed[key] = value;
      }
    });
    // check all the keys we want are present
    assert('SDK' in parsed);
    assert('boot_build' in parsed);
    assert('build' in parsed);
    assert('cc' in parsed);
    assert('pdxversion' in parsed);
    assert('serial#' in parsed);
    assert('target' in parsed);
    // format keys as an object
    return {
      sdk: parsed['SDK'],
      bootBuild: parsed['boot_build'],
      build: parsed['build'],
      cc: parsed['cc'],
      pdxVersion: parsed['pdxversion'],
      serial: parsed['serial#'],
      target: parsed['target'],
    };
  }

  async getScreen() {
    await this.serial.writeAscii(`screen\n`);
    const bytes = await this.serial.read();
    assert(bytes.byteLength >= 12011, 'Screen command response is too short');
    const header = bytesToString(bytes.subarray(0, 11));
    const bitmap = bytes.subarray(11, 12011);
    assert(header.includes('~screen:'), 'Invalid screen command response');
    return bitmap;
  }

  async getScreenIndexed() {
    const bitmap = await this.getScreen();
    const bitmapSize = bitmap.byteLength;
    const indexed = new Uint8Array(PLAYDATE_WIDTH * PLAYDATE_HEIGHT);
    let srcPtr = 0;
    let dstPtr = 0;
    while (srcPtr < bitmapSize) {
      const chunk = bitmap[srcPtr++];
      for (let b = 7; b >= 0; b--) {
        indexed[dstPtr++] = (chunk >> b) & 0x1;
      }
    }
    return indexed;
  }

  async getScreenRgba(palette = [0x000000FF, 0xFFFFFFFF]) {
    const indexed = await this.getScreenIndexed();
    const rgba = new Uint32Array(indexed.length);
    for (let i = 0; i < indexed.length; i++) {
      rgba[i] = palette[indexed[i]];
    }
    return rgba;
  }

  // TODO: simplify palette to either black+white or approximate
  async drawScreenToCanvas(ctx: CanvasRenderingContext2D, palette = [0xFF000000, 0xFFFFFFFF]) {
    const indexed = await this.getScreenIndexed();
    const imgData = ctx.createImageData(PLAYDATE_WIDTH, PLAYDATE_HEIGHT);
    const rgba = new Uint32Array(imgData.data.buffer);
    for (let i = 0; i < indexed.length; i++) {
      rgba[i] = palette[indexed[i]];
    }
    ctx.putImageData(imgData, 0, 0);
  }

  // TODO: remove
  async screenDebug() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = PLAYDATE_WIDTH;
    canvas.height = PLAYDATE_HEIGHT;
    await this.drawScreenToCanvas(ctx);
    document.body.appendChild(canvas);
  }
}