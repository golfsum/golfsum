const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withSwiftConcurrency(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        'Podfile'
      );
      let contents = fs.readFileSync(podfilePath, 'utf-8');

      const injection = `
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |cfg|
        cfg.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'
        unless ['ExpoModulesCore', 'ExpoUI'].include?(target.name)
          cfg.build_settings['SWIFT_VERSION'] = '5'
        end
      end
    end`;

      if (!contents.includes('SWIFT_STRICT_CONCURRENCY')) {
        contents = contents.replace(
          /post_install do \|installer\|/,
          `post_install do |installer|${injection}`
        );
        fs.writeFileSync(podfilePath, contents);
      }

      return config;
    },
  ]);
};