/**
 * Playdate version information, retrieved by getVersion()
 */
export interface PDVersion {
  sdk: string;
  build: string;
  bootBuild: string;
  cc: string;
  pdxVersion: string;
  serial: string;
  target: string;
};

/**
 * Playdate hardware button masks
 */
export const enum PDButton {
  kButtonLeft =  1,
  kButtonRight = 1 << 1,
  kButtonUp =    1 << 2,
  kButtonDown =  1 << 3,
  kButtonB =     1 << 4,
  kButtonA =     1 << 5,
  kButtonMenu =  1 << 6,
  kButtonLock =  1 << 7,
};

/**
 * Type for button name strings
 */
 export type PDButtonName = 'left' | 'right' | 'up' | 'down' | 'a' | 'b' | 'menu' | 'lock';

/**
 * Names for each button bitmask
 */
export const PDButtonNameMap: Record<PDButton, PDButtonName> = {
  [PDButton.kButtonLeft]:  'left',
  [PDButton.kButtonRight]: 'right',
  [PDButton.kButtonUp]:    'up',
  [PDButton.kButtonDown]:  'down',
  [PDButton.kButtonB]:     'a',
  [PDButton.kButtonA]:     'b',
  [PDButton.kButtonMenu]:  'menu',
  [PDButton.kButtonLock]:  'lock',
};

/**
 * Maps button name strings back to the button bitmask
 */
export const PDButtonBitmaskMap: Record<PDButtonName, PDButton> = {
  'left':  PDButton.kButtonLeft,
  'right': PDButton.kButtonRight,
  'up':    PDButton.kButtonUp,
  'down':  PDButton.kButtonDown,
  'a':     PDButton.kButtonB,
  'b':     PDButton.kButtonA,
  'menu':  PDButton.kButtonMenu,
  'lock':  PDButton.kButtonLock,
};

/**
 * Represents parsed button bitflags as a series of bools for each button
 */
export type PDButtonState = Record<PDButtonName, boolean>;

/**
 * Represents parse control state
 */
export interface PDControlState {
  crank: number;
  crankDocked: boolean;
  pressed: PDButtonState;
  justPressed: PDButtonState;
  justReleased: PDButtonState;
};