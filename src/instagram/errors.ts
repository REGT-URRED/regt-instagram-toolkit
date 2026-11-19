export class InstagramThrottledError extends Error {
  public readonly fatal: boolean;

  public constructor(message: string, fatal = false) {
    super(message);
    this.name = 'InstagramThrottledError';
    this.fatal = fatal;
  }
}
