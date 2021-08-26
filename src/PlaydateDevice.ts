import { Serial } from './Serial';
import { assert, splitLines, parseKeyVal, bytesToString, stringToBytes } from './utils';

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
   * Get version information about the Playdate; its OS build info, SDK version, serial number, etc 
   */
  async getVersion(): Promise<PlaydateVersion> {
    const str = await this.sendCommand('version');
    const lines = splitLines(str);
    const parsed: Record<string, string> = {};
    // split key=value lines into object
    lines.forEach(line => {
      const kv = parseKeyVal(line);
      if (Array.isArray(kv))
        parsed[kv[0]] = kv[1];
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
   * Get the Playdate's serial number
   */
  async getSerial() {
    const str = await this.sendCommand('serialread');
    return str.trim();
  }

  /**
   * Capture a screenshot from the Playdate, and get the raw framebuffer
   * This will return the 1-bit framebuffer data as Uint8Array of bytes, where each bit in the byte will represent 1 pixel; `0` for black, `1` for white.
   * The framebuffer is 400 x 240 pixels
   */
  async getScreen() {
    await this.serial.writeAscii('screen\n');
    const bytes = await this.serial.read();
    assert(bytes.byteLength >= 12011, `Screen command response is too short, got ${ bytes.byteLength } bytes`);
    const header = bytesToString(bytes.subarray(0, 11));
    const frameBuffer = bytes.subarray(11, 12011);
    assert(header.includes('~screen:'), 'Invalid screen command response');
    return frameBuffer;
  }

  /**
   * Capture a screenshot from the Playdate, and get the unpacked framebuffer
   * This will return an 8-bit indexed framebuffer as an Uint8Array. Each element of the array will represent a single pixel; `0x0` for black, `0x1` for white
   * The framebuffer is 400 x 240 pixels
   */
  async getScreenIndexed() {
    const framebuffer = await this.getScreen();
    const framebufferSize = framebuffer.byteLength;
    const indexed = new Uint8Array(PLAYDATE_WIDTH * PLAYDATE_HEIGHT);
    let srcPtr = 0;
    let dstPtr = 0;
    while (srcPtr < framebufferSize) {
      // each one-byte chunk contains 8 pixels
      const chunk = framebuffer[srcPtr++];
      // unpack each bit of the chunk
      for (let shift = 7; shift >= 0; shift--)
        indexed[dstPtr++] = (chunk >> shift) & 0x1;
    }
    return indexed;
  }

  /**
   * Send a 1-bit bitmap buffer to display on the Playdate's screen. 
   * The input bitmap must be an Uint8Array of bytes, where each bit in the byte will represent 1 pixel; `0` for black, `1` for white.
   * The input bitmap must also contain 400 x 240 pixels
   */ 
  async sendBitmap(bitmap: Uint8Array) {
    assert(bitmap.length === 12000, `Bitmap size is incorrect; should be 12000 (400 * 240 / 8), got ${ bitmap.length }`);
    const bytes = new Uint8Array(12007);
    bytes.set(stringToBytes('bitmap\n'), 0);
    bytes.set(bitmap, 7);
    await this.serial.write(bytes);
    const str = await this.serial.readAscii();
    assert(str === '\r\n', `Invalid bitmap send response, got ${ str }`);
  }

  /**
   * Send a indexed bitmap to display on the Playdate's screen.
   * The input bitmap must be an Uint8Array of bytes, each byte in the array will represent 1 pixel; `0x0` for black, `0x1` for white.
   * The input bitmap must also contain 400 x 240 pixels
   */
  async sendBitmapIndexed(indexed: Uint8Array) {
    assert(indexed.length === 96000, `Bitmap size is incorrect; should be 96000 (400 * 240), got ${ indexed.length }`);
    const bitmap = new Uint8Array(12000);
    const bitmapSize = bitmap.byteLength;
    let srcPtr = 0;
    let dstPtr = 0;
    // pack indexed pixels into 1-bit bitmap data
    while (dstPtr < bitmapSize) {
      let chunk = 0;
      // pack every 8 pixels into a one-byte chunk
      for (let shift = 0; shift < 8; shift++) {
        // if the current pixel isn't 0, flip the current bit to 1
        if (indexed[srcPtr++] !== 0)
          chunk |= (0x1 << shift);
      }
      bitmap[dstPtr++] = chunk;
    }
    await this.sendBitmap(bitmap);
  }

  /**
   * Launch a .PDX rom at a given path, e.g. '/System/Crayons.pdx'
   */
  async run(path: string) {
    assert(path.startsWith('/'), 'Path must begin with a forward slash, e.g. "/System/Crayons.pdx"')
    const str = await this.sendCommand(`run ${ path }`);
    assert(str === '\r\n', `Invalid run response, got ${ str }`);
  }

  /**
   * Capture a screenshot from the Playdate, and get the unpacked RGBA framebuffer
   * This will return an 32-bit indexed framebuffer as an Uint32Array. Each element of the array will represent the RGBA color of a single pixel
   * The framebuffer is 400 x 240 pixels
   */
   async getScreenRgba(palette = [0x000000FF, 0xFFFFFFFF]) {
    const indexed = await this.getScreenIndexed();
    const rgba = new Uint32Array(indexed.length);
    // lookup each pixel's RGBA color using the palette
    for (let i = 0; i < indexed.length; i++)
      rgba[i] = palette[indexed[i]];
    return rgba;
  }

  // TODO: simplify palette to either black+white or approximated grey colors
  async drawScreenToCanvas(ctx: CanvasRenderingContext2D, palette = [0xFF000000, 0xFFFFFFFF]) {
    const indexed = await this.getScreenIndexed();
    const imgData = ctx.createImageData(PLAYDATE_WIDTH, PLAYDATE_HEIGHT);
    const rgba = new Uint32Array(imgData.data.buffer);
    for (let i = 0; i < indexed.length; i++)
      rgba[i] = palette[indexed[i]];
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
   * Send a custom USB command to the device
   * Some commands are potentially dangerous and could harm your Playdate. *Please* don't execute any commands that you're unsure about!
   */
  async sendCommand(command: string) {
    await this.serial.writeAscii(`${ command }\n`);
    const str = await this.serial.readAscii();
    if (this.logCommandResponse) {
      const lines = splitLines(str);
      console.log(lines.join('\n'));
    }
    return str;
  }

  /**
   * Set the console echo state. By default, this is set to 'off' while opening the device.
   */
  private async setEcho(echoState: 'on' | 'off') {
    const str = await this.sendCommand(`echo ${ echoState }`);
    if (echoState === 'off') {
      // echo off should respond with nothing but a blank line
      // if echo was previously set to on, it will echo the given command one last time in response
      assert(str.startsWith('\r\n') || str.includes('echo off'), `Invalid echo command response, got ${ str }`);
    }
  }

  /**
   * Send an ESP-AT command to the ESP-32 firmware
   * https://docs.espressif.com/projects/esp-at/en/latest/Get_Started/What_is_ESP-AT.html
   * NOTE: these could potentially be very dangerous, use this function at your own peril!
   */
  // async sendEspCommand(command: string) {
  //   await this.serial.writeAscii(`esp ${ command }\n`);
  //   let i = 0;
  //   while (i < 10) {
  //     const str = await this.serial.readAscii();
  //     console.log(str);
  //     if (str.includes('OK') || str.includes('ERROR'))
  //       break;
  //     sleep(100);
  //     i++;
  //   }
  // }
}