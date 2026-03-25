#!/bin/bash
# scripts/prebuild_ios.sh
# Called by EAS prebuildCommand — runs expo prebuild then adds Watch/Widget targets
 
set -e  # exit on any error
 
echo "[prebuild_ios] Running expo prebuild..."
npx expo prebuild --platform ios --clean
 
echo "[prebuild_ios] Adding Watch + Widget targets..."
ruby scripts/add_watch_target.rb
 
echo "[prebuild_ios] Done"
 