#!/usr/bin/env ruby
# scripts/add_watch_target.rb
# Adds Watch + Widget targets with explicit product references

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
project = Xcodeproj::Project.open(project_path)
main_target = project.targets.find { |t| t.name == MAIN_APP_NAME }
abort("ERROR: No target '#{MAIN_APP_NAME}'") unless main_target

SCRIPT_DIR   = File.expand_path(File.dirname(__FILE__))
PROJECT_ROOT = File.expand_path('..', SCRIPT_DIR)
IOS_DIR      = Dir.pwd  # we run from ios/

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

def entitlements(app_group, extra = '')
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

# ── Copy source files ────────────────────────────────────────────────────────

watch_dir = File.join(IOS_DIR, WATCH_APP_NAME)
la_dir    = File.join(IOS_DIR, LIVE_ACTIVITY_NAME)
main_dir  = File.join(IOS_DIR, MAIN_APP_NAME)

FileUtils.mkdir_p(watch_dir)
FileUtils.mkdir_p(la_dir)

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

# Plists + entitlements
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
write_file(File.join(watch_dir, "#{WATCH_APP_NAME}.entitlements"), entitlements(APP_GROUP_ID))
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
write_file(File.join(la_dir, "#{LIVE_ACTIVITY_NAME}.entitlements"),
  entitlements(APP_GROUP_ID, '<key>com.apple.developer.live-activities</key><true/>'))
write_file(File.join(main_dir, "#{MAIN_APP_NAME}.entitlements"),
  entitlements(APP_GROUP_ID, '<key>com.apple.developer.live-activities</key><true/>'))

# ── Helper: add target ───────────────────────────────────────────────────────

def add_target(project, name, product_type, platform, deploy, bundle_id, settings_extra = {})
  target = project.new_target(product_type, name, platform, deploy)
  dir    = File.join(Dir.pwd, name)

  group = project.main_group.find_subpath(name) ||
          project.main_group.new_group(name, name)

  # Add Swift source files
  Dir.glob(File.join(dir, '*.swift')).each do |f|
    fname = File.basename(f)
    existing = group.files.find { |r| r.path == fname }
    ref = existing || group.new_reference(fname)
    ref.last_known_file_type = 'sourcecode.swift'
    unless target.source_build_phase.files_references.include?(ref)
      target.add_file_references([ref])
    end
  end

  # Reference plists without compiling
  ['Info.plist', "#{name}.entitlements"].each do |meta|
    if File.exist?(File.join(dir, meta)) && !group.files.find { |r| r.path == meta }
      group.new_reference(meta)
    end
  end

  # Build settings
  target.build_configurations.each do |c|
    c.build_settings.merge!({
      'PRODUCT_BUNDLE_IDENTIFIER'    => bundle_id,
      'SWIFT_VERSION'                => SWIFT_VERSION,
      'CODE_SIGN_STYLE'              => 'Automatic',
      'MARKETING_VERSION'            => '1.0',
      'CURRENT_PROJECT_VERSION'      => '1',
      'INFOPLIST_FILE'               => "#{name}/Info.plist",
      'CODE_SIGN_ENTITLEMENTS'       => "#{name}/#{name}.entitlements",
    }.merge(settings_extra))
  end

  target
end

# ── Helper: create explicit product reference ────────────────────────────────
# This is the critical fix — product_reference is nil before first build,
# so we create a PBXFileReference for the .app product manually.

def create_product_ref(project, name, file_type)
  products_group = project.products_group
  existing = products_group.files.find { |f| f.path == "#{name}.app" }
  return existing if existing

  ref = products_group.new_reference("#{name}.app")
  ref.explicit_file_type   = file_type
  ref.include_in_index     = '0'
  ref.source_tree          = 'BUILT_PRODUCTS_DIR'
  ref
end

# ── Helper: create appex product reference ───────────────────────────────────

def create_appex_ref(project, name)
  products_group = project.products_group
  existing = products_group.files.find { |f| f.path == "#{name}.appex" }
  return existing if existing

  ref = products_group.new_reference("#{name}.appex")
  ref.explicit_file_type   = 'plug-in'
  ref.include_in_index     = '0'
  ref.source_tree          = 'BUILT_PRODUCTS_DIR'
  ref
