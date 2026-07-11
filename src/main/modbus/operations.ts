import { ModbusBus, type Priority } from './ModbusBus'
import { ok, err, type ReadRequest, type Result, type WriteRequest } from './types'

export function classifyError(e: unknown): { code: string; message: string } {
  const anyE = e as { code?: string; modbusCode?: number; message?: string }
  const message = anyE?.message ?? String(e)
  if (anyE?.code === 'TIMEOUT') return { code: 'TIMEOUT', message }
  if (typeof anyE?.modbusCode === 'number') return { code: 'MODBUS_EXCEPTION', message }
  return { code: 'IO_ERROR', message }
}

export async function busRead(
  bus: ModbusBus,
  req: ReadRequest,
  priority: Priority = 'user'
): Promise<Result<number[]>> {
  try {
    const value = await bus.enqueue(() => bus.transport.read(req), priority)
    return ok(value)
  } catch (e) {
    const { code, message } = classifyError(e)
    return err(code, message)
  }
}

export async function busWrite(
  bus: ModbusBus,
  req: WriteRequest,
  priority: Priority = 'user'
): Promise<Result<void>> {
  try {
    await bus.enqueue(() => bus.transport.write(req), priority)
    return ok(undefined)
  } catch (e) {
    const { code, message } = classifyError(e)
    return err(code, message)
  }
}
