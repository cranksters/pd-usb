import { PDSerial } from './Serial';

import {
  PDVersion,
  PDButton,
  PDButtonName,
  PDButtonNameMap,
  PDButtonBitmaskMap,
  PDButtonState,
  PDControlState
} from './PlaydateTypes';

import {
  assert,
  parseKeyVal,
  stringToBytes,
  bytesPos,
} from './utils';

// Playdate USB vendor and product IDs
export const PLAYDATE_VID = 0x1331;
export const PLAYDATE_PID = 0x5740;

export const USB_FILTER = { usbVendorId: PLAYDATE_VID, usbProductId: PLAYDATE_PID };

// Serial settings
export const PLAYDATE_BAUDRATE = 115200;
export const PLAYDATE_BUFFER_SIZE = 12800;

// Playdate screen dimensions
export const PLAYDATE_WIDTH = 400;
export const PLAYDATE_HEIGHT = 240;

/**
 * Event types for PlaydateDevice - register events with on()
 */
export type PlaydateDeviceEvent =
 | 'open'
 | 'close'
 | 'disconnect'
 | 'controls:start'
 | 'controls:update'
 | 'controls:stop'
 | 'data'
 | 'print'
 | 'error'
;

/**
 * Event callback function type
 */
export type PlaydateDeviceEventCallback<T extends any[] = any[]> = (...args: T) => void;

/**
 * Represents a Playdate device connected over USB, and provides some methods for communicating with it
 */
export class PlaydateDevice {

  port: SerialPort;
  serial: PDSerial;

  isConnected: boolean =  true;
  isPollingControls: boolean = false;
  isStreaming: boolean = false;
  lastControlState: PDControlState;
  lastButtonPressedFlags: number = 0;
  lastButtonJustReleasedFlags: number = 0;
  lastButtonJustPressedFlags: number = 0;

  logCommandResponse: boolean = false;

  events: Partial<Record<PlaydateDeviceEvent, PlaydateDeviceEventCallback[]>> = {};

  constructor(port: SerialPort) {
    this.port = port;
    this.serial = new PDSerial(port, {
      baudRate: PLAYDATE_BAUDRATE,
      bufferSize: PLAYDATE_BUFFER_SIZE
    });
    this.port.addEventListener('disconnect', this.handleDisconnectEvent);
  }

  static async requestDevice() {
    const port = await navigator.serial.requestPort({ filters: [USB_FILTER] });
    return new PlaydateDevice(port);
  }

  static async getDevices() {
    const ports = await navigator.serial.getPorts();
    return ports
      .filter(port => {
        const { usbProductId, usbVendorId } = port.getInfo();
        return usbProductId === PLAYDATE_PID && usbVendorId === PLAYDATE_VID;
      })
      .map(port => new PlaydateDevice(port));
  }

  /**
   * Indicates whether the Playdate is open or close to reading/writing
   */
  get isOpen() {
    return this.isConnected && this.serial.isOpen;
  }

  /**
   * Indicates when the Playdate is busy and not able to handle other commands
   */
  get isBusy() {
    return this.isConnected && (this.isPollingControls || this.isStreaming);
  }

  /**
   * Register an event callback
   */
  on(eventType: 'data', callback: PlaydateDeviceEventCallback<[Uint8Array]>): void;
  on(eventType: 'print', callback: PlaydateDeviceEventCallback<[string]>): void;
  on(eventType: 'error', callback: PlaydateDeviceEventCallback<[Error]>): void;
  on(eventType: PlaydateDeviceEvent, callback: PlaydateDeviceEventCallback): void;
  on(eventType: PlaydateDeviceEvent, callback: PlaydateDeviceEventCallback): void {
    (this.events[eventType] || (this.events[eventType] = [])).push(callback);
  }

  /**
   * Remove an event callback
   */
  off(eventType: PlaydateDeviceEvent, callback: PlaydateDeviceEventCallback) {
    const callbackList = this.events[eventType];
    if (callbackList)
      callbackList.splice(callbackList.indexOf(callback), 1);
  }

  /**
   * Emit an event
   */
  emit(eventType: PlaydateDeviceEvent, ...args: any[]) {
    const callbackList = this.events[eventType] || [];
    callbackList.forEach(fn => fn.apply(this, args));
  }

