import { Serial } from './Serial';
import { warn, assert, splitLines, parseKeyVal, bytesToString } from './utils';

// Playdate USB vendor and product IDs
export const PLAYDATE_VID = 0x1331;
export const PLAYDATE_PID = 0x5740;

// Playdate screen dimensions
export const PLAYDATE_WIDTH = 400;
export const PLAYDATE_HEIGHT = 240;

/**
 * Playdate version information, retrieved by getVersion()
 */
export interface PlaydateVersion {
  sdk: string;
  build: string;
  bootBuild: string;
  cc: string;
  pdxVersion: string;
  serial: string;
  target: string;
};

/**
 * Represents a Playdate device connected over USB, and provides some methods for communicating with it
 */
export class PlaydateDevice {

  device: USBDevice;
  serial: Serial;
  logCommandResponse = false;

  constructor(device: USBDevice) {
    this.device = device;
    this.serial = new Serial(device);
  }

  /**
   * Indicates whether the Playdate is open or close to reading/writing
   */
  get isOpen() {
    return this.serial.isOpen;
  }

  /**
   * Open a device for communication
   */
  async open() {
    await this.serial.open();
    await this.setEcho('off');
  }

  /**
   * Close a device for communication
   */
  async close() {
    await this.serial.close();
  }

  /**
   * Set the console echo state. By default, this is set to 'off' while opening the device.
   */
  async setEcho(echoState: 'on' | 'off') {
    const str = await this.runCommand(`echo ${ echoState }`);
    if (echoState === 'off')
      assert(str.startsWith('\r\n'), `Invalid echo command response`);
  }

  /**
   * Get version information about the Playdate; its OS build info, SDK version, serial number, etc 
   */
  async getVersion(): Promise<PlaydateVersion> {
    const str = await this.runCommand('version');
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

  /**
   * Capture a screenshot from the Playdate, and get the raw framebuffer
   * This will return the 1-bit framebuffer data as an Uint8Array of bytes. Each byte in the array will represent 8 pixels
   * The framebuffer is 400 x 240 pixels
   */
  async getScreen() {
    await this.serial.writeAscii('screen\n');
    const bytes = await this.serial.read();
    assert(bytes.byteLength >= 12011, 'Screen command response is too short');
    const header = bytesToString(bytes.subarray(0, 11));
    const frameBuffer = bytes.subarray(11, 12011);
    assert(header.includes('~screen:'), 'Invalid screen command response');
    return frameBuffer;
  }

  /**
   * Capture a screenshot from the Playdate, and get the unpacked framebuffer
   * This will return an 8-bit indexed framebuffer as an Uint8Array. Each element of the array will represent a single pixel; `0` for white, `1` for black
   * The framebuffer is 400 x 240 pixels
   */
  async getScreenIndexed() {
    const framebuffer = await this.getScreen();
    const framebufferSize = framebuffer.byteLength;
    const indexed = new Uint8Array(PLAYDATE_WIDTH * PLAYDATE_HEIGHT);
    let srcPtr = 0;
    let dstPtr = 0;
    while (srcPtr < framebufferSize) {
      const chunk = framebuffer[srcPtr++];
      // unpack each bit of the chunk
      for (let shift = 7; shift >= 0; shift--) {
        indexed[dstPtr++] = (chunk >> shift) & 0x1;
      }
    }
    return indexed;
  }

  /**
   * Capture a screenshot from the Playdate, and get the unpacked RGBA framebuffer
   * This will return an 32-bit indexed framebuffer as an Uint32Array. Each element of the array will represent the RGBA color of a single pixel
   * The framebuffer is 400 x 240 pixels
   */
  async getScreenRgba(palette = [0x000000FF, 0xFFFFFFFF]) {
    const indexed = await this.getScreenIndexed();
    const rgba = new Uint32Array(indexed.length);
    for (let i = 0; i < indexed.length; i++) {
      rgba[i] = palette[indexed[i]];
    }
    return rgba;
  }

  // TODO: simplify palette to either black+white or approximated grey colors
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

  /**
   * Print a list of commands that can be run with `runCommand()`
   */
  async help() {
    return await this.runCommand('help');
  }

  /**
   * Send a custom USB command to the device
   * Some commands are potentially dangerous and could harm your Playdate. *Please* don't execute any commands that you're unsure about.
   */
  async runCommand(command: string) {
    await this.serial.writeAscii(`${ command }\n`);
    const str = await this.serial.readAscii();
    if (this.logCommandResponse) {
      const lines = splitLines(str);
      console.log(lines.join('\n'));
    }
    return str;
  }

}