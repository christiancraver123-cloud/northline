#!/bin/bash
# Stops the Northline app's background server.
PIDS=$(lsof -ti tcp:3100 2>/dev/null); if [ -n "$PIDS" ]; then kill $PIDS; echo "Northline stopped."; else echo "Northline wasn't running."; fi
sleep 2
