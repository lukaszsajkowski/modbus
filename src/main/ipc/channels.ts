export const CH = {
  listPorts: 'ports:list',
  connect: 'modbus:connect',
  disconnect: 'modbus:disconnect',
  scanQuick: 'scan:quick',
  scanDeep: 'scan:deep',
  lastScan: 'scan:last',
  read: 'modbus:read',
  write: 'modbus:write',
  profilesList: 'profiles:list',
  profileGet: 'profiles:get',
  registerMapGet: 'regmap:get',
  registerMapSet: 'regmap:set'
} as const
