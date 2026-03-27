/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'watch',
  name: 'GolfSumWatch',
  bundleIdentifier: 'com.golfsum.app.watch',
  icon: 'https://github.com/expo.png',
  colors: { $accent: 'darkcyan' },
  deploymentTarget: '9.4',
  entitlements: {
    'com.apple.security.application-groups': ['group.com.golfsum.app'],
  },
});