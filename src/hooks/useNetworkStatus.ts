import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

type NetworkStatus = {
  isOffline: boolean;
  isConnected: boolean | null;
};

export const useNetworkStatus = (): NetworkStatus => {
  const [status, setStatus] = useState<NetworkStatus>({
    isOffline: false,
    isConnected: true,
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const updateStatus = () => {
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
      setStatus({
        isOffline: !isOnline,
        isConnected: isOnline,
      });
    };

    updateStatus();
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);

    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
    };
  }, []);

  return status;
};
