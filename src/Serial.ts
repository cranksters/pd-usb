import { sleep, assert, assertExists, bytesToString, stringToBytes } from './utils';

/**
 * Handles USB connection and sending data to and fro
 */
export class Serial {

  device: USBDevice;
  interface: USBInterface;
  inpoint: USBEndpoint;
  outpoint: USBEndpoint;

  constructor(device: USBDevice) {
    this.device = device;
  }

  /**
   * Indicates whether the serial is open or close to reading/writing
   */
  get isOpen() {
    return this.device.opened;
  }

  /**
   * Open the device for communication
   */
  async open() {
    await this.device.open();
    this.interface = await this.getInterface();
    this.inpoint = this.getEndpoint('in');
    this.outpoint = this.getEndpoint('out');
  }

  /**
   * Send a Uint8Array to the USB device
   */
  async write(bytes: Uint8Array) {
    assert(this.isOpen, 'Serial is not open, please call open() before beginning to write data');
    const outpoint = this.outpoint;
    const packetSize = outpoint.packetSize;

    let ptr = 0;
    let bytesLeft = bytes.byteLength
    while (bytesLeft > 0) {
      const size = Math.min(packetSize, bytesLeft);
      const packetData = bytes.subarray(ptr, ptr + size);
      const reply = await this.device.transferOut(outpoint.endpointNumber, packetData);
      const bytesWritten = reply.bytesWritten;
      if (reply.status !== 'ok')
        throw `Write error: got status ${ reply.status }`;
      if (bytesWritten === 0)
        throw `Write error: no bytes could be written`;
      bytesLeft -= bytesWritten;
      ptr += bytesWritten;
    }
  }

  /**
   * Send a string of ascii characters to the USB device
   */
  async writeAscii(str: string) {
    const bytes = stringToBytes(str);
    return await this.write(bytes);
  }

  /**
   * Read data from the USB device as a Uint8Array of bytes
   * Will keep reading until the device has no more data to give
   */
  async read() {
    assert(this.isOpen, 'Serial is not open, please call open() before beginning to read data');
    const inpoint = this.inpoint;

    const packets: DataView[] = [];
    let hasStartedToReceiveData = false;
    let responseSize = 0;

    // packet transfer loop
    while (true) {
      const packet = await this.device.transferIn(inpoint.endpointNumber, inpoint.packetSize);
      const dataSize = packet.data.byteLength;
      if (packet.status === 'ok') {
        // zero-byte packet signals the end of data
        if (hasStartedToReceiveData && dataSize === 0)
          break;
        // not sure if this is correct, but seems as though if the data starts with zero-byte packet, we need to wait for some to come
        else if (!hasStartedToReceiveData && dataSize === 0) {
          await sleep(100);
          continue;
        }
        // add packet to buffer
        else {
          hasStartedToReceiveData = true;
          responseSize += dataSize;
          packets.push(packet.data);
        }
      }
      else if (packet.status === 'babble') {
        // TODO: what to do here?
        throw new Error(`Device responded with too much data for packet`);
      }
      else if (packet.status === 'stall') {
        // TODO: what to do here?
        console.warn(`USB stalled during read`);
        //  apparently this helps recover from a stall
        await this.device.clearHalt('in', inpoint.endpointNumber);
        break;
      }
    }

    // merge packets into byte array
    let ptr = 0;
    const bytes = new Uint8Array(responseSize);
    for (let i = 0; i < packets.length; i++) {
      const packet = packets[i];
      const packetBytes = new Uint8Array(packet.buffer);
      bytes.set(packetBytes, ptr);
      ptr += packetBytes.byteLength;
    }

    return bytes;
  }

  /**
   * Read data from the USB device as a string of ascii characters
   * Will keep reading until the device has no more data to give
   */
  async readAscii() {
    const bytes = await this.read();
    return bytesToString(bytes);
  }

  /**
   * Clear in and out endpoints
   */
  async clear() {
    const inpoint = this.inpoint;
    const outpoint = this.outpoint;
    this.device.clearHalt('in', inpoint.endpointNumber);
    this.device.clearHalt('out', outpoint.endpointNumber);
  }

  /**
   * Close the USB device for communication
   */
  async close() {
    await this.device.releaseInterface(this.interface.interfaceNumber);
    this.interface = null;
    await this.device.close();
  }

  private async getInterface(): Promise<USBInterface> {
    assert(this.isOpen, 'Serial is not open');
    // set the config to use for the device
    // TODO: check if always selecting config 1 is valid? 
    await this.device.selectConfiguration(1);
    const config = this.device.configuration;
    // run through all the device interfaces and attempt to claim one
    const interfaces = await Promise.allSettled(config.interfaces.map(async (intf) => {
      await this.device.claimInterface(intf.interfaceNumber);
      return intf;
    }));
    // find the first interface that was claimable
    const result = interfaces.find(claimResult => claimResult.status === 'fulfilled');
    if (result)
      return (result as PromiseFulfilledResult<USBInterface>).value;
    throw new Error(`Unable to establish a USB interface, disconnect the Playdate and try again`);
  }

  private getEndpoint(direction: USBDirection) {
    assert(this.isOpen, 'Serial is not open');
    assertExists(this.interface, 'interface');
    assert(this.interface.claimed);
    // run through interfaces and attempt to find an endpoint matching the requested direction
    const endpoint = this.interface.alternate.endpoints.find(ep => ep.direction == direction);
    if (endpoint)
      return endpoint;
    throw new Error(`${ direction }ward endpoint not found on device USB interface.`);
  }
}