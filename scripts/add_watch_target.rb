#!/usr/bin/env ruby
# scripts/add_watch_target.rb
#
# Adds an Apple Watch App target to the Xcode project using Xcodeproj gem.
# Xcodeproj is pre-installed on all EAS Mac build servers.
#
# Called from eas.json prebuildCommand after expo prebuild completes:
#   "prebuildCommand": "npx expo prebuild --platform ios && ruby scripts/add_watch_target.rb"

require 'xcodeproj'
require 'fileutils'

# ── Constants ────────────────────────────────────────────────────────────────

MAIN_APP_NAME        = 'GolfSum'
WATCH_APP_NAME       = 'GolfSumWatch'
MAIN_BUNDLE_ID       = 'com.golfsum.app'
WATCH_BUNDLE_ID      = 'com.golfsum.app.watchkitapp'
WATCH_DEPLOY_TARGET  = '7.0'
IOS_DEPLOY_TARGET    = '15.1'
SWIFT_VERSION        = '5.9'
APP_GROUP_ID         = 'group.com.golfsum.app'

# ── Locate Xcode project ─────────────────────────────────────────────────────

project_path = Dir.glob('ios/*.xcodeproj').first
abort('ERROR: Could not find .xcodeproj in ios/') unless project_path

puts "[WatchPlugin] Opening #{project_path}"
project = Xcodeproj::Project.open(project_path)

# ── Guard: don't add target twice ────────────────────────────────────────────

if project.targets.any? { |t| t.name == WATCH_APP_NAME }
  puts "[WatchPlugin] Watch target '#{WATCH_APP_NAME}' already exists — skipping."
  exit 0
end

# ── 1. Copy Swift source files into ios/GolfSumWatch/ ─────────────────────

watch_ios_dir = File.join('ios', WATCH_APP_NAME)
watch_src_dir = File.join(File.dirname(__FILE__), '..', 'watch-src')

FileUtils.mkdir_p(watch_ios_dir)

%w[GolfSumWatchApp.swift ContentView.swift WatchSessionManager.swift].each do |file|
  src = File.join(watch_src_dir, file)
  dst = File.join(watch_ios_dir, file)
  if File.exist?(src)
    FileUtils.cp(src, dst)
    puts "[WatchPlugin] Copied #{file}"
  else
    abort("ERROR: Missing watch source file: #{src}")
  end
end

# ── 2. Write Info.plist ───────────────────────────────────────────────────────

info_plist_content = <<~XML
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0">
  <dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>$(DEVELOPMENT_LANGUAGE)</string>
    <key>CFBundleDisplayName</key>
    <string>GolfSum</string>
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    <key>CFBundleIdentifier</key>
    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>$(PRODUCT_NAME)</string>
    <key>CFBundlePackageType</key>
    <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
    <key>CFBundleShortVersionString</key>
    <string>$(MARKETING_VERSION)</string>
    <key>CFBundleVersion</key>
    <string>$(CURRENT_PROJECT_VERSION)</string>
    <key>WKApplication</key>
    <true/>
  </dict>
  </plist>
XML

File.write(File.join(watch_ios_dir, 'Info.plist'), info_plist_content)
puts "[WatchPlugin] Wrote Info.plist"

# ── 3. Write entitlements for both targets ───────────────────────────────────

entitlements_content = <<~XML
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0">
  <dict>
    <key>com.apple.security.application-groups</key>
    <array>
      <string>#{APP_GROUP_ID}</string>
    </array>
  </dict>
  </plist>
XML

File.write(File.join(watch_ios_dir, "#{WATCH_APP_NAME}.entitlements"), entitlements_content)
puts "[WatchPlugin] Wrote Watch entitlements"

# Also write entitlements for the iPhone app if not already there
iphone_entitlements_path = File.join('ios', MAIN_APP_NAME, "#{MAIN_APP_NAME}.entitlements")
unless File.exist?(iphone_entitlements_path)
  File.write(iphone_entitlements_path, entitlements_content)
  puts "[WatchPlugin] Wrote iPhone entitlements"
end

# ── 4. Copy native bridge ObjC files into iPhone target dir ─────────────────

bridge_dst_dir = File.join('ios', MAIN_APP_NAME)
bridge_src_dir = File.join(File.dirname(__FILE__), '..', 'watch-src', 'bridge')

if File.directory?(bridge_src_dir)
  %w[GolfSumWatchBridge.h GolfSumWatchBridge.m].each do |file|
    src = File.join(bridge_src_dir, file)
    dst = File.join(bridge_dst_dir, file)
    if File.exist?(src)
      FileUtils.cp(src, dst) unless File.exist?(dst)
      puts "[WatchPlugin] Bridge file ready: #{file}"
    end
  end
end

# ── 5. Create Watch App target in Xcode project ───────────────────────────────

puts "[WatchPlugin] Creating Watch App target..."

watch_target = project.new_target(
  :watch2_app,
  WATCH_APP_NAME,
  :watchos,
  WATCH_DEPLOY_TARGET
)

# ── 6. Configure build settings ───────────────────────────────────────────────

