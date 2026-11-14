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
import os
import random
import struct
import sys
import time
import zipfile

PORT = 8765
GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

connected_clients = set()


def load_real_d415_frames():
    """
    Carga los frames reales de la carpeta data/ (Intel RealSense D415 - sturdy-couscous):
    1) Prioriza data/sample_10s_d415.zip -> sample_10s_d415/frames.jsonl (22 frames con imágenes base64)
    2) Si no, usa data/latest_expo_payload.json
    3) Si no, usa data/latest_drone_cv.json
    """
    base_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(base_dir, "data")
    frames = []

    zip_path = os.path.join(data_dir, "sample_10s_d415.zip")
    if os.path.exists(zip_path):
        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                raw_lines = zf.read("sample_10s_d415/frames.jsonl").decode("utf-8").splitlines()
                for line in raw_lines:
                    line = line.strip()
                    if line:
                        frames.append(json.loads(line))
            print(f"📦 [Dataset D415] Cargados {len(frames)} frames reales desde data/sample_10s_d415.zip")
        except Exception as e:
            print(f"⚠️  Error leyendo sample_10s_d415.zip: {e}")

    if not frames:
        for fallback_name in ["latest_expo_payload.json", "latest_drone_cv.json", "drone_cv_1794682184211.json"]:
            fpath = os.path.join(data_dir, fallback_name)
            if os.path.exists(fpath):
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        frames.append(json.load(f))
                    print(f"📦 [Dataset D415] Cargado snapshot real desde data/{fallback_name}")
                    break
                except Exception as e:
                    print(f"⚠️  Error leyendo {fallback_name}: {e}")

    return frames


REAL_D415_FRAMES = load_real_d415_frames()
CURRENT_FRAME_INDEX = 0


def load_real_map_state():
    """
    Carga las matrices del mapa global (occupancy_grid, cost_grid, height_map_m, slope_map_deg)
    desde apps/web/public/data/real_map_state.json o data/latest_map_state.npz.zip
    para servirlas por HTTP y WebSocket a cualquier IP externa.
    """
    base_dir = os.path.dirname(os.path.abspath(__file__))
    precomputed_path = os.path.join(base_dir, "apps", "web", "public", "data", "real_map_state.json")
    if os.path.exists(precomputed_path):
        try:
            with open(precomputed_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            print("🗺️  [Map Server] Matrices reales (120x80 occupancy_grid + cost_grid) listas para servir")
            return data
        except Exception as e:
            print(f"⚠️  Error leyendo real_map_state.json: {e}")
    return None


REAL_MAP_STATE = load_real_map_state()


def send_http_json(writer, obj, status="200 OK"):
    body = json.dumps(obj).encode("utf-8")
    headers = (
        f"HTTP/1.1 {status}\r\n"
        "Content-Type: application/json; charset=utf-8\r\n"
        f"Content-Length: {len(body)}\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Access-Control-Allow-Methods: GET, OPTIONS\r\n"
        "Access-Control-Allow-Headers: *\r\n"
        "Connection: close\r\n\r\n"
    ).encode("latin1")
    writer.write(headers + body)


def create_ws_frame(message: str) -> bytes:
    payload = message.encode("utf-8")
    length = len(payload)
    if length <= 125:
        header = struct.pack("!BB", 0x81, length)
    elif length <= 65535:
        header = struct.pack("!BBH", 0x81, 126, length)
    else:
        header = struct.pack("!BBQ", 0x81, 127, length)
    return header + payload


async def handle_client(reader, writer):
    request = b""
    while True:
        line = await reader.readline()
        request += line
        if line == b"\r\n" or not line:
            break

    req_text = request.decode("latin1", errors="ignore")
    lines = req_text.split("\r\n")
    first_line = lines[0] if lines else ""
    parts = first_line.split(" ")
    method = parts[0] if len(parts) > 0 else "GET"
    path = parts[1].split("?")[0] if len(parts) > 1 else "/"

    headers = {}
    for line in lines[1:]:
        if ": " in line:
            k, v = line.split(": ", 1)
            headers[k.lower()] = v.strip()

    key = headers.get("sec-websocket-key")
    if not key:
        # Es una petición HTTP REST normal desde una IP externa (ej. GET /map_state.json o /latest_expo_payload.json)
        if method == "OPTIONS":
            send_http_json(writer, {"ok": True})
        elif path in ("/map_state.json", "/data/real_map_state.json"):
            send_http_json(writer, REAL_MAP_STATE or {})
        elif path in ("/latest_expo_payload.json", "/latest_drone_cv.json", "/"):
            frame = (
                REAL_D415_FRAMES[CURRENT_FRAME_INDEX % len(REAL_D415_FRAMES)]
                if REAL_D415_FRAMES
                else {"node": "drone_cv", "timestamp": int(time.time()), "data": {}}
            )
            payload_out = dict(frame)
            payload_out["node_id"] = "drone_cv"
            if REAL_MAP_STATE:
                payload_out["map_state"] = REAL_MAP_STATE
            send_http_json(writer, payload_out)
        else:
            send_http_json(writer, {"status": "online", "frames": len(REAL_D415_FRAMES), "has_map_state": bool(REAL_MAP_STATE)})
        await writer.drain()
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
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
    print(f"🛰️  [Map & Telemetry Server] Cliente WS conectado desde IP: {addr}")
    connected_clients.add(writer)

    # Enviar inmediatamente el primer paquete con map_state completo (120x80 occupancy_grid + cost_grid)
    if REAL_D415_FRAMES:
        init_frame = REAL_D415_FRAMES[CURRENT_FRAME_INDEX % len(REAL_D415_FRAMES)]
        init_packet = {
            "node": "drone_cv",
            "node_id": "drone_cv",
            "timestamp": int(time.time()),
            "data": init_frame.get("data", {}),
            "images": init_frame.get("images"),
            "map_state": REAL_MAP_STATE,
        }
        try:
            writer.write(create_ws_frame(json.dumps(init_packet)))
            await writer.drain()
        except Exception:
            pass

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
    global CURRENT_FRAME_INDEX
    step = 0
    while True:
        await asyncio.sleep(1.0)
        step += 1
        CURRENT_FRAME_INDEX = step - 1
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

        # 4. Dron Real CV (Raspberry Pi 4 + RealSense D415 desde carpeta data/)
        if REAL_D415_FRAMES:
            raw_frame = REAL_D415_FRAMES[(step - 1) % len(REAL_D415_FRAMES)]
            drone_packet = {
                "node": "drone_cv",
                "node_id": "drone_cv",
                "timestamp": now_sec,
                "data": raw_frame.get("data", {}),
                "images": raw_frame.get("images"),
            }
        else:
            is_safe = False if (step % 20 > 14) else True
            drone_z = round(max(0.1, 1.3 + 1.3 * math.sin(t * 0.35)), 2)
            drone_packet = {
                "node": "drone_cv",
                "node_id": "drone_cv",
                "timestamp": now_sec,
                "payload": {
                    "drone_cv": {
                        "drone_pos": [1.8, 5.4, drone_z],
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
