export type Parity = 'none' | 'even' | 'odd'

export interface SerialParams {
  path: string
  baudRate: number
  dataBits: 7 | 8
  parity: Parity
  stopBits: 1 | 2
  timeoutMs: number
}

export type Ok<T> = { ok: true; value: T }
export type Err = { ok: false; code: string; message: string }
export type Result<T> = Ok<T> | Err

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value })
export const err = (code: string, message: string): Err => ({ ok: false, code, message })

export type FunctionCode = 1 | 2 | 3 | 4 | 5 | 6 | 15 | 16

export interface ReadRequest {
  slave: number
  fc: 1 | 2 | 3 | 4
  addr: number
  count: number
}

export interface WriteRequest {
  slave: number
  fc: 5 | 6 | 15 | 16
  addr: number
  values: number[]
}

export interface ModbusTransport {
  connect(params: SerialParams): Promise<void>
  close(): Promise<void>
  read(req: ReadRequest): Promise<number[]>
  write(req: WriteRequest): Promise<void>
  isOpen(): boolean
  /** Optional: notified when the underlying link drops (real serial ports only). */
  onClose?(cb: () => void): void
}
