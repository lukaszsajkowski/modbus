# Modbus RTU Tester — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desktopowa aplikacja macOS (Electron) do testowania urządzeń Modbus RTU przez adapter USB↔RS-485: skanowanie, read/write wszystkich FC, deklaratywne profile urządzeń z auto-generowanym panelem testowym oraz dashboard z pollingiem.

**Architecture:** Proces **main** (Node.js) obsługuje całą komunikację szeregową; renderer (React) nigdy nie dotyka portu — rozmawia przez wąskie, typowane API `contextBridge` w preload. Sercem backendu jest `ModbusBus` per port z **jedną priorytetową kolejką** serializującą wszystkie operacje (skan, read/write, polling) — nigdy dwie ramki naraz. Logika czysta (`DataCodec`, `Scanner`, kolejka, profile) jest odseparowana od sprzętu za interfejsem `ModbusTransport`, więc testujemy bez adaptera.

**Tech Stack:** Electron + electron-vite, React 18 + TypeScript + Vite (renderer), `modbus-serial` + `serialport` (backend), `electron-store` (persystencja JSON w userData), **Vitest** (testy jednostkowe).

## Global Constraints

- Platforma docelowa: **macOS** (desktop, Electron).
- Renderer: **brak `nodeIntegration`**, **`contextIsolation: true`**; dostęp do backendu wyłącznie przez API wystawione w preload przez `contextBridge`.
- Modbus RTU/RS-485: **tylko jedno zapytanie naraz na danym porcie** — cała komunikacja przechodzi przez kolejkę `ModbusBus`; między ramkami obowiązuje inter-frame delay.
- Priorytet w kolejce: **akcje użytkownika (`user`) wyprzedzają polling (`poll`)**.
- Wszystkie operacje backendu zwracają typowany wynik — nigdy nie ubijają procesu. Kształt błędu: `{ ok: false, code: string, message: string }`; sukces: `{ ok: true, value: T }`.
- Zakres FC: **FC01, FC02, FC03, FC04, FC05, FC06, FC15, FC16**.
- Poza zakresem MVP: Modbus TCP, graficzna topologia RS-485 (zastąpiona tabelą urządzeń).
- Parametry łącza Daikin EKWHCTRL1 wg producenta: **`9600 8N1`** (parity = `none`, 1 stop bit). Urządzenie implementuje **tylko FC03 i FC06**.
- Node floor: **Node 20+** (zgodnie z Electron current).
- Testy: framework **Vitest**; komenda `npm test` uruchamia cały zestaw, `npm test -- <ścieżka>` pojedynczy plik.
- Język: kod, identyfikatory i komunikaty commitów po angielsku; etykiety UI po polsku (jak w spec).

---

## File Structure

```
package.json                     # zależności, skrypty (dev, build, test)
electron.vite.config.ts          # konfiguracja electron-vite (main/preload/renderer)
tsconfig.json / tsconfig.node.json
vitest.config.ts                 # runner testów jednostkowych
src/
  main/
    index.ts                     # entry main: tworzenie okna, rejestracja IPC
    modbus/
      types.ts                   # SerialParams, ModbusTransport, Result<T>, typy op
      DataCodec.ts               # czyste funkcje decode/encode (int/uint/float/skala/word order)
      flags.ts                   # dekodowanie/kodowanie rejestrów flagowych (bity/zakresy/enum)
      ModbusBus.ts               # priorytetowa kolejka serializująca operacje per port
      SerialPortService.ts       # lista dostępnych portów USB-serial
      ModbusSerialTransport.ts   # adapter modbus-serial implementujący ModbusTransport
      Scanner.ts                 # skan szybki i głęboki (sweep params × adresy)
      PollingEngine.ts           # cykliczny odczyt punktów dashboardu -> zdarzenia
    profiles/
      schema.ts                  # typy profilu + validateProfile()
      DeviceProfiles.ts          # ładowanie profili wbudowanych
      builtin/daikin-ekwhctrl1.json
    store/
      Store.ts                   # typowany wrapper nad electron-store (backend wstrzykiwalny)
    ipc/
      channels.ts                # nazwy kanałów + typy request/response/event
      handlers.ts                # rejestracja handlerów IPC na obiektach backendu
  preload/
    index.ts                     # contextBridge.exposeInMainWorld('api', ...)
    api.d.ts                     # typ Window.api dla renderera
  renderer/
    index.html
    main.tsx                     # bootstrap React
    App.tsx                      # layout + nawigacja między widokami
    lib/api.ts                   # typowany dostęp do window.api
    views/
      ConnectionView.tsx
      ScannerView.tsx
      ReadWriteView.tsx
      DeviceTestView.tsx
      DashboardView.tsx
      SettingsView.tsx
test/
  main/modbus/DataCodec.test.ts
  main/modbus/flags.test.ts
  main/modbus/ModbusBus.test.ts
  main/modbus/Scanner.test.ts
  main/modbus/SerialPortService.test.ts
  main/modbus/PollingEngine.test.ts
  main/profiles/schema.test.ts
  main/profiles/DeviceProfiles.test.ts
  main/store/Store.test.ts
```

---

## Phase 1 — Fundament

Skeleton Electron+React, `SerialPortService`, `ModbusBus` z kolejką, IPC, `DataCodec` z testami.

### Task 1: Scaffold projektu (electron-vite + React + TS + Vitest)

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `vitest.config.ts`
- Create: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/App.tsx`
- Test: `test/smoke.test.ts`

**Interfaces:**
- Consumes: nic.
- Produces: uruchamialny szkielet (`npm run dev` otwiera okno), działający `npm test`.

- [ ] **Step 1: Zainicjuj projekt i zależności**

```bash
cd /Users/lsajkowski/workspace/modbus
npm init -y
npm install electron electron-store modbus-serial serialport
npm install -D electron-vite vite typescript vitest \
  react react-dom @types/react @types/react-dom @vitejs/plugin-react
npm install react react-dom
```

- [ ] **Step 2: Napisz `package.json` skrypty i typ modułu**

Zamień pola `main`/`scripts`/`type` w `package.json` na:

```json
{
  "name": "modbus-rtu-tester",
  "version": "0.1.0",
  "type": "module",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: Konfiguracja electron-vite i TypeScript**

`electron.vite.config.ts`:

```ts
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts') } } }
  },
  preload: {
    build: { rollupOptions: { input: { index: resolve('src/preload/index.ts') } } }
  },
  renderer: {
    root: 'src/renderer',
    build: { rollupOptions: { input: { index: resolve('src/renderer/index.html') } } },
    plugins: [react()]
  }
})
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "types": ["node"],
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "baseUrl": ".",
    "outDir": "out"
  },
  "include": ["src", "test"]
}
```

`tsconfig.node.json` (pusty rozszerzalny placeholder dla toolingu):

```json
{ "extends": "./tsconfig.json", "include": ["electron.vite.config.ts", "vitest.config.ts"] }
```

- [ ] **Step 4: Konfiguracja Vitest**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts']
  }
})
```

- [ ] **Step 5: Napisz smoke-test (failing)**

`test/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('runs the test harness', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 6: Uruchom testy — mają przejść**

Run: `npm test`
Expected: PASS — 1 test w `test/smoke.test.ts`.

- [ ] **Step 7: Minimalny main + okno + renderer**

`src/main/index.ts`:

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'path'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

`src/preload/index.ts`:

```ts
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('api', {
  version: () => process.versions.electron
})
```

`src/renderer/index.html`:

```html
<!doctype html>
<html lang="pl">
  <head><meta charset="UTF-8" /><title>Modbus RTU Tester</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`src/renderer/main.tsx`:

```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(<App />)
```

`src/renderer/App.tsx`:

```tsx
import React from 'react'

export default function App(): React.JSX.Element {
  return <h1>Modbus RTU Tester</h1>
}
```

- [ ] **Step 8: Uruchom aplikację — okno się otwiera**

Run: `npm run dev`
Expected: otwiera się okno Electron z nagłówkiem „Modbus RTU Tester". Zamknij okno.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold electron-vite + react + vitest skeleton"
```

---

### Task 2: DataCodec — typy 16-bit (uint16/int16) ze skalą i offsetem

**Files:**
- Create: `src/main/modbus/DataCodec.ts`
- Test: `test/main/modbus/DataCodec.test.ts`

**Interfaces:**
- Consumes: nic.
- Produces:
  - `type NumericType = 'uint16' | 'int16' | 'uint32' | 'int32' | 'float32'`
  - `type WordOrder = 'AB' | 'BA'` (kolejność słów dla 32-bit; `AB` = starsze słowo pierwsze)
  - `interface CodecSpec { type: NumericType; scale?: number; offset?: number; wordOrder?: WordOrder }`
  - `function decode(registers: number[], spec: CodecSpec): number` — surowe słowa 16-bit → wartość inżynierska (`raw * scale + offset`).
  - `function encode(value: number, spec: CodecSpec): number[]` — odwrotność: `raw = round((value - offset) / scale)`, zwraca tablicę słów 16-bit.

- [ ] **Step 1: Napisz failing testy 16-bit**

`test/main/modbus/DataCodec.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { decode, encode } from '../../../src/main/modbus/DataCodec'

describe('DataCodec 16-bit', () => {
  it('decodes uint16 with scale (manual case 224 -> 22.4)', () => {
    expect(decode([224], { type: 'uint16', scale: 0.1 })).toBeCloseTo(22.4, 5)
  })

  it('decodes plain uint16 (scale defaults to 1)', () => {
    expect(decode([1500], { type: 'uint16' })).toBe(1500)
  })

  it('decodes int16 negative (two-complement 0xFFF0 -> -16)', () => {
    expect(decode([0xfff0], { type: 'int16' })).toBe(-16)
  })

  it('decodes int16 with scale and offset', () => {
    // -120 raw, scale 0.1 -> -12.0
    expect(decode([0xff88], { type: 'int16', scale: 0.1 })).toBeCloseTo(-12.0, 5)
  })

  it('encodes uint16 with scale (22.4 -> 224)', () => {
    expect(encode(22.4, { type: 'uint16', scale: 0.1 })).toEqual([224])
  })

  it('encodes int16 negative (-12.0 scale 0.1 -> 0xFF88)', () => {
    expect(encode(-12.0, { type: 'int16', scale: 0.1 })).toEqual([0xff88])
  })

  it('round-trips uint16 through encode/decode', () => {
    const spec = { type: 'uint16' as const, scale: 0.1 }
    expect(decode(encode(16.0, spec), spec)).toBeCloseTo(16.0, 5)
  })
})
```

- [ ] **Step 2: Uruchom test — ma nie przejść**

Run: `npm test -- test/main/modbus/DataCodec.test.ts`
Expected: FAIL — `decode`/`encode` nie istnieją (import error).

- [ ] **Step 3: Zaimplementuj DataCodec dla 16-bit**

`src/main/modbus/DataCodec.ts`:

```ts
export type NumericType = 'uint16' | 'int16' | 'uint32' | 'int32' | 'float32'
export type WordOrder = 'AB' | 'BA'

export interface CodecSpec {
  type: NumericType
  scale?: number
  offset?: number
  wordOrder?: WordOrder
}

function toSigned16(raw: number): number {
  return raw >= 0x8000 ? raw - 0x10000 : raw
}

function toUnsigned16(value: number): number {
  return value & 0xffff
}

export function decode(registers: number[], spec: CodecSpec): number {
  const scale = spec.scale ?? 1
  const offset = spec.offset ?? 0
  let raw: number

  switch (spec.type) {
    case 'uint16':
      raw = registers[0] & 0xffff
      break
    case 'int16':
      raw = toSigned16(registers[0] & 0xffff)
      break
    default:
      throw new Error(`decode: unsupported type ${spec.type}`)
  }
  return raw * scale + offset
}

export function encode(value: number, spec: CodecSpec): number[] {
  const scale = spec.scale ?? 1
  const offset = spec.offset ?? 0
  const raw = Math.round((value - offset) / scale)

  switch (spec.type) {
    case 'uint16':
      return [toUnsigned16(raw)]
    case 'int16':
      return [toUnsigned16(raw)]
    default:
      throw new Error(`encode: unsupported type ${spec.type}`)
  }
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm test -- test/main/modbus/DataCodec.test.ts`
Expected: PASS — wszystkie testy 16-bit.

- [ ] **Step 5: Commit**

```bash
git add src/main/modbus/DataCodec.ts test/main/modbus/DataCodec.test.ts
git commit -m "feat: DataCodec decode/encode for uint16/int16 with scale and offset"
```

---

### Task 3: DataCodec — typy 32-bit (uint32/int32/float32) i word order

**Files:**
- Modify: `src/main/modbus/DataCodec.ts`
- Test: `test/main/modbus/DataCodec.test.ts` (dopisanie bloku)

**Interfaces:**
- Consumes: `decode`/`encode`/`CodecSpec`/`WordOrder` z Task 2.
- Produces: rozszerzone `decode`/`encode` obsługujące `uint32`/`int32`/`float32` z `wordOrder` (`AB` domyślnie). Dwa słowa: dla `AB` `registers[0]` = starsze słowo, `registers[1]` = młodsze; dla `BA` odwrotnie.

- [ ] **Step 1: Dopisz failing testy 32-bit**

Dopisz do `test/main/modbus/DataCodec.test.ts`:

```ts
describe('DataCodec 32-bit', () => {
  it('decodes uint32 AB (0x0001, 0x0000 -> 65536)', () => {
    expect(decode([0x0001, 0x0000], { type: 'uint32' })).toBe(65536)
  })

  it('decodes uint32 BA word-swapped (0x0000, 0x0001 -> 65536)', () => {
    expect(decode([0x0000, 0x0001], { type: 'uint32', wordOrder: 'BA' })).toBe(65536)
  })

  it('decodes int32 negative (-2)', () => {
    expect(decode([0xffff, 0xfffe], { type: 'int32' })).toBe(-2)
  })

  it('decodes float32 AB (1.0 = 0x3F80 0x0000)', () => {
    expect(decode([0x3f80, 0x0000], { type: 'float32' })).toBeCloseTo(1.0, 5)
  })

  it('encodes float32 AB (1.0 -> [0x3F80, 0x0000])', () => {
    expect(encode(1.0, { type: 'float32' })).toEqual([0x3f80, 0x0000])
  })

  it('round-trips int32 with word swap', () => {
    const spec = { type: 'int32' as const, wordOrder: 'BA' as const }
    expect(decode(encode(-123456, spec), spec)).toBe(-123456)
  })
})
```

- [ ] **Step 2: Uruchom test — ma nie przejść**

Run: `npm test -- test/main/modbus/DataCodec.test.ts`
Expected: FAIL — `decode: unsupported type uint32`.

- [ ] **Step 3: Rozszerz DataCodec o 32-bit**

W `src/main/modbus/DataCodec.ts` dodaj helpery i gałęzie `switch`. Wstaw przed `decode`:

```ts
function words32(registers: number[], wordOrder: WordOrder): [number, number] {
  const a = registers[0] & 0xffff
  const b = registers[1] & 0xffff
  return wordOrder === 'BA' ? [b, a] : [a, b]
}

function combine32(hi: number, lo: number): number {
  return ((hi << 16) >>> 0) | (lo & 0xffff)
}

function split32(u32: number, wordOrder: WordOrder): number[] {
  const hi = (u32 >>> 16) & 0xffff
  const lo = u32 & 0xffff
  return wordOrder === 'BA' ? [lo, hi] : [hi, lo]
}
```

W `decode` dodaj gałęzie przed `default`:

```ts
    case 'uint32': {
      const [hi, lo] = words32(registers, spec.wordOrder ?? 'AB')
      raw = combine32(hi, lo)
      break
    }
    case 'int32': {
      const [hi, lo] = words32(registers, spec.wordOrder ?? 'AB')
      const u = combine32(hi, lo)
      raw = u >= 0x80000000 ? u - 0x100000000 : u
      break
    }
    case 'float32': {
      const [hi, lo] = words32(registers, spec.wordOrder ?? 'AB')
      const buf = Buffer.alloc(4)
      buf.writeUInt16BE(hi, 0)
      buf.writeUInt16BE(lo, 2)
      raw = buf.readFloatBE(0)
      break
    }
```

W `encode` dodaj gałęzie przed `default`:

```ts
    case 'uint32':
    case 'int32': {
      const u = raw >>> 0
      return split32(u, spec.wordOrder ?? 'AB')
    }
    case 'float32': {
      const buf = Buffer.alloc(4)
      buf.writeFloatBE(value * 0 + (value - offset) / scale === raw ? (value - offset) / scale : raw, 0)
      // dla float32 skala/offset zwykle 1/0; koduj wartość inżynierską wprost:
      buf.writeFloatBE((value - offset) / scale, 0)
      const hi = buf.readUInt16BE(0)
      const lo = buf.readUInt16BE(2)
      return spec.wordOrder === 'BA' ? [lo, hi] : [hi, lo]
    }
```

> Uwaga: w gałęzi `float32` ostatecznie liczy się druga linia `buf.writeFloatBE(...)`; usuń pierwszą (pomocniczą) linię jeśli linter zgłasza martwy zapis — zostaw tylko `buf.writeFloatBE((value - offset) / scale, 0)`.

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm test -- test/main/modbus/DataCodec.test.ts`
Expected: PASS — testy 16-bit i 32-bit.

- [ ] **Step 5: Commit**

```bash
git add src/main/modbus/DataCodec.ts test/main/modbus/DataCodec.test.ts
git commit -m "feat: DataCodec support for uint32/int32/float32 with word order"
```

---

### Task 4: Wspólne typy Modbus i interfejs transportu

**Files:**
- Create: `src/main/modbus/types.ts`

**Interfaces:**
- Consumes: nic.
- Produces:
  - `type Parity = 'none' | 'even' | 'odd'`
  - `interface SerialParams { path: string; baudRate: number; dataBits: 7 | 8; parity: Parity; stopBits: 1 | 2; timeoutMs: number }`
  - `type Ok<T> = { ok: true; value: T }`, `type Err = { ok: false; code: string; message: string }`, `type Result<T> = Ok<T> | Err`
  - `type FunctionCode = 1 | 2 | 3 | 4 | 5 | 6 | 15 | 16`
  - `interface ReadRequest { slave: number; fc: 1 | 2 | 3 | 4; addr: number; count: number }`
  - `interface WriteRequest { slave: number; fc: 5 | 6 | 15 | 16; addr: number; values: number[] }`
  - `interface ModbusTransport { connect(params: SerialParams): Promise<void>; close(): Promise<void>; read(req: ReadRequest): Promise<number[]>; write(req: WriteRequest): Promise<void>; isOpen(): boolean }`
  - helper `ok<T>(value: T): Ok<T>` i `err(code: string, message: string): Err`

- [ ] **Step 1: Napisz plik typów**

`src/main/modbus/types.ts`:

```ts
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
}
```

- [ ] **Step 2: Sprawdź kompilację typów**

Run: `npx tsc --noEmit`
Expected: brak błędów.

- [ ] **Step 3: Commit**

```bash
git add src/main/modbus/types.ts
git commit -m "feat: shared Modbus types and ModbusTransport interface"
```

---

### Task 5: ModbusBus — serializacja kolejki (jedno zapytanie naraz)

**Files:**
- Create: `src/main/modbus/ModbusBus.ts`
- Test: `test/main/modbus/ModbusBus.test.ts`

**Interfaces:**
- Consumes: `ModbusTransport`, `Result`, `ok`, `err` z `types.ts`.
- Produces:
  - `type Priority = 'user' | 'poll'`
  - `interface BusOptions { interFrameDelayMs?: number }`
  - `class ModbusBus` z konstruktorem `(transport: ModbusTransport, opts?: BusOptions)` i metodą `enqueue<T>(run: () => Promise<T>, priority?: Priority): Promise<T>` (domyślnie `'user'`). Operacje wykonywane sekwencyjnie — kolejny `run()` startuje dopiero po rozliczeniu poprzedniego (plus inter-frame delay).

- [ ] **Step 1: Napisz failing test serializacji**

`test/main/modbus/ModbusBus.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ModbusBus } from '../../../src/main/modbus/ModbusBus'
import type { ModbusTransport } from '../../../src/main/modbus/types'

