#!/usr/bin/env python3
"""
Test komunikacji Modbus RTU z klimakonwektorami Daikin (EKWHCTRL1)
Slave ID: 21, 22
Port: /dev/cu.usbserial-B000Z3G6
"""

from pymodbus.client import ModbusSerialClient

PORT = "/dev/cu.usbserial-B000Z3G6"
SLAVE_IDS = [21, 22]

# EKWHCTRL1 - typowe parametry Modbus RTU dla Daikin
client = ModbusSerialClient(
    port=PORT,
    baudrate=9600,
    bytesize=8,
    parity="E",  # Even parity - standard dla Daikin
    stopbits=1,
    timeout=2,
)

print(f"Laczenie z portem {PORT}...")
if not client.connect():
    print("BLAD: Nie mozna otworzyc portu serialowego!")
    exit(1)

print("Port otwarty.\n")

for slave_id in SLAVE_IDS:
    print(f"--- Slave ID {slave_id} ---")
    try:
        # Odczyt holding registers od adresu 0, 10 rejestrow
        result = client.read_holding_registers(address=0, count=10, device_id=slave_id)
        if result.isError():
            print(f"  Blad odpowiedzi: {result}")
        else:
            print(f"  Holding registers [0-9]: {result.registers}")

        # Odczyt input registers od adresu 0, 10 rejestrow
        result = client.read_input_registers(address=0, count=10, device_id=slave_id)
        if result.isError():
            print(f"  Blad odpowiedzi (input): {result}")
        else:
            print(f"  Input registers  [0-9]: {result.registers}")

    except Exception as e:
        print(f"  BRAK ODPOWIEDZI / BLAD: {e}")
    print()

client.close()
print("Zakonczono.")