watch_target.build_configurations.each do |config|
  s = config.build_settings

  s['PRODUCT_BUNDLE_IDENTIFIER']    = WATCH_BUNDLE_ID
  s['PRODUCT_NAME']                  = WATCH_APP_NAME
  s['SWIFT_VERSION']                 = SWIFT_VERSION
  s['WATCHOS_DEPLOYMENT_TARGET']     = WATCH_DEPLOY_TARGET
  s['TARGETED_DEVICE_FAMILY']        = '4'
  s['SDKROOT']                       = 'watchos'
  s['SUPPORTED_PLATFORMS']           = 'watchos watchsimulator'
  s['INFOPLIST_FILE']                = "#{WATCH_APP_NAME}/Info.plist"
  s['CODE_SIGN_STYLE']               = 'Automatic'
  s['DEVELOPMENT_TEAM']              = '$(DEVELOPMENT_TEAM)'
  s['MARKETING_VERSION']             = '1.0'
  s['CURRENT_PROJECT_VERSION']       = '1'
  s['GENERATE_INFOPLIST_FILE']       = 'NO'
  s['ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES'] = 'NO'
  s['CODE_SIGN_ENTITLEMENTS']        = "#{WATCH_APP_NAME}/#{WATCH_APP_NAME}.entitlements"

  if config.name == 'Debug'
    s['DEBUG_INFORMATION_FORMAT']    = 'dwarf'
    s['SWIFT_OPTIMIZATION_LEVEL']    = '-Onone'
    s['SWIFT_ACTIVE_COMPILATION_CONDITIONS'] = 'DEBUG'
  else
    s['DEBUG_INFORMATION_FORMAT']    = 'dwarf-with-dsym'
    s['SWIFT_OPTIMIZATION_LEVEL']    = '-O'
    s['VALIDATE_PRODUCT']            = 'YES'
  end
end

# ── 7. Add Swift source files to Watch target ─────────────────────────────────

# Create a group for the watch app in the Xcode navigator
watch_group = project.main_group.new_group(WATCH_APP_NAME, WATCH_APP_NAME)

swift_files = %w[GolfSumWatchApp.swift ContentView.swift WatchSessionManager.swift]

swift_files.each do |file|
  file_ref = watch_group.new_reference(file)
  file_ref.last_known_file_type = 'sourcecode.swift'
  watch_target.add_file_references([file_ref])
end

# Add Info.plist to group (not to build phases)
watch_group.new_reference('Info.plist')
watch_group.new_reference("#{WATCH_APP_NAME}.entitlements")

puts "[WatchPlugin] Added #{swift_files.length} Swift files to Watch target"

# ── 8. Add ObjC bridge files to iPhone target ────────────────────────────────

main_target = project.targets.find { |t| t.name == MAIN_APP_NAME }
abort("ERROR: Could not find main target '#{MAIN_APP_NAME}'") unless main_target

main_group = project.main_group.find_subpath(MAIN_APP_NAME, false)

if main_group
  bridge_files = %w[GolfSumWatchBridge.h GolfSumWatchBridge.m]
  bridge_files.each do |file|
    file_path = File.join('ios', MAIN_APP_NAME, file)
    next unless File.exist?(file_path)

    # Check if already referenced
    already_referenced = project.files.any? { |f| f.path&.include?(file) }
    next if already_referenced

    file_ref = main_group.new_reference(file)
    file_ref.last_known_file_type = file.end_with?('.h') ? 'sourcecode.c.h' : 'sourcecode.c.objc'

    # Only .m files go in Sources build phase
    if file.end_with?('.m')
      sources_phase = main_target.source_build_phase
      sources_phase.add_file_reference(file_ref)
    end
    puts "[WatchPlugin] Added bridge file: #{file}"
  end
end

# ── 9. Add iPhone app entitlements to build settings ─────────────────────────

main_target.build_configurations.each do |config|
  existing = config.build_settings['CODE_SIGN_ENTITLEMENTS']
  unless existing
    config.build_settings['CODE_SIGN_ENTITLEMENTS'] = "#{MAIN_APP_NAME}/#{MAIN_APP_NAME}.entitlements"
  end
end

# ── 10. Wire Watch App as dependency + embed in iPhone target ─────────────────

# Add target dependency
main_target.add_dependency(watch_target)
puts "[WatchPlugin] Added Watch target dependency to #{MAIN_APP_NAME}"

# Create embed Watch Content copy files phase
embed_phase = main_target.new_copy_files_build_phase('Embed Watch Content')
embed_phase.symbol_dst_subfolder_spec = :wrapper
embed_phase.dst_path = '$(CONTENTS_FOLDER_PATH)/Watch'

# Add watch app product to embed phase
watch_product_ref = watch_target.product_reference
if watch_product_ref
  build_file = embed_phase.add_file_reference(watch_product_ref)
  build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
  puts "[WatchPlugin] Embed Watch Content phase configured"
else
  puts "[WatchPlugin] WARNING: Could not find Watch product reference for embed phase"
end

# ── 11. Save project ─────────────────────────────────────────────────────────

project.save
puts "[WatchPlugin] Xcode project saved successfully"
puts "[WatchPlugin] Watch target '#{WATCH_APP_NAME}' added with bundle ID: #{WATCH_BUNDLE_ID}"
