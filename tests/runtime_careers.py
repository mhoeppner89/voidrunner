#!/usr/bin/env python3
"""Focused live-runtime checks for mining, salvage, and bounty combat."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

from playwright.sync_api import Browser, Page, sync_playwright

BASE_URL = os.environ.get("VOID_PRIVATEER_URL", "http://127.0.0.1:4173/")
ROOT = Path(__file__).resolve().parents[1]
SHOT_DIR = ROOT / "review" / "screenshots"
SHOT_DIR.mkdir(parents=True, exist_ok=True)

ARGS = [
    "--no-sandbox",
    "--allow-file-access-from-files",
    "--disable-web-security",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-certificate-errors",
]




def key_edge(page: Page, code: str) -> None:
    """Send a physical-key edge directly to the window input layer."""
    page.evaluate(
        """code => {
          window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
          window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, cancelable: true }));
        }""",
        code,
    )
    page.wait_for_timeout(90)


def key_down(page: Page, code: str) -> None:
    page.evaluate(
        "code => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }))",
        code,
    )


def key_up(page: Page, code: str) -> None:
    page.evaluate(
        "code => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, cancelable: true }))",
        code,
    )




def scan_node(page: Page, node_id: str) -> None:
    """Select and scan a node, retrying across animation-frame boundaries."""
    for _ in range(10):
        page.evaluate("nodeId => { window.__VOID_PRIVATEER__.getState().player.currentTargetId = nodeId; }", node_id)
        key_edge(page, "KeyV")
        page.wait_for_timeout(360)
        if node_id in get_state(page)["world"]["scannedNodes"]:
            return
    toast = page.locator("#toast-stack").inner_text()
    state = get_state(page)
    raise AssertionError({"node": node_id, "target": state["player"].get("currentTargetId"), "toast": toast})


def get_state(page: Page) -> dict[str, Any]:
    result = page.evaluate("() => window.__VOID_PRIVATEER__.getState()")
    assert isinstance(result, dict)
    return result


def get_runtime(page: Page) -> dict[str, Any]:
    result = page.evaluate("() => window.__VOID_PRIVATEER__.getRuntime()")
    assert isinstance(result, dict)
    return result


def start_flight(browser: Browser) -> tuple[Any, Page, list[str], list[str]]:
    context = browser.new_context(viewport={"width": 1280, "height": 720})
    page = context.new_page()
    page.set_default_timeout(12000)
    errors: list[str] = []
    page_errors: list[str] = []
    page.on("console", lambda msg: errors.append(f"{msg.type}: {msg.text}") if msg.type == "error" else None)
    page.on("pageerror", lambda exc: page_errors.append(str(exc)))
    page.goto(BASE_URL, wait_until="domcontentloaded")
    page.locator('[data-ui-command="new"]').click()
    page.locator("#dock-screen").wait_for(state="visible")
    page.locator('[data-ui-command="launch"]').last.click()
    page.locator("#hud").wait_for(state="visible")
    page.wait_for_timeout(450)
    return context, page, errors, page_errors


def place_at_resource(page: Page, kind: str) -> dict[str, Any]:
    return page.evaluate(
        """async (kind) => {
          const save = window.__VOID_PRIVATEER__.getState();
          const world = await import('./src/game/worldData.js');
          const locations = await import('./src/game/data.js');
          let node;
          let center;
          let candidates;
          let obstacles;
          if (kind === 'mining') {
            const nodes = world.generateAsteroidField(save.world.seed, save.world.depletedAsteroids, save.world.scannedNodes);
            candidates = nodes.filter((entry) => !entry.moving && !entry.tunnelPart && entry.remaining > 0 && entry.radius <= 4.15)
              .sort((a, b) => b.richness - a.richness);
            obstacles = nodes.map((entry) => ({ id: entry.id, position: entry.position, radius: entry.radius * 0.9 }));
            center = locations.LOCATIONS.shardbelt.position;
            save.player.mode = 'mining';
            for (const equipment of ['mining-mk2', 'salvage-mk2', 'radar-mk2']) {
              if (!save.player.equipment.includes(equipment)) save.player.equipment.push(equipment);
            }
          } else {
            const nodes = world.generateWreckNodes(save.world.seed, save.world.depletedWrecks, save.world.scannedNodes);
            candidates = nodes.filter((entry) => entry.remaining > 0 && entry.hazard < 0.55)
              .sort((a, b) => b.remaining - a.remaining);
            obstacles = world.generateGraveyardPieces(save.world.seed)
              .map((entry) => ({ id: entry.id, position: entry.position, radius: entry.collisionRadius }));
            center = locations.LOCATIONS['mourning-line'].position;
            save.player.mode = 'salvage';
            for (const equipment of ['salvage-mk2', 'radar-mk2']) {
              if (!save.player.equipment.includes(equipment)) save.player.equipment.push(equipment);
            }
          }

          const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
          const segmentHits = (start, end, obstacle) => {
            if (distance(start, obstacle.position) < obstacle.radius + 1.5) return false;
            const dx = end[0] - start[0], dy = end[1] - start[1], dz = end[2] - start[2];
            const fx = start[0] - obstacle.position[0], fy = start[1] - obstacle.position[1], fz = start[2] - obstacle.position[2];
            const a = dx * dx + dy * dy + dz * dz;
            const b = 2 * (fx * dx + fy * dy + fz * dz);
            const c = fx * fx + fy * fy + fz * fz - obstacle.radius * obstacle.radius;
            const discriminant = b * b - 4 * a * c;
            if (discriminant < 0 || a < 1e-9) return false;
            const root = Math.sqrt(discriminant);
            const t1 = (-b - root) / (2 * a);
            const t2 = (-b + root) / (2 * a);
            return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
          };
          const normalize = (v) => {
            const length = Math.hypot(v[0], v[1], v[2]) || 1;
            return [v[0] / length, v[1] / length, v[2] / length];
          };
          const baseDirections = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],[1,1,0],[1,-1,0],[-1,1,0],[-1,-1,0],[1,0,1],[-1,0,1],[0,1,1],[0,-1,1]];
          let chosen;
          for (const candidate of candidates) {
            const radial = normalize([candidate.position[0] - center[0], candidate.position[1] - center[1], candidate.position[2] - center[2]]);
            for (const direction of [radial, ...baseDirections.map(normalize)]) {
              const standOff = Math.max(candidate.radius + 7.5, 12);
              const position = [
                candidate.position[0] + direction[0] * standOff,
                candidate.position[1] + direction[1] * standOff,
                candidate.position[2] + direction[2] * standOff,
              ];
              const safe = obstacles.every((obstacle) => obstacle.id === candidate.id || distance(position, obstacle.position) >= obstacle.radius + 1.5);
              const clear = obstacles.every((obstacle) => obstacle.id === candidate.id || !segmentHits(position, candidate.position, obstacle));
              if (safe && clear) {
                chosen = { node: candidate, position };
                break;
              }
            }
            if (chosen) break;
          }
          if (!chosen) throw new Error(`No clear ${kind} test vector found`);
          node = chosen.node;
          const [px, py, pz] = chosen.position;
          const tx = node.position[0] - px;
          const ty = node.position[1] - py;
          const tz = node.position[2] - pz;
          const tlen = Math.hypot(tx, ty, tz) || 1;
          const bx = tx / tlen, by = ty / tlen, bz = tz / tlen;
          let qx = by, qy = -bx, qz = 0, qw = 1 - bz;
          let qlen = Math.hypot(qx, qy, qz, qw);
          if (qlen < 1e-6) { qx = 0; qy = 1; qz = 0; qw = 0; qlen = 1; }
          save.player.position = [px, py, pz];
          save.player.velocity = [0, 0, 0];
          save.player.angularVelocity = [0, 0, 0];
          save.player.rotation = [qx / qlen, qy / qlen, qz / qlen, qw / qlen];
          save.player.throttle = 0;
          save.player.currentTargetId = node.id;
          save.player.navTargetId = kind === 'mining' ? 'shardbelt' : 'mourning-line';
          return node;
        }""",
        kind,
    )


def run_mining(browser: Browser) -> dict[str, Any]:
    context, page, errors, page_errors = start_flight(browser)
    node = place_at_resource(page, "mining")
    page.wait_for_timeout(350)
    scan_node(page, node["id"])
    initial_remaining = float(node["remaining"])
    key_down(page, "Space")
    page.wait_for_timeout(1100)
    page.screenshot(path=str(SHOT_DIR / "desktop-mining.png"), animations="disabled")
    page.wait_for_timeout(3500)
    key_up(page, "Space")
    page.wait_for_timeout(250)
    for pickup in [entry for entry in get_runtime(page)["pickups"] if entry["source"] == "mining"]:
        page.evaluate("pickup => { const save = window.__VOID_PRIVATEER__.getState(); save.player.position = [...pickup.position]; save.player.velocity = [0,0,0]; }", pickup)
        page.wait_for_timeout(180)
    page.wait_for_timeout(250)
    save = get_state(page)
    depleted = save["world"]["depletedAsteroids"].get(node["id"], initial_remaining)
    assert depleted < initial_remaining, (depleted, initial_remaining)
    assert save["player"]["stats"]["mined"] > 0 or save["player"]["cargo"].get("ore", 0) > 0
    assert not errors and not page_errors, (errors, page_errors)
    context.close()
    return {"node": node["id"], "remaining": depleted, "mined": save["player"]["stats"]["mined"], "ore": save["player"]["cargo"].get("ore", 0)}


def run_salvage(browser: Browser) -> dict[str, Any]:
    context, page, errors, page_errors = start_flight(browser)
    node = place_at_resource(page, "salvage")
    page.wait_for_timeout(350)
    scan_node(page, node["id"])
    initial_remaining = float(node["remaining"])
    key_down(page, "Space")
    page.wait_for_timeout(1300)
    page.screenshot(path=str(SHOT_DIR / "desktop-salvage.png"), animations="disabled")
    page.wait_for_timeout(3900)
    key_up(page, "Space")
    page.wait_for_timeout(250)
    for pickup in [entry for entry in get_runtime(page)["pickups"] if entry["source"] == "salvage"]:
        page.evaluate("pickup => { const save = window.__VOID_PRIVATEER__.getState(); save.player.position = [...pickup.position]; save.player.velocity = [0,0,0]; }", pickup)
        page.wait_for_timeout(180)
    page.wait_for_timeout(300)
    save = get_state(page)
    depleted = save["world"]["depletedWrecks"].get(node["id"], initial_remaining)
    assert depleted < initial_remaining, (depleted, initial_remaining)
    assert save["player"]["stats"]["salvaged"] > 0 or save["player"]["cargo"].get(node["salvage"], 0) > 0
    assert not errors and not page_errors, (errors, page_errors)
    context.close()
    return {"node": node["id"], "remaining": depleted, "salvaged": save["player"]["stats"]["salvaged"], "cargo": save["player"]["cargo"].get(node["salvage"], 0), "commodity": node["salvage"]}


def run_bounty(browser: Browser) -> dict[str, Any]:
    context = browser.new_context(viewport={"width": 1280, "height": 720})
    page = context.new_page()
    page.set_default_timeout(12000)
    errors: list[str] = []
    page_errors: list[str] = []
    page.on("console", lambda msg: errors.append(f"{msg.type}: {msg.text}") if msg.type == "error" else None)
    page.on("pageerror", lambda exc: page_errors.append(str(exc)))
    page.goto(BASE_URL, wait_until="domcontentloaded")
    page.locator('[data-ui-command="new"]').click()
    page.locator('[data-dock-tab="missions"]').click()
    save = get_state(page)
    mission = next(mission for mission in save["world"]["offers"]["helix"] if mission["kind"] == "bounty")
    page.locator(f'[data-mission-id="{mission["id"]}"]').click()
    page.locator('[data-ui-command="launch"]').last.click()
    page.locator("#hud").wait_for(state="visible")

    page.evaluate(
        """async (mission) => {
          const save = window.__VOID_PRIVATEER__.getState();
          const data = await import('./src/game/data.js');
          const zone = data.LOCATIONS[mission.targetZone];
          save.player.position = [zone.position[0], zone.position[1], zone.position[2]];
          save.player.velocity = [0, 0, 0];
          save.player.angularVelocity = [0, 0, 0];
          save.player.throttle = 0;
          save.player.shipId = 'vanguard';
          for (const equipment of ['engine-mk2', 'thrusters-mk2', 'shield-mk2', 'armor-mk2', 'pulse-mk2', 'radar-mk2']) {
            if (!save.player.equipment.includes(equipment)) save.player.equipment.push(equipment);
          }
          save.player.shield = 195;
          save.player.armor = 185;
          save.player.hull = 150;
          save.player.missiles = 8;
          save.player.mode = 'combat';
        }""",
        mission,
    )
    page.wait_for_timeout(5200)
    runtime = get_runtime(page)
    target = next(ship for ship in runtime["ships"] if ship.get("missionId") == mission["id"])
    target_id = target["id"]

    page.evaluate(
        """(target) => {
          const save = window.__VOID_PRIVATEER__.getState();
          save.player.position = [target.position[0], target.position[1], target.position[2] + 12];
          save.player.velocity = [0, 0, 0];
          save.player.rotation = [0, 0, 0, 1];
          save.player.currentTargetId = target.id;
        }""",
        target,
    )
    key_edge(page, "KeyV")
    page.wait_for_timeout(250)
    key_down(page, "Space")
    combat_shot_taken = False
    for tick in range(36):
        runtime = get_runtime(page)
        live = next((ship for ship in runtime["ships"] if ship["id"] == target_id and ship["hull"] > 0), None)
        if live is None:
            break
        page.evaluate(
            """(target) => {
              const save = window.__VOID_PRIVATEER__.getState();
              save.player.position = [target.position[0], target.position[1], target.position[2] + 12];
              save.player.velocity = [0, 0, 0];
              save.player.rotation = [0, 0, 0, 1];
              save.player.currentTargetId = target.id;
            }""",
            live,
        )
        if tick % 6 == 0:
            key_edge(page, "KeyM")
        if tick == 3 and not combat_shot_taken:
            page.screenshot(path=str(SHOT_DIR / "desktop-bounty-combat.png"), animations="disabled")
            combat_shot_taken = True
        page.wait_for_timeout(220)
    key_up(page, "Space")
    page.wait_for_timeout(500)
    save = get_state(page)
    assert mission["id"] in save["world"]["completedMissionIds"], get_runtime(page)
    assert not any(active["id"] == mission["id"] for active in save["activeMissions"])
    assert save["player"]["stats"]["kills"] >= 1
    assert not errors and not page_errors, (errors, page_errors)
    context.close()
    return {"mission": mission["title"], "target": mission["targetName"], "kills": save["player"]["stats"]["kills"], "credits": save["player"]["credits"]}


def run_named_check(label: str) -> dict[str, Any]:
    checks = {"mining": run_mining, "salvage": run_salvage, "bounty": run_bounty}
    check = checks.get(label)
    if check is None:
        raise ValueError(f"Unknown runtime check: {label}")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, executable_path=os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE", "/usr/bin/chromium"), args=ARGS)
        try:
            return check(browser)
        finally:
            browser.close()


def main() -> int:
    labels = ("mining", "salvage", "bounty")
    if len(sys.argv) < 2 or sys.argv[1] not in labels:
        print("Usage: python tests/runtime_careers.py [mining|salvage|bounty]")
        print("Run the three WebGL capture checks as separate processes for reliable software-renderer QA.")
        return 0
    label = sys.argv[1]
    print(f"runtime: {label}", flush=True)
    print(json.dumps(run_named_check(label), separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
