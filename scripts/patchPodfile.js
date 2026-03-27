const fs = require('fs');
const path = require('path');

const podfilePath = path.join(__dirname, '..', 'ios', 'Podfile');
const marker = '# GolfSum: Force Swift versions';

if (!fs.existsSync(podfilePath)) {
  console.log('Podfile not found, skipping patch');
  process.exit(0);
}

let contents = fs.readFileSync(podfilePath, 'utf8');
if (contents.includes(marker)) {
  console.log('Podfile already patched, skipping');
  process.exit(0);
}

const patchBlock = [
  `  ${marker}`,
  "  installer.pods_project.targets.each do |target|",
  '    target.build_configurations.each do |cfg|',
  "      cfg.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'",
  "      if ['ExpoModulesCore', 'ExpoUI'].include?(target.name)",
  "        cfg.build_settings['SWIFT_VERSION'] = '6.0'",
  '      else',
  "        cfg.build_settings['SWIFT_VERSION'] = '5.0'",
  '      end',
  '    end',
  '  end',
].join('\n');

const postInstallRegex = /post_install do \|installer\|([\s\S]*?)^\s*end\s*$/m;
const match = contents.match(postInstallRegex);

if (match) {
  const replacement = match[0].replace(/\n\s*end\s*$/m, `\n${patchBlock}\nend`);
  contents = contents.replace(postInstallRegex, replacement);
} else {
  const fallbackInjection = [
    '',
    'post_install do |installer|',
    patchBlock,
    'end',
    '',
  ].join('\n');
  contents += fallbackInjection;
}

fs.writeFileSync(podfilePath, contents, 'utf8');
console.log('Podfile patched successfully');
