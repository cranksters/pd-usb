# playdate-usb

JavaScript library for interacting with a [Panic Playdate](http://play.date/) console over USB, wherever [WebUSB](https://web.dev/usb/) is supported.

## Features

 - Get Playdate device stats such as its version info, serial, cpu stats, etc
 - Take a screenshot of the Playdate's screen and draw it to a HTML5 canvas, or send an image to be previewed
 - Read the Playdate's button and crank input state
 - Execute secret commands!
 - Extensive error handling with helpful error messages
 - Exports full Typescript types, has zero dependencies, and weighs less than 4kb minified and gzipped

## Examples

> ⚠️ TODO: list examples

## Installation

> ⚠️ TODO: this project isn't actually on NPM or Unpkg yet, that will happen on release!

### With NPM

```shell
npm install playdate-usb --save
```

Then assuming you're using a module-compatible system (like Webpack, Rollup, etc):

```js
import { requestConnectPlaydate } from 'playdate-usb';

async function connectToPlaydate() {
  const playdate = await requestConnectPlaydate();
}
```

### Directly in a browser

Using the modules directly via Unpkg:

```html
<script type="module">
  import { requestConnectPlaydate } from 'https://unpkg.com/playdate-usb?module';

  async function connectToPlaydate() {
    const playdate = await requestConnectPlaydate();
  }
</script>
```

Using an external script reference

```html
<script src="https://unpkg.com/playdate-usb/dist/playdate-usb.min.js"></script>
<script>
  async function connectToPlaydate() {
    const playdate = await playdateUsb.requestConnectPlaydate();
  }
</script>
```

When using the library this way, a global called `playdateUsb` will be created containing all the exports from the module version.

## Usage

### Preamble

This library uses WebUSB to connect to the Playdate, however due to the asynchronous nature of WebUSB, this library uses [`async/await`](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Async_await) a lot. If you're not already familiar with that, now would be a good time to catch up!

### Detecting WebUSB support

WebUSB is also only supported in [Secure Contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts), and only in [certain browsers](https://developer.mozilla.org/en-US/docs/Web/API/USB#browser_compatibility) (currently Google Chrome, Microsoft Edge, and Opera). 

You can use the `isUsbSupported()` method to check if the current environment supports WebUSB:

```js
import { isUsbSupported } from 'playdate-usb';

if (!isUsbSupported) {
  alert('Sorry, your browser does not support USB, and cannot connect to a Playdate :(')
}
```

### Connecting a Playdate

Next we want to actually connect to a Playdate. Calling `requestConnectPlaydate()` will prompt the user to select a Playdate device from a menu, and returns a [Promise](https://web.dev/promises/) that will resolve a `PlaydateDevice` object if the connection was successful, or reject if a connection could not be made.

For security reasons, `requestConnectPlaydate()` can only be called with a user interaction, such as a click. It's recommended to create a "Connect to Playdate" button somewhere on your page:

```html
<button id="connectButton">Connect to Playdate</button>
```

Then call `requestConnectPlaydate()` in the button's `click` event callback function:

```js
import { requestConnectPlaydate } from 'playdate-usb';

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

### PlaydateDevice API

> ⚠️ TODO: document these functions

#### `open()`

#### `close()`

#### `getVersion()`

#### `getSerial()`

#### `getScreen()`

#### `getScreenIndexed()`

#### `sendBitmap()`

#### `sendBitmapIndexed()`

#### `startPollingControls()`

#### `getControls()`

#### `stopPollingControls()`

#### `sendCommand()`

Sends a plaintext command directly to the Playdate, and returns the response as a string. You can use `await sendCommand('help')` to get a list of all available commands.

> ⚠️ The commands that this library wraps with functions (such as `getVersion()` or `getScreen()`) are known to be safe, are used by the Playdate Simulator, and have all been tested on actual Playdate hardware. However, some of the commands that you can potentially run with `sendCommand()` could be dangerous, and might even harm your favorite yellow handheld if you don't know what you're doing. *Please* don't execute any commands that you're unsure about.

## Contributing

`npm install`

 - `npm start` - Begins a dev server on your machine's localhost that serves the `example` directory and refreshes on changes.
 - `npm run build`

If you have any questions or just want to say hi, you can reach me on Twitter ([@rakujira](https://twitter.com/rakujira)), on Discord (`@jaames#9860`), or via email (`mail at jamesdaniel dot dev`).

## Special Thanks

 - [Matt Sephton](https://github.com/gingerbeardman) for helping me get access to the Playdate Developer Preview
 - This [blogpost from Secure Systems Lab](https://ssl.engineering.nyu.edu/blog/2018-01-08-WebUSB) on reverse-engineering USB with WireShark and translating from captured packets to WebUSB calls
 - Suz Hinton's fun [talk about WebUSB at JSConf 2018](https://www.youtube.com/watch?v=IpfZ8Nj3uiE)
 - The folks at [Panic](https://panic.com/) for making such a wonderful and fascinating handheld

 ----

 2021 James Daniel

 Playdate is © [Panic Inc.](https://panic.com/) This project isn't affiliated with or endorsed by them in any way