function fakeTransport(): ModbusTransport {
  return {
    connect: async () => {},
    close: async () => {},
    read: async () => [0],
    write: async () => {},
    isOpen: () => true
  }
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe('ModbusBus serialization', () => {
  it('runs only one operation at a time', async () => {
    const bus = new ModbusBus(fakeTransport(), { interFrameDelayMs: 0 })
    const d1 = deferred<string>()
    let secondStarted = false

    const p1 = bus.enqueue(() => d1.promise)
    const p2 = bus.enqueue(async () => {
      secondStarted = true
      return 'second'
    })

    // druga operacja nie może wystartować, dopóki pierwsza trwa
    await Promise.resolve()
    expect(secondStarted).toBe(false)

    d1.resolve('first')
    await expect(p1).resolves.toBe('first')
    await expect(p2).resolves.toBe('second')
    expect(secondStarted).toBe(true)
  })

  it('propagates rejection without blocking the queue', async () => {
    const bus = new ModbusBus(fakeTransport(), { interFrameDelayMs: 0 })
    const p1 = bus.enqueue(async () => {
      throw new Error('boom')
    })
    const p2 = bus.enqueue(async () => 'ok')

    await expect(p1).rejects.toThrow('boom')
    await expect(p2).resolves.toBe('ok')
  })
})
```

- [ ] **Step 2: Uruchom test — ma nie przejść**

Run: `npm test -- test/main/modbus/ModbusBus.test.ts`
Expected: FAIL — brak `ModbusBus`.

- [ ] **Step 3: Zaimplementuj ModbusBus (kolejka)**

`src/main/modbus/ModbusBus.ts`:

```ts
import type { ModbusTransport } from './types'

export type Priority = 'user' | 'poll'

export interface BusOptions {
  interFrameDelayMs?: number
}

interface QueueItem {
  run: () => Promise<unknown>
  priority: Priority
  seq: number
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

const delay = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve()

export class ModbusBus {
  private readonly queue: QueueItem[] = []
  private processing = false
  private seqCounter = 0

  constructor(
    readonly transport: ModbusTransport,
    private readonly opts: BusOptions = {}
  ) {}

  enqueue<T>(run: () => Promise<T>, priority: Priority = 'user'): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        run: run as () => Promise<unknown>,
        priority,
        seq: this.seqCounter++,
        resolve: resolve as (v: unknown) => void,
        reject
      })
      this.sortQueue()
      void this.drain()
    })
  }

  private sortQueue(): void {
    const rank = (p: Priority): number => (p === 'user' ? 0 : 1)
    this.queue.sort((a, b) => rank(a.priority) - rank(b.priority) || a.seq - b.seq)
  }

  private async drain(): Promise<void> {
    if (this.processing) return
    this.processing = true
    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift()!
        try {
          const value = await item.run()
          item.resolve(value)
        } catch (e) {
          item.reject(e)
        }
        await delay(this.opts.interFrameDelayMs ?? 0)
      }
    } finally {
      this.processing = false
    }
  }
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm test -- test/main/modbus/ModbusBus.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/modbus/ModbusBus.ts test/main/modbus/ModbusBus.test.ts
git commit -m "feat: ModbusBus serializing queue (one operation at a time)"
```

---

### Task 6: ModbusBus — priorytet akcji użytkownika nad pollingiem

**Files:**
- Modify: `src/main/modbus/ModbusBus.ts` (bez zmian logiki — sortowanie już wdrożone; ten task dokłada test dowodzący kontraktu)
- Test: `test/main/modbus/ModbusBus.test.ts` (dopisanie bloku)

**Interfaces:**
- Consumes: `ModbusBus.enqueue(run, priority)` z Task 5.
- Produces: potwierdzony kontrakt: gdy magistrala jest zajęta i w kolejce czekają operacje `poll` i `user`, następna wykonana jest `user`.

- [ ] **Step 1: Dopisz failing test priorytetu**

Dopisz do `test/main/modbus/ModbusBus.test.ts`:

```ts
describe('ModbusBus priority', () => {
  it('runs user operations before poll when both are queued', async () => {
    const bus = new ModbusBus(fakeTransport(), { interFrameDelayMs: 0 })
    const gate = deferred<void>()
    const order: string[] = []

    // pierwsza operacja trzyma magistralę zajętą (blokuje pętlę)
    const busy = bus.enqueue(async () => {
      await gate.promise
      order.push('busy')
    })

    // w tej kolejności trafiają do kolejki: poll, potem user
    const pollP = bus.enqueue(async () => {
      order.push('poll')
    }, 'poll')
    const userP = bus.enqueue(async () => {
      order.push('user')
    }, 'user')

    gate.resolve()
    await Promise.all([busy, pollP, userP])

    expect(order).toEqual(['busy', 'user', 'poll'])
  })
})
```

- [ ] **Step 2: Uruchom test — ma od razu przejść**

Run: `npm test -- test/main/modbus/ModbusBus.test.ts`
Expected: PASS (sortowanie priorytetów wdrożone w Task 5). Jeśli FAIL — sprawdź `sortQueue`.

- [ ] **Step 3: Commit**

```bash
git add test/main/modbus/ModbusBus.test.ts
git commit -m "test: assert user operations preempt polling in ModbusBus"
```

---

### Task 7: ModbusBus — inter-frame delay i timeout operacji

**Files:**
- Modify: `src/main/modbus/ModbusBus.ts`
- Test: `test/main/modbus/ModbusBus.test.ts` (dopisanie bloku, fake timers)

**Interfaces:**
- Consumes: `ModbusBus`, `BusOptions` z Task 5.
- Produces:
  - rozszerzone `BusOptions`: `{ interFrameDelayMs?: number; defaultTimeoutMs?: number }`
  - `enqueue<T>(run, priority?, timeoutMs?)` — gdy `run()` nie rozliczy się w `timeoutMs` (lub `defaultTimeoutMs`), Promise odrzucany błędem z `code === 'TIMEOUT'`, a kolejka rusza dalej.
  - `class TimeoutError extends Error { code = 'TIMEOUT' }`

- [ ] **Step 1: Dopisz failing testy delay + timeout**

Dopisz do `test/main/modbus/ModbusBus.test.ts` (na górze pliku dodaj import `vi`):

```ts
import { describe, it, expect, vi } from 'vitest'
```

```ts
describe('ModbusBus timing', () => {
  it('waits interFrameDelayMs between operations', async () => {
    vi.useFakeTimers()
    try {
      const bus = new ModbusBus(fakeTransport(), { interFrameDelayMs: 50 })
      const order: string[] = []
      const p1 = bus.enqueue(async () => order.push('a'))
      const p2 = bus.enqueue(async () => order.push('b'))

      await p1
      expect(order).toEqual(['a'])   // druga czeka na delay
      await vi.advanceTimersByTimeAsync(50)
      await p2
      expect(order).toEqual(['a', 'b'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects with code TIMEOUT and keeps the queue alive', async () => {
    vi.useFakeTimers()
    try {
      const bus = new ModbusBus(fakeTransport(), { interFrameDelayMs: 0, defaultTimeoutMs: 100 })
      const stuck = bus.enqueue(() => new Promise<void>(() => {})) // nigdy nie kończy
      const next = bus.enqueue(async () => 'ok')

      const assertion = expect(stuck).rejects.toMatchObject({ code: 'TIMEOUT' })
      await vi.advanceTimersByTimeAsync(100)
      await assertion
      await expect(next).resolves.toBe('ok')
    } finally {
      vi.useRealTimers()
    }
  })
})
```

- [ ] **Step 2: Uruchom test — ma nie przejść**

Run: `npm test -- test/main/modbus/ModbusBus.test.ts`
Expected: FAIL — brak timeoutu (`stuck` nigdy się nie odrzuca).

- [ ] **Step 3: Dodaj timeout do ModbusBus**

W `src/main/modbus/ModbusBus.ts` zmień `BusOptions`, dodaj `TimeoutError`, `withTimeout` i użyj w `drain`:

```ts
export interface BusOptions {
  interFrameDelayMs?: number
  defaultTimeoutMs?: number
}

export class TimeoutError extends Error {
  readonly code = 'TIMEOUT'
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`)
    this.name = 'TimeoutError'
  }
}
```

Dodaj pole `timeoutMs` do `QueueItem`:

```ts
interface QueueItem {
  run: () => Promise<unknown>
  priority: Priority
  seq: number
  timeoutMs?: number
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}
```

Rozszerz `enqueue`:

```ts
  enqueue<T>(run: () => Promise<T>, priority: Priority = 'user', timeoutMs?: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        run: run as () => Promise<unknown>,
        priority,
        seq: this.seqCounter++,
        timeoutMs,
        resolve: resolve as (v: unknown) => void,
        reject
      })
      this.sortQueue()
      void this.drain()
    })
  }
```

Dodaj helper i użyj go w `drain`:

```ts
  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    if (!ms || ms <= 0) return p
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new TimeoutError(ms)), ms)
      p.then(
        (v) => { clearTimeout(t); resolve(v) },
        (e) => { clearTimeout(t); reject(e) }
      )
    })
  }
```

W `drain` zamień `const value = await item.run()` na:

```ts
        try {
          const ms = item.timeoutMs ?? this.opts.defaultTimeoutMs ?? 0
          const value = await this.withTimeout(item.run(), ms)
          item.resolve(value)
        } catch (e) {
          item.reject(e)
        }
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm test -- test/main/modbus/ModbusBus.test.ts`
Expected: PASS — serialization, priority, timing.

- [ ] **Step 5: Commit**

```bash
git add src/main/modbus/ModbusBus.ts test/main/modbus/ModbusBus.test.ts
git commit -m "feat: ModbusBus inter-frame delay and per-op timeout"
```

---

### Task 8: SerialPortService — lista portów USB-serial

**Files:**
- Create: `src/main/modbus/SerialPortService.ts`
- Test: `test/main/modbus/SerialPortService.test.ts`

**Interfaces:**
- Consumes: nic (biblioteka `serialport` wstrzykiwana dla testu).
- Produces:
  - `interface PortInfo { path: string; manufacturer?: string; serialNumber?: string }`
  - `type PortLister = () => Promise<Array<{ path: string; manufacturer?: string; serialNumber?: string }>>`
  - `async function listSerialPorts(lister?: PortLister): Promise<PortInfo[]>` — domyślnie używa `SerialPort.list` z pakietu `serialport`; filtruje wpisy bez `path`.

- [ ] **Step 1: Napisz failing test**

`test/main/modbus/SerialPortService.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { listSerialPorts } from '../../../src/main/modbus/SerialPortService'

describe('SerialPortService', () => {
  it('maps and filters port entries', async () => {
    const fakeLister = async () => [
      { path: '/dev/tty.usbserial-1', manufacturer: 'FTDI', serialNumber: 'A1' },
      { path: '', manufacturer: 'ghost' } // brak path -> odfiltrowany
    ]
    const ports = await listSerialPorts(fakeLister)
    expect(ports).toEqual([
      { path: '/dev/tty.usbserial-1', manufacturer: 'FTDI', serialNumber: 'A1' }
    ])
  })
})
```

- [ ] **Step 2: Uruchom test — ma nie przejść**

Run: `npm test -- test/main/modbus/SerialPortService.test.ts`
Expected: FAIL — brak `listSerialPorts`.

- [ ] **Step 3: Zaimplementuj SerialPortService**

`src/main/modbus/SerialPortService.ts`:

```ts
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
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm test -- test/main/modbus/SerialPortService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/modbus/SerialPortService.ts test/main/modbus/SerialPortService.test.ts
git commit -m "feat: SerialPortService lists USB-serial ports"
```

---

### Task 9: ModbusSerialTransport — adapter modbus-serial

**Files:**
- Create: `src/main/modbus/ModbusSerialTransport.ts`

**Interfaces:**
- Consumes: `ModbusTransport`, `SerialParams`, `ReadRequest`, `WriteRequest` z `types.ts`; pakiet `modbus-serial`.
- Produces: `class ModbusSerialTransport implements ModbusTransport` — realny adapter na sprzęt. Mapuje `fc` na metody `modbus-serial` (FC01→`readCoils`, FC02→`readDiscreteInputs`, FC03→`readHoldingRegisters`, FC04→`readInputRegisters`, FC05→`writeCoil`, FC06→`writeRegister`, FC15→`writeCoils`, FC16→`writeRegisters`). Ustawia `setID(slave)` i `setTimeout` przed każdą operacją.

- [ ] **Step 1: Zaimplementuj adapter**

`src/main/modbus/ModbusSerialTransport.ts`:

```ts
import ModbusRTU from 'modbus-serial'
import type { ModbusTransport, ReadRequest, SerialParams, WriteRequest } from './types'

export class ModbusSerialTransport implements ModbusTransport {
  private client = new ModbusRTU()
  private open = false
  private timeoutMs = 1000

  async connect(params: SerialParams): Promise<void> {
    this.timeoutMs = params.timeoutMs
    await this.client.connectRTUBuffered(params.path, {
      baudRate: params.baudRate,
      dataBits: params.dataBits,
      parity: params.parity,
      stopBits: params.stopBits
    })
    this.client.setTimeout(params.timeoutMs)
    this.open = true
  }

  async close(): Promise<void> {
    if (!this.open) return
    await new Promise<void>((resolve) => this.client.close(() => resolve()))
    this.open = false
  }

  isOpen(): boolean {
    return this.open
  }

  async read(req: ReadRequest): Promise<number[]> {
    this.client.setID(req.slave)
    this.client.setTimeout(this.timeoutMs)
    switch (req.fc) {
      case 1:
        return (await this.client.readCoils(req.addr, req.count)).data.map((b) => (b ? 1 : 0))
      case 2:
        return (await this.client.readDiscreteInputs(req.addr, req.count)).data.map((b) =>
          b ? 1 : 0
        )
      case 3:
        return (await this.client.readHoldingRegisters(req.addr, req.count)).data
      case 4:
        return (await this.client.readInputRegisters(req.addr, req.count)).data
    }
  }

  async write(req: WriteRequest): Promise<void> {
    this.client.setID(req.slave)
    this.client.setTimeout(this.timeoutMs)
    switch (req.fc) {
      case 5:
        await this.client.writeCoil(req.addr, req.values[0] !== 0)
        return
      case 6:
        await this.client.writeRegister(req.addr, req.values[0])
        return
      case 15:
        await this.client.writeCoils(req.addr, req.values.map((v) => v !== 0))
        return
      case 16:
        await this.client.writeRegisters(req.addr, req.values)
        return
    }
  }
}
```

- [ ] **Step 2: Sprawdź kompilację**

Run: `npx tsc --noEmit`
Expected: brak błędów. (Jeśli brakuje typów `modbus-serial`, dodaj `// @ts-expect-error` tylko przy imporcie i zanotuj — pakiet dostarcza własne typy, więc nie powinno być potrzebne.)

- [ ] **Step 3: Commit**

```bash
git add src/main/modbus/ModbusSerialTransport.ts
git commit -m "feat: ModbusSerialTransport adapter over modbus-serial"
```

---

### Task 10: IPC szkielet — kanały, preload, ping end-to-end

**Files:**
- Create: `src/main/ipc/channels.ts`, `src/main/ipc/handlers.ts`, `src/preload/api.d.ts`, `src/renderer/lib/api.ts`
- Modify: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/App.tsx`

**Interfaces:**
- Consumes: `listSerialPorts` z Task 8; `PortInfo`.
- Produces:
  - `channels.ts`: stałe nazw kanałów, np. `export const CH = { listPorts: 'ports:list' } as const`.
  - `handlers.ts`: `export function registerIpcHandlers(): void` rejestrująca `ipcMain.handle`.
  - preload `window.api`: `{ listPorts(): Promise<PortInfo[]> }` (typ w `api.d.ts`).
  - renderer `lib/api.ts`: `export const api = window.api`.

- [ ] **Step 1: Zdefiniuj kanały i handlery**

`src/main/ipc/channels.ts`:

```ts
export const CH = {
  listPorts: 'ports:list'
} as const
```

`src/main/ipc/handlers.ts`:

```ts
import { ipcMain } from 'electron'
import { CH } from './channels'
import { listSerialPorts } from '../modbus/SerialPortService'

export function registerIpcHandlers(): void {
  ipcMain.handle(CH.listPorts, async () => listSerialPorts())
}
```

- [ ] **Step 2: Wystaw API w preload i otypuj okno**

`src/preload/index.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { CH } from '../main/ipc/channels'

const api = {
  listPorts: () => ipcRenderer.invoke(CH.listPorts)
}

contextBridge.exposeInMainWorld('api', api)
```

`src/preload/api.d.ts`:

```ts
import type { PortInfo } from '../main/modbus/SerialPortService'

export interface RendererApi {
  listPorts: () => Promise<PortInfo[]>
}

declare global {
  interface Window {
    api: RendererApi
  }
}
```

`src/renderer/lib/api.ts`:

```ts
import type { RendererApi } from '../../preload/api.d'

export const api: RendererApi = window.api
```

- [ ] **Step 3: Zarejestruj handlery w main**

W `src/main/index.ts` dodaj import i wywołanie w `app.whenReady()`:

```ts
import { registerIpcHandlers } from './ipc/handlers'
```

```ts
app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
```

- [ ] **Step 4: Wyświetl porty w App**

`src/renderer/App.tsx`:

```tsx
import React, { useEffect, useState } from 'react'
import { api } from './lib/api'
import type { PortInfo } from '../main/modbus/SerialPortService'

export default function App(): React.JSX.Element {
  const [ports, setPorts] = useState<PortInfo[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.listPorts().then(setPorts).catch((e) => setError(String(e)))
  }, [])

  return (
    <div style={{ fontFamily: 'system-ui', padding: 16 }}>
      <h1>Modbus RTU Tester</h1>
      <h2>Porty szeregowe</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <ul>
        {ports.map((p) => (
          <li key={p.path}>
            {p.path} {p.manufacturer ? `(${p.manufacturer})` : ''}
          </li>
        ))}
      </ul>
      {ports.length === 0 && !error && <p>Brak wykrytych portów.</p>}
    </div>
  )
}
```

- [ ] **Step 5: Weryfikacja manualna end-to-end**

Run: `npm run dev`
Expected: okno pokazuje sekcję „Porty szeregowe". Po podłączeniu adaptera USB-serial na liście pojawia się np. `/dev/tty.usbserial-*`; bez adaptera — „Brak wykrytych portów". Brak błędów `nodeIntegration`/`contextBridge` w konsoli DevTools.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: IPC skeleton with typed preload bridge and port listing"
```

---

## Phase 2 — Połączenie + skan

Profile połączeń (zapis), skan szybki i głęboki, tabela wykrytych urządzeń (zapis wyników).

### Task 11: Store — typowany wrapper nad electron-store

**Files:**
- Create: `src/main/store/Store.ts`
- Test: `test/main/store/Store.test.ts`

**Interfaces:**
- Consumes: `SerialParams` z `types.ts`.
- Produces:
  - `interface ConnectionProfile { name: string; params: SerialParams }`
  - `interface ScanRecord { params: SerialParams; slaves: number[]; ts: number }`
  - `interface DashboardLayout { name: string; points: DashboardPoint[] }` (typ `DashboardPoint` z Task 25 — na razie `unknown[]`, dopięty w Fazie 5)
  - `interface StoreShape { connectionProfiles: ConnectionProfile[]; lastScan: ScanRecord | null; dashboards: DashboardLayout[]; registerMaps: Record<string, unknown> }`
  - `interface KeyValueBackend { get<T>(key: string): T | undefined; set<T>(key: string, value: T): void }`
  - `class AppStore` z konstruktorem `(backend: KeyValueBackend)` i metodami: `getConnectionProfiles()`, `saveConnectionProfile(p)`, `getLastScan()`, `setLastScan(r)`, `getDashboards()`, `saveDashboard(d)`. Backend wstrzykiwany → test na atrapie `Map`.

- [ ] **Step 1: Napisz failing test**

`test/main/store/Store.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { AppStore } from '../../../src/main/store/Store'
import type { KeyValueBackend } from '../../../src/main/store/Store'
import type { SerialParams } from '../../../src/main/modbus/types'

function memoryBackend(): KeyValueBackend {
  const map = new Map<string, unknown>()
  return {
    get: <T>(k: string) => map.get(k) as T | undefined,
    set: <T>(k: string, v: T) => void map.set(k, v)
  }
}

const params: SerialParams = {
  path: '/dev/tty.usbserial-1',
  baudRate: 9600,
  dataBits: 8,
  parity: 'none',
  stopBits: 1,
  timeoutMs: 1000
}

describe('AppStore', () => {
  it('starts with empty connection profiles', () => {
    const store = new AppStore(memoryBackend())
    expect(store.getConnectionProfiles()).toEqual([])
  })

  it('saves and overwrites a connection profile by name', () => {
    const store = new AppStore(memoryBackend())
    store.saveConnectionProfile({ name: 'Daikin', params })
    store.saveConnectionProfile({ name: 'Daikin', params: { ...params, baudRate: 19200 } })
    const profiles = store.getConnectionProfiles()
    expect(profiles).toHaveLength(1)
    expect(profiles[0].params.baudRate).toBe(19200)
  })

  it('persists last scan result', () => {
    const store = new AppStore(memoryBackend())
    expect(store.getLastScan()).toBeNull()
    store.setLastScan({ params, slaves: [21, 22], ts: 1000 })
    expect(store.getLastScan()?.slaves).toEqual([21, 22])
  })
})
```

- [ ] **Step 2: Uruchom test — ma nie przejść**

Run: `npm test -- test/main/store/Store.test.ts`
Expected: FAIL — brak `AppStore`.

- [ ] **Step 3: Zaimplementuj AppStore**

`src/main/store/Store.ts`:

```ts
import type { SerialParams } from '../modbus/types'

export interface ConnectionProfile {
  name: string
  params: SerialParams
}

export interface ScanRecord {
  params: SerialParams
  slaves: number[]
  ts: number
}

export interface DashboardLayout {
  name: string
  points: unknown[]
}

export interface StoreShape {
  connectionProfiles: ConnectionProfile[]
  lastScan: ScanRecord | null
  dashboards: DashboardLayout[]
  registerMaps: Record<string, unknown>
}

export interface KeyValueBackend {
  get<T>(key: string): T | undefined
  set<T>(key: string, value: T): void
}

export class AppStore {
  constructor(private readonly backend: KeyValueBackend) {}

  getConnectionProfiles(): ConnectionProfile[] {
    return this.backend.get<ConnectionProfile[]>('connectionProfiles') ?? []
  }

  saveConnectionProfile(profile: ConnectionProfile): void {
    const existing = this.getConnectionProfiles().filter((p) => p.name !== profile.name)
    this.backend.set('connectionProfiles', [...existing, profile])
  }

  getLastScan(): ScanRecord | null {
    return this.backend.get<ScanRecord>('lastScan') ?? null
  }

  setLastScan(record: ScanRecord): void {
    this.backend.set('lastScan', record)
  }

  getDashboards(): DashboardLayout[] {
    return this.backend.get<DashboardLayout[]>('dashboards') ?? []
  }

  saveDashboard(layout: DashboardLayout): void {
    const existing = this.getDashboards().filter((d) => d.name !== layout.name)
    this.backend.set('dashboards', [...existing, layout])
  }
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm test -- test/main/store/Store.test.ts`
Expected: PASS.

- [ ] **Step 5: Dodaj fabrykę produkcyjną z electron-store**

Dopisz na końcu `src/main/store/Store.ts`:

```ts
import Store from 'electron-store'

export function createAppStore(): AppStore {
  const store = new Store<StoreShape>({
    defaults: {
      connectionProfiles: [],
      lastScan: null,
      dashboards: [],
      registerMaps: {}
    }
  })
  const backend: KeyValueBackend = {
    get: <T>(key: string) => store.get(key as keyof StoreShape) as T | undefined,
    set: <T>(key: string, value: T) => store.set(key, value as never)
  }
  return new AppStore(backend)
}
```

- [ ] **Step 6: Uruchom testy (regresja)**

Run: `npm test -- test/main/store/Store.test.ts`
Expected: PASS (fabryka nietestowana jednostkowo — używa realnego electron-store).

- [ ] **Step 7: Commit**

```bash
git add src/main/store/Store.ts test/main/store/Store.test.ts
git commit -m "feat: typed AppStore over electron-store with injectable backend"
```

---

### Task 12: Scanner — skan szybki (adresy)

**Files:**
- Create: `src/main/modbus/Scanner.ts`
- Test: `test/main/modbus/Scanner.test.ts`

**Interfaces:**
- Consumes: `SerialParams`, `Parity` z `types.ts`.
- Produces:
  - `interface Prober { probe(slave: number): Promise<boolean>; close(): Promise<void> }`
  - `interface ScanTarget { withParams(params: SerialParams): Promise<Prober> }`
  - `interface QuickScanOptions { params: SerialParams; slaveRange: [number, number]; signal?: AbortSignal; onProgress?: (done: number, total: number) => void }`
  - `interface ScanResult { params: SerialParams; found: number[] }`
  - `async function quickScan(target: ScanTarget, opts: QuickScanOptions): Promise<ScanResult>`

- [ ] **Step 1: Napisz failing testy quick scan**

`test/main/modbus/Scanner.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { quickScan } from '../../../src/main/modbus/Scanner'
import type { ScanTarget, Prober } from '../../../src/main/modbus/Scanner'
import type { SerialParams } from '../../../src/main/modbus/types'

const params: SerialParams = {
  path: '/dev/x', baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1, timeoutMs: 500
}

function targetRespondingAt(slaves: number[]): ScanTarget {
  return {
    withParams: async (): Promise<Prober> => ({
      probe: async (slave: number) => slaves.includes(slave),
      close: async () => {}
    })
  }
}

describe('quickScan', () => {
  it('returns slaves that respond within range', async () => {
    const result = await quickScan(targetRespondingAt([21, 22]), {
      params,
      slaveRange: [20, 23]
    })
    expect(result.found).toEqual([21, 22])
    expect(result.params).toEqual(params)
  })

  it('reports progress for each address', async () => {
    const seen: Array<[number, number]> = []
    await quickScan(targetRespondingAt([]), {
      params,
      slaveRange: [1, 3],
      onProgress: (done, total) => seen.push([done, total])
    })
    expect(seen).toEqual([[1, 3], [2, 3], [3, 3]])
  })

  it('stops early when aborted', async () => {
    const controller = new AbortController()
    let probed = 0
    const target: ScanTarget = {
      withParams: async () => ({
        probe: async () => {
          probed++
          if (probed === 2) controller.abort()
          return false
        },
        close: async () => {}
      })
    }
    const result = await quickScan(target, {
      params,
      slaveRange: [1, 10],
      signal: controller.signal
    })
    expect(probed).toBe(2)
    expect(result.found).toEqual([])
  })
})
```

- [ ] **Step 2: Uruchom test — ma nie przejść**

Run: `npm test -- test/main/modbus/Scanner.test.ts`
Expected: FAIL — brak `quickScan`.

- [ ] **Step 3: Zaimplementuj quickScan**

`src/main/modbus/Scanner.ts`:

```ts
import type { Parity, SerialParams } from './types'

export interface Prober {
  probe(slave: number): Promise<boolean>
  close(): Promise<void>
}

export interface ScanTarget {
  withParams(params: SerialParams): Promise<Prober>
}

export interface QuickScanOptions {
  params: SerialParams
  slaveRange: [number, number]
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}

export interface ScanResult {
  params: SerialParams
  found: number[]
}

export async function quickScan(target: ScanTarget, opts: QuickScanOptions): Promise<ScanResult> {
  const [from, to] = opts.slaveRange
  const total = to - from + 1
  const found: number[] = []
  const prober = await target.withParams(opts.params)
  try {
    let done = 0
    for (let slave = from; slave <= to; slave++) {
      if (opts.signal?.aborted) break
      const responded = await prober.probe(slave)
      done++
      if (responded) found.push(slave)
      opts.onProgress?.(done, total)
    }
  } finally {
    await prober.close()
  }
  return { params: opts.params, found }
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm test -- test/main/modbus/Scanner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/modbus/Scanner.ts test/main/modbus/Scanner.test.ts
git commit -m "feat: Scanner quick scan over slave address range"
```

---

### Task 13: Scanner — skan głęboki (sweep params × adresy) z przerwaniem

**Files:**
- Modify: `src/main/modbus/Scanner.ts`
- Test: `test/main/modbus/Scanner.test.ts` (dopisanie bloku)

**Interfaces:**
- Consumes: `ScanTarget`, `Prober`, `Parity`, `SerialParams` z Task 12.
- Produces:
  - `interface DeepScanOptions { basePath: string; timeoutMs: number; bauds: number[]; parities: Parity[]; stopBits: Array<1 | 2>; dataBits?: 7 | 8; slaveRange: [number, number]; signal?: AbortSignal; onProgress?: (done: number, total: number) => void }`
  - `interface DeepScanResult { params: SerialParams | null; found: number[] }`
  - `async function deepScan(target: ScanTarget, opts: DeepScanOptions): Promise<DeepScanResult>` — iteruje kombinacje `baud × parity × stopBits`; dla pierwszej konfiguracji, w której **którykolwiek** adres odpowie, zwraca tę konfigurację + listę adresów, które w niej odpowiedziały. Gdy nic — `params: null`.

- [ ] **Step 1: Dopisz failing testy deep scan**

Dopisz do `test/main/modbus/Scanner.test.ts`:

```ts
import { deepScan } from '../../../src/main/modbus/Scanner'

describe('deepScan', () => {
  it('finds the working config and responding slaves', async () => {
    // odpowiada tylko przy 9600 / none / 1 na adresach 21,22
    const target: ScanTarget = {
      withParams: async (p) => ({
        probe: async (slave) =>
          p.baudRate === 9600 &&
          p.parity === 'none' &&
          p.stopBits === 1 &&
          (slave === 21 || slave === 22),
        close: async () => {}
      })
    }
    const result = await deepScan(target, {
      basePath: '/dev/x',
      timeoutMs: 300,
      bauds: [19200, 9600],
      parities: ['even', 'none'],
      stopBits: [1],
      slaveRange: [20, 23]
    })
    expect(result.params).toMatchObject({ baudRate: 9600, parity: 'none', stopBits: 1 })
    expect(result.found).toEqual([21, 22])
  })

  it('returns null params when nothing responds', async () => {
    const target: ScanTarget = {
      withParams: async () => ({ probe: async () => false, close: async () => {} })
    }
    const result = await deepScan(target, {
      basePath: '/dev/x',
      timeoutMs: 300,
      bauds: [9600],
      parities: ['none'],
      stopBits: [1],
      slaveRange: [1, 2]
    })
    expect(result.params).toBeNull()
    expect(result.found).toEqual([])
  })
})
```

- [ ] **Step 2: Uruchom test — ma nie przejść**

Run: `npm test -- test/main/modbus/Scanner.test.ts`
Expected: FAIL — brak `deepScan`.

- [ ] **Step 3: Zaimplementuj deepScan**

Dopisz do `src/main/modbus/Scanner.ts`:

```ts
export interface DeepScanOptions {
  basePath: string
  timeoutMs: number
  bauds: number[]
  parities: Parity[]
  stopBits: Array<1 | 2>
  dataBits?: 7 | 8
  slaveRange: [number, number]
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}

export interface DeepScanResult {
  params: SerialParams | null
  found: number[]
}

export async function deepScan(target: ScanTarget, opts: DeepScanOptions): Promise<DeepScanResult> {
  const [from, to] = opts.slaveRange
  const addrCount = to - from + 1
  const total = opts.bauds.length * opts.parities.length * opts.stopBits.length * addrCount
  let done = 0

  for (const baudRate of opts.bauds) {
    for (const parity of opts.parities) {
      for (const stopBits of opts.stopBits) {
        if (opts.signal?.aborted) return { params: null, found: [] }
        const params: SerialParams = {
          path: opts.basePath,
          baudRate,
          dataBits: opts.dataBits ?? 8,
          parity,
          stopBits,
          timeoutMs: opts.timeoutMs
        }
        const prober = await target.withParams(params)
        const found: number[] = []
        try {
          for (let slave = from; slave <= to; slave++) {
            if (opts.signal?.aborted) break
            const responded = await prober.probe(slave)
            done++
            if (responded) found.push(slave)
            opts.onProgress?.(done, total)
          }
        } finally {
          await prober.close()
        }
        if (found.length > 0) return { params, found }
      }
    }
  }
  return { params: null, found: [] }
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm test -- test/main/modbus/Scanner.test.ts`
Expected: PASS — quick + deep.

- [ ] **Step 5: Commit**

```bash
git add src/main/modbus/Scanner.ts test/main/modbus/Scanner.test.ts
git commit -m "feat: Scanner deep scan sweeping serial params x addresses"
```

---

### Task 14: Bus registry + prober oparty na transporcie + IPC skanu/połączenia

**Files:**
- Create: `src/main/modbus/BusRegistry.ts`, `src/main/modbus/TransportScanTarget.ts`
- Modify: `src/main/ipc/channels.ts`, `src/main/ipc/handlers.ts`, `src/preload/index.ts`, `src/preload/api.d.ts`
- Test: `test/main/modbus/TransportScanTarget.test.ts`

**Interfaces:**
- Consumes: `ModbusBus` (Task 5–7), `ModbusSerialTransport` (Task 9), `ScanTarget`/`Prober` (Task 12), `AppStore` (Task 11), kanały IPC (Task 10).
- Produces:
  - `class BusRegistry` — mapa `path → ModbusBus`; `get(path): ModbusBus | undefined`, `open(params): Promise<ModbusBus>`, `close(path): Promise<void>`.
  - `function makeScanTarget(makeTransport: () => ModbusTransport, probeFc?: 1|2|3|4): ScanTarget` — `probe(slave)` robi lekki odczyt (domyślnie FC03 addr 0 count 1); `true` gdy bez wyjątku, `false` przy błędzie/timeout.
  - Nowe kanały: `connect: 'modbus:connect'`, `disconnect: 'modbus:disconnect'`, `scanQuick: 'scan:quick'`, `scanDeep: 'scan:deep'`, `lastScan: 'scan:last'`.

- [ ] **Step 1: Napisz failing test dla makeScanTarget**

`test/main/modbus/TransportScanTarget.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { makeScanTarget } from '../../../src/main/modbus/TransportScanTarget'
import type { ModbusTransport } from '../../../src/main/modbus/types'

const params = {
  path: '/dev/x', baudRate: 9600, dataBits: 8 as const, parity: 'none' as const,
  stopBits: 1 as const, timeoutMs: 200
}

function transportRespondingAt(slaves: number[]): ModbusTransport {
  let open = false
  return {
    connect: async () => { open = true },
    close: async () => { open = false },
    isOpen: () => open,
    read: async (req) => {
      if (!slaves.includes(req.slave)) throw new Error('timeout')
      return [0]
    },
    write: async () => {}
  }
}

describe('makeScanTarget', () => {
  it('probe resolves true when the light read succeeds', async () => {
    const target = makeScanTarget(() => transportRespondingAt([21]))
    const prober = await target.withParams(params)
    expect(await prober.probe(21)).toBe(true)
    expect(await prober.probe(22)).toBe(false)
    await prober.close()
  })
})
```

- [ ] **Step 2: Uruchom test — ma nie przejść**

Run: `npm test -- test/main/modbus/TransportScanTarget.test.ts`
Expected: FAIL — brak `makeScanTarget`.

- [ ] **Step 3: Zaimplementuj makeScanTarget i BusRegistry**

`src/main/modbus/TransportScanTarget.ts`:

```ts
import type { ModbusTransport, SerialParams } from './types'
import type { Prober, ScanTarget } from './Scanner'

export function makeScanTarget(
  makeTransport: () => ModbusTransport,
  probeFc: 1 | 2 | 3 | 4 = 3
): ScanTarget {
  return {
    withParams: async (params: SerialParams): Promise<Prober> => {
      const transport = makeTransport()
      await transport.connect(params)
      return {
        probe: async (slave: number): Promise<boolean> => {
          try {
            await transport.read({ slave, fc: probeFc, addr: 0, count: 1 })
            return true
          } catch {
            return false
          }
        },
        close: async () => {
          await transport.close()
        }
      }
    }
  }
}
```

`src/main/modbus/BusRegistry.ts`:

```ts
import { ModbusBus } from './ModbusBus'
import { ModbusSerialTransport } from './ModbusSerialTransport'
import type { SerialParams } from './types'

export class BusRegistry {
  private readonly buses = new Map<string, ModbusBus>()

  get(path: string): ModbusBus | undefined {
    return this.buses.get(path)
  }

  async open(params: SerialParams): Promise<ModbusBus> {
    await this.close(params.path)
    const transport = new ModbusSerialTransport()
    await transport.connect(params)
    const bus = new ModbusBus(transport, {
      interFrameDelayMs: 20,
      defaultTimeoutMs: params.timeoutMs
    })
    this.buses.set(params.path, bus)
    return bus
  }

  async close(path: string): Promise<void> {
    const bus = this.buses.get(path)
    if (!bus) return
    await bus.transport.close()
    this.buses.delete(path)
  }
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm test -- test/main/modbus/TransportScanTarget.test.ts`
Expected: PASS.

- [ ] **Step 5: Rozszerz kanały i handlery IPC**

`src/main/ipc/channels.ts`:

```ts
export const CH = {
  listPorts: 'ports:list',
  connect: 'modbus:connect',
  disconnect: 'modbus:disconnect',
  scanQuick: 'scan:quick',
  scanDeep: 'scan:deep',
  lastScan: 'scan:last'
} as const
```

`src/main/ipc/handlers.ts` (zamień całość):

```ts
import { ipcMain } from 'electron'
import { CH } from './channels'
import { listSerialPorts } from '../modbus/SerialPortService'
import { BusRegistry } from '../modbus/BusRegistry'
import { ModbusSerialTransport } from '../modbus/ModbusSerialTransport'
import { makeScanTarget } from '../modbus/TransportScanTarget'
import { quickScan, deepScan } from '../modbus/Scanner'
import type { QuickScanOptions, DeepScanOptions } from '../modbus/Scanner'
import { createAppStore } from '../store/Store'
import type { SerialParams } from '../modbus/types'

export function registerIpcHandlers(): void {
  const registry = new BusRegistry()
  const store = createAppStore()

  ipcMain.handle(CH.listPorts, async () => listSerialPorts())

  ipcMain.handle(CH.connect, async (_e, params: SerialParams) => {
    await registry.open(params)
    return { ok: true }
  })

  ipcMain.handle(CH.disconnect, async (_e, path: string) => {
    await registry.close(path)
    return { ok: true }
  })

  ipcMain.handle(CH.scanQuick, async (_e, opts: QuickScanOptions) => {
    const target = makeScanTarget(() => new ModbusSerialTransport())
    const result = await quickScan(target, opts)
    store.setLastScan({ params: result.params, slaves: result.found, ts: Date.now() })
    return result
  })

  ipcMain.handle(CH.scanDeep, async (_e, opts: DeepScanOptions) => {
    const target = makeScanTarget(() => new ModbusSerialTransport())
    const result = await deepScan(target, opts)
    if (result.params) {
      store.setLastScan({ params: result.params, slaves: result.found, ts: Date.now() })
    }
    return result
  })

  ipcMain.handle(CH.lastScan, async () => store.getLastScan())
}
```

- [ ] **Step 6: Rozszerz preload API**

`src/preload/index.ts` (zamień `api`):

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { CH } from '../main/ipc/channels'

const api = {
  listPorts: () => ipcRenderer.invoke(CH.listPorts),
  connect: (params: unknown) => ipcRenderer.invoke(CH.connect, params),
  disconnect: (path: string) => ipcRenderer.invoke(CH.disconnect, path),
  scanQuick: (opts: unknown) => ipcRenderer.invoke(CH.scanQuick, opts),
  scanDeep: (opts: unknown) => ipcRenderer.invoke(CH.scanDeep, opts),
  lastScan: () => ipcRenderer.invoke(CH.lastScan)
}

contextBridge.exposeInMainWorld('api', api)
```

`src/preload/api.d.ts` (zamień interfejs):

```ts
import type { PortInfo } from '../main/modbus/SerialPortService'
import type { SerialParams } from '../main/modbus/types'
import type { QuickScanOptions, DeepScanOptions, ScanResult, DeepScanResult } from '../main/modbus/Scanner'
import type { ScanRecord } from '../main/store/Store'

export interface RendererApi {
  listPorts: () => Promise<PortInfo[]>
  connect: (params: SerialParams) => Promise<{ ok: true }>
  disconnect: (path: string) => Promise<{ ok: true }>
  scanQuick: (opts: QuickScanOptions) => Promise<ScanResult>
  scanDeep: (opts: DeepScanOptions) => Promise<DeepScanResult>
  lastScan: () => Promise<ScanRecord | null>
}

declare global {
  interface Window {
    api: RendererApi
  }
}
```

- [ ] **Step 7: Sprawdź kompilację i testy**

Run: `npx tsc --noEmit && npm test`
Expected: brak błędów typów; wszystkie testy PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: bus registry, transport scan target, scan/connect IPC with scan persistence"
```

---

### Task 15: Widok Połączenie (renderer) + nawigacja

**Files:**
- Create: `src/renderer/views/ConnectionView.tsx`
- Modify: `src/renderer/App.tsx`

**Interfaces:**
- Consumes: `api.listPorts`, `api.connect`, `api.disconnect` z Task 14; `PortInfo`, `SerialParams`.
- Produces: `ConnectionView` z wyborem portu i parametrów (`baudRate`/`parity`/`stopBits`/`timeoutMs`), przyciskami „Połącz"/„Rozłącz". Utrzymuje globalny stan wybranego portu przez callback `onConnected(params: SerialParams)`. Nawigacja tabowa między widokami w `App.tsx`.

- [ ] **Step 1: Napisz ConnectionView**

`src/renderer/views/ConnectionView.tsx`:

```tsx
import React, { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { PortInfo } from '../../main/modbus/SerialPortService'
import type { SerialParams, Parity } from '../../main/modbus/types'

const BAUDS = [9600, 19200, 38400, 57600, 115200]
const PARITIES: Parity[] = ['none', 'even', 'odd']

export function ConnectionView({
  onConnected
}: {
  onConnected: (params: SerialParams) => void
}): React.JSX.Element {
  const [ports, setPorts] = useState<PortInfo[]>([])
  const [path, setPath] = useState('')
  const [baudRate, setBaud] = useState(9600)
  const [parity, setParity] = useState<Parity>('none')
  const [stopBits, setStop] = useState<1 | 2>(1)
  const [timeoutMs, setTimeout] = useState(1000)
  const [status, setStatus] = useState('rozłączony')

  useEffect(() => {
    api.listPorts().then((p) => {
      setPorts(p)
      if (p[0]) setPath(p[0].path)
    })
  }, [])

  const params: SerialParams = { path, baudRate, dataBits: 8, parity, stopBits, timeoutMs }

  async function connect(): Promise<void> {
    try {
      await api.connect(params)
      setStatus(`połączony: ${path}`)
      onConnected(params)
    } catch (e) {
      setStatus(`błąd: ${String(e)}`)
    }
  }

  async function disconnect(): Promise<void> {
    await api.disconnect(path)
    setStatus('rozłączony')
  }

  return (
    <div>
      <h2>Połączenie</h2>
      <label>Port:{' '}
        <select value={path} onChange={(e) => setPath(e.target.value)}>
          {ports.map((p) => <option key={p.path} value={p.path}>{p.path}</option>)}
        </select>
      </label>
      <label>{' '}Baud:{' '}
        <select value={baudRate} onChange={(e) => setBaud(Number(e.target.value))}>
          {BAUDS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </label>
      <label>{' '}Parity:{' '}
        <select value={parity} onChange={(e) => setParity(e.target.value as Parity)}>
          {PARITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <label>{' '}Stop bits:{' '}
        <select value={stopBits} onChange={(e) => setStop(Number(e.target.value) as 1 | 2)}>
          <option value={1}>1</option><option value={2}>2</option>
        </select>
      </label>
      <label>{' '}Timeout (ms):{' '}
        <input type="number" value={timeoutMs} onChange={(e) => setTimeout(Number(e.target.value))} />
      </label>
      <div style={{ marginTop: 8 }}>
        <button onClick={connect} disabled={!path}>Połącz</button>{' '}
        <button onClick={disconnect} disabled={!path}>Rozłącz</button>
        <span style={{ marginLeft: 12 }}>Status: {status}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Dodaj nawigację w App.tsx**

`src/renderer/App.tsx` (zamień całość):

```tsx
import React, { useState } from 'react'
import { ConnectionView } from './views/ConnectionView'
import type { SerialParams } from '../main/modbus/types'

type Tab = 'connection' | 'scanner' | 'readwrite' | 'devicetest' | 'dashboard' | 'settings'

export default function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('connection')
  const [params, setParams] = useState<SerialParams | null>(null)

  const tabs: Array<[Tab, string]> = [
    ['connection', 'Połączenie'],
    ['scanner', 'Skaner'],
    ['readwrite', 'Read/Write'],
    ['devicetest', 'Test urządzenia'],
    ['dashboard', 'Dashboard'],
    ['settings', 'Ustawienia']
  ]

  return (
    <div style={{ fontFamily: 'system-ui', padding: 16 }}>
      <h1>Modbus RTU Tester</h1>
      <nav style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} disabled={tab === id}>{label}</button>
        ))}
      </nav>
      {tab === 'connection' && <ConnectionView onConnected={setParams} />}
      {tab !== 'connection' && !params && <p>Najpierw połącz się w zakładce „Połączenie".</p>}
      {/* kolejne widoki dopinane w następnych taskach */}
      <footer style={{ marginTop: 24, color: '#888' }}>
        {params ? `Aktywny port: ${params.path} @ ${params.baudRate} ${params.parity}` : 'Brak połączenia'}
      </footer>
    </div>
  )
}
```

- [ ] **Step 3: Weryfikacja manualna**

Run: `npm run dev`
Expected: widoczne zakładki. W „Połączenie" lista portów, wybór parametrów. Bez sprzętu „Połącz" pokaże błąd w statusie (nie ubija apki). Z podłączonym Daikinem (`9600`, `none`, `1`) status „połączony" i stopka pokazuje aktywny port.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: Connection view and tab navigation"
```

