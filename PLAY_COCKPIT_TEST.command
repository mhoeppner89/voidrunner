#!/bin/zsh
cd "${0:A:h}"
if ! curl -fsS http://localhost:4184/game.html >/dev/null 2>&1; then
  python3 -m http.server 4184 >/tmp/voidrunner-cockpit-server.log 2>&1 &
fi
open 'http://localhost:4184/game.html?drone-test=1'
