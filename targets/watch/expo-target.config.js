/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'watch',
  name: 'GolfSumWatch',
  bundleIdentifier: 'com.golfsum.app.watch',
  icon: 'https://avatars.githubusercontent.com/u/241658053?s=96&v=4',
  colors: { $accent: 'darkcyan' },
  deploymentTarget: '9.4',
  entitlements: {
    'com.apple.security.application-groups': ['group.com.golfsum.app'],
  },
});