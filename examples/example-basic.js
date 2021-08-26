async function usbInit() {
  const device = await playdateUsb.requestConnectPlaydate();
  await device.open();
  await device.screenDebug();
  window.device = device;
}