end

# ── 1. WATCH TARGET ──────────────────────────────────────────────────────────

unless project.targets.any? { |t| t.name == WATCH_APP_NAME }
  watch_target = add_target(
    project, WATCH_APP_NAME, :watch2_app, :watchos, WATCH_DEPLOY_TARGET,
    WATCH_BUNDLE_ID,
    'WATCHOS_DEPLOYMENT_TARGET'    => WATCH_DEPLOY_TARGET,
    'TARGETED_DEVICE_FAMILY'       => '4',
    'SDKROOT'                      => 'watchos',
    'SUPPORTED_PLATFORMS'          => 'watchos watchsimulator',
    'ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES' => 'NO'
  )

  # Create explicit product reference
  watch_product_ref = create_product_ref(project, WATCH_APP_NAME, 'com.apple.product-type.application')
  watch_target.product_reference = watch_product_ref

  # Dependency
  main_target.add_dependency(watch_target)

  # Embed Watch Content phase with explicit product ref
  embed = main_target.new_copy_files_build_phase('Embed Watch Content')
  embed.symbol_dst_subfolder_spec = :wrapper
  embed.dst_path = '$(CONTENTS_FOLDER_PATH)/Watch'
  bf = embed.add_file_reference(watch_product_ref)
  bf.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

  puts "[Plugin] Watch target added with explicit product reference"
else
  puts "[Plugin] Watch target exists — sources synced"
end

# ── 2. LIVE ACTIVITY + WIDGET TARGET ─────────────────────────────────────────

unless project.targets.any? { |t| t.name == LIVE_ACTIVITY_NAME }
  la_target = add_target(
    project, LIVE_ACTIVITY_NAME, :app_extension, :ios, IOS_DEPLOY_TARGET,
    LIVE_ACTIVITY_BUNDLE,
    'IPHONEOS_DEPLOYMENT_TARGET'      => IOS_DEPLOY_TARGET,
    'TARGETED_DEVICE_FAMILY'          => '1,2',
    'SDKROOT'                         => 'iphoneos',
    'APPLICATION_EXTENSION_API_ONLY'  => 'YES'
  )

  la_product_ref = create_appex_ref(project, LIVE_ACTIVITY_NAME)
  la_target.product_reference = la_product_ref

  main_target.add_dependency(la_target)

  embed_ext = main_target.new_copy_files_build_phase('Embed App Extensions')
  embed_ext.symbol_dst_subfolder_spec = :plug_ins
  bf = embed_ext.add_file_reference(la_product_ref)
  bf.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

  puts "[Plugin] Live Activity / Widget target added"
else
  puts "[Plugin] Live Activity target exists — sources synced"
end

# ── 3. Bridge files → main target ────────────────────────────────────────────

main_group = project.main_group.find_subpath(MAIN_APP_NAME)
sources    = main_target.source_build_phase

if main_group
  %w[GolfSumWatchBridge.m GolfSumLiveActivityBridge.m GolfSumLiveActivityManager.swift GolfSumWidgetBridge.swift].each do |f|
    next unless File.exist?(File.join(IOS_DIR, MAIN_APP_NAME, f))
    next if project.files.any? { |pf| (pf.path || '').end_with?(f) }
    ref = main_group.new_reference(f)
    ref.last_known_file_type = f.end_with?('.swift') ? 'sourcecode.swift' : 'sourcecode.c.objc'
    sources.add_file_reference(ref)
    puts "[Plugin] Bridge → main: #{f}"
  end
end

# ── 4. Main app entitlements build setting ────────────────────────────────────

main_target.build_configurations.each do |c|
  c.build_settings['CODE_SIGN_ENTITLEMENTS'] ||= "#{MAIN_APP_NAME}/#{MAIN_APP_NAME}.entitlements"
end

# ── 5. Save ───────────────────────────────────────────────────────────────────

project.save
puts "[Plugin] Done — Watch + Widget targets saved"