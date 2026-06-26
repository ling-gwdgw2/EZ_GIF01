declare module 'gifshot' {
  interface GifOptions {
    images?: string[] | HTMLImageElement[];
    video?: string | string[] | HTMLVideoElement[];
    gifWidth?: number;
    gifHeight?: number;
    interval?: number;
    numFrames?: number;
    frameDuration?: number;
    keepCameraOn?: boolean;
    imagesToGif?: boolean;
    sampleInterval?: number;
    numWorkers?: number;
    filter?: string;
    text?: string;
    fontWeight?: string;
    fontSize?: string;
    fontFamily?: string;
    fontColor?: string;
    textAlign?: string;
    textBaseline?: string;
    textXCoordinate?: number;
    textYCoordinate?: number;
    progressCallback?: (captureProgress: number) => void;
  }

  interface GifResult {
    error: boolean;
    errorCode: string;
    errorMsg: string;
    image: string;
  }

  export function createGIF(
    options: GifOptions,
    callback: (result: GifResult) => void
  ): void;

  export function isSupported(): boolean;
  export function isWebcamSupported(): boolean;
}

declare module 'gifuct-js' {
  export interface GifFrame {
    dims: {
      width: number;
      height: number;
      top: number;
      left: number;
    };
    colorTable: number[][];
    delay: number;
    disposalType: number;
    patch: Uint8ClampedArray;
    pixels: number[];
    transparentIndex: number;
  }

  export class GIF {
    constructor(arrayBuffer: ArrayBuffer);
    decompressFrames(buildImages: boolean): GifFrame[];
  }

  export function parseGIF(arrayBuffer: ArrayBuffer): GIF;
  export function decompressFrames(gif: GIF, buildImages: boolean): GifFrame[];
}
