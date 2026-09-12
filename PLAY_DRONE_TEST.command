#!/bin/zsh
cd "$(dirname "$0")" || exit 1
if curl --silent --fail http://localhost:4183/game.html >/dev/null; then
    open 'http://localhost:4183/game.html?drone-test=1'
else
    python3 -m http.server 4183 --bind 0.0.0.0 &
    drone_server_pid=$!
    trap 'kill "$drone_server_pid" 2>/dev/null' EXIT INT TERM
    sleep 1
    open 'http://localhost:4183/game.html?drone-test=1'
    wait "$drone_server_pid"
fi
