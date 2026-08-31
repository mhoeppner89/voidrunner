#!/bin/zsh

set -eu

test_root=${0:A:h}
test_port=4173
test_log=/tmp/voidrunner-debris-test.log
test_url="http://127.0.0.1:${test_port}/?test=debris-collision&build=0.7.30"

cd -- "$test_root"

python3 -m http.server "$test_port" --bind 127.0.0.1 >"$test_log" 2>&1 &
test_server_pid=$!

stop_test_server() {
    kill "$test_server_pid" 2>/dev/null || true
}
trap stop_test_server EXIT INT TERM

sleep 0.8
if ! kill -0 "$test_server_pid" 2>/dev/null; then
    echo "Voidrunner could not start on port ${test_port}."
    echo "Close the program using that port, then double-click this file again."
    echo "Server log: ${test_log}"
    exit 1
fi

open "$test_url"

echo "Voidrunner debris collision test is running."
echo "Close this Terminal window or press Control-C to stop the local server."
echo "Reload the browser page at any time to restart outside the carrier bay."

wait "$test_server_pid"
