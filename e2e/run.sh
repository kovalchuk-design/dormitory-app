#!/usr/bin/env bash
# usage: E2E env vars set; ./e2e/run.sh e2e/02-students-flow.cjs
exec timeout "${E2E_TIMEOUT:-300}" node "$@"
