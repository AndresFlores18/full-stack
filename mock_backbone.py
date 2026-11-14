#!/usr/bin/env python3
"""
Mock Backbone Server - NASA Space Apps: Martian Map
Transmite paquetes WebSocket cumpliendo con el Contrato JSON Oficial v1.0.
Para pruebas inmediatas sin dependencias externas (solo Python 3 standard library).
"""

import asyncio
import base64
import hashlib
import json
import math
import random
import struct
import sys
import time

PORT = 8765
GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

connected_clients = set()

def create_ws_frame(message: str) -> bytes:
    payload = message.encode('utf-8')
    length = len(payload)
    if length <= 125:
        header = struct.pack('!BB', 0x81, length)
    elif length <= 65535:
        header = struct.pack('!BBH', 0x81, 126, length)
    else:
        header = struct.pack('!BBQ', 0x81, 127, length)
    return header + payload

async def handle_client(reader, writer):
    request = b""
    while True:
        line = await reader.readline()
        request += line
        if line == b"\r\n" or not line:
            break
    
    headers = {}
    for line in request.decode('latin1', errors='ignore').split('\r\n')[1:]:
        if ": " in line:
            k, v = line.split(": ", 1)
            headers[k.lower()] = v.strip()

    key = headers.get("sec-websocket-key")
    if not key:
        writer.close()
        await writer.wait_closed()
        return

    accept_val = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
    response = (
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Accept: {accept_val}\r\n\r\n"
    )
    writer.write(response.encode('latin1'))
    await writer.drain()

    addr = writer.get_extra_info('peername')
    print(f"🛰️  [Backbone Mock] Cliente conectado: {addr}")
    connected_clients.add(writer)

    try:
        while True:
            header = await reader.read(2)
            if not header or len(header) < 2:
                break
            b1, b2 = header[0], header[1]
            opcode = b1 & 0x0F
            if opcode == 0x08: # Close
                break
            payload_len = b2 & 0x7F
            if payload_len == 126:
                ext = await reader.read(2)
                payload_len = struct.unpack("!H", ext)[0]
            elif payload_len == 127:
                ext = await reader.read(8)
                payload_len = struct.unpack("!Q", ext)[0]
            
            mask = await reader.read(4)
            data = await reader.read(payload_len)
            if opcode == 0x09: # Ping -> Pong
                writer.write(struct.pack('!BB', 0x8A, 0))
                await writer.drain()
    except Exception:
        pass
    finally:
        connected_clients.discard(writer)
        print(f"⚠️  [Backbone Mock] Cliente desconectado: {addr}")
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass

async def telemetry_broadcaster():
    step = 0
    while True:
        await asyncio.sleep(1.0)
        step += 1
        now_sec = int(time.time())
        t = step * 0.1

        # 1. Satélite (ESP32 #1)
        sat_packet = {
            "node_id": "satellite_esp32",
            "timestamp": now_sec,
            "payload": {
                "satellite_esp32": {
                    "orbit_pos": [
                        round(12.5 + 2.0 * math.cos(t * 0.05), 2),
                        round(45.0 + 2.0 * math.sin(t * 0.05), 2),
                        round(250.0 + 5.0 * math.sin(t * 0.1), 1)
                    ],
                    "signal_dbm": int(-62 + random.randint(-3, 3)),
                    "latency_ms": int(18 + random.randint(-4, 6))
                }
            }
        }

        # 2. Estación Base (ESP32 #2)
        station_packet = {
            "node_id": "station_esp32",
            "timestamp": now_sec,
            "payload": {
                "station_esp32": {
                    "habitat_o2": round(98.4 - (step * 0.01) % 5, 1),
                    "habitat_power": round(87.0 - (step * 0.02) % 10, 1),
                    "mesh_nodes_active": 4
                }
            }
        }

        # 3. Traje EVA Astronauta Alan (ESP32 #3)
        eva_packet = {
            "node_id": "eva_esp32",
            "timestamp": now_sec,
            "payload": {
                "eva_esp32": {
                    "suit_o2": round(max(65.0, 94.2 - (step * 0.08) % 35), 1),
                    "heart_rate": int(78 + 12 * math.sin(t * 0.3) + random.uniform(-2, 2)),
                    "radiation_msv": round(0.14 + (0.32 if (step % 30 > 22) else 0.02 * math.sin(t)), 2),
                    "battery": round(max(12.0, 89.5 - (step * 0.05) % 80), 1),
                    "imu": {
                        "yaw": round(12.4 + 25 * math.sin(t * 0.2), 1),
                        "pitch": round(-1.2 + 8 * math.cos(t * 0.25), 1),
                        "roll": round(0.5 + 4 * math.sin(t * 0.3), 1),
                        "accel_mag": round(3.72 + 0.5 * math.sin(t), 2)
                    }
                }
            }
        }

        # 4. Dron Real CV (Raspberry Pi 4 + RealSense D415)
        # El dron NO se mueve en X/Y; permanece en su plataforma fija [1.8, 5.4] y solo sube en Z, escanea y baja.
        is_safe = False if (step % 20 > 14) else True
        drone_z = round(max(0.1, 1.3 + 1.3 * math.sin(t * 0.35)), 2)
        drone_packet = {
            "node_id": "drone_cv",
            "timestamp": now_sec,
            "payload": {
                "drone_cv": {
                    "drone_pos": [
                        1.8,
                        5.4,
                        drone_z
                    ],
                    "safe_path": is_safe,
                    "max_slope_deg": round(12.5 + (10.0 if not is_safe else 2.5 * math.sin(t * 0.3)), 1),
                    "imu": {
                        "yaw": round(0.4 + 2 * math.sin(t * 0.1), 1),
                        "pitch": round(1.1 + 1.5 * math.cos(t * 0.2), 1),
                        "roll": round(-0.2 + 1.0 * math.sin(t * 0.3), 1)
                    },
                    "obstacles": [
                        {"x": 1.7, "y": 2.0, "radius": 0.30, "severity": "high" if not is_safe else "medium"},
                        {"x": 2.3, "y": 1.4, "radius": 0.25, "severity": "low"}
                    ]
                }
            }
        }

        if connected_clients:
            for packet in [sat_packet, station_packet, eva_packet, drone_packet]:
                msg = json.dumps(packet)
                frame = create_ws_frame(msg)
                for client in list(connected_clients):
                    try:
                        client.write(frame)
                    except Exception:
                        connected_clients.discard(client)

async def main():
    server = await asyncio.start_server(handle_client, '0.0.0.0', PORT)
    print("=================================================================")
    print(f"🚀 NASA Space Apps - MOCK BACKBONE (Contrato JSON v1.0)")
    print(f"📡 WebSocket Server escuchando en: ws://0.0.0.0:{PORT}")
    print(f"   Transmitiendo: satellite_esp32, station_esp32, eva_esp32, drone_cv")
    print("=================================================================")
    asyncio.create_task(telemetry_broadcaster())
    async with server:
        await server.serve_forever()

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServidor detenido.")
