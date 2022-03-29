import { PDSerialMode, PDSerialTransformer } from './SerialTransformer';
import { assert, stringToBytes, mergeByteChunks } from './utils';

/**
 * Options for the serial connection
 */
export interface PDSerialOptions {
  baudRate: number;
  bufferSize: number;
};

/**
 * Handles USB connection and sending data to and fro
 * Intended to be a generic serial interface, with no specific knowledge of the playdate and its commands
 */
export class PDSerial {

  private port: SerialPort;
  private options: PDSerialOptions;
  private readTransformer: PDSerialTransformer;
  private reader: ReadableStreamDefaultReader<string | Uint8Array>;
  private errorCallback: (error: Error) => void = () => {};

  isOpen = false;
  isReading = false;
  isWaitingForRead = false;

  constructor(port: SerialPort, options: PDSerialOptions) {
    this.port = port;
    this.options = options;
    port.addEventListener('disconnect', this.handleDisconnectEvent);
  }

  onData(callbackFn: (data: Uint8Array) => void) {
    this.readTransformer.onData(callbackFn);
  }

  onError(callbackFn: (error: Error) => void) {
    this.errorCallback = callbackFn;
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
  }

  /**
   * Closes the serial device, stopping communication
   */
  async close() {
    await this.reader.cancel();
    await this.port.close();
    this.isOpen = false;
  }

  /**
   * Sends an Uint8Array to the serial device
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

  /**
   * Reads an Uint8Array from the serial device
   * If numBytes is 0, it will resolve as soon as some bytes are received
   * If numBytes is more than 0, it will resolved when *at least* that many bytes have been received -- the actual buffer could be a bit longer
   */
  async readBytes(numBytes = 0): Promise<Uint8Array> {
    assert(!this.isReading, 'A read was queued while another was still in progress');
    this.isReading = true;
    try {
      this.readTransformer.setMode(PDSerialMode.Bytes);
      this.readTransformer.bytesTarget = numBytes;
      const { value } = await this.reader.read() as ReadableStreamDefaultReadResult<Uint8Array>;
      this.readTransformer.bytesTarget = 0;
      this.isReading = false;
      return value;
    }
    catch (error) {
      this.isReading = false;
      this.errorCallback(error);
    }
  }

  /**
   * Clear the current reader.read() call that's being awaited, to prevent it from blocking further reads...
   */
  async clearRead() {
    if (this.port.readable && this.isWaitingForRead) {
      this.readTransformer.clearOut();
      this.isWaitingForRead = false;
    }
  }

  /**
   * Reads a single line of ascii text from the serial device
   * Newline characters are not included, some lines may be empty
   */
  async readLine(): Promise<string> {
    assert(!this.isReading, 'A read was queued while another was still in progress');
    this.isReading = true;
    try {
      this.readTransformer.setMode(PDSerialMode.Lines);
      const { value } = await this.reader.read() as ReadableStreamDefaultReadResult<string>;
      this.isReading = false;
      return value;
    }
    catch (error) {
      this.isReading = false;
      this.errorCallback(error);
    }
  }
  
  
  /**
   * Do one of the above read functions, but make it timeout after a given number of milliseconds
   * This is used to read everything until the device has nothing more to send
   */
  async doReadWithTimeout<T = Uint8Array | string>(
    timeoutMs: number,
    readFn: (...args: any[]) => Promise<T>,
    ...readFnArgs: any[]
  ) {
    return new Promise<{ value: T, done: boolean }>((resolve, reject) => {
      this.isWaitingForRead = true;

      const timer = setTimeout(() => {
        resolve({ value: null, done: true });
        // this is SUPER IMPORTANT, the readFn that has timed out still needs to complete somehow,
        // otherwise it will just block further reads
        // I imagine there's a nicer way to handle this, but I can't find any good information out there...
        this.clearRead();
      }, timeoutMs);

      try {
        readFn.bind(this)(...readFnArgs).then((result: any) => {
          clearTimeout(timer);
          this.isWaitingForRead = false;
          resolve({ value: result, done: false });
        });
      }
      catch(error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  /**
   * Read lines until a timeout happens, indicating there's no more lines to read for now
   */
  async readLinesUntilTimeout(ms = 50) {
    const lines: string[] = [];
    while (this.isOpen && this.port.readable) {
      try {
        const { value, done } = await this.doReadWithTimeout(ms, this.readLine);
        if (value !== null)
          lines.push(value);
        if (done)
          return lines;
      } 
      catch (error) {
        this.errorCallback(error);
      }
    }
  }

  /**
   * Read bytes until a timeout happens, indicating there's no more bytes to read for now
   */
  async readBytesUntilTimeout(ms = 50) {
    const chunks: Uint8Array[] = [];
    while (this.isOpen && this.port.readable) {
      try {
        const { value, done } = await this.doReadWithTimeout(ms, this.readBytes);
        if (value !== null)
          chunks.push(value);
        if (done)
          return mergeByteChunks(chunks);
      } 
      catch (error) {
        this.errorCallback(error);
      }
    }
  }

  private handleDisconnectEvent = () => {
    this.isOpen = false;
    this.isReading = false;
  }
}