  /**
   * Open a device for communication
   */
  async open() {
    await this.serial.open();
    this.serial.onData(this.handleSerialDataEvent);
    this.serial.onError(this.handleSerialErrorEvent);
    // we want echo to be off by default (playdate simulator does this first)
    const lines = await this.sendCommand(`echo off`);
    assert(Array.isArray(lines), 'Open error - Playdate did not respond, maybe something else is interacting with it?');
    const resp = lines.pop();
    // echo off should respond with nothing but a blank line
    // if echo was previously set to on, it will echo the given command one last time in response
    assert(resp === '' || resp.includes('echo off'), `Open error - invalid echo command response, got ${ resp }`);
    this.emit('open');
  }

  /**
   * Close a device for communication
   */
  async close() {
    // seems to help if the session goofed up and the device is still trying to send data
    // stop any continually running commands
    if (this.isPollingControls)
      await this.stopPollingControls();
    // actually close the device
    await this.serial.close();
    this.emit('close');
  }

  /**
   * Get version information about the Playdate; its OS build info, SDK version, serial number, etc 
   */
  async getVersion(): Promise<PDVersion> {
    const lines = await this.sendCommand('version');
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
    assert('pcbver' in parsed);
    // format keys as an object
    return {
      sdk: parsed['SDK'],
      bootBuild: parsed['boot_build'],
      build: parsed['build'],
      cc: parsed['cc'],
      pdxVersion: parsed['pdxversion'],
      serial: parsed['serial#'],
      target: parsed['target'],
      pcbVer: parsed['pcbver'],
    };
  }

  /**
   * Get the Playdate's serial number
   */
  async getSerial() {
    const lines = await this.sendCommand('serialread');
    return lines.find(line => line !== '');
  }

  /**
   * Capture a screenshot from the Playdate, and get the raw framebuffer
   * This will return the 1-bit framebuffer data as an Uint8Array of bytes, where each bit in the byte will represent 1 pixel; `0` for black, `1` for white
   * The framebuffer is 400 x 240 pixels
   */
  async getScreen() {
    this.assertNotBusy();
    await this.serial.writeAscii('screen\n');
    const bytes = await this.serial.readBytes(12011);
    assert(bytes.byteLength >= 12011, `Screen command response is too short, got ${ bytes.byteLength } bytes`);
    const header = stringToBytes('~screen:\n');
    let ptr = bytesPos(bytes, header);
    assert(ptr !== -1, 'Invalid screen command response');
    ptr += header.length;
    const frameBuffer = bytes.subarray(ptr, ptr + 12000);
    return frameBuffer;
  }

  /**
   * Capture a screenshot from the Playdate, and get the unpacked framebuffer
   * This will return an 8-bit indexed framebuffer as an Uint8Array of pixels. Each element of the array will represent a single pixel; `0x0` for black, `0x1` for white
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
   * Send a 1-bit bitmap buffer to display on the Playdate's screen
   * The input bitmap must be an Uint8Array of bytes, where each bit in the byte will represent 1 pixel; `0` for black, `1` for white.
   * The input bitmap must also contain 400 x 240 pixels
   */ 
  async sendBitmap(bitmap: Uint8Array) {
    this.assertNotBusy();
    assert(bitmap.length === 12000, `Bitmap size is incorrect; should be 12000 (400 * 240 / 8), got ${ bitmap.length }`);
    const bytes = new Uint8Array(12007);
    bytes.set(stringToBytes('bitmap\n'), 0);
    bytes.set(bitmap, 7);
    await this.serial.write(bytes);
    const [str] = await this.serial.readLinesUntilTimeout();
    assert(str === '', `Invalid bitmap send response, got ${ str }`);
  }

  /**
   * Send a indexed bitmap to display on the Playdate's screen
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
          chunk |= (0x80 >> shift);
      }
      bitmap[dstPtr++] = chunk;
    }
    await this.sendBitmap(bitmap);
  }

  /**
   * Begin polling for control updates. Can be stopped with `stopPollingControls()`
   * While this is active, you won't be able to communicate with the device
   */
  async startPollingControls() {
    this.assertNotBusy();
    await this.serial.writeAscii('buttons\n');
    this.emit('controls:start');
    // isPollingControls will be set to false when stopPollingControls() is called
    this.isPollingControls = true;
    this.pollControlsLoop();
  }

