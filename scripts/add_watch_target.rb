#!/usr/bin/env ruby
# scripts/add_watch_target.rb
# v4 — sets PRODUCT_NAME before product reference creation to avoid empty .app path

require 'xcodeproj'
require 'fileutils'

MAIN_APP_NAME        = 'GolfSum'
WATCH_APP_NAME       = 'GolfSumWatch'
LIVE_ACTIVITY_NAME   = 'GolfSumLiveActivity'
WATCH_BUNDLE_ID      = 'com.golfsum.app.watchkitapp'
LIVE_ACTIVITY_BUNDLE = 'com.golfsum.app.liveactivity'
WATCH_DEPLOY_TARGET  = '7.0'
IOS_DEPLOY_TARGET    = '16.2'
SWIFT_VERSION        = '5.9'
APP_GROUP_ID         = 'group.com.golfsum.app'

project_path = Dir.glob('*.xcodeproj').first
abort('ERROR: No .xcodeproj found. Run from ios/ directory.') unless project_path

puts "[Plugin] Opening #{project_path}"
project     = Xcodeproj::Project.open(project_path)
main_target = project.targets.find { |t| t.name == MAIN_APP_NAME }
abort("ERROR: No target '#{MAIN_APP_NAME}'") unless main_target

SCRIPT_DIR   = File.expand_path(File.dirname(__FILE__))
PROJECT_ROOT = File.expand_path('..', SCRIPT_DIR)
IOS_DIR      = Dir.pwd

# ── Helpers ───────────────────────────────────────────────────────────────────

def copy_if_changed(src, dst)
  return unless File.exist?(src)
  FileUtils.mkdir_p(File.dirname(dst))
  content = File.read(src)
  return if File.exist?(dst) && File.read(dst) == content
  File.write(dst, content)
  puts "[Plugin] Copied: #{File.basename(dst)}"
end

def write_file(path, content)
  FileUtils.mkdir_p(File.dirname(path))
  return if File.exist?(path) && File.read(path) == content
  File.write(path, content)
  puts "[Plugin] Wrote: #{File.basename(path)}"
end

def entitlements_plist(app_group, extra = '')
  <<~XML
    <?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
    <plist version="1.0"><dict>
      <key>com.apple.security.application-groups</key>
      <array><string>#{app_group}</string></array>
      #{extra}
    </dict></plist>
  XML
end

# ── Copy sources ───────────────────────────────────────────────────────────────

watch_dir = File.join(IOS_DIR, WATCH_APP_NAME)
la_dir    = File.join(IOS_DIR, LIVE_ACTIVITY_NAME)
main_dir  = File.join(IOS_DIR, MAIN_APP_NAME)

FileUtils.mkdir_p([watch_dir, la_dir])

%w[GolfSumWatchApp.swift ContentView.swift WatchSessionManager.swift].each do |f|
  copy_if_changed(File.join(PROJECT_ROOT, 'watch-src', f), File.join(watch_dir, f))
end
%w[GolfSumWatchBridge.h GolfSumWatchBridge.m].each do |f|
  copy_if_changed(File.join(PROJECT_ROOT, 'watch-src', 'bridge', f), File.join(main_dir, f))
end
%w[GolfSumLiveActivityAttributes.swift GolfSumLiveActivity.swift GolfSumWidget.swift GolfSumLiveActivityBundle.swift].each do |f|
  copy_if_changed(File.join(PROJECT_ROOT, 'live-activity-src', f), File.join(la_dir, f))
end
%w[GolfSumLiveActivityBridge.h GolfSumLiveActivityBridge.m GolfSumLiveActivityManager.swift GolfSumWidgetBridge.swift].each do |f|
  copy_if_changed(File.join(PROJECT_ROOT, 'live-activity-src', 'bridge', f), File.join(main_dir, f))
end

# Info.plist files
write_file(File.join(watch_dir, 'Info.plist'), <<~XML)
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0"><dict>
    <key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    <key>CFBundleVersion</key><string>$(CURRENT_PROJECT_VERSION)</string>
    <key>CFBundleShortVersionString</key><string>$(MARKETING_VERSION)</string>
    <key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>
    <key>CFBundlePackageType</key><string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
    <key>WKApplication</key><true/>
  </dict></plist>
XML

write_file(File.join(la_dir, 'Info.plist'), <<~XML)
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0"><dict>
    <key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    <key>CFBundleVersion</key><string>$(CURRENT_PROJECT_VERSION)</string>
    <key>CFBundleShortVersionString</key><string>$(MARKETING_VERSION)</string>
    <key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>
    <key>CFBundlePackageType</key><string>XPC!</string>
    <key>NSExtension</key><dict>
      <key>NSExtensionPointIdentifier</key><string>com.apple.widgetkit-extension</string>
    </dict>
  </dict></plist>
