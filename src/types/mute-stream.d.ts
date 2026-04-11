declare module 'mute-stream' {
  export default class MuteStream {
    pipe(destination: NodeJS.WritableStream): NodeJS.WritableStream;
    end(): void;
  }
}