  /**
   * Get the current controls state, after startPollingControls() has been called
   */
  getControls() {
    assert(this.isPollingControls, 'Please begin polling Playdate controls by calling startPollingControls() first');
    return this.lastControlState;
  }

  /**
   * Equivalent to Playdate SDK's playdate.buttonIsPressed(button)
   */
  buttonIsPressed(button: PDButton | PDButtonName) {
    assert(this.isPollingControls, 'Please begin polling Playdate controls by calling startPollingControls() first');
    if (typeof(button) === 'string')
      button = PDButtonBitmaskMap[button];
    return (this.lastButtonPressedFlags & button) !== 0;
  }

  /**
   * Equivalent to Playdate SDK's playdate.buttonJustPressed(button)
   */
  buttonJustPressed(button: PDButton | PDButtonName) {
    assert(this.isPollingControls, 'Please begin polling Playdate controls by calling startPollingControls() first');
    if (typeof(button) === 'string')
      button = PDButtonBitmaskMap[button];
    return (this.lastButtonJustPressedFlags & button) !== 0;
  }

  /**
   * Equivalent to Playdate SDK's playdate.buttonJustReleased(button)
   */
  buttonJustReleased(button: PDButton | PDButtonName) {
    assert(this.isPollingControls, 'Please begin polling Playdate controls by calling startPollingControls() first');
    if (typeof(button) === 'string')
      button = PDButtonBitmaskMap[button];
    return (this.lastButtonJustReleasedFlags & button) !== 0;
  }

  /**
   * Equivalent to Playdate SDK's playdate.isCrankDocked()
   */
  isCrankDocked() {
    assert(this.isPollingControls, 'Please begin polling Playdate controls by calling startPollingControls() first');
    return this.lastControlState.crankDocked;
  }

  /**
   * Equivalent to Playdate SDK's playdate.getCrankPosition()
   */
  getCrankPosition() {
    assert(this.isPollingControls, 'Please begin polling Playdate controls by calling startPollingControls() first');
    return this.lastControlState.crank;
  }

  /**
   * Stop polling for control updates, after startPollingControls() has been called
   * After this has completed, you'll be able to communicate with the device again
   */
  async stopPollingControls() {
    assert(this.isPollingControls, 'Controls are not currently being polled');
    await this.serial.writeAscii('\n');
    this.lastControlState = undefined;
    this.lastButtonPressedFlags = 0;
    this.lastButtonJustReleasedFlags = 0;
    this.lastButtonJustPressedFlags = 0;
    this.isPollingControls = false;
  }

  /**
   * Launch a .PDX rom at a given path, e.g. '/System/Crayons.pdx'
   */
  async run(path: string) {
    assert(path.startsWith('/'), 'Path must begin with a forward slash, e.g. "/System/Crayons.pdx"')
    const [str] = await this.sendCommand(`run ${ path }`);
    assert(str === '', `Invalid run response, got ${ str }`);
  }

  /**
   * Eval a pre-compiled lua function payload (has to be compiled with pdc) on the device
   */
  async evalLuaPayload(payload: Uint8Array | ArrayBufferLike, waitTime = 50) {
    const cmd = `eval ${ payload.byteLength }\n`;
    const data = new Uint8Array(cmd.length + payload.byteLength);
    data.set(stringToBytes(cmd), 0);
    data.set(new Uint8Array(payload), cmd.length);
    await this.serial.write(data);
    return await this.serial.readLinesUntilTimeout(waitTime);
  }

  // not quite working yet
  // async startStreaming() {
  //   this.assertNotBusy();
  //   await this.serial.writeAscii('stream enable\n');
  //   // this.emit('stream:start');
  //   const r = await this.serial.read();
  //   console.log('r');
  //   const firstFrame = await this.serial.read();
  //   console.log('first frame', firstFrame);
  //   this.isStreaming = true;
  //   while (this.isStreaming) {
  //     await this.serial.writeAscii('stream poke\n');
  //     const frame = await this.serial.read();
  //     console.log('new frame', frame);
  //   }
  //   // this.emit('stream:stop');
  //   return true;
  // }

