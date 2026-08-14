#!/usr/bin/env python3
"""Synthetic standard-Gamepad API smoke test for the live browser runtime."""
from __future__ import annotations

import json
import os
from typing import Any

from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("VOID_PRIVATEER_URL", "http://127.0.0.1:4173/")
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


def state(page: Any) -> dict[str, Any]:
    value = page.evaluate("() => window.__VOID_PRIVATEER__.getState()")
    assert isinstance(value, dict)
    return value


def button_edge(page: Any, index: int) -> None:
    page.evaluate("index => { window.__gamepadTest.buttons[index].pressed = true; window.__gamepadTest.buttons[index].value = 1; }", index)
    page.wait_for_timeout(480)
    page.evaluate("index => { window.__gamepadTest.buttons[index].pressed = false; window.__gamepadTest.buttons[index].value = 0; }", index)
    page.wait_for_timeout(360)


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, executable_path=os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE", "/usr/bin/chromium"), args=ARGS)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        context.add_init_script(
            """
            window.__gamepadTest = {
              id: 'QA Standard Gamepad',
              index: 0,
              connected: true,
              mapping: 'standard',
              timestamp: performance.now(),
              axes: [0, 0, 0, 0],
              buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })),
              vibrationActuator: null,
              hapticActuators: [],
            };
            Object.defineProperty(navigator, 'getGamepads', {
              configurable: true,
              value: () => [window.__gamepadTest, null, null, null],
            });
            """
        )
        page = context.new_page()
        errors: list[str] = []
        page_errors: list[str] = []
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.goto(BASE_URL, wait_until="domcontentloaded")
        page.locator('[data-ui-command="new"]').click()
        page.locator('[data-ui-command="launch"]').last.click()
        page.locator("#hud").wait_for(state="visible")
        page.wait_for_timeout(900)

        # Standard axes: left stick pitch/yaw, right stick roll/throttle.
        page.evaluate("() => { window.__gamepadTest.axes = [0.64, -0.52, 0.41, -0.9]; }")
        page.wait_for_timeout(1500)
        axis_state = state(page)
        angular = axis_state["player"]["angularVelocity"]
        assert max(abs(float(value)) for value in angular) > 0.02, angular
        assert axis_state["player"]["throttle"] > 0.12, axis_state["player"]["throttle"]
        page.evaluate("() => { window.__gamepadTest.axes = [0, 0, 0, 0]; }")

        # Face button B cycles the full simulation mode.
        previous_mode = state(page)["player"]["mode"]
        button_edge(page, 1)
        assert state(page)["player"]["mode"] != previous_mode

        # D-pad right cycles nav; D-pad up reaches the scan action.
        previous_nav = state(page)["player"]["navTargetId"]
        button_edge(page, 15)
        assert state(page)["player"]["navTargetId"] != previous_nav
        page.evaluate("() => { window.__VOID_PRIVATEER__.getState().player.currentTargetId = undefined; }")
        button_edge(page, 12)
        assert "target" in page.locator("#toast-stack").inner_text().lower()

        # Return to combat and hold the right trigger; projectiles must enter the runtime.
        button_edge(page, 1)
        button_edge(page, 1)
        assert state(page)["player"]["mode"] == "combat"
        page.evaluate("() => { window.__gamepadTest.buttons[7].pressed = true; window.__gamepadTest.buttons[7].value = 1; }")
        page.wait_for_timeout(650)
        projectile_count = len(page.evaluate("() => window.__VOID_PRIVATEER__.getRuntime().projectiles"))
        page.evaluate("() => { window.__gamepadTest.buttons[7].pressed = false; window.__gamepadTest.buttons[7].value = 0; }")
        assert projectile_count > 0, projectile_count

        assert not errors and not page_errors, (errors, page_errors)
        result = {
            "throttle": axis_state["player"]["throttle"],
            "angular_velocity": angular,
            "projectiles": projectile_count,
            "errors": errors,
            "page_errors": page_errors,
        }
        context.close()
        browser.close()
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
