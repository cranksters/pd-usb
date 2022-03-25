import { PDSerialMode, PDSerialTransformer } from './SerialTransformer';
import { assert, stringToBytes, mergeByteChunks } from './utils';

/**
 * Event types for PlaydateDevice - register events with on()
 */
export type PDSerialEvent =
 | 'open'
 | 'close'
 | 'disconnect'
 | 'error'
 | 'data'
;

/**
 * Event callback function type
 */
export type PDSerialEventCallback<T extends any[] = any[]> = (...args: T) => void;

export interface PDSerialOptions {
  baudRate: number;
  bufferSize: number;
};

/**
 * Handles USB connection and sending data to and fro
 */
export class PDSerial {

  isOpen = false;
  isReading = false;

  private port: SerialPort;
  private options: PDSerialOptions;
  private events: Partial<Record<PDSerialEvent, PDSerialEventCallback[]>> = {};
  private readTransformer: PDSerialTransformer;
  private reader: ReadableStreamDefaultReader<string | Uint8Array>;

  constructor(port: SerialPort, options: PDSerialOptions) {
    this.port = port;
    this.options = options;
    port.addEventListener('disconnect', this.handleDisconnect);
  }

  /**
   * Register an event callback
   */
  on(eventType: 'data', callback: PDSerialEventCallback<[Uint8Array]>): void;
  on(eventType: PDSerialEvent, callback: PDSerialEventCallback): void;
  on(eventType: PDSerialEvent, callback: PDSerialEventCallback): void {
    (this.events[eventType] || (this.events[eventType] = [])).push(callback);
  }

  /**
   * Remove an event callback
   */
  off(eventType: PDSerialEvent, callback: PDSerialEventCallback) {
    const callbackList = this.events[eventType];
    if (callbackList)
      callbackList.splice(callbackList.indexOf(callback), 1);
  }

  /**
   * Emit an event
   */
  emit(eventType: PDSerialEvent, ...args: any[]) {
    const callbackList = this.events[eventType] || [];
    callbackList.forEach(fn => fn.apply(this, args));
  }

  /**
   * Open the serial device to start communication
   */
  async open() {
    await this.port.open({ ...this.options });
    this.readTransformer = new PDSerialTransformer();
    const readable = this.port.readable;
    const stream = readable.pipeThrough(new TransformStream(this.readTransformer));
    this.reader = stream.getReader();
    this.isOpen = true;
    this.emit('open');
  }

  /**
   * Closes the serial device, stopping communication
   */
  async close() {
    await this.port.close();
    this.isOpen = false;
    // this.stopReadingLoop();
    this.emit('close');
  }

  /**
   * Send a Uint8Array to the serial device
   */
  async write(bytes: Uint8Array) {
    assert(this.isOpen, 'Serial is not open, please call open() before beginning to write data');
    const writer = this.port.writable.getWriter();
    await writer.write(bytes);
    writer.releaseLock();
  }

  /**
   * Send an ascii string to the serial device
   */
  async writeAscii(str: string) {
    const bytes = stringToBytes(str);
    return await this.write(bytes);
  }

  async readBytes(num = 0) {
    try {
      this.readTransformer.setMode(PDSerialMode.Bytes);
      this.readTransformer.bytesTarget = num;
      const { value } = await this.reader.read() as ReadableStreamDefaultReadResult<Uint8Array>;
      this.readTransformer.bytesTarget = 0;
      return value;
    }
    catch (error) {
      this.emit('error', error);
    }
  }

  async readLine() {
    try {
      this.readTransformer.setMode(PDSerialMode.Lines);
      const { value } = await this.reader.read() as ReadableStreamDefaultReadResult<string>;
      return value;
    }
    catch (error) {
      this.emit('error', error);
    }
  }

  async doReadWithTimeout<T = Uint8Array | string>(
    timeoutMs: number,
    readFn: (...args: any[]) => Promise<T>,
    ...readFnArgs: any[]
  ) {
    return new Promise<{ value: T, done: boolean }>((resolve, reject) => {
      
      const timer = setTimeout(() => {
        resolve({ value: null, done: true });
        // this is SUPER IMPORTANT, the readFn that has timed out still needs to complete somehow,
        // otherwise it will just block further reads
        // I imagine there's a nicer way to handle this, but I can't find any good information out there...
        this.readTransformer.clearOut();
      }, timeoutMs);

      try {
        readFn.bind(this)(...readFnArgs).then((result: any) => {
          clearTimeout(timer);
          resolve({ value: result, done: false });
        });
      }
      catch(error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  async readLinesUntilTimeout(ms = 50) {
    let lines:string[] = [];
    while (this.isOpen && this.port.readable) {
      try {
        const { value, done } = await this.doReadWithTimeout(ms, this.readLine);
        if (value !== null)
          lines.push(value);
        if (done)
          return lines;
      } 
      catch (error) {
        this.emit('error', error);
      }
    }
  }

  async readBytesUntilTimeout(ms = 50) {
    let chunks: Uint8Array[] = [];
    while (this.isOpen && this.port.readable) {
      try {
        const { value, done } = await this.doReadWithTimeout(ms, this.readBytes);
        if (value !== null)
          chunks.push(value);
        if (done)
          return mergeByteChunks(chunks);
      } 
      catch (error) {
        this.emit('error', error);
      }
    }
  }

  private handleDisconnect = () => {
    this.isOpen = false;
    this.isReading = false;
    this.emit('disconnect');
    console.log('disconnected', this);
  }
}