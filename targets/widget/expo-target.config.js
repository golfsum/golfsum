/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'GolfSumLiveActivity',
  bundleIdentifier: 'com.golfsum.app.LiveActivity',
  icon: 'https://github.com/expo.png',
  entitlements: {
    'com.apple.security.application-groups': ['group.com.golfsum.app'],
  },
});