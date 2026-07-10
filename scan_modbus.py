#!/usr/bin/env python3
"""
Skanowanie parametrow Modbus RTU - probuje rozne kombinacje baudrate/parity
dla klimakonwektorow Daikin EKWHCTRL1
"""

from pymodbus.client import ModbusSerialClient

PORT = "/dev/cu.usbserial-B000Z3G6"
SLAVE_IDS = [21, 22]

CONFIGS = [
    {"baudrate": 9600,  "parity": "N", "stopbits": 2},
    {"baudrate": 9600,  "parity": "E", "stopbits": 1},
    {"baudrate": 9600,  "parity": "N", "stopbits": 1},
    {"baudrate": 19200, "parity": "E", "stopbits": 1},
    {"baudrate": 19200, "parity": "N", "stopbits": 2},
    {"baudrate": 19200, "parity": "N", "stopbits": 1},
]

for cfg in CONFIGS:
    label = f"baud={cfg['baudrate']} parity={cfg['parity']} stop={cfg['stopbits']}"
    print(f"\n=== Probuje: {label} ===")

    client = ModbusSerialClient(
        port=PORT,
        baudrate=cfg["baudrate"],
        bytesize=8,
        parity=cfg["parity"],
        stopbits=cfg["stopbits"],
        timeout=1,
        retries=1,
    )

    if not client.connect():
        print("  Nie mozna otworzyc portu")
        continue

    for slave_id in SLAVE_IDS:
        try:
            result = client.read_holding_registers(address=0, count=1, device_id=slave_id)
            if not result.isError():
                print(f"  >>> ODPOWIEDZ od slave {slave_id}: register[0] = {result.registers[0]}")
            else:
                print(f"  Slave {slave_id}: brak odpowiedzi")
        except Exception as e:
            print(f"  Slave {slave_id}: {e}")

    client.close()

print("\nSkanowanie zakonczone.")
