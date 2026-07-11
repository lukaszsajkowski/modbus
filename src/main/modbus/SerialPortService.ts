import { SerialPort } from 'serialport'

export interface PortInfo {
  path: string
  manufacturer?: string
  serialNumber?: string
}

export type PortLister = () => Promise<
  Array<{ path: string; manufacturer?: string; serialNumber?: string }>
>

const defaultLister: PortLister = () => SerialPort.list()

export async function listSerialPorts(lister: PortLister = defaultLister): Promise<PortInfo[]> {
  const raw = await lister()
  return raw
    .filter((p) => typeof p.path === 'string' && p.path.length > 0)
    .map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer,
      serialNumber: p.serialNumber
    }))
}
