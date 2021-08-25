import { sleep, assert, assertExists } from './utils';

/**
 * Handles USB connection and sending data to and fro
 */
export class Serial {

  device: USBDevice;
  interface: USBInterface;

  constructor(device: USBDevice) {
    this.device = device;
  }

  /**
   * Open the device for communication
   */
  async open() {
    await this.device.open();
    this.interface = await this.getInterface();
  }

  /**
   * Send a Uint8Array to the USB device
   */
  async write(bytes: Uint8Array) {
    const outpoint = this.getEndpoint('out');
    const resp = await this.device.transferOut(outpoint.endpointNumber, bytes);
    if (resp.status !== 'ok')
      throw `Got status ${ resp.status }`;
    return resp;
  }

  /**
   * Send a string of ascii characters to the USB device
   */
  async writeAscii(str: string) {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++)
      bytes[i] = str.charCodeAt(i);
    return await this.write(bytes);
  }

  /**
   * Read data from the USB device as a Uint8Array of bytes
   * Will keep reading until the device has no more data to give
   */
  async read() {
    const inpoint = this.getEndpoint('in');

    const packets: DataView[] = [];
    let hasStartedToReceiveData = false;
    let responseSize = 0;

    // packet transfer loop
    while (true) {
      const packet = await this.device.transferIn(inpoint.endpointNumber, inpoint.packetSize);
      const dataSize = packet.data.byteLength;
      if (packet.status === 'ok') {
        // zero-byte packet signals the end of data
        if (hasStartedToReceiveData && dataSize === 0) {
          break;
        }
        // not sure if this is correct, but seems as though if the data starts with zero-byte packet, we need to wait for some to come
        else if (!hasStartedToReceiveData && dataSize === 0) {
          console.log('waiting');
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

    // merge packets into single byte array
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
    let str = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      str += String.fromCharCode(bytes[i]);
    }
    return str;
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
    // set the config to use for the device
    // TODO: check if always selecting config 1 is valid? 
    await this.device.selectConfiguration(1);
    const config = this.device.configuration;
    // run through all the device interfaces and attempt to claim one
    const interfaces = await Promise.allSettled(config.interfaces.map(async (intf) => {
      await this.device.claimInterface(intf.interfaceNumber);
      return intf;
    }));
    const result = interfaces.find(claimResult => claimResult.status === 'fulfilled');
    // no interface could be claimed
    if (!result)
      new Error(`Unable to establish a USB interface, disconnect the Playdate and try again`);
    return (result as PromiseFulfilledResult<USBInterface>).value;
  }

  private getEndpoint(direction: USBDirection) {
    assertExists(this.interface)
    // run through interfaces and attempt to find an endpoint matching the requested direction
    const endpoint = this.interface.alternate.endpoints.find(ep => ep.direction == direction);
    if (endpoint === null)
      throw new Error(`Endpoint ${ direction } not found on device USB interface.`);
    return endpoint;
  }
}