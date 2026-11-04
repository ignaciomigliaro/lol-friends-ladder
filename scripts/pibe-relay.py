#!/usr/bin/env python3
"""
La Grieta de los Pibes - Live Telemetry Relay
Conector que lee en tiempo real la partida local de League of Legends (https://127.0.0.1:2999)
y envía el marcador de kills, oro, items y objetivos a tu servidor web (https://lagrietadelospibes.com).

Uso:
  python3 scripts/pibe-relay.py
  (Opcional) SERVER_URL=http://localhost:3000 python3 scripts/pibe-relay.py
"""

import os
import sys
import time
import json
import ssl
import urllib.request
import urllib.error

SERVER_URL = os.environ.get("SERVER_URL", "https://lagrietadelospibes.com").rstrip("/")
if len(sys.argv) > 1 and sys.argv[1].startswith("http"):
    SERVER_URL = sys.argv[1].rstrip("/")

TELEMETRY_ENDPOINT = f"{SERVER_URL}/api/live/telemetry"
LOL_CLIENT_URL = "https://127.0.0.1:2999/liveclientdata/allgamedata"

# LoL client uses a self-signed certificate on localhost:2999
ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

def fetch_local_game():
    req = urllib.request.Request(
        LOL_CLIENT_URL,
        headers={"User-Agent": "PibeRelay/1.0", "Accept": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, context=ssl_ctx, timeout=2.0) as resp:
            if resp.status == 200:
                return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None

def send_to_server(payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        TELEMETRY_ENDPOINT,
        data=data,
        headers={"Content-Type": "application/json", "User-Agent": "PibeRelay/1.0"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            return resp.status == 200
    except Exception as e:
        print(f"  [!] Error enviando al servidor ({SERVER_URL}): {e}")
        return False

def main():
    print("=" * 65)
    print(" 🎮 LA GRIETA DE LOS PIBES - CONECTOR DE TELEMETRÍA EN VIVO 🚀")
    print(f" Servidor destino: {SERVER_URL}")
    print(" Conectando con cliente local de LoL (127.0.0.1:2999)...")
    print("=" * 65)

    waiting_printed = False

    while True:
        game_data = fetch_local_game()

        if game_data and "allPlayers" in game_data:
            waiting_printed = False
            game_time = int(game_data.get("gameData", {}).get("gameTime", 0))
            mins = game_time // 60
            secs = game_time % 60

            act = game_data.get("activePlayer", {})
            active_player = act.get("summonerName") or act.get("riotId") or "Jugador"
            players = game_data.get("allPlayers", [])

            blue_kills = sum(p.get("scores", {}).get("kills", 0) for p in players if p.get("team") == "ORDER")
            red_kills = sum(p.get("scores", {}).get("kills", 0) for p in players if p.get("team") == "CHAOS")

            stamp = time.strftime("%H:%M:%S")
            ok = send_to_server(game_data)
            status_char = "✓" if ok else "✗"

            print(f"[{stamp}] {status_char} Min {mins:02d}:{secs:02d} | Kills: 🔵 {blue_kills} vs {red_kills} 🔴 | {active_player} activo")
        else:
            if not waiting_printed:
                stamp = time.strftime("%H:%M:%S")
                print(f"[{stamp}] ⏳ Esperando que inicie una partida de LoL en tu PC...")
                waiting_printed = True

        time.sleep(2.5)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[✓] Conector detenido por el usuario.")
        sys.exit(0)
