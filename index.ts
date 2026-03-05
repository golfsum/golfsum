// ============================================================================
// CRITICAL: Import crypto polyfill FIRST before ANY other imports
// This ensures Firebase and other libraries can use crypto.subtle
// ============================================================================
import './crypto-polyfill.js';
import { installFetchTimeout } from './src/utils/installFetchTimeout';

// ============================================================================
// NOW it's safe to import and run the app
// ============================================================================

import { registerRootComponent } from 'expo';
import App from './App';

installFetchTimeout();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

