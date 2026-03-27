const { withPodfile } = require('@expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

const TAG = 'golfsum-swift-concurrency';

module.exports = function withSwiftConcurrency(config) {
  return withPodfile(config, (cfg) => {
    const RUBY_LINES = [
      '  installer.pods_project.targets.each do |target|',
      '    target.build_configurations.each do |cfg|',
      "      cfg.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'",
      '      # Strip -enable-upcoming-feature IsolatedDefaultValues: Swift 6 already enables SE-0411;',
      '      # passing it again fails with "already enabled as of Swift version 6".',
      "      of = cfg.build_settings['OTHER_SWIFT_FLAGS']",
      '      unless of.nil?',
      '        s = of.is_a?(Array) ? of.join(" ") : of.to_s',
      "        s = s.gsub(/-enable-upcoming-feature\\s+IsolatedDefaultValues\\s*/, ' ').gsub(/\\s+/, ' ').strip",
      "        cfg.build_settings['OTHER_SWIFT_FLAGS'] = s.empty? ? nil : s",
      '      end',
      "      if target.name == 'ExpoModulesCore'",
      "        cfg.build_settings['SWIFT_VERSION'] = '6.0'",
      "      elsif target.name == 'ExpoUI'",
      "        cfg.build_settings['SWIFT_VERSION'] = '5.0'",
      '      else',
      "        cfg.build_settings['SWIFT_VERSION'] = '5.0'",
      '      end',
      '    end',
      '  end',
    ];

    const RUBY_LINES_STR = RUBY_LINES.join('\n');

    const result = mergeContents({
      tag: TAG,
      src: cfg.modResults.contents,
      newSrc: RUBY_LINES_STR,
      anchor: /^\s*post_install do \|installer\|\s*$/m,
      offset: 1,
      comment: '#',
    });

    if (result.didMerge || result.didClear) {
      cfg.modResults.contents = result.contents;
    }

    return cfg;
  });
};
