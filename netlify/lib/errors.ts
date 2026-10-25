/** Fehler mit HTTP-Status; die Meldung geht so an den Client (englisch, wie die restliche UI) */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}