XML

write_file(File.join(watch_dir, "#{WATCH_APP_NAME}.entitlements"),
  entitlements_plist(APP_GROUP_ID))
write_file(File.join(la_dir, "#{LIVE_ACTIVITY_NAME}.entitlements"),
  entitlements_plist(APP_GROUP_ID, '<key>com.apple.developer.live-activities</key><true/>'))
write_file(File.join(main_dir, "#{MAIN_APP_NAME}.entitlements"),
  entitlements_plist(APP_GROUP_ID, '<key>com.apple.developer.live-activities</key><true/>'))

# ── Add sources to a target ───────────────────────────────────────────────────

def add_swift_sources(project, target, dir, files)
  group = project.main_group.find_subpath(File.basename(dir)) ||
          project.main_group.new_group(File.basename(dir), File.basename(dir))

  files.each do |f|
    next unless File.exist?(File.join(dir, f))
    existing = group.files.find { |r| r.path == f }
    ref = existing || group.new_reference(f)
    ref.last_known_file_type = 'sourcecode.swift'
    unless target.source_build_phase.files_references.include?(ref)
      target.add_file_references([ref])
    end
  end

  # Non-compiled files
  ['Info.plist', "#{File.basename(dir)}.entitlements"].each do |meta|
    next unless File.exist?(File.join(dir, meta))
    group.new_reference(meta) unless group.files.any? { |r| r.path == meta }
  end
end

# ── 1. WATCH TARGET ──────────────────────────────────────────────────────────

unless project.targets.any? { |t| t.name == WATCH_APP_NAME }
  puts "[Plugin] Creating Watch target..."

  # Create target — new_target also creates a product reference internally
  watch_target = project.new_target(
    :watch2_app,
    WATCH_APP_NAME,
    :watchos,
    WATCH_DEPLOY_TARGET
  )

  # Set build settings FIRST — PRODUCT_NAME must be set before we use product_reference
  watch_target.build_configurations.each do |c|
    c.build_settings.merge!(
      'PRODUCT_NAME'                 => WATCH_APP_NAME,
      'PRODUCT_BUNDLE_IDENTIFIER'    => WATCH_BUNDLE_ID,
      'SWIFT_VERSION'                => SWIFT_VERSION,
      'WATCHOS_DEPLOYMENT_TARGET'    => WATCH_DEPLOY_TARGET,
      'TARGETED_DEVICE_FAMILY'       => '4',
      'SDKROOT'                      => 'watchos',
      'SUPPORTED_PLATFORMS'          => 'watchos watchsimulator',
      'INFOPLIST_FILE'               => "#{WATCH_APP_NAME}/Info.plist",
      'CODE_SIGN_STYLE'              => 'Automatic',
      'MARKETING_VERSION'            => '1.0',
      'CURRENT_PROJECT_VERSION'      => '1',
      'CODE_SIGN_ENTITLEMENTS'       => "#{WATCH_APP_NAME}/#{WATCH_APP_NAME}.entitlements",
      'ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES' => 'NO',
      'SKIP_INSTALL'                 => 'NO',
    )
  end

  # Fix the product reference that new_target created — set explicit path and type
  if watch_target.product_reference
    watch_target.product_reference.path            = "#{WATCH_APP_NAME}.app"
    watch_target.product_reference.explicit_file_type = 'wrapper.watchkit-app'
    watch_target.product_reference.include_in_index   = '0'
    watch_target.product_reference.source_tree        = 'BUILT_PRODUCTS_DIR'
    puts "[Plugin] Fixed Watch product reference: #{WATCH_APP_NAME}.app"
  else
    # Fallback: create manually
    ref = project.products_group.new_reference("#{WATCH_APP_NAME}.app")
    ref.explicit_file_type = 'wrapper.watchkit-app'
    ref.include_in_index   = '0'
    ref.source_tree        = 'BUILT_PRODUCTS_DIR'
    watch_target.product_reference = ref
    puts "[Plugin] Created Watch product reference: #{WATCH_APP_NAME}.app"
  end

  add_swift_sources(project, watch_target, watch_dir,
    %w[GolfSumWatchApp.swift ContentView.swift WatchSessionManager.swift])

  # Wire dependency and embed phase
  main_target.add_dependency(watch_target)

  embed = main_target.new_copy_files_build_phase('Embed Watch Content')
  embed.symbol_dst_subfolder_spec = :wrapper
  embed.dst_path = '$(CONTENTS_FOLDER_PATH)/Watch'
  bf = embed.add_file_reference(watch_target.product_reference)
  bf.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

  puts "[Plugin] Watch target added"
