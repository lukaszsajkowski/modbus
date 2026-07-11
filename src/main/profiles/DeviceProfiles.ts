import { validateProfile, type DeviceProfile } from './schema'
import daikin from './builtin/daikin-ekwhctrl1.json'

const raw: unknown[] = [daikin]

export function loadBuiltinProfiles(): DeviceProfile[] {
  return raw.map(validateProfile)
}

export function getProfileById(id: string): DeviceProfile | undefined {
  return loadBuiltinProfiles().find((p) => p.id === id)
}
