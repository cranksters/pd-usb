/*!!
pd-usb v2.0.1
JavaScript library for interacting with a Panic Playdate console over USB
https://github.com/jaames/pd-usb
2022 James Daniel
Playdate is (c) Panic Inc. - this project isn't affiliated with or endorsed by them in any way
*/
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.pdusb = {}));
}(this, (function (exports) { 'use strict';

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */

    function __awaiter(thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    }

    /**
     * Show a warning in a nicely formatted way
     */
    /**
     * Throw an error in a nicely formatted way
     */
    function error(msg) {
        console.trace(msg);
        throw new Error(msg);
    }
    /**
     * Assert condition is true
     */
    function assert(condition, errMsg = 'Assert failed') {
        if (!condition)
            error(errMsg);
    }

    /**
     * Is the code running in a Node environment?
     * @internal
     */
    typeof process !== 'undefined'
        && process.versions != null
        && process.versions.node != null;

    const KEY_VAL_REGEX = /^\s*([^=]+?)\s*=\s*(.*?)\s*$/;
    /**
     * Parse a 'key=value' string into an array of [key, value], or just return the string if it couldn't be parsed
     */
    function parseKeyVal(str) {
        if (KEY_VAL_REGEX.test(str)) {
            const match = str.match(KEY_VAL_REGEX);
            return [match[1], match[2]];
        }
        return str;
    }

    /**
     * Convert an Uint8Array of bytes to an ascii string
     */
    /**
     * Convert an ascii string to an Uint8Array of bytes
     */
    function stringToBytes(str) {
        const bytes = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++)
            bytes[i] = str.charCodeAt(i);
        return bytes;
    }
    function bytesPos(haystack, needle, ptr = 0) {
        search: while (true) {
            let start = haystack.indexOf(needle[0], ptr);
            if (start === -1)
                return -1;
            ptr = start;
            for (let i = 1; i < needle.length; i++) {
                if (haystack[ptr + i] !== needle[i]) {
                    ptr += 1;
                    continue search;
                }
            }
            // found a match
            return ptr;
        }
    }
    function mergeByteChunks(chunks) {
        const size = chunks.reduce((s, bytes) => s + bytes.length, 0);
        const result = new Uint8Array(size);
        for (let ptr = 0, i = 0; i < chunks.length; i++) {
            result.set(chunks[i], ptr);
            ptr += chunks[i].length;
        }
        return result;
    }

    class PDSerialTransformer {
        constructor() {
            this.mode = 1 /* Lines */;
            this.lineBuffer = '';
            this.asciiDecoder = new TextDecoder('ascii');
            this.bytePackets = [];
            this.bytesReceived = 0;
            // if not 0, transformer will collect byte input until this many bytes have been read
            this.bytesTarget = 0;
            this.dataReceivedCallback = (data) => { };
        }
        onData(callbackFn) {
            this.dataReceivedCallback = callbackFn;
        }
        setMode(mode) {
            if (this.mode !== mode) {
                if (mode === 1 /* Lines */) {
                    this.lineBuffer = '';
                }
                else if (mode === 0 /* Bytes */) {
                    this.bytePackets = [];
                    this.bytesReceived = 0;
                    this.bytesTarget = 0;
                }
                this.mode = mode;
            }
        }
        clearOut() {
            if (this.mode === 1 /* Lines */)
                this.controller.enqueue('');
            else if (this.mode === 0 /* Bytes */)
                this.controller.enqueue(new Uint8Array(0));
        }
        start(controller) {
            this.controller = controller;
        }
        transform(chunk, controller) {
            if (this.mode === 1 /* Lines */)
                this.transformLines(chunk, controller);
            else if (this.mode === 0 /* Bytes */)
                this.transformBytes(chunk, controller);
            this.dataReceivedCallback(chunk);
        }
        flush(controller) {
            if (this.mode === 1 /* Lines */)
                this.flushLines(controller);
            else if (this.mode === 0 /* Bytes */)
                this.flushBytes(controller);
        }
        transformLines(chunk, controller) {
            this.lineBuffer += this.asciiDecoder.decode(chunk);
            const lines = this.lineBuffer.split(/\r?\n/);
            this.lineBuffer = lines.pop();
            lines.forEach(line => controller.enqueue(line));
        }
        transformBytes(chunk, controller) {
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
        flushLines(controller) {
            controller.enqueue(this.lineBuffer);
            this.lineBuffer = '';
        }
        flushBytes(controller) { }
    }

    /**
     * Handles USB connection and sending data to and fro
     * Intended to be a generic serial interface, with no specific knowledge of the playdate and its commands
     */
    class PDSerial {
        constructor(port, options) {
            this.errorCallback = () => { };
            this.isOpen = false;
            this.isReading = false;
            this.isWaitingForRead = false;
            this.handleDisconnectEvent = () => {
                this.isOpen = false;
                this.isReading = false;
            };
            this.port = port;
            this.options = options;
            port.addEventListener('disconnect', this.handleDisconnectEvent);
        }
        onData(callbackFn) {
            this.readTransformer.onData(callbackFn);
        }
        onError(callbackFn) {
            this.errorCallback = callbackFn;
        }
        /**
         * Open the serial device to start communication
         */
        open() {
            return __awaiter(this, void 0, void 0, function* () {
                yield this.port.open(Object.assign({}, this.options));
                this.readTransformer = new PDSerialTransformer();
                const readable = this.port.readable;
                const stream = readable.pipeThrough(new TransformStream(this.readTransformer));
                this.reader = stream.getReader();
                this.isOpen = true;
            });
        }
        /**
         * Closes the serial device, stopping communication
         */
        close() {
            return __awaiter(this, void 0, void 0, function* () {
                yield this.reader.cancel();
                yield this.port.close();
                this.isOpen = false;
            });
        }
        /**
         * Sends an Uint8Array to the serial device
         */
        write(bytes) {
            return __awaiter(this, void 0, void 0, function* () {
                assert(this.isOpen, 'Serial is not open, please call open() before beginning to write data');
                const writer = this.port.writable.getWriter();
                yield writer.write(bytes);
                writer.releaseLock();
            });
        }
        /**
         * Send an ascii string to the serial device
         */
        writeAscii(str) {
            return __awaiter(this, void 0, void 0, function* () {
                const bytes = stringToBytes(str);
                return yield this.write(bytes);
            });
        }
        /**
         * Reads an Uint8Array from the serial device
         * If numBytes is 0, it will resolve as soon as some bytes are received
         * If numBytes is more than 0, it will resolved when *at least* that many bytes have been received -- the actual buffer could be a bit longer
         */
        readBytes(numBytes = 0) {
            return __awaiter(this, void 0, void 0, function* () {
                assert(!this.isReading, 'A read was queued while another was still in progress');
                this.isReading = true;
                try {
                    this.readTransformer.setMode(0 /* Bytes */);
                    this.readTransformer.bytesTarget = numBytes;
                    const { value } = yield this.reader.read();
                    this.readTransformer.bytesTarget = 0;
                    this.isReading = false;
                    return value;
                }
                catch (error) {
                    this.isReading = false;
                    this.errorCallback(error);
                }
            });
        }
        /**
         * Clear the current reader.read() call that's being awaited, to prevent it from blocking further reads...
         */
        clearRead() {
            return __awaiter(this, void 0, void 0, function* () {
                if (this.port.readable && this.isWaitingForRead) {
                    this.readTransformer.clearOut();
                    this.isWaitingForRead = false;
                }
            });
        }
        /**
         * Reads a single line of ascii text from the serial device
         * Newline characters are not included, some lines may be empty
         */
        readLine() {
            return __awaiter(this, void 0, void 0, function* () {
                assert(!this.isReading, 'A read was queued while another was still in progress');
                this.isReading = true;
                try {
                    this.readTransformer.setMode(1 /* Lines */);
                    const { value } = yield this.reader.read();
                    this.isReading = false;
                    return value;
                }
                catch (error) {
                    this.isReading = false;
                    this.errorCallback(error);
                }
            });
        }
        /**
         * Do one of the above read functions, but make it timeout after a given number of milliseconds
         * This is used to read everything until the device has nothing more to send
         */
        doReadWithTimeout(timeoutMs, readFn, ...readFnArgs) {
            return __awaiter(this, void 0, void 0, function* () {
                return new Promise((resolve, reject) => {
                    this.isWaitingForRead = true;
                    const timer = setTimeout(() => {
                        resolve({ value: null, done: true });
                        // this is SUPER IMPORTANT, the readFn that has timed out still needs to complete somehow,
                        // otherwise it will just block further reads
                        // I imagine there's a nicer way to handle this, but I can't find any good information out there...
                        this.clearRead();
                    }, timeoutMs);
                    try {
                        readFn.bind(this)(...readFnArgs).then((result) => {
                            clearTimeout(timer);
                            this.isWaitingForRead = false;
                            resolve({ value: result, done: false });
                        });
                    }
                    catch (error) {
                        clearTimeout(timer);
                        reject(error);
                    }
                });
            });
        }
        /**
         * Read lines until a timeout happens, indicating there's no more lines to read for now
         */
        readLinesUntilTimeout(ms = 50) {
            return __awaiter(this, void 0, void 0, function* () {
                const lines = [];
                while (this.isOpen && this.port.readable) {
                    try {
                        const { value, done } = yield this.doReadWithTimeout(ms, this.readLine);
                        if (value !== null)
                            lines.push(value);
                        if (done)
                            return lines;
                    }
                    catch (error) {
                        this.errorCallback(error);
                    }
                }
            });
        }
        /**
         * Read bytes until a timeout happens, indicating there's no more bytes to read for now
         */
        readBytesUntilTimeout(ms = 50) {
            return __awaiter(this, void 0, void 0, function* () {
                const chunks = [];
                while (this.isOpen && this.port.readable) {
                    try {
                        const { value, done } = yield this.doReadWithTimeout(ms, this.readBytes);
                        if (value !== null)
                            chunks.push(value);
                        if (done)
                            return mergeByteChunks(chunks);
                    }
                    catch (error) {
                        this.errorCallback(error);
                    }
                }
            });
        }
    }

    /**
     * Names for each button bitmask
     */
    const PDButtonNameMap = {
        [1 /* kButtonLeft */]: 'left',
        [2 /* kButtonRight */]: 'right',
        [4 /* kButtonUp */]: 'up',
        [8 /* kButtonDown */]: 'down',
        [16 /* kButtonB */]: 'a',
        [32 /* kButtonA */]: 'b',
        [64 /* kButtonMenu */]: 'menu',
        [128 /* kButtonLock */]: 'lock',
    };
    /**
     * Maps button name strings back to the button bitmask
     */
    const PDButtonBitmaskMap = {
        'left': 1 /* kButtonLeft */,
        'right': 2 /* kButtonRight */,
        'up': 4 /* kButtonUp */,
        'down': 8 /* kButtonDown */,
        'a': 16 /* kButtonB */,
        'b': 32 /* kButtonA */,
        'menu': 64 /* kButtonMenu */,
        'lock': 128 /* kButtonLock */,
    };

    // Playdate USB vendor and product IDs
    const PLAYDATE_VID = 0x1331;
    const PLAYDATE_PID = 0x5740;
    const USB_FILTER = { usbVendorId: PLAYDATE_VID, usbProductId: PLAYDATE_PID };
    // Serial settings
    const PLAYDATE_BAUDRATE = 115200;
    const PLAYDATE_BUFFER_SIZE = 12800;
    // Playdate screen dimensions
    const PLAYDATE_WIDTH = 400;
    const PLAYDATE_HEIGHT = 240;
    /**
     * Represents a Playdate device connected over USB, and provides some methods for communicating with it
     */
    class PlaydateDevice {
        constructor(port) {
            this.isConnected = true;
            this.isPollingControls = false;
            this.isStreaming = false;
            this.lastButtonPressedFlags = 0;
            this.lastButtonJustReleasedFlags = 0;
            this.lastButtonJustPressedFlags = 0;
            this.logCommandResponse = false;
            this.events = {};
            this.handleDisconnectEvent = () => {
                this.isConnected = false;
                this.emit('disconnect');
            };
            this.handleSerialDataEvent = (data) => {
                this.emit('data', data);
            };
            this.handleSerialErrorEvent = (err) => {
                this.emit('error', err);
                throw err;
            };
            this.port = port;
            this.serial = new PDSerial(port, {
                baudRate: PLAYDATE_BAUDRATE,
                bufferSize: PLAYDATE_BUFFER_SIZE
            });
            this.port.addEventListener('disconnect', this.handleDisconnectEvent);
        }
        static requestDevice() {
            return __awaiter(this, void 0, void 0, function* () {
                const port = yield navigator.serial.requestPort({ filters: [USB_FILTER] });
                return new PlaydateDevice(port);
            });
        }
        static getDevices() {
            return __awaiter(this, void 0, void 0, function* () {
                const ports = yield navigator.serial.getPorts();
                return ports
                    .filter(port => {
                    const { usbProductId, usbVendorId } = port.getInfo();
                    return usbProductId === PLAYDATE_PID && usbVendorId === PLAYDATE_VID;
                })
                    .map(port => new PlaydateDevice(port));
            });
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
        on(eventType, callback) {
            (this.events[eventType] || (this.events[eventType] = [])).push(callback);
        }
        /**
         * Remove an event callback
         */
        off(eventType, callback) {
            const callbackList = this.events[eventType];
            if (callbackList)
                callbackList.splice(callbackList.indexOf(callback), 1);
        }
        /**
         * Emit an event
         */
        emit(eventType, ...args) {
            const callbackList = this.events[eventType] || [];
            callbackList.forEach(fn => fn.apply(this, args));
        }
        /**
         * Open a device for communication
         */
        open() {
            return __awaiter(this, void 0, void 0, function* () {
                yield this.serial.open();
                this.serial.onData(this.handleSerialDataEvent);
                this.serial.onError(this.handleSerialErrorEvent);
                // we want echo to be off by default (playdate simulator does this first)
                const lines = yield this.sendCommand(`echo off`);
                assert(Array.isArray(lines), 'Open error - Playdate did not respond, maybe something else is interacting with it?');
                const resp = lines.pop();
                // echo off should respond with nothing but a blank line
                // if echo was previously set to on, it will echo the given command one last time in response
                assert(resp === '' || resp.includes('echo off'), `Open error - invalid echo command response, got ${resp}`);
                this.emit('open');
            });
        }
        /**
         * Close a device for communication
         */
        close() {
            return __awaiter(this, void 0, void 0, function* () {
                // seems to help if the session goofed up and the device is still trying to send data
                // stop any continually running commands
                if (this.isPollingControls)
                    yield this.stopPollingControls();
                // actually close the device
                yield this.serial.close();
                this.emit('close');
            });
        }
        /**
         * Get version information about the Playdate; its OS build info, SDK version, serial number, etc
         */
        getVersion() {
            return __awaiter(this, void 0, void 0, function* () {
                const lines = yield this.sendCommand('version');
                const parsed = {};
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
            });
        }
        /**
         * Get the Playdate's serial number
         */
        getSerial() {
            return __awaiter(this, void 0, void 0, function* () {
                const lines = yield this.sendCommand('serialread');
                return lines.find(line => line !== '');
            });
        }
        /**
         * Capture a screenshot from the Playdate, and get the raw framebuffer
         * This will return the 1-bit framebuffer data as an Uint8Array of bytes, where each bit in the byte will represent 1 pixel; `0` for black, `1` for white
         * The framebuffer is 400 x 240 pixels
         */
        getScreen() {
            return __awaiter(this, void 0, void 0, function* () {
                this.assertNotBusy();
                yield this.serial.writeAscii('screen\n');
                const bytes = yield this.serial.readBytes(12011);
                assert(bytes.byteLength >= 12011, `Screen command response is too short, got ${bytes.byteLength} bytes`);
                const header = stringToBytes('~screen:\n');
                let ptr = bytesPos(bytes, header);
                assert(ptr !== -1, 'Invalid screen command response');
                ptr += header.length;
                const frameBuffer = bytes.subarray(ptr, ptr + 12000);
                return frameBuffer;
            });
        }
        /**
         * Capture a screenshot from the Playdate, and get the unpacked framebuffer
         * This will return an 8-bit indexed framebuffer as an Uint8Array of pixels. Each element of the array will represent a single pixel; `0x0` for black, `0x1` for white
         * The framebuffer is 400 x 240 pixels
         */
        getScreenIndexed() {
            return __awaiter(this, void 0, void 0, function* () {
                const framebuffer = yield this.getScreen();
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
            });
        }
        /**
         * Send a 1-bit bitmap buffer to display on the Playdate's screen
         * The input bitmap must be an Uint8Array of bytes, where each bit in the byte will represent 1 pixel; `0` for black, `1` for white.
         * The input bitmap must also contain 400 x 240 pixels
         */
        sendBitmap(bitmap) {
            return __awaiter(this, void 0, void 0, function* () {
                this.assertNotBusy();
                assert(bitmap.length === 12000, `Bitmap size is incorrect; should be 12000 (400 * 240 / 8), got ${bitmap.length}`);
                const bytes = new Uint8Array(12007);
                bytes.set(stringToBytes('bitmap\n'), 0);
                bytes.set(bitmap, 7);
                yield this.serial.write(bytes);
                const [str] = yield this.serial.readLinesUntilTimeout();
                assert(str === '', `Invalid bitmap send response, got ${str}`);
            });
        }
        /**
         * Send a indexed bitmap to display on the Playdate's screen
         * The input bitmap must be an Uint8Array of bytes, each byte in the array will represent 1 pixel; `0x0` for black, `0x1` for white.
         * The input bitmap must also contain 400 x 240 pixels
         */
        sendBitmapIndexed(indexed) {
            return __awaiter(this, void 0, void 0, function* () {
                assert(indexed.length === 96000, `Bitmap size is incorrect; should be 96000 (400 * 240), got ${indexed.length}`);
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
                yield this.sendBitmap(bitmap);
            });
        }
        /**
         * Begin polling for control updates. Can be stopped with `stopPollingControls()`
         * While this is active, you won't be able to communicate with the device
         */
        startPollingControls() {
            return __awaiter(this, void 0, void 0, function* () {
                this.assertNotBusy();
                yield this.serial.writeAscii('buttons\n');
                this.emit('controls:start');
                // isPollingControls will be set to false when stopPollingControls() is called
                this.isPollingControls = true;
                this.pollControlsLoop();
            });
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
        buttonIsPressed(button) {
            assert(this.isPollingControls, 'Please begin polling Playdate controls by calling startPollingControls() first');
            if (typeof (button) === 'string')
                button = PDButtonBitmaskMap[button];
            return (this.lastButtonPressedFlags & button) !== 0;
        }
        /**
         * Equivalent to Playdate SDK's playdate.buttonJustPressed(button)
         */
        buttonJustPressed(button) {
            assert(this.isPollingControls, 'Please begin polling Playdate controls by calling startPollingControls() first');
            if (typeof (button) === 'string')
                button = PDButtonBitmaskMap[button];
            return (this.lastButtonJustPressedFlags & button) !== 0;
        }
        /**
         * Equivalent to Playdate SDK's playdate.buttonJustReleased(button)
         */
        buttonJustReleased(button) {
            assert(this.isPollingControls, 'Please begin polling Playdate controls by calling startPollingControls() first');
            if (typeof (button) === 'string')
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
        stopPollingControls() {
            return __awaiter(this, void 0, void 0, function* () {
                assert(this.isPollingControls, 'Controls are not currently being polled');
                yield this.serial.writeAscii('\n');
                this.lastControlState = undefined;
                this.lastButtonPressedFlags = 0;
                this.lastButtonJustReleasedFlags = 0;
                this.lastButtonJustPressedFlags = 0;
                this.isPollingControls = false;
            });
        }
        /**
         * Launch a .PDX rom at a given path, e.g. '/System/Crayons.pdx'
         */
        run(path) {
            return __awaiter(this, void 0, void 0, function* () {
                assert(path.startsWith('/'), 'Path must begin with a forward slash, e.g. "/System/Crayons.pdx"');
                const [str] = yield this.sendCommand(`run ${path}`);
                assert(str === '', `Invalid run response, got ${str}`);
            });
        }
        /**
         * Eval a pre-compiled lua function payload (has to be compiled with pdc) on the device
         */
        evalLuaPayload(payload, waitTime = 50) {
            return __awaiter(this, void 0, void 0, function* () {
                const cmd = `eval ${payload.byteLength}\n`;
                const data = new Uint8Array(cmd.length + payload.byteLength);
                data.set(stringToBytes(cmd), 0);
                data.set(new Uint8Array(payload), cmd.length);
                yield this.serial.write(data);
                return yield this.serial.readLinesUntilTimeout(waitTime);
            });
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
        sendCommand(command) {
            return __awaiter(this, void 0, void 0, function* () {
                assert(this.isOpen);
                this.assertNotBusy();
                yield this.serial.writeAscii(`${command}\n`);
                const lines = yield this.serial.readLinesUntilTimeout();
                if (this.logCommandResponse) {
                    console.log(lines.join('\n'));
                }
                return lines;
            });
        }
        /**
         * Continually read lines while control polling is active
         * Probably don't want to call this with await so that it doesn't lock everything
         */
        pollControlsLoop() {
            return __awaiter(this, void 0, void 0, function* () {
                while (this.isPollingControls && this.port.readable) {
                    try {
                        const line = yield this.serial.readLine();
                        const state = this.parseControlState(line);
                        if (state) {
                            this.emit('controls:update', state);
                        }
                    }
                    catch (e) {
                        // if isPollingControls is false, that means stopPollingControls() was called, 
                        // and we can ignore this error because it cancels any ongoing transfers
                        // if it's still true, it means something actually went wrong
                        if (this.isPollingControls)
                            throw e;
                    }
                }
                // only reached when stopped
                this.emit('controls:stop');
            });
        }
        assertNotBusy() {
            assert(!this.isBusy, 'Device is currently busy, stop polling controls or streaming to send further commands');
        }
        parseControlState(state) {
            const parsed = state.match(/buttons:([A-F0-9]{2}) ([A-F0-9]{2}) ([A-F0-9]{2}) crank:(\d+\.?\d+) docked:(\d)/);
            if (parsed) {
                const pressed = parseInt(parsed[1], 16);
                const justPressed = parseInt(parsed[2], 16);
                const justReleased = parseInt(parsed[3], 16);
                const crank = parseFloat(parsed[4]);
                const crankDocked = parsed[5] === '1';
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
        parseButtonFlags(flags) {
            return {
                [PDButtonNameMap[2 /* kButtonRight */]]: (flags & 2 /* kButtonRight */) !== 0,
                [PDButtonNameMap[1 /* kButtonLeft */]]: (flags & 1 /* kButtonLeft */) !== 0,
                [PDButtonNameMap[4 /* kButtonUp */]]: (flags & 4 /* kButtonUp */) !== 0,
                [PDButtonNameMap[8 /* kButtonDown */]]: (flags & 8 /* kButtonDown */) !== 0,
                [PDButtonNameMap[16 /* kButtonB */]]: (flags & 16 /* kButtonB */) !== 0,
                [PDButtonNameMap[32 /* kButtonA */]]: (flags & 32 /* kButtonA */) !== 0,
                [PDButtonNameMap[64 /* kButtonMenu */]]: (flags & 64 /* kButtonMenu */) !== 0,
                [PDButtonNameMap[128 /* kButtonLock */]]: (flags & 128 /* kButtonLock */) !== 0,
            };
        }
    }

    /**
     * Check that Web Serial is supported in the current environment
     * Returns true if Web Serial is supported, false if not
     */
    function isUsbSupported() {
        return window.isSecureContext && navigator.serial !== undefined;
    }
    /**
     * Assert that Web Serial is supported in the current environment
     * This does the same thing as isUsbSupported, but will instead throw a useful error message detailing why Web Serial isn't supported
     */
    function assertUsbSupported() {
        assert(window.isSecureContext, 'Web Serial is only supported in secure contexts\nhttps://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts');
        assert(navigator.serial !== undefined, 'Web Serial is not supported by this browser.\nhttps://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API#browser_compatibility');
    }
    /**
     * Request a connection to a Playdate - the browser will prompt the user to select a device. Will throw an error if no device was found or selected
     */
    function requestConnectPlaydate() {
        return __awaiter(this, void 0, void 0, function* () {
            assertUsbSupported();
            return yield PlaydateDevice.requestDevice();
        });
    }
    /**
     * Button constants for input state methods
     */
    const kButtonLeft = 1 /* kButtonLeft */;
    const kButtonRight = 2 /* kButtonRight */;
    const kButtonUp = 4 /* kButtonUp */;
    const kButtonDown = 8 /* kButtonDown */;
    const kButtonB = 16 /* kButtonB */;
    const kButtonA = 32 /* kButtonA */;
    const kButtonMenu = 64 /* kButtonMenu */;
    const kButtonLock = 128 /* kButtonLock */;
    /**
     * Provides the current version of the pd-usb library for debugging
     */
    const version = "2.0.1"; // replaced by @rollup/plugin-replace; see rollup.config.js

    exports.PDButtonBitmaskMap = PDButtonBitmaskMap;
    exports.PDButtonNameMap = PDButtonNameMap;
    exports.PDSerial = PDSerial;
    exports.PLAYDATE_BAUDRATE = PLAYDATE_BAUDRATE;
    exports.PLAYDATE_BUFFER_SIZE = PLAYDATE_BUFFER_SIZE;
    exports.PLAYDATE_HEIGHT = PLAYDATE_HEIGHT;
    exports.PLAYDATE_PID = PLAYDATE_PID;
    exports.PLAYDATE_VID = PLAYDATE_VID;
    exports.PLAYDATE_WIDTH = PLAYDATE_WIDTH;
    exports.PlaydateDevice = PlaydateDevice;
    exports.USB_FILTER = USB_FILTER;
    exports.assertUsbSupported = assertUsbSupported;
    exports.isUsbSupported = isUsbSupported;
    exports.kButtonA = kButtonA;
    exports.kButtonB = kButtonB;
    exports.kButtonDown = kButtonDown;
    exports.kButtonLeft = kButtonLeft;
    exports.kButtonLock = kButtonLock;
    exports.kButtonMenu = kButtonMenu;
    exports.kButtonRight = kButtonRight;
    exports.kButtonUp = kButtonUp;
    exports.requestConnectPlaydate = requestConnectPlaydate;
    exports.version = version;

    Object.defineProperty(exports, '__esModule', { value: true });

})));
