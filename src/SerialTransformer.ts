import { stringToBytes, bytesToString, mergeByteChunks } from './utils';

export const enum PDSerialMode {
  Bytes,
  Lines
};

export class PDSerialTransformer {
  mode = PDSerialMode.Lines;
  controller: TransformStreamDefaultController<Uint8Array | string>;

  lineBuffer = '';
  asciiDecoder = new TextDecoder('ascii');

  bytePackets: Uint8Array[] = [];
  bytesReceived = 0;
  // if not 0, transformer will collect byte input until this many bytes have been read
  bytesTarget = 0;

  setMode(mode: PDSerialMode) {
    if (this.mode !== mode) {

      if (mode === PDSerialMode.Lines) {
        this.lineBuffer = '';
      }
      else if (mode === PDSerialMode.Bytes) {
        this.bytePackets = [];
        this.bytesReceived = 0;
        this.bytesTarget = 0;
      }

      this.mode = mode;
    }
  }

  transform(chunk: Uint8Array, controller: TransformStreamDefaultController<Uint8Array | string>) {
    this.controller = controller;

    if (this.mode === PDSerialMode.Lines)
      this.transformLines(chunk, controller);

    else if (this.mode === PDSerialMode.Bytes)
      this.transformBytes(chunk, controller);
  }

  clearOut() {
    if (this.controller)
      this.controller.enqueue('');
  }

  flush(controller: TransformStreamDefaultController<Uint8Array | string>) {
    if (this.mode === PDSerialMode.Lines)
      this.flushLines(controller);

    else if (this.mode === PDSerialMode.Bytes)
      this.flushBytes(controller);
  }

  transformLines(chunk: Uint8Array, controller: TransformStreamDefaultController<string>) {
    this.lineBuffer += this.asciiDecoder.decode(chunk);
    const lines = this.lineBuffer.split(/\r?\n/);
    this.lineBuffer = lines.pop();
    lines.forEach(line => controller.enqueue(line));
  }

  transformBytes(chunk: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>) {
    if (this.bytesTarget > 0) {
      this.bytePackets.push(chunk);
      this.bytesReceived += chunk.byteLength;

      if (this.bytesReceived >= this.bytesTarget) {
        controller.enqueue(mergeByteChunks(this.bytePackets));
        this.bytePackets = [];
        this.bytesReceived = 0;
      }
    }
    else {
      controller.enqueue(chunk);
    }
  }

  flushLines(controller: TransformStreamDefaultController<string>) {
    controller.enqueue(this.lineBuffer);
    this.lineBuffer = '';
  }

  flushBytes(controller: TransformStreamDefaultController<Uint8Array>) {}
}