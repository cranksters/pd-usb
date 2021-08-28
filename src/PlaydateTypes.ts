/**
 * Playdate version information, retrieved by getVersion()
 */
export interface PlaydateVersion {
  sdk: string;
  build: string;
  bootBuild: string;
  cc: string;
  pdxVersion: string;
  serial: string;
  target: string;
};

/**
 * Playdate hardware buttons
 */
export enum PlaydateButton {
  kButtonA = 'a',
  kButtonB = 'b',
  kButtonUp = 'up',
  kButtonDown = 'down',
  kButtonLeft = 'left',
  kButtonRight = 'right',
  kButtonMenu = 'menu',
  kButtonLock = 'lock',
};

/**
 * Bitmasks for each button, used for parsing "button" command values
 */
export const PlaydateButtonBitmask: Record<PlaydateButton, number> = {
  [PlaydateButton.kButtonLeft]:  1,
  [PlaydateButton.kButtonRight]: 1 << 1,
  [PlaydateButton.kButtonUp]:    1 << 2,
  [PlaydateButton.kButtonDown]:  1 << 3,
  [PlaydateButton.kButtonB]:     1 << 4,
  [PlaydateButton.kButtonA]:     1 << 5,
  [PlaydateButton.kButtonMenu]:  1 << 6,
  [PlaydateButton.kButtonLock]:  1 << 7,
};

/**
 * Represents parsed button bitflags as a series of bools for each button
 */
export interface PlaydateButtonState {
  [PlaydateButton.kButtonLeft]:  boolean,
  [PlaydateButton.kButtonRight]: boolean,
  [PlaydateButton.kButtonUp]:    boolean,
  [PlaydateButton.kButtonDown]:  boolean,
  [PlaydateButton.kButtonB]:     boolean,
  [PlaydateButton.kButtonA]:     boolean,
  [PlaydateButton.kButtonMenu]:  boolean,
  [PlaydateButton.kButtonLock]:  boolean,
};

/**
 * Represents parse control state
 */
export interface PlaydateControlState {
  crank: number;
  crankDocked: boolean;
  button: PlaydateButtonState;
  buttonDown: PlaydateButtonState;
  buttonUp: PlaydateButtonState;
};