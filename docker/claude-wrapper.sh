#!/bin/sh
# Wrapper to invoke the claude-code CLI via node inside Docker.
# The claude-code package is mounted at /opt/claude-code from the host.
exec node /opt/claude-code/cli.js "$@"
