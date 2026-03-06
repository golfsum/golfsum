const { withXcodeProject } = require('@expo/config-plugins');

module.exports = function withWatchApp(config) {
  return withXcodeProject(config, function(config) {
    const xcodeProject = config.modResults;
    const watchAppName = 'GolfSum Watch App';

    // Find the Watch target if it exists
    const targets = xcodeProject.pbxNativeTargetSection();
    var watchTarget = null;
    for (var key in targets) {
      if (targets[key].name === watchAppName) {
        watchTarget = key;
        break;
      }
    }

    if (!watchTarget) {
      return config;
    }

    // Fix Swift version on all build configurations
    const buildConfigs = xcodeProject.pbxXCBuildConfigurationSection();
    for (var key in buildConfigs) {
      var config2 = buildConfigs[key];
      if (typeof config2 === 'object' && config2.buildSettings) {
        var settings = config2.buildSettings;
        // Only fix Watch target configs
        if (settings.PRODUCT_NAME === '"' + watchAppName + '"' ||
            settings.PRODUCT_NAME === watchAppName) {
          settings.SWIFT_VERSION = '5.0';
          settings.WATCHOS_DEPLOYMENT_TARGET = '9.0';
          settings.TARGETED_DEVICE_FAMILY = '4';
          settings.SDKROOT = 'watchos';
          settings.SUPPORTED_PLATFORMS = 'watchos watchsimulator';
        }
      }
    }

    return config;
  });
};