# pd-usb

JavaScript library for interacting with a [Panic Playdate](http://play.date/) console over USB, wherever [WebSerial](https://web.dev/serial/) is supported.

> ⚠️ This library is unofficial and is not affiliated with Panic. Details on the USB protocol were gleaned from reverse-engineering and packet sniffing. Things may be incorrect!

## Features

 - Get Playdate device stats such as its version info, serial, cpu stats, etc
 - Grab a screenshot from the Playdate and draw it to a HTML5 canvas, or send an image to be previewed on the device
 - Read the button and crank input state
 - Execute secret commands!
 - Send compiled Lua payloads over USB!
 - Extensive error handling with helpful error messages
 - Exports full Typescript types, has zero dependencies, and weighs less than 5kb minified and gzipped

## Examples

 - [Basic Connection](https://jaames.github.io/pd-usb/example-basic.html)
 - [Input State Capture](https://jaames.github.io/pd-usb/example-controller.html)
 - [Screenshot Capture](https://jaames.github.io/pd-usb/example-screen.html)
 - [Send Bitmap](https://jaames.github.io/pd-usb/example-send-bitmap.html)
 - [Execute Lua Payload](https://jaames.github.io/pd-usb/example-eval.html)

## Installation

### With NPM

```shell
npm install pd-usb --save
```

Then assuming you're using a module-compatible system (like Webpack, Rollup, etc):

```js
import { requestConnectPlaydate } from 'pd-usb';

async function connectToPlaydate() {
  const playdate = await requestConnectPlaydate();
}
```

### Directly in a browser

Using the module directly via Unpkg:

```html
<script type="module">
  import { requestConnectPlaydate } from 'https://unpkg.com/pd-usb?module';

  async function connectToPlaydate() {
    const playdate = await requestConnectPlaydate();
  }
</script>
```

Using an external script reference

```html
<script src="https://unpkg.com/pd-usb/dist/pd-usb.min.js"></script>
<script>
  async function connectToPlaydate() {
    const playdate = await pdusb.requestConnectPlaydate();
  }
</script>
```

When using the library this way, a global called `pdusb` will be created containing all the exports from the module version.

## Usage

### Preamble

WebSerial is asynchronous by nature, so this library uses [`async/await`](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Async_await) a lot. If you're not already familiar with that, now would be a good time to catch up!

### Detecting WebSerial support

WebSerial is also only supported in [Secure Contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts), and only in [certain browsers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API#browser_compatibility) (currently Google Chrome, Microsoft Edge, and Opera). 

You can use the `isUsbSupported()` method to check if the current environment supports WebSerial:

```js
import { isUsbSupported } from 'pd-usb';

if (!isUsbSupported) {
  alert('Sorry, your browser does not support USB, and cannot connect to a Playdate :(')
}
```

### Connecting to a Playdate

Next we want to actually connect to a Playdate. Calling `requestConnectPlaydate()` will prompt the user to select a Playdate device from a menu, and returns a [Promise](https://web.dev/promises/) that will resolve a `PlaydateDevice` object if the connection was successful, or reject if a connection could not be made.

For security reasons, `requestConnectPlaydate()` can only be called with a user interaction, such as a click. It's recommended to create a "Connect to Playdate" button somewhere on your page:

```html
<button id="connectButton">Connect to Playdate</button>
```

Then call `requestConnectPlaydate()` in the button's `click` event callback function:

```js
import { requestConnectPlaydate } from 'pd-usb';

const button = document.getElementById('connectButton');

button.addEventListener('click', async() => {
  try {
    const device = await requestConnectPlaydate();
    // do something with device here...
  }
  catch (e) {
    alert('Could not connect to Playdate, lock and unlock the device and try again.');
  }
});
```

### Open and close a PlaydateDevice

Before interacting with the device, you need to make sure that it is open for communication. This can be done by calling `PlaydateDevice`'s asynchronous `open` method, which returns a promise that resolves when the device is ready, or throws an error if a connection could not be opened.

After you are done, it's a good idea to end by calling the `close` method to stop the connection. This function is also asynchronous and returns a Promise that resolves when the device has been closed successfully. Note that browsers seen to handle closing the device when you leave or refresh a page, so it's not the end of the world if you forget this.

```js
await device.open();

// interact with the device here...

await device.close();
```

### PlaydateDevice events

A `PlaydateDevice` instance will fire events when certain things happen, allowing you to write code to handle things such as the device being disconnected.

You can add event listeners with the `PlaydateDevice`'s `on` method, and remove then with the `off` method.

```js
function handleDisconnect() {
  alert('Oh no, the Playdate has been disconnected! Please plug it back in!')
}

// add an event handler
// the handleDisconnect function will be called whenever the disconnect event fires
device.on('disconnect', handleDisconnect);

// remove an event handler
device.off('disconnect', handleDisconnect);
```

The following events are available:

| Event | Details |
|:------|:--------|
| `open` | The device has been opened |
| `close` | The device has been closed |
| `disconnect` | The device has been physically disconnected |
| `controls:start` | Control-polling mode has been started |
| `controls:update` | A new control state has been received while control-polling mode is active |
| `controls:stop` | Control-polling mode has been stopped |

### PlaydateDevice general API

These methods are asynchronous and will resolve when a response has been received from the Playdate, so you need to remember to use `async/await`.

#### `getVersion`

Returns an object containing version information about the Playdate, such as its OS build info, SDK version, serial number, etc.

```js
const version = await device.getVersion();
```

#### `getSerial`

Returns the Playdate's serial number as a string, useful for if you need the user to be able to identify the connected device.

```js
const serial = await device.getSerial();
```

#### `getScreen`

Capture a screenshot from the Playdate, and get the raw framebuffer. This will return the 1-bit framebuffer data as [Uint8Array](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array) of bytes, where each bit in the byte will represent 1 pixel; `0` for black, `1` for white. The framebuffer is 400 x 240 pixels

```js
const screenBuffer = await device.getScreen();
```

#### `getScreenIndexed`

Capture a screenshot from the Playdate, and get the unpacked framebuffer. This will return an 8-bit indexed framebuffer as an [Uint8Array](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array). Each element of the array will represent a single pixel; `0x0` for black, `0x1` for white. The framebuffer is 400 x 240 pixels.

```js
const screenPixels = await device.getScreenIndexed();
```

If you want to draw the screen to a HTML5 canvas, check out the [screen example](https://github.com/jaames/pd-usb/blob/main/examples/example-screen.html).

#### `sendBitmap`

Send a 1-bit bitmap buffer to display on the Playdate's screen. The input bitmap must be an [Uint8Array](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array) of bytes, where each bit in the byte will represent 1 pixel; `0` for black, `1` for white. The input bitmap must also contain 400 x 240 pixels.

```js
const screenBuffer = new Uint8Array(12000);

// put some pixels into screenBuffer here

await device.sendBitmap(screenBuffer);
```

#### `sendBitmapIndexed`

Send a indexed bitmap to display on the Playdate's screen. The input bitmap must be an [Uint8Array](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array) of bytes, each byte in the array will represent 1 pixel; `0x0` for black, `0x1` for white. The input bitmap must also contain 400 x 240 pixels.

```js
const pixels = new Uint8Array(400 * 240);

// put some pixels into the pixels array here

await device.sendBitmapIndexed(pixels);
```

If you want to creating a bitmap using a HTML5 canvas, check out the [bitmap example](https://github.com/jaames/pd-usb/blob/main/examples/example-bitmap.html).

#### `run`

Launch a .pdx file at a given path on the Playdate's data disk. The path must begin with a forward slash, and the device may crash if the selected file does not exist.

```js
await device.run('/System/Crayons.pdx');
```

#### `sendCommand`

Sends a plaintext command directly to the Playdate, and returns the response as an array of strings for each line. You can use `await sendCommand('help')` to get a list of all available commands.

> ⚠️ The commands that this library wraps with functions (such as `getVersion()` or `getScreen()`) are known to be safe, are used by the Playdate Simulator, and have all been tested on actual Playdate hardware. However, some of the commands that you can potentially run with `sendCommand()` could be dangerous, and might even harm your favorite yellow handheld if you don't know what you're doing. *Please* don't execute any commands that you're unsure about!

#### `evalLuaPayload`

Sends a compiled Lua function to the device to be evaluated. The payload must be a Playdate-compatible Lua function compiled with `pdc` from the Playdate SDK. It will return anything printed to the device's console.

> ⚠️ This is pretty hardcore, you're probably not going to find this useable unless you really know what you're doing. 

```js
const payloadData = new Uint8Array(... put your payload data here);
await device.evalLuaPayload(payloadData);
```

### Reading Playdate controls

The Playdate can be put into a control polling mode, where it will send the current state of the buttons and crank at regular intervals. While control polling is active, you won't be able to communicate with the device.

Control polling can be started with `startPollingControls()` and stopped with `stopPollingControls()`. While polling is active, the `controls:update` event will be fired whenever a new control state is received, which seems to be every time the Playdate's update loop is run.

```js
// add a controls:update event handler
device.on('controls:update', function(state) {
  // handle control updates here...
  if (state.buttonDown.b) {
    console.log('B button is pressed!');
  }
});

// start polling controls
await device.startPollingControls();

// sometime later...
await device.stopPollingControls();
```

Please note that disconnecting your Playdate while control polling is active can sometimes cause future USB connections to goof up for a while. This library has code that tries to fix this by clearing the input buffer, but it doesn't seem to be perfect. If this happens, try locking and unlocking your device a few times!

### Getting the control state without an event

You can also query the Playdate's control state at your own pace, without using events. Note that these methods will only work while control polling is active.

#### `getControls()`

Returns the current control state as an object containing button states and crank angle/dock state.

```js
const state = device.getControls();
console.log('B button:', state.pressed.b);
console.log('Crank angle:', state.crank);
```

#### `buttonIsPressed(button)`, `buttonJustPressed(button)`, `buttonJustReleased(button)`

Equivalents to the Playdate SDK's [button query methods](https://sdk.play.date/1.9.3/Inside%20Playdate.html#_querying_buttons_directly).

`button` should be one of the constants:

- `pbusb.kButtonA`
- `pbusb.kButtonB`
- `pbusb.kButtonUp`
- `pbusb.kButtonDown`
- `pbusb.kButtonLeft`
- `pbusb.kButtonRight`
- `pbusb.kButtonMenu`
- `pbusb.kButtonLock`

Or one of the strings "a", "b", "up", "down", "left", "right", "menu", "lock".

#### `isCrankDocked()`, `getCrankPosition()`

Equivalents to the Playdate SDK's [crank query methods](https://sdk.play.date/1.9.3/Inside%20Playdate.html#_querying_crank_status_directly).

## Contributing

Contributions and ports to other languages are welcome! Here's a list of things I'd like to do, but haven't found the time yet:

- Node support
- Figure out how Playdate streaming works
- Stack traces, memory stats, CPU stats, etc
- Port to another language to build a general Playdate USB CLI tool?

### USB Docs

If you're looking for reference, I've documented the Playdate's USB protocol and some of the more interesting commands over on my [playdate-reverse-engineering](https://github.com/jaames/playdate-reverse-engineering/blob/main/usb/usb.md) repo.

### Setup

To build the project, you'll need to have Node and NPM installed. Clone the repo to your local machine, then run `npm install` in the project's root directory to grab dependencies. After that you can run `npm start` to begin a dev server on your machine's localhost and point it to the examples directory. You can run `npm run build` to build the production-ready files for distribution.

## Special Thanks

 - [Matt](https://github.com/gingerbeardman) for helping me get into the Playdate Developer Preview
 - This [blogpost from Secure Systems Lab](https://ssl.engineering.nyu.edu/blog/2018-01-08-WebUSB) on reverse-engineering USB with WireShark and translating from captured packets to WebUSB calls
 - Suz Hinton's fun [talk about WebUSB at JSConf 2018](https://www.youtube.com/watch?v=IpfZ8Nj3uiE)
 - The folks at [Panic](https://panic.com/) for making such a wonderful and fascinating handheld

----

2021 James Daniel

If you have any questions or just want to say hi, you can reach me on Twitter ([@rakujira](https://twitter.com/rakujira)), on Discord (`@jaames#9860`), or via email (`mail at jamesdaniel dot dev`).

Playdate is © [Panic Inc.](https://panic.com/) This project isn't affiliated with or endorsed by them in any way