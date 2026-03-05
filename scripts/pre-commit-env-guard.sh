#!/bin/sh

if git diff --cached --name-only | grep -qE '\.env\.local|\.env\.production'; then
  echo "Refusing to commit .env.local/.env.production files."
  exit 1
fi
