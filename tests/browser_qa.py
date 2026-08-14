#!/usr/bin/env python3
"""Headful Playwright QA for the static Void Privateer build.

Run under Xvfb in environments without a physical display:
  xvfb-run -a python tests/browser_qa.py
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

from playwright.sync_api import Browser, BrowserContext, Page, sync_playwright

BASE_URL = os.environ.get("VOID_PRIVATEER_URL", "http://127.0.0.1:4173/")
ROOT = Path(__file__).resolve().parents[1]
SHOT_DIR = ROOT / "review" / "screenshots"
SHOT_DIR.mkdir(parents=True, exist_ok=True)
CAPTURE_SCREENSHOTS = os.environ.get("VOID_PRIVATEER_CAPTURE", "0") == "1"

LAUNCH_ARGS = [
    "--no-sandbox",
    "--allow-file-access-from-files",
    "--disable-web-security",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-certificate-errors",
]


def state(page: Page) -> dict[str, Any]:
    value = page.evaluate("() => window.__VOID_PRIVATEER__?.getState?.()")
    assert isinstance(value, dict), "Game debug state was unavailable"
    return value


def shot(page: Page, name: str) -> None:
    if CAPTURE_SCREENSHOTS:
        page.screenshot(path=str(SHOT_DIR / name), animations="disabled")


def webgl_available(page: Page) -> bool:
    return bool(page.evaluate("""
      () => {
        const canvas = document.createElement('canvas');
        return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
      }
    """))


def collect_messages(page: Page, label: str) -> tuple[list[str], list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    page_errors: list[str] = []

    def on_console(message: Any) -> None:
        text = f"[{label}] {message.type}: {message.text}"
        if message.type == "error":
            errors.append(text)
        elif message.type == "warning":
            warnings.append(text)

    page.on("console", on_console)
    page.on("pageerror", lambda exc: page_errors.append(f"[{label}] {exc}"))
    return errors, warnings, page_errors


def launch_game(page: Page) -> None:
    if page.locator('[data-ui-command="dock-concourse"]').count():
        page.locator('[data-ui-command="dock-concourse"]').click()
    page.locator('.concourse-pointer-ship').click()
    page.locator("#hud").wait_for(state="visible")
    page.wait_for_timeout(1200)


def run_desktop(browser: Browser) -> dict[str, Any]:
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()
    page.set_default_timeout(12000)
    errors, warnings, page_errors = collect_messages(page, "desktop")
    print("desktop: boot", flush=True)

    page.goto(BASE_URL, wait_until="domcontentloaded")
    page.locator("#title-screen").wait_for(state="visible")
    assert webgl_available(page), "Desktop WebGL context unavailable"
    assert page.locator("canvas").count() >= 1, "Expected radar canvas on the title shell"
    shot(page, "desktop-title.png")
    print("desktop: title", flush=True)

    page.locator('[data-ui-command="new"]').click()
    page.locator("#dock-screen").wait_for(state="visible")
    assert state(page)["player"]["dockedAt"] == "helix"
    assert page.locator("canvas").count() >= 2, "Expected WebGL viewport and radar canvases after session start"
    assert page.locator(".dock-footer").count() == 0
    assert page.locator(".concourse-screen .scene-pointer").count() == 4
    concourse_text = page.locator("#dock-screen").inner_text()
    for stale_label in ("ARRIVAL /", "DOCKED PLAYER SHIP", "LOCAL FEED", "SERVICES / NEAR SHIP", "DOCK"):
        assert stale_label not in concourse_text
    shot(page, "desktop-dock-concourse.png")

    # Bar: all three people are interactive and cycle through distinct dialogue.
    page.locator('[data-dock-hotspot="bar"]').click()
    people = page.locator('[data-person-id]')
    assert people.count() == 3, f"Expected 3 bar contacts, found {people.count()}"
    first_person = people.first
    first_person_id = first_person.get_attribute("data-person-id")
    first_person.click()
    dialogue_1 = page.locator(".bar-dialogue-card p").inner_text()
    page.locator(f'[data-person-id="{first_person_id}"]').click()
    dialogue_2 = page.locator(".bar-dialogue-card p").inner_text()
    assert dialogue_1 != dialogue_2 and "Select someone" not in dialogue_1
    shot(page, "desktop-dock-bar.png")
    print("desktop: bar", flush=True)

    # Market: execute a complete buy/sell round trip and verify both credit and cargo mutation.
    page.locator('[data-ui-command="bar-scene"]').click()
    page.locator('[data-ui-command="dock-concourse"]').click()
    page.locator('[data-dock-hotspot="market"]').click()
    assert page.locator('.market-scene [data-market-point]').count() == 3
    page.locator('[data-market-point="commodities"]').click()
    before_buy = state(page)
    page.locator('[data-trade="buy:water:1"]').click()
    page.wait_for_timeout(150)
    after_buy = state(page)
    assert after_buy["player"]["cargo"].get("water", 0) == before_buy["player"]["cargo"].get("water", 0) + 1
    assert after_buy["player"]["credits"] < before_buy["player"]["credits"]
    page.locator('[data-trade="sell:water:1"]').click()
    page.wait_for_timeout(150)
    after_sell = state(page)
    assert after_sell["player"]["cargo"].get("water", 0) == before_buy["player"]["cargo"].get("water", 0)
    shot(page, "desktop-dock-market.png")
    print("desktop: market", flush=True)

    # Bar mission board: prefer a merchant contract and verify it becomes active.
    page.locator('[data-ui-command="market-overview"]').click()
    page.locator('[data-ui-command="dock-concourse"]').click()
    page.locator('[data-dock-hotspot="bar"]').click()
    page.locator('[data-bar-panel="missions"]').click()
    before_mission = state(page)
    offers = before_mission["world"]["offers"]["helix"]
    suitable = next(
        (
            mission
            for mission in offers
            if mission["kind"] in {"delivery", "procurement", "transport"}
            and mission.get("deposit", 0) <= before_mission["player"]["credits"]
        ),
        offers[0],
    )
    page.locator(f'[data-mission-id="{suitable["id"]}"]').click()
    page.wait_for_timeout(180)
    after_mission = state(page)
    assert any(mission["id"] == suitable["id"] for mission in after_mission["activeMissions"])
    assert "3.599999" not in page.locator("#dock-screen").inner_text()
    shot(page, "desktop-dock-missions.png")
    print("desktop: missions", flush=True)

    # Guild progression starts through an explicit registration transaction.
    page.locator('[data-ui-command="dock-concourse"]').click()
    page.locator('[data-dock-hotspot="bar"]').click()
    page.locator('[data-bar-panel="guilds"]').click()
    credits_before_guild = state(page)["player"]["credits"]
    page.locator('[data-guild-id="merchant"]').click()
    page.wait_for_timeout(160)
    joined_state = state(page)
    assert joined_state["player"]["guildRep"]["merchant"] == 1
    assert joined_state["player"]["credits"] < credits_before_guild
    shot(page, "desktop-dock-guilds.png")

    page.locator('[data-ui-command="dock-concourse"]').click()
    page.locator('[data-dock-hotspot="market"]').click()
    page.locator('[data-market-point="equipment"]').click()
    assert page.locator(".equipment-card").count() >= 8
    shot(page, "desktop-dock-equipment.png")
    page.locator('[data-market-point="shipyard"]').click()
    assert page.locator(".ship-card").count() == 1
    shot(page, "desktop-dock-ship-dealer.png")
    print("desktop: dock tabs", flush=True)

    # Launch and exercise the keyboard-first fallback controls.
    launch_game(page)
    launch_state = state(page)
    assert launch_state["player"].get("dockedAt") is None
    initial_time = launch_state["world"]["time"]
    shot(page, "desktop-flight.png")
    print("desktop: flight", flush=True)

    page.keyboard.down("r")
    page.wait_for_timeout(1500)
    page.keyboard.up("r")
    page.wait_for_timeout(100)
    throttle_state = state(page)
    assert throttle_state["player"]["throttle"] > 0.18
    assert throttle_state["world"]["time"] > initial_time

    page.keyboard.press("t")
    for _ in range(3):
        page.keyboard.press("c")
        page.wait_for_timeout(180)
        mode_state = state(page)
        if mode_state["player"]["mode"] != "combat":
            break
    assert mode_state["player"]["mode"] != "combat"

    # Pause is a DOM overlay and must gate the cockpit without losing the flight state.
    page.locator(".pause-button").click()
    page.locator("#pause-panel").wait_for(state="visible")
    shot(page, "desktop-pause.png")
    print("desktop: pause", flush=True)
    page.locator('[data-ui-command="resume-flight"]').evaluate("element => element.click()")
    page.locator("#pause-panel").wait_for(state="hidden")

    # Autopilot may refuse under immediate threat; either outcome must produce feedback without crashing.
    page.keyboard.press("j")
    page.wait_for_timeout(900)
    nav_readout = page.locator("#hud-nav-distance").inner_text()
    toast_text = page.locator("#toast-stack").inner_text()
    assert "AUTOPILOT" in nav_readout or "autopilot" in toast_text.lower() or "hostile" in toast_text.lower()
    shot(page, "desktop-flight-autopilot.png")
    print("desktop: autopilot", flush=True)

    # Persistence boundary: every mutating action writes a complete serializable career save.
    credits_before_reload = state(page)["player"]["credits"]
    serialized_save = page.evaluate("() => localStorage.getItem('void-privateer-save-v1')")
    assert serialized_save and str(credits_before_reload) in serialized_save
    saved = json.loads(serialized_save)
    assert saved["player"].get("dockedAt") is None
    assert saved["activeMissions"]

    print("desktop: passed", flush=True)
    context.close()
    return {
        "errors": errors,
        "warnings": warnings,
        "page_errors": page_errors,
        "active_mission_kind": suitable["kind"],
        "desktop_throttle": throttle_state["player"]["throttle"],
    }


def pointer_sequence(page: Page, selector: str, x_ratio: float, y_ratio: float, pointer_id: int = 7) -> None:
    locator = page.locator(selector)
    box = locator.bounding_box()
    assert box, f"No bounding box for {selector}"
    x = box["x"] + box["width"] * x_ratio
    y = box["y"] + box["height"] * y_ratio
    page.evaluate(
        """([selector, x, y, pointerId]) => {
          const element = document.querySelector(selector);
          if (!element) throw new Error(`Missing ${selector}`);
          const init = { bubbles: true, cancelable: true, pointerId, pointerType: 'touch', clientX: x, clientY: y, buttons: 1 };
          element.dispatchEvent(new PointerEvent('pointerdown', init));
          element.dispatchEvent(new PointerEvent('pointermove', { ...init, clientX: x, clientY: y }));
          element.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
        }""",
        [selector, x, y, pointer_id],
    )


def tap_pointer(page: Page, selector: str, pointer_id: int = 9) -> None:
    page.evaluate(
        """([selector, pointerId]) => {
          const element = document.querySelector(selector);
          if (!element) throw new Error(`Missing ${selector}`);
          const rect = element.getBoundingClientRect();
          const init = { bubbles: true, cancelable: true, pointerId, pointerType: 'touch', clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, buttons: 1 };
          element.dispatchEvent(new PointerEvent('pointerdown', init));
          element.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
        }""",
        [selector, pointer_id],
    )


def run_mobile(browser: Browser) -> dict[str, Any]:
    context = browser.new_context(
        viewport={"width": 844, "height": 390},
        is_mobile=True,
        has_touch=True,
        device_scale_factor=1,
    )
    page = context.new_page()
    page.set_default_timeout(12000)
    errors, warnings, page_errors = collect_messages(page, "mobile")
    print("mobile: boot", flush=True)
    page.goto(BASE_URL, wait_until="domcontentloaded")
    assert webgl_available(page), "Mobile-emulated WebGL context unavailable"
    page.locator('[data-ui-command="new"]').click()
    page.locator("#dock-screen").wait_for(state="visible")
    assert page.locator(".dock-footer").count() == 0
    assert page.locator(".concourse-screen .scene-pointer").count() == 4
    shot(page, "mobile-dock-landscape.png")
    print("mobile: dock", flush=True)

    page.locator('[data-dock-hotspot="bar"]').click()
    assert page.locator('[data-person-id]').count() == 3
    shot(page, "mobile-dock-bar.png")

    launch_game(page)
    touch_controls = page.locator(".touch-controls")
    assert touch_controls.is_visible()
    assert page.locator('[data-touch-stick]').is_visible()
    assert page.locator('[data-touch-throttle]').is_visible()
    shot(page, "mobile-flight.png")
    print("mobile: flight", flush=True)

    # Move the touch throttle near full with a real browser pointer sequence.
    throttle_control = page.locator("[data-touch-throttle]")
    throttle_box = throttle_control.bounding_box()
    assert throttle_box
    page.mouse.move(throttle_box["x"] + throttle_box["width"] * 0.5, throttle_box["y"] + throttle_box["height"] * 0.08)
    page.mouse.down()
    page.wait_for_timeout(120)
    page.mouse.up()
    page.wait_for_timeout(180)
    throttle = state(page)["player"]["throttle"]
    assert throttle > 0.8, f"Touch throttle did not update: {throttle}"

    # Edge-trigger touch action: cycle mode.
    previous_mode = state(page)["player"]["mode"]
    page.locator('[data-touch-action="cycleMode"]').click()
    page.wait_for_timeout(120)
    assert state(page)["player"]["mode"] != previous_mode

    # The joystick must create angular motion while held.
    stick = page.locator("[data-touch-stick]")
    box = stick.bounding_box()
    assert box
    x = box["x"] + box["width"] * 0.82
    y = box["y"] + box["height"] * 0.3
    page.mouse.move(x, y)
    page.mouse.down()
    page.wait_for_timeout(360)
    angular = state(page)["player"]["angularVelocity"]
    page.mouse.up()
    assert max(abs(float(value)) for value in angular) > 0.01
    shot(page, "mobile-flight-controls.png")

    # Portrait mode should block play with a clear rotation notice rather than compressing controls.
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(200)
    assert page.locator("#rotate-notice").is_visible()
    shot(page, "mobile-portrait-rotate.png")
    print("mobile: portrait", flush=True)

    print("mobile: passed", flush=True)
    context.close()
    return {
        "errors": errors,
        "warnings": warnings,
        "page_errors": page_errors,
        "mobile_throttle": throttle,
        "angular_velocity": angular,
    }


def main() -> int:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=False,
            executable_path=os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE", "/usr/bin/chromium"),
            args=LAUNCH_ARGS,
        )
        try:
            mode = sys.argv[1] if len(sys.argv) > 1 else "all"
            desktop = run_desktop(browser) if mode in {"all", "desktop"} else {"errors": [], "warnings": [], "page_errors": []}
            mobile = run_mobile(browser) if mode in {"all", "mobile"} else {"errors": [], "warnings": [], "page_errors": []}
        finally:
            browser.close()

    report = {"desktop": desktop, "mobile": mobile}
    print(json.dumps(report, indent=2))

    fatal_console = [
        message
        for bucket in (desktop["errors"], desktop["page_errors"], mobile["errors"], mobile["page_errors"])
        for message in bucket
        if "favicon" not in message.lower()
    ]
    if fatal_console:
        print("Fatal browser messages:\n" + "\n".join(fatal_console), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
