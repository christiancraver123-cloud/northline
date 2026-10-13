#!/bin/bash
# Stops Northline's background server.
launchctl remove media.northline.server 2>/dev/null
PIDS=$(lsof -ti tcp:3100 2>/dev/null); [ -n "$PIDS" ] && kill $PIDS
echo "Northline stopped."; sleep 2