---

### Task 16: Widok Skaner + tabela urządzeń + odczyt ostatniego skanu

**Files:**
- Create: `src/renderer/views/ScannerView.tsx`
- Modify: `src/renderer/App.tsx`

**Interfaces:**
- Consumes: `api.scanQuick`, `api.scanDeep`, `api.lastScan` z Task 14; `SerialParams`, `ScanResult`, `DeepScanResult`.
- Produces: `ScannerView` z wyborem trybu (szybki/głęboki), zakresem adresów, uruchomieniem skanu i tabelą wykrytych slaveów (adres + status „online"). Wczytuje ostatni skan przy montowaniu.

- [ ] **Step 1: Napisz ScannerView**

`src/renderer/views/ScannerView.tsx`:

```tsx
import React, { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { SerialParams } from '../../main/modbus/types'

export function ScannerView({ params }: { params: SerialParams }): React.JSX.Element {
  const [mode, setMode] = useState<'quick' | 'deep'>('quick')
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(32)
  const [busy, setBusy] = useState(false)
  const [found, setFound] = useState<number[]>([])
  const [foundParams, setFoundParams] = useState<SerialParams | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api.lastScan().then((rec) => {
      if (rec) {
        setFound(rec.slaves)
        setFoundParams(rec.params)
        setMsg(`Ostatni skan: ${new Date(rec.ts).toLocaleString()}`)
      }
    })
  }, [])

  async function run(): Promise<void> {
    setBusy(true)
    setMsg('Skanowanie…')
    try {
      if (mode === 'quick') {
        const r = await api.scanQuick({ params, slaveRange: [from, to] })
        setFound(r.found)
        setFoundParams(r.params)
      } else {
        const r = await api.scanDeep({
          basePath: params.path,
          timeoutMs: params.timeoutMs,
          bauds: [9600, 19200, 38400, 57600, 115200],
          parities: ['none', 'even', 'odd'],
          stopBits: [1, 2],
          slaveRange: [from, to]
        })
        setFound(r.found)
        setFoundParams(r.params)
        if (!r.params) setMsg('Nie znaleziono działającej konfiguracji.')
      }
      setMsg((m) => (m === 'Skanowanie…' ? 'Zakończono.' : m))
    } catch (e) {
      setMsg(`Błąd: ${String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h2>Skaner</h2>
      <label>Tryb:{' '}
        <select value={mode} onChange={(e) => setMode(e.target.value as 'quick' | 'deep')}>
          <option value="quick">Szybki (adresy)</option>
          <option value="deep">Głęboki (parametry × adresy)</option>
        </select>
      </label>
      <label>{' '}Od:{' '}<input type="number" value={from} onChange={(e) => setFrom(Number(e.target.value))} /></label>
      <label>{' '}Do:{' '}<input type="number" value={to} onChange={(e) => setTo(Number(e.target.value))} /></label>
      <button onClick={run} disabled={busy} style={{ marginLeft: 8 }}>Skanuj</button>
      <p>{msg}</p>
      {foundParams && (
        <p>Działająca konfiguracja: {foundParams.baudRate} {foundParams.parity} {foundParams.stopBits}</p>
      )}
      <table border={1} cellPadding={4}>
        <thead><tr><th>Adres slave</th><th>Status</th></tr></thead>
        <tbody>
          {found.map((s) => <tr key={s}><td>{s}</td><td>online</td></tr>)}
          {found.length === 0 && <tr><td colSpan={2}>Brak wykrytych urządzeń.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Podepnij ScannerView w App.tsx**

W `src/renderer/App.tsx` dodaj import i render dla `tab === 'scanner'`:

```tsx
import { ScannerView } from './views/ScannerView'
```

Wstaw po linii z `ConnectionView` (i po strażniku „Najpierw połącz"):

```tsx
      {tab === 'scanner' && params && <ScannerView params={params} />}
```

- [ ] **Step 3: Weryfikacja manualna**

Run: `npm run dev`
Expected: po połączeniu, w „Skaner" tryb szybki skanuje zakres i wypełnia tabelę online-slaveów; z Daikinem na slave 21/22 pojawiają się te adresy. Tryb głęboki bez znajomości parametrów sam wykrywa `9600/none/1`. Ponowne otwarcie zakładki wczytuje ostatni skan z `Store`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: Scanner view with device table and last-scan restore"
```

---

## Phase 3 — Read/Write

Wszystkie FC01–06/15/16, ręczny odczyt/zapis, interpretacja typów (16/32-bit signed/unsigned, float32, endianness/word order).

### Task 17: Operacje read/write przez ModbusBus (wszystkie FC)

**Files:**
- Create: `src/main/modbus/operations.ts`
- Test: `test/main/modbus/operations.test.ts`

**Interfaces:**
- Consumes: `ModbusBus` (Task 5–7), `ReadRequest`, `WriteRequest`, `Result`, `ok`, `err` z `types.ts`.
- Produces:
  - `async function busRead(bus: ModbusBus, req: ReadRequest, priority?: Priority): Promise<Result<number[]>>` — kolejkuje `transport.read`, zwraca surowe słowa; błędy mapuje na `Err` (kod z wyjątku, np. `TIMEOUT` lub `MODBUS_EXCEPTION`).
  - `async function busWrite(bus: ModbusBus, req: WriteRequest, priority?: Priority): Promise<Result<void>>` — kolejkuje `transport.write`.
  - `function classifyError(e: unknown): { code: string; message: string }` — mapuje `TimeoutError`→`TIMEOUT`, wyjątki modbus (pole `modbusCode`)→`MODBUS_EXCEPTION`, reszta→`IO_ERROR`.

- [ ] **Step 1: Napisz failing testy operacji**

`test/main/modbus/operations.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ModbusBus } from '../../../src/main/modbus/ModbusBus'
import { busRead, busWrite } from '../../../src/main/modbus/operations'
import type { ModbusTransport } from '../../../src/main/modbus/types'

function transport(overrides: Partial<ModbusTransport> = {}): ModbusTransport {
  return {
    connect: async () => {},
    close: async () => {},
    isOpen: () => true,
    read: async () => [42],
    write: async () => {},
    ...overrides
  }
}

describe('busRead / busWrite', () => {
  it('returns ok with raw registers on success', async () => {
    const bus = new ModbusBus(transport(), { interFrameDelayMs: 0 })
    const res = await busRead(bus, { slave: 21, fc: 3, addr: 0, count: 1 })
    expect(res).toEqual({ ok: true, value: [42] })
  })

  it('maps modbus exception to Err with MODBUS_EXCEPTION', async () => {
    const boom = Object.assign(new Error('Illegal address'), { modbusCode: 2 })
    const bus = new ModbusBus(transport({ read: async () => { throw boom } }), { interFrameDelayMs: 0 })
    const res = await busRead(bus, { slave: 21, fc: 3, addr: 999, count: 1 })
    expect(res).toEqual({ ok: false, code: 'MODBUS_EXCEPTION', message: 'Illegal address' })
  })

  it('returns ok on successful write', async () => {
    let written: unknown = null
    const bus = new ModbusBus(transport({ write: async (r) => { written = r } }), { interFrameDelayMs: 0 })
    const res = await busWrite(bus, { slave: 21, fc: 6, addr: 231, values: [200] })
    expect(res).toEqual({ ok: true, value: undefined })
    expect(written).toEqual({ slave: 21, fc: 6, addr: 231, values: [200] })
  })
})
```

- [ ] **Step 2: Uruchom test — ma nie przejść**

Run: `npm test -- test/main/modbus/operations.test.ts`
Expected: FAIL — brak `busRead`/`busWrite`.

- [ ] **Step 3: Zaimplementuj operacje**

`src/main/modbus/operations.ts`:

```ts
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
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm test -- test/main/modbus/operations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/modbus/operations.ts test/main/modbus/operations.test.ts
git commit -m "feat: bus read/write operations with typed error classification"
```

---

### Task 18: IPC modbus:read / modbus:write

**Files:**
- Modify: `src/main/ipc/channels.ts`, `src/main/ipc/handlers.ts`, `src/preload/index.ts`, `src/preload/api.d.ts`

**Interfaces:**
- Consumes: `BusRegistry` (Task 14), `busRead`/`busWrite` (Task 17), `ReadRequest`/`WriteRequest`/`Result`.
- Produces:
  - kanały `read: 'modbus:read'`, `write: 'modbus:write'`.
  - `api.read(port: string, req: ReadRequest): Promise<Result<number[]>>`
  - `api.write(port: string, req: WriteRequest): Promise<Result<void>>`
  - Handlery pobierają `ModbusBus` z registry po `port`; brak połączenia → `{ ok: false, code: 'NOT_CONNECTED', message }`.

- [ ] **Step 1: Dodaj kanały**

W `src/main/ipc/channels.ts` dodaj do obiektu `CH`:

```ts
  read: 'modbus:read',
  write: 'modbus:write',
```

- [ ] **Step 2: Dodaj handlery**

W `src/main/ipc/handlers.ts` dodaj importy:

```ts
import { busRead, busWrite } from '../modbus/operations'
import type { ReadRequest, WriteRequest } from '../modbus/types'
```

Dodaj wewnątrz `registerIpcHandlers` (przed końcem funkcji):

```ts
  ipcMain.handle(CH.read, async (_e, port: string, req: ReadRequest) => {
    const bus = registry.get(port)
    if (!bus) return { ok: false, code: 'NOT_CONNECTED', message: `Port ${port} not connected` }
    return busRead(bus, req)
  })

  ipcMain.handle(CH.write, async (_e, port: string, req: WriteRequest) => {
    const bus = registry.get(port)
    if (!bus) return { ok: false, code: 'NOT_CONNECTED', message: `Port ${port} not connected` }
    return busWrite(bus, req)
  })
```

- [ ] **Step 3: Rozszerz preload**

W `src/preload/index.ts` dodaj do `api`:

```ts
  read: (port: string, req: unknown) => ipcRenderer.invoke(CH.read, port, req),
  write: (port: string, req: unknown) => ipcRenderer.invoke(CH.write, port, req),
```

W `src/preload/api.d.ts` dodaj importy i pola:

```ts
import type { ReadRequest, WriteRequest, Result } from '../main/modbus/types'
```

```ts
  read: (port: string, req: ReadRequest) => Promise<Result<number[]>>
  write: (port: string, req: WriteRequest) => Promise<Result<void>>
```

- [ ] **Step 4: Sprawdź kompilację i testy**

Run: `npx tsc --noEmit && npm test`
Expected: brak błędów typów; testy PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: modbus:read/write IPC channels wired to bus registry"
```

---

### Task 19: Widok Read/Write z interpretacją typów

**Files:**
- Create: `src/renderer/views/ReadWriteView.tsx`
- Modify: `src/renderer/App.tsx`

**Interfaces:**
- Consumes: `api.read`, `api.write` (Task 18); `decode`/`encode`/`NumericType`/`WordOrder` z `DataCodec` (Task 2–3); `ReadRequest`/`WriteRequest`.
- Produces: `ReadWriteView` — wybór FC (01/02/03/04 read; 05/06/15/16 write), slave, addr, count/wartość; odczyt pokazuje surowe słowa oraz zdekodowaną wartość wg wybranego typu (`uint16`/`int16`/`uint32`/`int32`/`float32`) i `wordOrder`; zapis koduje wartość i wysyła. Wynik `Err` renderowany jako czytelny komunikat z kodem.

- [ ] **Step 1: Napisz ReadWriteView**

`src/renderer/views/ReadWriteView.tsx`:

```tsx
import React, { useState } from 'react'
import { api } from '../lib/api'
import { decode, encode, type NumericType, type WordOrder } from '../../main/modbus/DataCodec'
import type { SerialParams } from '../../main/modbus/types'

const READ_FCS = [1, 2, 3, 4] as const
const WRITE_FCS = [5, 6, 15, 16] as const
const TYPES: NumericType[] = ['uint16', 'int16', 'uint32', 'int32', 'float32']

export function ReadWriteView({ params }: { params: SerialParams }): React.JSX.Element {
  const [slave, setSlave] = useState(21)
  const [addr, setAddr] = useState(0)
  const [count, setCount] = useState(1)
  const [readFc, setReadFc] = useState<1 | 2 | 3 | 4>(3)
  const [writeFc, setWriteFc] = useState<5 | 6 | 15 | 16>(6)
  const [type, setType] = useState<NumericType>('uint16')
  const [wordOrder, setWordOrder] = useState<WordOrder>('AB')
  const [scale, setScale] = useState(1)
  const [writeValue, setWriteValue] = useState(0)
  const [raw, setRaw] = useState<number[] | null>(null)
  const [decoded, setDecoded] = useState<number | null>(null)
  const [error, setError] = useState('')

  async function doRead(): Promise<void> {
    setError('')
    const res = await api.read(params.path, { slave, fc: readFc, addr, count })
    if (!res.ok) { setError(`${res.code}: ${res.message}`); return }
    setRaw(res.value)
    try {
      setDecoded(decode(res.value, { type, scale, wordOrder }))
    } catch {
      setDecoded(null)
    }
  }

  async function doWrite(): Promise<void> {
    setError('')
    const values = encode(writeValue, { type, scale, wordOrder })
    const res = await api.write(params.path, { slave, fc: writeFc, addr, values })
    if (!res.ok) { setError(`${res.code}: ${res.message}`); return }
    setError('Zapis OK')
  }

  return (
    <div>
      <h2>Read / Write</h2>
      <div>
        <label>Slave:{' '}<input type="number" value={slave} onChange={(e) => setSlave(Number(e.target.value))} /></label>
        <label>{' '}Addr:{' '}<input type="number" value={addr} onChange={(e) => setAddr(Number(e.target.value))} /></label>
        <label>{' '}Count:{' '}<input type="number" value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>
      </div>
      <div>
        <label>Typ:{' '}
          <select value={type} onChange={(e) => setType(e.target.value as NumericType)}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>{' '}Word order:{' '}
          <select value={wordOrder} onChange={(e) => setWordOrder(e.target.value as WordOrder)}>
            <option value="AB">AB</option><option value="BA">BA</option>
          </select>
        </label>
        <label>{' '}Skala:{' '}<input type="number" step="0.1" value={scale} onChange={(e) => setScale(Number(e.target.value))} /></label>
      </div>
      <div style={{ marginTop: 8 }}>
        <label>Read FC:{' '}
          <select value={readFc} onChange={(e) => setReadFc(Number(e.target.value) as 1 | 2 | 3 | 4)}>
            {READ_FCS.map((f) => <option key={f} value={f}>FC{String(f).padStart(2, '0')}</option>)}
          </select>
        </label>
        <button onClick={doRead} style={{ marginLeft: 8 }}>Odczytaj</button>
      </div>
      <div style={{ marginTop: 8 }}>
        <label>Write FC:{' '}
          <select value={writeFc} onChange={(e) => setWriteFc(Number(e.target.value) as 5 | 6 | 15 | 16)}>
            {WRITE_FCS.map((f) => <option key={f} value={f}>FC{String(f).padStart(2, '0')}</option>)}
          </select>
        </label>
        <label>{' '}Wartość:{' '}<input type="number" step="0.1" value={writeValue} onChange={(e) => setWriteValue(Number(e.target.value))} /></label>
        <button onClick={doWrite} style={{ marginLeft: 8 }}>Zapisz</button>
      </div>
      {raw && <p>Surowe słowa: [{raw.join(', ')}] → zdekodowana wartość: {decoded ?? '—'}</p>}
      {error && <p style={{ color: error === 'Zapis OK' ? 'green' : 'red' }}>{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Podepnij w App.tsx**

W `src/renderer/App.tsx` dodaj import i render:

```tsx
import { ReadWriteView } from './views/ReadWriteView'
```

```tsx
      {tab === 'readwrite' && params && <ReadWriteView params={params} />}
```

- [ ] **Step 3: Weryfikacja manualna**

Run: `npm run dev`
Expected: po połączeniu z Daikinem, FC03 slave 21 addr 0 count 1 → surowe np. `[224]`, przy typie `uint16` skala `0.1` zdekodowana `22.4`. Zapis FC06 addr 231 wartością setpointu działa (albo czytelny błąd `MODBUS_EXCEPTION`/`TIMEOUT`, bez ubicia apki).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: Read/Write view with type interpretation (16/32-bit, float32, word order)"
```

---

## Phase 4 — Profile urządzeń + Test urządzenia

`DeviceProfiles`, profil EKWHCTRL1, auto-generowany panel, mapy rejestrów (zapis).

### Task 20: Schemat profilu + validateProfile

**Files:**
- Create: `src/main/profiles/schema.ts`
- Test: `test/main/profiles/schema.test.ts`

**Interfaces:**
- Consumes: `NumericType` z `DataCodec`; `Parity` z `types.ts`.
- Produces:
  - `type Access = 'R' | 'RW'`
  - `interface FlagBitEnum { enum: Record<string, string> }` (dla zakresu bitów, np. `"0-2"`)
  - `type FlagBitDef = string | FlagBitEnum`
  - `interface NumericRegister { addr: number; mnem: string; name: string; access: Access; type: NumericType; scale?: number; unit?: string; min?: number; max?: number; default?: number; kind?: undefined }`
  - `interface FlagsRegister { addr: number; mnem: string; name: string; access: Access; kind: 'flags'; bits: Record<string, FlagBitDef> }`
  - `type RegisterDef = NumericRegister | FlagsRegister`
  - `interface DeviceProfile { id: string; name: string; serial: { baud: number; dataBits: number; parity: Parity; stopBits: number }; functions: string[]; registers: RegisterDef[] }`
  - `function validateProfile(obj: unknown): DeviceProfile` — rzuca `Error` z czytelnym komunikatem, gdy brakuje pól / zły `addr` / duplikat adresu / zły `access`.

- [ ] **Step 1: Napisz failing testy schematu**

`test/main/profiles/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateProfile } from '../../../src/main/profiles/schema'

const valid = {
  id: 'x',
  name: 'X',
  serial: { baud: 9600, dataBits: 8, parity: 'none', stopBits: 1 },
  functions: ['FC03', 'FC06'],
  registers: [
    { addr: 0, mnem: 'T1', name: 'Temp', access: 'R', type: 'uint16', scale: 0.1, unit: '°C' },
    { addr: 201, mnem: 'PRG', name: 'Tryb', access: 'RW', kind: 'flags',
      bits: { '0-2': { enum: { '0': 'Auto', '1': 'Silent' } }, '4': 'Lock' } }
  ]
}

describe('validateProfile', () => {
  it('accepts a valid profile', () => {
    const p = validateProfile(valid)
    expect(p.id).toBe('x')
    expect(p.registers).toHaveLength(2)
  })

  it('rejects missing id', () => {
    expect(() => validateProfile({ ...valid, id: undefined })).toThrow(/id/)
  })

  it('rejects duplicate register addresses', () => {
    const dup = { ...valid, registers: [valid.registers[0], { ...valid.registers[0] }] }
    expect(() => validateProfile(dup)).toThrow(/duplicate/i)
  })

  it('rejects invalid access value', () => {
    const bad = { ...valid, registers: [{ ...valid.registers[0], access: 'X' }] }
    expect(() => validateProfile(bad)).toThrow(/access/i)
  })

  it('rejects negative addr', () => {
    const bad = { ...valid, registers: [{ ...valid.registers[0], addr: -1 }] }
    expect(() => validateProfile(bad)).toThrow(/addr/i)
  })
})
```

- [ ] **Step 2: Uruchom test — ma nie przejść**

Run: `npm test -- test/main/profiles/schema.test.ts`
Expected: FAIL — brak `validateProfile`.

- [ ] **Step 3: Zaimplementuj schemat i walidację**

`src/main/profiles/schema.ts`:

```ts
import type { NumericType } from '../modbus/DataCodec'
import type { Parity } from '../modbus/types'

export type Access = 'R' | 'RW'

export interface FlagBitEnum {
  enum: Record<string, string>
}

export type FlagBitDef = string | FlagBitEnum

export interface NumericRegister {
  addr: number
  mnem: string
  name: string
  access: Access
  type: NumericType
  scale?: number
  unit?: string
  min?: number
  max?: number
  default?: number
  kind?: undefined
}

export interface FlagsRegister {
  addr: number
  mnem: string
  name: string
  access: Access
  kind: 'flags'
  bits: Record<string, FlagBitDef>
}

export type RegisterDef = NumericRegister | FlagsRegister

export interface DeviceProfile {
  id: string
  name: string
  serial: { baud: number; dataBits: number; parity: Parity; stopBits: number }
  functions: string[]
  registers: RegisterDef[]
}

function req(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Invalid profile: ${msg}`)
}

export function validateProfile(obj: unknown): DeviceProfile {
  const p = obj as Record<string, unknown>
  req(typeof p?.id === 'string' && p.id.length > 0, 'missing id')
  req(typeof p?.name === 'string' && p.name.length > 0, 'missing name')
  req(typeof p?.serial === 'object' && p.serial !== null, 'missing serial')
  req(Array.isArray(p?.functions), 'missing functions')
  req(Array.isArray(p?.registers), 'missing registers')

  const seen = new Set<number>()
  for (const r of p.registers as Array<Record<string, unknown>>) {
    req(typeof r.addr === 'number' && r.addr >= 0, `addr must be a non-negative number (mnem ${String(r.mnem)})`)
    req(!seen.has(r.addr), `duplicate register address ${r.addr}`)
    seen.add(r.addr)
    req(typeof r.mnem === 'string' && r.mnem.length > 0, `missing mnem at addr ${r.addr}`)
    req(typeof r.name === 'string' && r.name.length > 0, `missing name at addr ${r.addr}`)
    req(r.access === 'R' || r.access === 'RW', `invalid access at addr ${r.addr}`)
    if (r.kind === 'flags') {
      req(typeof r.bits === 'object' && r.bits !== null, `flags register ${r.addr} missing bits`)
    } else {
      req(typeof r.type === 'string', `numeric register ${r.addr} missing type`)
    }
  }
  return obj as DeviceProfile
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm test -- test/main/profiles/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/profiles/schema.ts test/main/profiles/schema.test.ts
git commit -m "feat: device profile schema and validateProfile"
```

---

### Task 21: Profil EKWHCTRL1 (JSON) + loadBuiltinProfiles

**Files:**
- Create: `src/main/profiles/builtin/daikin-ekwhctrl1.json`, `src/main/profiles/DeviceProfiles.ts`
- Test: `test/main/profiles/DeviceProfiles.test.ts`

**Interfaces:**
- Consumes: `validateProfile`, `DeviceProfile` z Task 20.
- Produces:
  - `function loadBuiltinProfiles(): DeviceProfile[]` — waliduje i zwraca wbudowane profile.
  - `function getProfileById(id: string): DeviceProfile | undefined`.

- [ ] **Step 1: Napisz profil EKWHCTRL1 (z manuala N420384A, spec §5.4)**

`src/main/profiles/builtin/daikin-ekwhctrl1.json`:

```json
{
  "id": "daikin-ekwhctrl1",
  "name": "Daikin EKWHCTRL1 / EKRTCTRL1",
  "serial": { "baud": 9600, "dataBits": 8, "parity": "none", "stopBits": 1 },
  "functions": ["FC03", "FC06"],
  "registers": [
    { "addr": 0, "mnem": "T1", "name": "Temp. powietrza", "access": "R", "type": "uint16", "scale": 0.1, "unit": "°C" },
    { "addr": 1, "mnem": "T2", "name": "Temp. wody H2", "access": "R", "type": "uint16", "scale": 0.1, "unit": "°C" },
    { "addr": 8, "mnem": "SP", "name": "Setpoint rzeczywisty", "access": "R", "type": "uint16", "scale": 0.1, "unit": "°C" },
    { "addr": 9, "mnem": "OUT", "name": "Status przekaźników", "access": "R", "kind": "flags",
      "bits": { "0": "EV1", "1": "EV2", "2": "CHILLER", "3": "BOILER" } },
    { "addr": 15, "mnem": "MOT_SET", "name": "Prędkość silnika (set)", "access": "R", "type": "uint16", "scale": 1, "min": 0, "max": 1700 },
    { "addr": 104, "mnem": "STAT", "name": "Flagi statusu", "access": "R", "kind": "flags",
      "bits": { "0": "Mod.Raff", "1": "Mod.Risc", "3": "F.V. H2", "4": "F.V. H4", "6": "B.A.",
                "8": "Antig", "9": "Alrm", "10": "Test", "11": "Stby", "12": "Com err", "13": "H2 asnt", "14": "H4 asnt" } },
    { "addr": 105, "mnem": "ALR_STAT", "name": "Flagi alarmów", "access": "R", "kind": "flags",
      "bits": { "0": "Com", "1": "AIR", "2": "H4", "3": "Acq.Dan H4", "4": "H2", "6": "H4 n.id",
                "7": "Hi Res", "9": "Mot", "10": "SW GRL", "11": "Filter", "12": "2 AIR M5" } },
    { "addr": 200, "mnem": "ADR", "name": "Adres urządzenia", "access": "RW", "type": "uint16", "scale": 1, "min": 1, "max": 255, "default": 1 },
    { "addr": 201, "mnem": "PRG", "name": "Tryb pracy / konfiguracja", "access": "RW", "kind": "flags",
      "bits": { "0-2": { "enum": { "0": "Auto", "1": "Silent", "2": "Night", "3": "Max" } }, "4": "Lock", "7": "Standby" } },
    { "addr": 202, "mnem": "SPL", "name": "Setpoint min", "access": "RW", "type": "uint16", "scale": 0.1, "unit": "°C", "min": 5.0, "max": 35.0, "default": 16.0 },
    { "addr": 203, "mnem": "SPH", "name": "Setpoint max", "access": "RW", "type": "uint16", "scale": 0.1, "unit": "°C", "min": 5.0, "max": 35.0, "default": 28.0 },
    { "addr": 209, "mnem": "E_SAVING", "name": "Offset obecności/stand-by", "access": "RW", "type": "uint16", "scale": 0.1, "unit": "°K", "min": 0, "max": 8.5, "default": 0 },
    { "addr": 210, "mnem": "MVV5", "name": "Min prędkość MIN/Night", "access": "RW", "type": "uint16", "scale": 1, "min": 400, "max": 1500, "default": 400 },
    { "addr": 211, "mnem": "MVV4", "name": "MVV4", "access": "RW", "type": "uint16", "scale": 1, "min": 400, "max": 1500, "default": 550 },
    { "addr": 212, "mnem": "MVV3", "name": "MVV3", "access": "RW", "type": "uint16", "scale": 1, "min": 400, "max": 1500, "default": 680 },
    { "addr": 213, "mnem": "MVV2", "name": "Max w AUTO", "access": "RW", "type": "uint16", "scale": 1, "min": 400, "max": 1500, "default": 1100 },
    { "addr": 214, "mnem": "MVV1", "name": "Max w MAX", "access": "RW", "type": "uint16", "scale": 1, "min": 400, "max": 1500, "default": 1500 },
    { "addr": 215, "mnem": "MVVP1", "name": "MVVP1", "access": "RW", "type": "uint16", "scale": 1, "min": 400, "max": 1700, "default": 1700 },
    { "addr": 218, "mnem": "LLO", "name": "Min woda grzanie", "access": "RW", "type": "uint16", "scale": 0.1, "unit": "°C", "min": 0.0, "max": 100.0, "default": 30.0 },
    { "addr": 219, "mnem": "LHI", "name": "Max woda chłodzenie", "access": "RW", "type": "uint16", "scale": 0.1, "unit": "°C", "min": 0.0, "max": 100.0, "default": 20.0 },
    { "addr": 221, "mnem": "ACL", "name": "Częstotliwość serwisu (h)", "access": "RW", "type": "uint16", "scale": 1, "min": 0, "max": 32000, "default": 0 },
    { "addr": 222, "mnem": "ACL_TIM", "name": "Licznik godzin pracy", "access": "RW", "type": "uint16", "scale": 1, "min": 0, "max": 32000, "default": 0 },
    { "addr": 230, "mnem": "MVVP3", "name": "MVVP3", "access": "RW", "type": "uint16", "scale": 1, "min": 400, "max": 1700, "default": 920 },
    { "addr": 231, "mnem": "SP_ABS", "name": "Setpoint absolutny", "access": "RW", "type": "uint16", "scale": 0.1, "unit": "°C", "min": 5.0, "max": 35.0, "default": 20.0 },
    { "addr": 233, "mnem": "Man", "name": "Sezon auto/ręczny", "access": "RW", "type": "uint16", "scale": 1, "min": 0, "max": 5, "default": 3 },
    { "addr": 234, "mnem": "MVVP2", "name": "MVVP2", "access": "RW", "type": "uint16", "scale": 1, "min": 400, "max": 1500, "default": 1220 },
    { "addr": 242, "mnem": "OS1", "name": "Offset sondy powietrza T1", "access": "RW", "type": "int16", "scale": 0.1, "unit": "°K", "min": -12.0, "max": 12.0, "default": 0 },
    { "addr": 243, "mnem": "OS2", "name": "Offset sondy wody H2", "access": "RW", "type": "int16", "scale": 0.1, "unit": "°K", "min": -12.0, "max": 12.0, "default": 0 },
    { "addr": 244, "mnem": "OS3", "name": "Offset sondy wody H4", "access": "RW", "type": "int16", "scale": 0.1, "unit": "°K", "min": -12.0, "max": 12.0, "default": 0 },
    { "addr": 245, "mnem": "SPL_W", "name": "WEB setpoint min", "access": "RW", "type": "uint16", "scale": 0.1, "unit": "°C", "min": 5.0, "max": 40.0, "default": 20.0 },
    { "addr": 246, "mnem": "SPH_W", "name": "WEB setpoint max", "access": "RW", "type": "uint16", "scale": 0.1, "unit": "°C", "min": 5.0, "max": 40.0, "default": 24.0 },
    { "addr": 247, "mnem": "WEB", "name": "Flagi WEB", "access": "RW", "kind": "flags",
      "bits": { "0": "Led WEB OFF", "1": "Forced off", "2": "Disable rotacji programów", "3": "Disable stby",
                "4": "Inhibit ekstremów", "5": "Restrykcja setpointu", "6": "Disable wszystkich klawiszy",
                "7": "Bypass 1h", "8": "Disable klawisza sezonu" } }
  ]
}
```

- [ ] **Step 2: Napisz failing test ładowania profili**

`test/main/profiles/DeviceProfiles.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { loadBuiltinProfiles, getProfileById } from '../../../src/main/profiles/DeviceProfiles'

describe('DeviceProfiles', () => {
  it('loads and validates the EKWHCTRL1 builtin profile', () => {
    const profiles = loadBuiltinProfiles()
    const daikin = profiles.find((p) => p.id === 'daikin-ekwhctrl1')
    expect(daikin).toBeDefined()
    expect(daikin!.serial).toEqual({ baud: 9600, dataBits: 8, parity: 'none', stopBits: 1 })
    expect(daikin!.functions).toEqual(['FC03', 'FC06'])
  })

  it('includes the PRG flags register with mode enum', () => {
    const p = getProfileById('daikin-ekwhctrl1')!
    const prg = p.registers.find((r) => r.addr === 201)!
    expect(prg.kind).toBe('flags')
  })

  it('returns undefined for unknown id', () => {
    expect(getProfileById('nope')).toBeUndefined()
  })
})
```

- [ ] **Step 3: Uruchom test — ma nie przejść**

Run: `npm test -- test/main/profiles/DeviceProfiles.test.ts`
Expected: FAIL — brak `loadBuiltinProfiles`.

- [ ] **Step 4: Zaimplementuj DeviceProfiles**

`src/main/profiles/DeviceProfiles.ts`:

```ts
import { validateProfile, type DeviceProfile } from './schema'
import daikin from './builtin/daikin-ekwhctrl1.json'

const raw: unknown[] = [daikin]

export function loadBuiltinProfiles(): DeviceProfile[] {
  return raw.map(validateProfile)
}

export function getProfileById(id: string): DeviceProfile | undefined {
  return loadBuiltinProfiles().find((p) => p.id === id)
}
```

Dodaj do `tsconfig.json` w `compilerOptions` (jeśli brak): `"resolveJsonModule": true`.

- [ ] **Step 5: Uruchom test — ma przejść**

Run: `npm test -- test/main/profiles/DeviceProfiles.test.ts`
Expected: PASS. (Jeśli walidacja rzuci — to realny błąd w JSON: napraw wg komunikatu, np. duplikat adresu.)

- [ ] **Step 6: Commit**

```bash
git add src/main/profiles/ test/main/profiles/DeviceProfiles.test.ts tsconfig.json
git commit -m "feat: EKWHCTRL1 builtin profile and profile loader"
```

---

### Task 22: flags.ts — dekodowanie i kodowanie rejestrów flagowych

**Files:**
- Create: `src/main/modbus/flags.ts`
- Test: `test/main/modbus/flags.test.ts`

**Interfaces:**
- Consumes: `FlagBitDef`, `FlagsRegister` z `profiles/schema.ts`.
- Produces:
  - `interface DecodedBit { key: string; label: string; kind: 'bool'; value: boolean }`
  - `interface DecodedEnum { key: string; label: string; kind: 'enum'; value: string; raw: number }`
  - `type DecodedFlag = DecodedBit | DecodedEnum`
  - `function decodeFlags(raw: number, bits: Record<string, FlagBitDef>): DecodedFlag[]` — pojedynczy klucz `"4"` → bool z bitu 4; zakres `"0-2"` z `enum` → wartość enum z bitów 0..2.
  - `function setBit(current: number, key: string, on: boolean): number` — ustawia/zeruje pojedynczy bit.
  - `function setBitRange(current: number, key: string, value: number): number` — wpisuje wartość w zakres bitów (`"0-2"`).

- [ ] **Step 1: Napisz failing testy flags**

`test/main/modbus/flags.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { decodeFlags, setBit, setBitRange } from '../../../src/main/modbus/flags'

const prgBits = {
  '0-2': { enum: { '0': 'Auto', '1': 'Silent', '2': 'Night', '3': 'Max' } },
  '4': 'Lock',
  '7': 'Standby'
}

describe('decodeFlags', () => {
  it('decodes single bit as boolean', () => {
    // bit4 set, bit7 clear -> raw 0x10
    const flags = decodeFlags(0x10, prgBits)
    const lock = flags.find((f) => f.key === '4')!
    expect(lock).toMatchObject({ kind: 'bool', label: 'Lock', value: true })
    const stby = flags.find((f) => f.key === '7')!
    expect(stby).toMatchObject({ kind: 'bool', value: false })
  })

  it('decodes a bit range to an enum label', () => {
    // bits 0-2 = 3 -> "Max"
    const flags = decodeFlags(0x03, prgBits)
    const mode = flags.find((f) => f.key === '0-2')!
    expect(mode).toMatchObject({ kind: 'enum', value: 'Max', raw: 3 })
  })
})

describe('setBit / setBitRange', () => {
  it('sets and clears a single bit', () => {
    expect(setBit(0x00, '4', true)).toBe(0x10)
    expect(setBit(0x10, '4', false)).toBe(0x00)
  })

  it('writes a value into a bit range preserving other bits', () => {
    // start 0x90 (bit7+bit4), set range 0-2 to value 2 -> 0x92
    expect(setBitRange(0x90, '0-2', 2)).toBe(0x92)
  })
})
```

- [ ] **Step 2: Uruchom test — ma nie przejść**

Run: `npm test -- test/main/modbus/flags.test.ts`
Expected: FAIL — brak `flags`.

- [ ] **Step 3: Zaimplementuj flags.ts**

`src/main/modbus/flags.ts`:

```ts
import type { FlagBitDef } from '../profiles/schema'

export interface DecodedBit {
  key: string
  label: string
  kind: 'bool'
  value: boolean
}

export interface DecodedEnum {
  key: string
  label: string
  kind: 'enum'
  value: string
  raw: number
}

export type DecodedFlag = DecodedBit | DecodedEnum

function parseRange(key: string): [number, number] {
  const [lo, hi] = key.split('-').map(Number)
  return [lo, hi]
}

function extractRange(raw: number, lo: number, hi: number): number {
  const width = hi - lo + 1
  const mask = (1 << width) - 1
  return (raw >>> lo) & mask
}

export function decodeFlags(raw: number, bits: Record<string, FlagBitDef>): DecodedFlag[] {
  const out: DecodedFlag[] = []
  for (const [key, def] of Object.entries(bits)) {
    if (key.includes('-')) {
      const [lo, hi] = parseRange(key)
      const value = extractRange(raw, lo, hi)
      const enumMap = (def as { enum: Record<string, string> }).enum
      out.push({ key, label: enumMap[String(value)] ?? `#${value}`, kind: 'enum', value: enumMap[String(value)] ?? `#${value}`, raw: value })
    } else {
      const bit = Number(key)
      out.push({ key, label: def as string, kind: 'bool', value: ((raw >>> bit) & 1) === 1 })
    }
  }
  return out
}

export function setBit(current: number, key: string, on: boolean): number {
  const bit = Number(key)
  return on ? (current | (1 << bit)) & 0xffff : current & ~(1 << bit) & 0xffff
}

export function setBitRange(current: number, key: string, value: number): number {
  const [lo, hi] = parseRange(key)
  const width = hi - lo + 1
  const mask = ((1 << width) - 1) << lo
  return ((current & ~mask) | ((value << lo) & mask)) & 0xffff
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm test -- test/main/modbus/flags.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/modbus/flags.ts test/main/modbus/flags.test.ts
git commit -m "feat: flag register decode/encode (single bits and bit ranges)"
```

---

### Task 23: IPC profili + persystencja map rejestrów

**Files:**
- Modify: `src/main/ipc/channels.ts`, `src/main/ipc/handlers.ts`, `src/main/store/Store.ts`, `src/preload/index.ts`, `src/preload/api.d.ts`

**Interfaces:**
- Consumes: `loadBuiltinProfiles`/`getProfileById` (Task 21), `DeviceProfile`, `AppStore` (Task 11).
- Produces:
  - kanały `profilesList: 'profiles:list'`, `profileGet: 'profiles:get'`, `registerMapGet: 'regmap:get'`, `registerMapSet: 'regmap:set'`.
  - w `AppStore`: `getRegisterMap(profileId: string): Record<string, string>` (nadpisania etykiet), `setRegisterMap(profileId, map)`.
  - `api.profilesList()`, `api.profileGet(id)`, `api.registerMapGet(id)`, `api.registerMapSet(id, map)`.

- [ ] **Step 1: Dodaj metody map rejestrów do AppStore**

W `src/main/store/Store.ts` dodaj do klasy `AppStore`:

```ts
  getRegisterMap(profileId: string): Record<string, string> {
    const all = this.backend.get<Record<string, Record<string, string>>>('registerMaps') ?? {}
    return all[profileId] ?? {}
  }

  setRegisterMap(profileId: string, map: Record<string, string>): void {
    const all = this.backend.get<Record<string, Record<string, string>>>('registerMaps') ?? {}
    all[profileId] = map
    this.backend.set('registerMaps', all)
  }
```

- [ ] **Step 2: Dodaj kanały i handlery**

W `src/main/ipc/channels.ts` dodaj do `CH`:

```ts
  profilesList: 'profiles:list',
  profileGet: 'profiles:get',
  registerMapGet: 'regmap:get',
  registerMapSet: 'regmap:set',
```

W `src/main/ipc/handlers.ts` dodaj import i handlery:

```ts
import { loadBuiltinProfiles, getProfileById } from '../profiles/DeviceProfiles'
```

```ts
  ipcMain.handle(CH.profilesList, async () => loadBuiltinProfiles().map((p) => ({ id: p.id, name: p.name })))
  ipcMain.handle(CH.profileGet, async (_e, id: string) => getProfileById(id) ?? null)
  ipcMain.handle(CH.registerMapGet, async (_e, id: string) => store.getRegisterMap(id))
  ipcMain.handle(CH.registerMapSet, async (_e, id: string, map: Record<string, string>) => {
    store.setRegisterMap(id, map)
    return { ok: true }
  })
```

- [ ] **Step 3: Rozszerz preload**

W `src/preload/index.ts` dodaj do `api`:

```ts
  profilesList: () => ipcRenderer.invoke(CH.profilesList),
  profileGet: (id: string) => ipcRenderer.invoke(CH.profileGet, id),
  registerMapGet: (id: string) => ipcRenderer.invoke(CH.registerMapGet, id),
  registerMapSet: (id: string, map: unknown) => ipcRenderer.invoke(CH.registerMapSet, id, map),
```

W `src/preload/api.d.ts` dodaj import i pola:

```ts
import type { DeviceProfile } from '../main/profiles/schema'
```

```ts
  profilesList: () => Promise<Array<{ id: string; name: string }>>
  profileGet: (id: string) => Promise<DeviceProfile | null>
  registerMapGet: (id: string) => Promise<Record<string, string>>
  registerMapSet: (id: string, map: Record<string, string>) => Promise<{ ok: true }>
```

- [ ] **Step 4: Sprawdź kompilację i testy**

Run: `npx tsc --noEmit && npm test`
Expected: brak błędów; wszystkie testy PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: device profiles IPC and register-map persistence"
```

---

### Task 24: Widok „Test urządzenia" (auto-generowany panel)

**Files:**
- Create: `src/renderer/views/DeviceTestView.tsx`
- Modify: `src/renderer/App.tsx`

**Interfaces:**
- Consumes: `api.profilesList`, `api.profileGet`, `api.connect`, `api.read`, `api.write` (Task 18, 23); `decode`/`encode` (Task 2–3); `decodeFlags`/`setBit`/`setBitRange` (Task 22); `DeviceProfile`, `NumericRegister`, `FlagsRegister`.
- Produces: `DeviceTestView` — wybór profilu, przycisk „Zastosuj parametry łącza" (`api.connect` z `serial` profilu), auto-panel: wartości przeskalowane z jednostką, pola RW edytowalne z walidacją `min/max` (blokada wysyłki poza limitem), rejestry flagowe jako przełączniki/select, szybkie akcje (Standby ON/OFF na PRG bit7; „Ustaw setpoint" → reg 231).

- [ ] **Step 1: Napisz DeviceTestView**

`src/renderer/views/DeviceTestView.tsx`:

```tsx
import React, { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { decode, encode } from '../../main/modbus/DataCodec'
import { decodeFlags, setBit } from '../../main/modbus/flags'
import type { DeviceProfile, NumericRegister, FlagsRegister, RegisterDef } from '../../main/profiles/schema'
import type { SerialParams } from '../../main/modbus/types'

const parityMap = { none: 'none', even: 'even', odd: 'odd' } as const

export function DeviceTestView({ params }: { params: SerialParams }): React.JSX.Element {
  const [profiles, setProfiles] = useState<Array<{ id: string; name: string }>>([])
  const [profile, setProfile] = useState<DeviceProfile | null>(null)
  const [slave, setSlave] = useState(21)
  const [values, setValues] = useState<Record<number, number>>({}) // addr -> raw
  const [msg, setMsg] = useState('')

  useEffect(() => { api.profilesList().then(setProfiles) }, [])

  async function selectProfile(id: string): Promise<void> {
    setProfile(await api.profileGet(id))
  }

  async function applySerial(): Promise<void> {
    if (!profile) return
    const p: SerialParams = {
      path: params.path,
      baudRate: profile.serial.baud,
      dataBits: profile.serial.dataBits as 7 | 8,
      parity: parityMap[profile.serial.parity],
      stopBits: profile.serial.stopBits as 1 | 2,
      timeoutMs: params.timeoutMs
    }
    await api.connect(p)
    setMsg(`Zastosowano ${profile.serial.baud} ${profile.serial.parity} ${profile.serial.stopBits}`)
  }

  async function readAll(): Promise<void> {
    if (!profile) return
    const next: Record<number, number> = {}
    for (const r of profile.registers) {
      const res = await api.read(params.path, { slave, fc: 3, addr: r.addr, count: 1 })
      if (res.ok) next[r.addr] = res.value[0]
    }
    setValues(next)
    setMsg('Odczytano rejestry.')
  }

  async function writeNumeric(reg: NumericRegister, engValue: number): Promise<void> {
    if (reg.min !== undefined && engValue < reg.min) { setMsg(`Wartość < ${reg.min}`); return }
    if (reg.max !== undefined && engValue > reg.max) { setMsg(`Wartość > ${reg.max}`); return }
    const raw = encode(engValue, { type: reg.type, scale: reg.scale })
    const res = await api.write(params.path, { slave, fc: 6, addr: reg.addr, values: raw })
    setMsg(res.ok ? `Zapisano ${reg.mnem}` : `${res.code}: ${res.message}`)
    if (res.ok) setValues((v) => ({ ...v, [reg.addr]: raw[0] }))
  }

  async function toggleBit(reg: FlagsRegister, bitKey: string, on: boolean): Promise<void> {
    const current = values[reg.addr] ?? 0
    const nextRaw = setBit(current, bitKey, on)
    const res = await api.write(params.path, { slave, fc: 6, addr: reg.addr, values: [nextRaw] })
    setMsg(res.ok ? `Zapisano ${reg.mnem}` : `${res.code}: ${res.message}`)
    if (res.ok) setValues((v) => ({ ...v, [reg.addr]: nextRaw }))
  }

  return (
    <div>
      <h2>Test urządzenia</h2>
      <label>Profil:{' '}
        <select value={profile?.id ?? ''} onChange={(e) => selectProfile(e.target.value)}>
          <option value="">— wybierz —</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label>{' '}Slave:{' '}<input type="number" value={slave} onChange={(e) => setSlave(Number(e.target.value))} /></label>
      {profile && (
        <>
          <button onClick={applySerial} style={{ marginLeft: 8 }}>Zastosuj parametry łącza</button>
          <button onClick={readAll} style={{ marginLeft: 8 }}>Odczytaj wszystko</button>
          <p>{msg}</p>
          <table border={1} cellPadding={4}>
            <thead><tr><th>Mnem</th><th>Nazwa</th><th>Wartość</th><th>Akcja</th></tr></thead>
            <tbody>
              {profile.registers.map((r) => (
                <RegisterRow
                  key={r.addr}
                  reg={r}
                  raw={values[r.addr]}
                  onWriteNumeric={writeNumeric}
                  onToggleBit={toggleBit}
                />
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

function RegisterRow({
  reg, raw, onWriteNumeric, onToggleBit
}: {
  reg: RegisterDef
  raw: number | undefined
  onWriteNumeric: (r: NumericRegister, v: number) => void
  onToggleBit: (r: FlagsRegister, bitKey: string, on: boolean) => void
}): React.JSX.Element {
  const [edit, setEdit] = useState('')
  if (reg.kind === 'flags') {
    const decoded = raw === undefined ? [] : decodeFlags(raw, reg.bits)
    return (
      <tr>
        <td>{reg.mnem}</td><td>{reg.name}</td>
        <td>
          {decoded.map((f) => (
            <span key={f.key} style={{ marginRight: 8 }}>
              {f.kind === 'bool'
                ? <label><input type="checkbox" checked={f.value} disabled={reg.access === 'R'}
                    onChange={(e) => onToggleBit(reg, f.key, e.target.checked)} /> {f.label}</label>
                : <>{f.label}</>}
            </span>
          ))}
        </td>
        <td>{reg.access}</td>
      </tr>
    )
  }
  const eng = raw === undefined ? undefined : decode([raw], { type: reg.type, scale: reg.scale })
  return (
    <tr>
      <td>{reg.mnem}</td><td>{reg.name}</td>
      <td>{eng === undefined ? '—' : `${eng} ${reg.unit ?? ''}`}</td>
      <td>
        {reg.access === 'RW' && (
          <>
            <input type="number" step="0.1" value={edit} placeholder={String(reg.default ?? '')}
              onChange={(e) => setEdit(e.target.value)} style={{ width: 70 }} />
            <button onClick={() => onWriteNumeric(reg, Number(edit))} disabled={edit === ''}>Zapisz</button>
            {(reg.min !== undefined || reg.max !== undefined) && <small> [{reg.min}…{reg.max}]</small>}
          </>
        )}
      </td>
    </tr>
  )
}
```

- [ ] **Step 2: Podepnij w App.tsx**

W `src/renderer/App.tsx` dodaj import i render:

```tsx
import { DeviceTestView } from './views/DeviceTestView'
```

```tsx
      {tab === 'devicetest' && params && <DeviceTestView params={params} />}
```

- [ ] **Step 3: Weryfikacja manualna**

Run: `npm run dev`
Expected: wybór profilu „Daikin EKWHCTRL1" → „Zastosuj parametry łącza" ustawia `9600/none/1`. „Odczytaj wszystko" wypełnia panel przeskalowanymi wartościami (`T1 = 22.4 °C`). Pole RW z wartością poza `min/max` blokuje zapis z komunikatem; rejestr PRG pokazuje przełączniki Lock/Standby i tryb; zapis bitu Standby wysyła FC06.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: auto-generated Device Test panel from profiles"
```

---

## Phase 5 — Dashboard + polling

`PollingEngine`, live grid, układy dashboardów (zapis).

### Task 25: PollingEngine — cykliczny odczyt punktów

**Files:**
- Create: `src/main/modbus/PollingEngine.ts`
- Test: `test/main/modbus/PollingEngine.test.ts`

**Interfaces:**
- Consumes: `Result`, `NumericType`, `WordOrder` (z `types.ts`/`DataCodec`); `decode` (Task 2–3).
- Produces:
  - `interface DashboardPoint { id: string; port: string; slave: number; fc: 1 | 2 | 3 | 4; addr: number; type: NumericType; scale?: number; wordOrder?: WordOrder; intervalMs: number }`
  - `interface PollUpdate { pointId: string; value: number | null; ts: number; quality: 'good' | 'bad' }`
  - `interface PollingDeps { readPoint: (p: DashboardPoint) => Promise<Result<number[]>>; emit: (u: PollUpdate) => void; now: () => number }`
  - `class PollingEngine` z `(deps: PollingDeps)`, metodami `start(points: DashboardPoint[]): void`, `stop(): void`. Każdy punkt pollowany co `intervalMs`; `readPoint` z priorytetem `poll` (wstrzykiwany przez zależność); wynik dekodowany → `PollUpdate` z `quality: 'good'|'bad'`.

- [ ] **Step 1: Napisz failing testy PollingEngine (fake timers)**

`test/main/modbus/PollingEngine.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { PollingEngine } from '../../../src/main/modbus/PollingEngine'
import type { DashboardPoint, PollUpdate } from '../../../src/main/modbus/PollingEngine'
import { ok, err } from '../../../src/main/modbus/types'

const point = (over: Partial<DashboardPoint> = {}): DashboardPoint => ({
  id: 'p1', port: '/dev/x', slave: 21, fc: 3, addr: 0, type: 'uint16', scale: 0.1, intervalMs: 100, ...over
})

describe('PollingEngine', () => {
  it('emits decoded good updates on interval', async () => {
    vi.useFakeTimers()
    try {
      const updates: PollUpdate[] = []
      const engine = new PollingEngine({
        readPoint: async () => ok([224]),
        emit: (u) => updates.push(u),
        now: () => 1000
      })
      engine.start([point()])
      await vi.advanceTimersByTimeAsync(100)
      engine.stop()
      expect(updates[0]).toEqual({ pointId: 'p1', value: 22.4, ts: 1000, quality: 'good' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('emits bad quality with null value on read error', async () => {
    vi.useFakeTimers()
    try {
      const updates: PollUpdate[] = []
      const engine = new PollingEngine({
        readPoint: async () => err('TIMEOUT', 'no response'),
        emit: (u) => updates.push(u),
        now: () => 2000
      })
      engine.start([point()])
      await vi.advanceTimersByTimeAsync(100)
      engine.stop()
      expect(updates[0]).toEqual({ pointId: 'p1', value: null, ts: 2000, quality: 'bad' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops emitting after stop()', async () => {
    vi.useFakeTimers()
    try {
      const updates: PollUpdate[] = []
      const engine = new PollingEngine({
        readPoint: async () => ok([10]),
        emit: (u) => updates.push(u),
        now: () => 0
      })
      engine.start([point({ scale: 1 })])
      await vi.advanceTimersByTimeAsync(100)
      const countAfterFirst = updates.length
      engine.stop()
      await vi.advanceTimersByTimeAsync(300)
      expect(updates.length).toBe(countAfterFirst)
    } finally {
      vi.useRealTimers()
    }
  })
})
```

- [ ] **Step 2: Uruchom test — ma nie przejść**

Run: `npm test -- test/main/modbus/PollingEngine.test.ts`
Expected: FAIL — brak `PollingEngine`.

- [ ] **Step 3: Zaimplementuj PollingEngine**

`src/main/modbus/PollingEngine.ts`:

```ts
import { decode, type NumericType, type WordOrder } from './DataCodec'
import type { Result } from './types'

export interface DashboardPoint {
  id: string
  port: string
  slave: number
  fc: 1 | 2 | 3 | 4
  addr: number
  type: NumericType
  scale?: number
  wordOrder?: WordOrder
  intervalMs: number
}

export interface PollUpdate {
  pointId: string
  value: number | null
  ts: number
  quality: 'good' | 'bad'
}

export interface PollingDeps {
  readPoint: (p: DashboardPoint) => Promise<Result<number[]>>
  emit: (u: PollUpdate) => void
  now: () => number
}

export class PollingEngine {
  private timers: ReturnType<typeof setInterval>[] = []

  constructor(private readonly deps: PollingDeps) {}

  start(points: DashboardPoint[]): void {
    this.stop()
    for (const p of points) {
      const timer = setInterval(() => void this.pollOnce(p), p.intervalMs)
      this.timers.push(timer)
    }
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t)
    this.timers = []
  }

  private async pollOnce(p: DashboardPoint): Promise<void> {
    const res = await this.deps.readPoint(p)
    if (res.ok) {
      const value = decode(res.value, { type: p.type, scale: p.scale, wordOrder: p.wordOrder })
      this.deps.emit({ pointId: p.id, value, ts: this.deps.now(), quality: 'good' })
    } else {
      this.deps.emit({ pointId: p.id, value: null, ts: this.deps.now(), quality: 'bad' })
    }
  }
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm test -- test/main/modbus/PollingEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/modbus/PollingEngine.ts test/main/modbus/PollingEngine.test.ts
git commit -m "feat: PollingEngine cyclic reads with good/bad quality updates"
```

---

### Task 26: IPC pollingu (strumień poll:update) + zapis dashboardów

**Files:**
- Modify: `src/main/ipc/channels.ts`, `src/main/ipc/handlers.ts`, `src/preload/index.ts`, `src/preload/api.d.ts`, `src/main/store/Store.ts`

**Interfaces:**
- Consumes: `PollingEngine`, `DashboardPoint`, `PollUpdate` (Task 25); `BusRegistry` (Task 14); `busRead` (Task 17); `AppStore.getDashboards/saveDashboard` (Task 11).
- Produces:
  - kanały `pollStart: 'poll:start'`, `pollStop: 'poll:stop'`, zdarzenie `pollUpdate: 'poll:update'`, `dashboardsGet: 'dashboards:get'`, `dashboardSave: 'dashboards:save'`.
  - `DashboardLayout.points` dociąga do typu `DashboardPoint[]` w `Store.ts`.
  - `api.pollStart(points)`, `api.pollStop()`, `api.onPollUpdate(cb): () => void` (unsubskrypcja), `api.dashboardsGet()`, `api.dashboardSave(layout)`.

- [ ] **Step 1: Dociągnij typ punktów w Store**

W `src/main/store/Store.ts` zamień `points: unknown[]` na import i typ:

```ts
import type { DashboardPoint } from '../modbus/PollingEngine'
```

```ts
export interface DashboardLayout {
  name: string
  points: DashboardPoint[]
}
```

- [ ] **Step 2: Dodaj kanały**

W `src/main/ipc/channels.ts` dodaj do `CH`:

```ts
  pollStart: 'poll:start',
  pollStop: 'poll:stop',
  pollUpdate: 'poll:update',
  dashboardsGet: 'dashboards:get',
  dashboardSave: 'dashboards:save',
```

- [ ] **Step 3: Dodaj handlery pollingu i dashboardów**

W `src/main/ipc/handlers.ts` dodaj importy:

```ts
import { PollingEngine, type DashboardPoint } from '../modbus/PollingEngine'
import type { DashboardLayout } from '../store/Store'
import { BrowserWindow } from 'electron'
```

Wewnątrz `registerIpcHandlers` (po utworzeniu `registry`/`store`) dodaj silnik pollingu i handlery:

```ts
  const polling = new PollingEngine({
    readPoint: async (p: DashboardPoint) => {
      const bus = registry.get(p.port)
      if (!bus) return { ok: false, code: 'NOT_CONNECTED', message: `Port ${p.port} not connected` }
      return busRead(bus, { slave: p.slave, fc: p.fc, addr: p.addr, count: 1 }, 'poll')
    },
    emit: (u) => {
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send(CH.pollUpdate, u)
    },
    now: () => Date.now()
  })

  ipcMain.handle(CH.pollStart, async (_e, points: DashboardPoint[]) => {
    polling.start(points)
    return { ok: true }
  })
  ipcMain.handle(CH.pollStop, async () => {
    polling.stop()
    return { ok: true }
  })
  ipcMain.handle(CH.dashboardsGet, async () => store.getDashboards())
  ipcMain.handle(CH.dashboardSave, async (_e, layout: DashboardLayout) => {
    store.saveDashboard(layout)
    return { ok: true }
  })
```

- [ ] **Step 4: Rozszerz preload (invoke + subskrypcja zdarzeń)**

W `src/preload/index.ts` dodaj do `api`:

```ts
  pollStart: (points: unknown) => ipcRenderer.invoke(CH.pollStart, points),
  pollStop: () => ipcRenderer.invoke(CH.pollStop),
  onPollUpdate: (cb: (u: unknown) => void) => {
    const listener = (_e: unknown, u: unknown): void => cb(u)
    ipcRenderer.on(CH.pollUpdate, listener)
    return () => ipcRenderer.removeListener(CH.pollUpdate, listener)
  },
  dashboardsGet: () => ipcRenderer.invoke(CH.dashboardsGet),
  dashboardSave: (layout: unknown) => ipcRenderer.invoke(CH.dashboardSave, layout),
```

W `src/preload/api.d.ts` dodaj importy i pola:

```ts
import type { DashboardPoint, PollUpdate } from '../main/modbus/PollingEngine'
import type { DashboardLayout } from '../main/store/Store'
```

```ts
  pollStart: (points: DashboardPoint[]) => Promise<{ ok: true }>
  pollStop: () => Promise<{ ok: true }>
  onPollUpdate: (cb: (u: PollUpdate) => void) => () => void
  dashboardsGet: () => Promise<DashboardLayout[]>
  dashboardSave: (layout: DashboardLayout) => Promise<{ ok: true }>
```

- [ ] **Step 5: Sprawdź kompilację i testy**

Run: `npx tsc --noEmit && npm test`
Expected: brak błędów; wszystkie testy PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: polling IPC stream and dashboard layout persistence"
```

---

### Task 27: Widok Dashboard (live grid) + zapis układu

**Files:**
- Create: `src/renderer/views/DashboardView.tsx`
- Modify: `src/renderer/App.tsx`

**Interfaces:**
- Consumes: `api.pollStart`, `api.pollStop`, `api.onPollUpdate`, `api.dashboardsGet`, `api.dashboardSave` (Task 26); `DashboardPoint`, `PollUpdate`.
- Produces: `DashboardView` — dodawanie punktów (slave/addr/typ/skala/interwał), start/stop pollingu, live grid odświeżany zdarzeniami `poll:update` (wartość, znacznik czasu, quality good/bad), zapis/odczyt układu.

- [ ] **Step 1: Napisz DashboardView**

`src/renderer/views/DashboardView.tsx`:

```tsx
import React, { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { DashboardPoint, PollUpdate } from '../../main/modbus/PollingEngine'
import type { NumericType } from '../../main/modbus/DataCodec'
import type { SerialParams } from '../../main/modbus/types'

const TYPES: NumericType[] = ['uint16', 'int16', 'uint32', 'int32', 'float32']

export function DashboardView({ params }: { params: SerialParams }): React.JSX.Element {
  const [points, setPoints] = useState<DashboardPoint[]>([])
  const [live, setLive] = useState<Record<string, PollUpdate>>({})
  const [running, setRunning] = useState(false)
  const [slave, setSlave] = useState(21)
  const [addr, setAddr] = useState(0)
  const [type, setType] = useState<NumericType>('uint16')
  const [scale, setScale] = useState(0.1)
  const [intervalMs, setIntervalMs] = useState(1000)
  const [layoutName, setLayoutName] = useState('domyślny')

  useEffect(() => {
    const unsub = api.onPollUpdate((u) => setLive((m) => ({ ...m, [u.pointId]: u })))
    return unsub
  }, [])

  function addPoint(): void {
    const id = `${slave}:${addr}:${Date.now()}`
    setPoints((ps) => [...ps, { id, port: params.path, slave, fc: 3, addr, type, scale, intervalMs }])
  }

  async function start(): Promise<void> {
    await api.pollStart(points)
    setRunning(true)
  }

  async function stop(): Promise<void> {
    await api.pollStop()
    setRunning(false)
  }

  async function saveLayout(): Promise<void> {
    await api.dashboardSave({ name: layoutName, points })
  }

  async function loadLayout(): Promise<void> {
    const layouts = await api.dashboardsGet()
    const found = layouts.find((l) => l.name === layoutName)
    if (found) setPoints(found.points)
  }

  return (
    <div>
      <h2>Dashboard</h2>
      <div>
        <label>Slave:{' '}<input type="number" value={slave} onChange={(e) => setSlave(Number(e.target.value))} /></label>
        <label>{' '}Addr:{' '}<input type="number" value={addr} onChange={(e) => setAddr(Number(e.target.value))} /></label>
        <label>{' '}Typ:{' '}
          <select value={type} onChange={(e) => setType(e.target.value as NumericType)}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>{' '}Skala:{' '}<input type="number" step="0.1" value={scale} onChange={(e) => setScale(Number(e.target.value))} /></label>
        <label>{' '}Interwał (ms):{' '}<input type="number" value={intervalMs} onChange={(e) => setIntervalMs(Number(e.target.value))} /></label>
        <button onClick={addPoint} style={{ marginLeft: 8 }}>Dodaj punkt</button>
      </div>
      <div style={{ marginTop: 8 }}>
        <button onClick={start} disabled={running || points.length === 0}>Start</button>{' '}
        <button onClick={stop} disabled={!running}>Stop</button>{' '}
        <input value={layoutName} onChange={(e) => setLayoutName(e.target.value)} />
        <button onClick={saveLayout}>Zapisz układ</button>{' '}
        <button onClick={loadLayout}>Wczytaj układ</button>
      </div>
      <table border={1} cellPadding={4} style={{ marginTop: 8 }}>
        <thead><tr><th>Slave</th><th>Addr</th><th>Typ</th><th>Wartość</th><th>Quality</th><th>Czas</th></tr></thead>
        <tbody>
          {points.map((p) => {
            const u = live[p.id]
            return (
              <tr key={p.id} style={{ background: u?.quality === 'bad' ? '#fdd' : undefined }}>
                <td>{p.slave}</td><td>{p.addr}</td><td>{p.type}</td>
                <td>{u ? (u.value ?? '—') : '…'}</td>
                <td>{u?.quality ?? '—'}</td>
                <td>{u ? new Date(u.ts).toLocaleTimeString() : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Podepnij w App.tsx**

W `src/renderer/App.tsx` dodaj import i render:

```tsx
import { DashboardView } from './views/DashboardView'
```

```tsx
      {tab === 'dashboard' && params && <DashboardView params={params} />}
```

- [ ] **Step 3: Weryfikacja manualna**

Run: `npm run dev`
Expected: dodanie punktu (slave 21, addr 0, uint16, skala 0.1, 1000 ms), Start → grid odświeża się na żywo z wartościami z Daikina; przy braku odpowiedzi wiersz czerwony (quality `bad`). „Zapisz układ" i po restarcie „Wczytaj układ" przywraca punkty. Polling nie koliduje z ręcznym odczytem w Read/Write (akcje użytkownika wyprzedzają).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: Dashboard live grid with polling and layout persistence"
```

---

### Task 28: Obsługa błędów — reconnect portu, licznik jakości, widok Ustawienia

**Files:**
- Modify: `src/main/modbus/ModbusSerialTransport.ts`, `src/main/ipc/channels.ts`, `src/main/ipc/handlers.ts`, `src/preload/index.ts`, `src/preload/api.d.ts`, `src/renderer/App.tsx`
- Create: `src/renderer/views/SettingsView.tsx`

**Interfaces:**
- Consumes: `ModbusSerialTransport` (Task 9), `BusRegistry` (Task 14), zdarzenia IPC (Task 10).
- Produces:
  - zdarzenie `busStatus: 'bus:status'` z payloadem `{ port: string; state: 'connected' | 'disconnected'; message?: string }`.
  - `ModbusSerialTransport` emituje callback `onClose(cb)` przy zdarzeniu `close`/`error` portu.
  - `api.onBusStatus(cb): () => void`.
  - `SettingsView` z opcją `autoReconnect` (przechowywaną w `localStorage`) i banerem stanu magistrali w `App.tsx`.

- [ ] **Step 1: Dodaj callback close w transporcie**

W `src/main/modbus/ModbusSerialTransport.ts` dodaj pole i metodę, i podłącz do portu po connect:

```ts
  private closeCb: (() => void) | null = null

  onClose(cb: () => void): void {
    this.closeCb = cb
  }
```

W `connect`, po `this.open = true`, dodaj nasłuch na zdarzenia portu (obiekt portu z modbus-serial):

```ts
    const port = (this.client as unknown as { _port?: { on?: (ev: string, fn: () => void) => void } })._port
    port?.on?.('close', () => { this.open = false; this.closeCb?.() })
    port?.on?.('error', () => { this.open = false; this.closeCb?.() })
```

- [ ] **Step 2: Emituj status magistrali z registry**

W `src/main/ipc/channels.ts` dodaj do `CH`: `busStatus: 'bus:status',`.

W `src/main/ipc/handlers.ts` w handlerze `CH.connect` (Task 14) — po `registry.open(params)` podłącz status. Zmień `BusRegistry.open`, aby przyjmował callback statusu; najprościej: w handlerze pobierz transport przez registry i zarejestruj emisję. Zmodyfikuj `BusRegistry.open` w `src/main/modbus/BusRegistry.ts` by przyjmował opcjonalny `onClose`:

```ts
  async open(params: SerialParams, onClose?: () => void): Promise<ModbusBus> {
    await this.close(params.path)
    const transport = new ModbusSerialTransport()
    if (onClose) transport.onClose(onClose)
    await transport.connect(params)
    const bus = new ModbusBus(transport, { interFrameDelayMs: 20, defaultTimeoutMs: params.timeoutMs })
    this.buses.set(params.path, bus)
    return bus
  }
```

W handlerze `CH.connect`:

```ts
  ipcMain.handle(CH.connect, async (_e, params: SerialParams) => {
    await registry.open(params, () => {
      for (const win of BrowserWindow.getAllWindows())
        win.webContents.send(CH.busStatus, { port: params.path, state: 'disconnected', message: 'Port zamknięty' })
    })
    for (const win of BrowserWindow.getAllWindows())
      win.webContents.send(CH.busStatus, { port: params.path, state: 'connected' })
    return { ok: true }
  })
```

- [ ] **Step 3: Wystaw onBusStatus w preload**

W `src/preload/index.ts` dodaj do `api`:

```ts
  onBusStatus: (cb: (s: unknown) => void) => {
    const listener = (_e: unknown, s: unknown): void => cb(s)
    ipcRenderer.on(CH.busStatus, listener)
    return () => ipcRenderer.removeListener(CH.busStatus, listener)
  },
```

W `src/preload/api.d.ts` dodaj pole:

```ts
  onBusStatus: (cb: (s: { port: string; state: 'connected' | 'disconnected'; message?: string }) => void) => () => void
```

- [ ] **Step 4: Baner stanu + SettingsView**

`src/renderer/views/SettingsView.tsx`:

```tsx
import React, { useState } from 'react'

export function SettingsView(): React.JSX.Element {
  const [autoReconnect, setAutoReconnect] = useState(localStorage.getItem('autoReconnect') === 'true')

  function toggle(v: boolean): void {
    setAutoReconnect(v)
    localStorage.setItem('autoReconnect', String(v))
  }

  return (
    <div>
      <h2>Ustawienia</h2>
      <label>
        <input type="checkbox" checked={autoReconnect} onChange={(e) => toggle(e.target.checked)} />
        {' '}Automatyczny reconnect po odłączeniu portu
      </label>
    </div>
  )
}
```

W `src/renderer/App.tsx` dodaj import, stan bannera i render:

```tsx
import { SettingsView } from './views/SettingsView'
```

Wewnątrz `App`, dodaj stan i efekt (po istniejących `useState`):

```tsx
  const [busBanner, setBusBanner] = React.useState<string | null>(null)
  React.useEffect(() => {
    const unsub = window.api.onBusStatus((s) => {
      setBusBanner(s.state === 'disconnected' ? `Rozłączono: ${s.port} ${s.message ?? ''}` : null)
    })
    return unsub
  }, [])
```

Nad `<nav>` dodaj baner:

```tsx
      {busBanner && <div style={{ background: '#fdd', padding: 8, marginBottom: 8 }}>{busBanner}</div>}
```

Dodaj render zakładki Ustawienia:

```tsx
      {tab === 'settings' && <SettingsView />}
```

- [ ] **Step 5: Sprawdź kompilację i testy**

Run: `npx tsc --noEmit && npm test`
Expected: brak błędów; wszystkie testy PASS.

- [ ] **Step 6: Weryfikacja manualna**

Run: `npm run dev`
Expected: po połączeniu i fizycznym odłączeniu adaptera USB pojawia się czerwony baner „Rozłączono: …" (apka nie pada). Zakładka „Ustawienia" utrzymuje przełącznik auto-reconnect między restartami (localStorage).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: bus disconnect banner, reconnect setting, settings view"
```

---

## Weryfikacja końcowa (po Fazie 5)

- [ ] **Pełny zestaw testów:** `npm test` — wszystkie pliki PASS.
- [ ] **Typy:** `npx tsc --noEmit` — bez błędów.
- [ ] **Build produkcyjny:** `npm run build` — kończy się sukcesem.
- [ ] **E2E na sprzęcie:** realny Daikin EKWHCTRL1 przez adapter USB-serial — skan głęboki wykrywa `9600/none/1`, panel „Test urządzenia" pokazuje `T1` przeskalowane, zapis setpointu (reg 231) potwierdzony odczytem.

---

## Uwagi do wykonania (self-review)

**Pokrycie spec:**
- §3.1 model współbieżności → Task 5–7 (kolejka, priorytet, delay, timeout).
- §3.2 moduły main → SerialPortService (T8), ModbusBus (T5–7), Scanner (T12–13), PollingEngine (T25), DataCodec (T2–3), DeviceProfiles (T20–21), Store (T11), ipc (T10,14,18,23,26).
- §3.3 widoki → Połączenie (T15), Skaner (T16), Read/Write (T19), Test urządzenia (T24), Dashboard (T27), Ustawienia (T28).
- §4 dwa tryby skanu → T12 (szybki), T13 (głęboki + abort).
- §5 profile + panel → T20–24; §5.4 pełny profil EKWHCTRL1 → T21; flagi → T22.
- §6 przepływ danych → T17–18 (read/write), T25–26 (polling z priorytetem `poll`).
- §7 obsługa błędów → typowany `Result`/`classifyError` (T17), timeout (T7), reconnect/baner (T28), walidacja limitów w UI (T24).
- §8 testowanie → jednostkowe: DataCodec, Scanner, ModbusBus, DeviceProfiles/schema, flags, Store, PollingEngine; E2E → weryfikacja końcowa.
- §9 persystencja → Store: profile połączeń (T11), mapy rejestrów (T23), dashboardy (T26), wyniki skanu (T14).
- §10 fazowanie → Fazy 1–5 = sekcje planu.

**Uwaga wykonawcza — spójność nazw:** `SP` (setpoint rzeczywisty, addr 8, R) i setpoint absolutny (addr 231, RW) w spec mają ten sam mnemonik `SP`; w profilu JSON addr 231 dostał mnemonik `SP_ABS`, aby uniknąć kolizji — to celowa różnica względem spec §5.4, nie błąd.

**Uwaga wykonawcza — `deep_scan.py`:** istniejący skrypt (`deep_scan.py` w repo) jest referencją logiki skanu głębokiego (T13). Nie jest importowany — przepisany na TypeScript.