  // async stopStreaming() {
  //   this.isStreaming = false;
  //   await this.serial.writeAscii('stream disable\n');
  //   const str = await this.serial.readAscii();
  //   assert(str === '\r\n');
  //   await this.serial.clear();
  // }

  /**
   * Send a custom USB command to the device
   * Some commands are potentially dangerous and could harm your Playdate. *Please* don't execute any commands that you're unsure about!
   */
  async sendCommand(command: string) {
    assert(this.isOpen);
    this.assertNotBusy();
    await this.serial.writeAscii(`${ command }\n`);
    const lines = await this.serial.readLinesUntilTimeout();
    if (this.logCommandResponse) {
      console.log(lines.join('\n'));
    }
    return lines;
  }

  private handleDisconnectEvent = () => {
    this.isConnected = false;
    this.emit('disconnect');
  }

  private handleSerialDataEvent = (data: Uint8Array) => {
    this.emit('data', data);
  }

  private handleSerialErrorEvent = (err: Error) => {
    this.emit('error', err);
    throw err;
  }

  /**
   * Continually read lines while control polling is active
   * Probably don't want to call this with await so that it doesn't lock everything
   */
  private async pollControlsLoop() {
    while (this.isPollingControls && this.port.readable) {
      try {
        const line = await this.serial.readLine();
        const state = this.parseControlState(line);
        if (state) {
          this.emit('controls:update', state);
        }
      }
      catch(e) {
        // if isPollingControls is false, that means stopPollingControls() was called, 
        // and we can ignore this error because it cancels any ongoing transfers
        // if it's still true, it means something actually went wrong
        if (this.isPollingControls)
          throw e;
      }
    }
    // only reached when stopped
    this.emit('controls:stop');
  }

  private assertNotBusy() {
    assert(!this.isBusy, 'Device is currently busy, stop polling controls or streaming to send further commands');
  }

  private parseControlState(state: string): PDControlState {
    const parsed = state.match(/buttons:([A-F0-9]{2}) ([A-F0-9]{2}) ([A-F0-9]{2}) crank:(\d+\.?\d+) docked:(\d)/);
    if (parsed) {
      const pressed =      parseInt(parsed[1], 16);
      const justPressed =  parseInt(parsed[2], 16);
      const justReleased = parseInt(parsed[3], 16);
      const crank =        parseFloat(parsed[4]);
      const crankDocked =  parsed[5] === '1';
      const state = {
        crank,
        crankDocked,
        pressed: this.parseButtonFlags(pressed),
        justPressed: this.parseButtonFlags(justPressed),
        justReleased: this.parseButtonFlags(justReleased),
      };
      this.lastButtonPressedFlags = pressed;
      this.lastButtonJustPressedFlags = justPressed;
      this.lastButtonJustReleasedFlags = justReleased;
      this.lastControlState = state;
      return state;
    }
    return;
  }

  private parseButtonFlags(flags: number): PDButtonState {
    return {
      [PDButtonNameMap[PDButton.kButtonRight]]: (flags & PDButton.kButtonRight) !== 0,
      [PDButtonNameMap[PDButton.kButtonLeft]]:  (flags & PDButton.kButtonLeft)  !== 0,
      [PDButtonNameMap[PDButton.kButtonUp]]:    (flags & PDButton.kButtonUp)    !== 0,
      [PDButtonNameMap[PDButton.kButtonDown]]:  (flags & PDButton.kButtonDown)  !== 0,
      [PDButtonNameMap[PDButton.kButtonB]]:     (flags & PDButton.kButtonB)     !== 0,
      [PDButtonNameMap[PDButton.kButtonA]]:     (flags & PDButton.kButtonA)     !== 0,
      [PDButtonNameMap[PDButton.kButtonMenu]]:  (flags & PDButton.kButtonMenu)  !== 0,
      [PDButtonNameMap[PDButton.kButtonLock]]:  (flags & PDButton.kButtonLock)  !== 0,
    } as PDButtonState;
  }
}