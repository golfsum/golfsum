// ============================================================================
// CRITICAL: Crypto Polyfill - MUST be imported FIRST before ANY other code
// This ensures Firebase and other libraries can use crypto.subtle
// ============================================================================

const globalObject =
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof global !== 'undefined'
      ? global
      : this;

if (!globalObject.self) {
  globalObject.self = globalObject;
}

if (!globalObject.window) {
  globalObject.window = globalObject;
}

const cryptoContainer =
  globalObject.crypto && typeof globalObject.crypto === 'object' ? globalObject.crypto : {};

const attachCrypto = (target) => {
  if (!target) return;
  try {
    Object.defineProperty(target, 'crypto', {
      configurable: true,
      get: () => cryptoContainer,
      set: (value) => {
        if (!value) {
          try {
            console.warn('⚠️ crypto overwritten with falsy value');
            console.warn(new Error('crypto setter stack').stack);
          } catch (error) {
            console.warn('⚠️ crypto overwritten with falsy value');
          }
          return;
        }
        if (value !== cryptoContainer) {
          Object.assign(cryptoContainer, value);
        }
      },
    });
  } catch (error) {
    target.crypto = cryptoContainer;
  }
};

attachCrypto(globalObject);
attachCrypto(globalObject.self);
attachCrypto(globalObject.window);
if (typeof global !== 'undefined') {
  attachCrypto(global);
}

if (!cryptoContainer.subtle) {
  const { sha1 } = require('@noble/hashes/legacy.js');
  const { sha256, sha384, sha512 } = require('@noble/hashes/sha2.js');
  cryptoContainer.subtle = {
    digest: async (algorithm, data) => {
      const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
      const algo = name?.toUpperCase?.() || 'SHA-256';
      const bytes = new Uint8Array(data);
      let hash;
      switch (algo) {
        case 'SHA-1':
          hash = sha1(bytes);
          break;
        case 'SHA-384':
          hash = sha384(bytes);
          break;
        case 'SHA-512':
          hash = sha512(bytes);
          break;
        case 'SHA-256':
        default:
          hash = sha256(bytes);
          break;
      }
      return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength);
    },
  };
}

require('react-native-get-random-values');

attachCrypto(globalObject);
attachCrypto(globalObject.self);
attachCrypto(globalObject.window);
if (typeof global !== 'undefined') {
  attachCrypto(global);
}

if (!cryptoContainer.subtle) {
  const { sha1 } = require('@noble/hashes/legacy.js');
  const { sha256, sha384, sha512 } = require('@noble/hashes/sha2.js');
  cryptoContainer.subtle = {
    digest: async (algorithm, data) => {
      const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
      const algo = name?.toUpperCase?.() || 'SHA-256';
      const bytes = new Uint8Array(data);
      let hash;
      switch (algo) {
        case 'SHA-1':
          hash = sha1(bytes);
          break;
        case 'SHA-384':
          hash = sha384(bytes);
          break;
        case 'SHA-512':
          hash = sha512(bytes);
          break;
        case 'SHA-256':
        default:
          hash = sha256(bytes);
          break;
      }
      return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength);
    },
  };
}

console.log('✅ Crypto polyfill initialized');
console.log('   crypto:', !!cryptoContainer);
console.log('   crypto.subtle:', !!cryptoContainer.subtle);
console.log('   crypto.getRandomValues:', !!cryptoContainer.getRandomValues);

const errorUtils = globalObject.ErrorUtils;
if (errorUtils && typeof errorUtils.setGlobalHandler === 'function') {
  const previousHandler =
    typeof errorUtils.getGlobalHandler === 'function' ? errorUtils.getGlobalHandler() : null;
  errorUtils.setGlobalHandler((error, isFatal) => {
    try {
      console.error('❌ Global error captured:', error?.message);
      console.error(error?.stack || error);
      console.error('🔐 Crypto snapshot:', {
        hasCrypto: !!cryptoContainer,
        hasSubtle: !!cryptoContainer?.subtle,
        hasGetRandomValues: !!cryptoContainer?.getRandomValues,
      });
    } catch (handlerError) {
      console.error('❌ Global error captured (logging failed)');
    }
    if (typeof previousHandler === 'function') {
      previousHandler(error, isFatal);
    }
  });
}