else
  # Sync sources even if target exists
  %w[GolfSumWatchApp.swift ContentView.swift WatchSessionManager.swift].each do |f|
    copy_if_changed(
      File.join(PROJECT_ROOT, 'watch-src', f),
      File.join(watch_dir, f)
    )
  end
  puts "[Plugin] Watch target exists — sources synced"
end

# ── 2. LIVE ACTIVITY + WIDGET TARGET ─────────────────────────────────────────

unless project.targets.any? { |t| t.name == LIVE_ACTIVITY_NAME }
  puts "[Plugin] Creating Live Activity / Widget target..."

  la_target = project.new_target(
    :app_extension,
    LIVE_ACTIVITY_NAME,
    :ios,
    IOS_DEPLOY_TARGET
  )

  la_target.build_configurations.each do |c|
    c.build_settings.merge!(
      'PRODUCT_NAME'                    => LIVE_ACTIVITY_NAME,
      'PRODUCT_BUNDLE_IDENTIFIER'       => LIVE_ACTIVITY_BUNDLE,
      'SWIFT_VERSION'                   => SWIFT_VERSION,
      'IPHONEOS_DEPLOYMENT_TARGET'      => IOS_DEPLOY_TARGET,
      'TARGETED_DEVICE_FAMILY'          => '1,2',
      'SDKROOT'                         => 'iphoneos',
      'INFOPLIST_FILE'                  => "#{LIVE_ACTIVITY_NAME}/Info.plist",
      'CODE_SIGN_STYLE'                 => 'Automatic',
      'MARKETING_VERSION'               => '1.0',
      'CURRENT_PROJECT_VERSION'         => '1',
      'CODE_SIGN_ENTITLEMENTS'          => "#{LIVE_ACTIVITY_NAME}/#{LIVE_ACTIVITY_NAME}.entitlements",
      'APPLICATION_EXTENSION_API_ONLY'  => 'YES',
      'SKIP_INSTALL'                    => 'YES',
    )
  end

  if la_target.product_reference
    la_target.product_reference.path            = "#{LIVE_ACTIVITY_NAME}.appex"
    la_target.product_reference.explicit_file_type = 'plug-in'
    la_target.product_reference.include_in_index   = '0'
    la_target.product_reference.source_tree        = 'BUILT_PRODUCTS_DIR'
    puts "[Plugin] Fixed Widget product reference: #{LIVE_ACTIVITY_NAME}.appex"
  else
    ref = project.products_group.new_reference("#{LIVE_ACTIVITY_NAME}.appex")
    ref.explicit_file_type = 'plug-in'
    ref.include_in_index   = '0'
    ref.source_tree        = 'BUILT_PRODUCTS_DIR'
    la_target.product_reference = ref
  end

  add_swift_sources(project, la_target, la_dir,
    %w[GolfSumLiveActivityAttributes.swift GolfSumLiveActivity.swift GolfSumWidget.swift GolfSumLiveActivityBundle.swift])

  main_target.add_dependency(la_target)

  embed_ext = main_target.new_copy_files_build_phase('Embed App Extensions')
  embed_ext.symbol_dst_subfolder_spec = :plug_ins
  bf = embed_ext.add_file_reference(la_target.product_reference)
  bf.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

  puts "[Plugin] Live Activity / Widget target added"
else
  puts "[Plugin] Live Activity target exists — sources synced"
end

# ── 3. Bridge files → main target Sources ────────────────────────────────────

main_group = project.main_group.find_subpath(MAIN_APP_NAME)
sources    = main_target.source_build_phase

if main_group
  bridge_files = %w[
    GolfSumWatchBridge.m
    GolfSumLiveActivityBridge.m
    GolfSumLiveActivityManager.swift
    GolfSumWidgetBridge.swift
  ]
  bridge_files.each do |f|
    next unless File.exist?(File.join(IOS_DIR, MAIN_APP_NAME, f))
    next if project.files.any? { |pf| (pf.path || '').end_with?(f) }
    ref = main_group.new_reference(f)
    ref.last_known_file_type = f.end_with?('.swift') ? 'sourcecode.swift' : 'sourcecode.c.objc'
    sources.add_file_reference(ref)
    puts "[Plugin] Bridge → main: #{f}"
  end
end

# ── 4. Main app entitlements ──────────────────────────────────────────────────

main_target.build_configurations.each do |c|
  c.build_settings['CODE_SIGN_ENTITLEMENTS'] ||=
    "#{MAIN_APP_NAME}/#{MAIN_APP_NAME}.entitlements"
end

# ── 5. Save ───────────────────────────────────────────────────────────────────

project.save
puts "[Plugin] Done — project saved successfully"