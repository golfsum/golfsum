import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Storage from './storage';
import { logger } from '../utils/logger';
import type { NotificationPreferences, UserProfile } from '../types';
import {
  deactivatePushDeviceRegistration,
  upsertPushDeviceRegistration,
} from './userService';

const PUSH_INSTALLATION_ID_KEY = '@GolfSum:PushInstallationId';

export type NotificationRoutePayload = {
  screen?: string;
  tab?: string;
  roundId?: string;
  courseId?: string;
  source?: string;
};

let notificationsConfigured = false;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const getProjectId = (): string | null => {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId ||
    null;
  return typeof projectId === 'string' && projectId.trim() ? projectId : null;
};

const normalizePreferences = (
  profile?: Pick<UserProfile, 'notificationPreferences'> | null
): NotificationPreferences => ({
  pushEnabled: profile?.notificationPreferences?.pushEnabled === true,
  marketingEnabled: profile?.notificationPreferences?.marketingEnabled === true,
  maintenanceEnabled: profile?.notificationPreferences?.maintenanceEnabled !== false,
});

const normalizeRoutePayload = (
  data: Record<string, unknown> | null | undefined
): NotificationRoutePayload => {
  if (!data || typeof data !== 'object') return {};
  return {
    screen: typeof data.screen === 'string' ? data.screen : undefined,
    tab: typeof data.tab === 'string' ? data.tab : undefined,
    roundId: typeof data.roundId === 'string' ? data.roundId : undefined,
    courseId: typeof data.courseId === 'string' ? data.courseId : undefined,
    source: typeof data.source === 'string' ? data.source : undefined,
  };
};

async function getInstallationId(): Promise<string> {
  const existing = await Storage.getItem(PUSH_INSTALLATION_ID_KEY);
  if (existing) return existing;

  const created =
    typeof Crypto.randomUUID === 'function'
      ? Crypto.randomUUID()
      : `push-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await Storage.setItem(PUSH_INSTALLATION_ID_KEY, created);
  return created;
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250],
    lightColor: '#10B981',
  });
}

export async function getPushPermissionSnapshot(): Promise<Notifications.NotificationPermissionsStatus | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await Notifications.getPermissionsAsync();
  } catch (error) {
    logger.error('Failed to read notification permissions:', error);
    return null;
  }
}

export async function syncPushRegistrationForProfile(
  profile?: UserProfile | null,
  options?: { requestPermission?: boolean }
): Promise<{
  registered: boolean;
  prompted: boolean;
  permissionStatus: string;
  expoPushToken?: string | null;
}> {
  if (Platform.OS === 'web') {
    return { registered: false, prompted: false, permissionStatus: 'web' };
  }

  const projectId = getProjectId();
  if (!projectId) {
    logger.warn('Push notifications skipped: missing Expo project ID');
    return { registered: false, prompted: false, permissionStatus: 'missing-project-id' };
  }

  const installationId = await getInstallationId();
  const prefs = normalizePreferences(profile);
  const nowIso = new Date().toISOString();

  if (!prefs.pushEnabled) {
    await upsertPushDeviceRegistration({
      installationId,
      expoPushToken: null,
      status: 'disabled',
      permissionStatus: 'disabled',
      notificationsEnabled: false,
      marketingEnabled: prefs.marketingEnabled,
      maintenanceEnabled: prefs.maintenanceEnabled,
      platform: Platform.OS,
      projectId,
      deviceName: Device.deviceName ?? null,
      appVersion: Constants.expoConfig?.version ?? null,
      buildNumber:
        Constants.expoConfig?.ios?.buildNumber ??
        Constants.expoConfig?.android?.versionCode ??
        null,
      lastSeenAt: nowIso,
    });
    return { registered: false, prompted: false, permissionStatus: 'disabled' };
  }

  let permissions = await Notifications.getPermissionsAsync();
  let prompted = false;

  if (!permissions.granted && options?.requestPermission) {
    permissions = await Notifications.requestPermissionsAsync();
    prompted = true;
  }

  const permissionStatus = permissions.granted ? 'granted' : (permissions.status || 'undetermined');

  if (!permissions.granted) {
    await upsertPushDeviceRegistration({
      installationId,
      expoPushToken: null,
      status: 'denied',
      permissionStatus,
      notificationsEnabled: true,
      marketingEnabled: prefs.marketingEnabled,
      maintenanceEnabled: prefs.maintenanceEnabled,
      platform: Platform.OS,
      projectId,
      deviceName: Device.deviceName ?? null,
      appVersion: Constants.expoConfig?.version ?? null,
      buildNumber:
        Constants.expoConfig?.ios?.buildNumber ??
        Constants.expoConfig?.android?.versionCode ??
        null,
      lastSeenAt: nowIso,
    });
    return { registered: false, prompted, permissionStatus };
  }

  if (!Device.isDevice) {
    await upsertPushDeviceRegistration({
      installationId,
      expoPushToken: null,
      status: 'simulator',
      permissionStatus,
      notificationsEnabled: true,
      marketingEnabled: prefs.marketingEnabled,
      maintenanceEnabled: prefs.maintenanceEnabled,
      platform: Platform.OS,
      projectId,
      deviceName: Device.deviceName ?? null,
      appVersion: Constants.expoConfig?.version ?? null,
      buildNumber:
        Constants.expoConfig?.ios?.buildNumber ??
        Constants.expoConfig?.android?.versionCode ??
        null,
      lastSeenAt: nowIso,
    });
    return { registered: false, prompted, permissionStatus: 'simulator' };
  }

  await ensureAndroidChannel();
  const expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  await upsertPushDeviceRegistration({
    installationId,
    expoPushToken,
    status: 'active',
    permissionStatus,
    notificationsEnabled: true,
    marketingEnabled: prefs.marketingEnabled,
    maintenanceEnabled: prefs.maintenanceEnabled,
    platform: Platform.OS,
    projectId,
    deviceName: Device.deviceName ?? null,
    appVersion: Constants.expoConfig?.version ?? null,
    buildNumber:
      Constants.expoConfig?.ios?.buildNumber ??
      Constants.expoConfig?.android?.versionCode ??
      null,
    lastSeenAt: nowIso,
  });

  return { registered: true, prompted, permissionStatus, expoPushToken };
}

export async function deactivatePushRegistrationForCurrentUser(): Promise<void> {
  if (Platform.OS === 'web') return;
  const installationId = await getInstallationId();
  await deactivatePushDeviceRegistration(installationId);
}

export function initializePushNotifications(
  onOpen?: (payload: NotificationRoutePayload) => void
): () => void {
  if (Platform.OS === 'web') return () => {};
  if (notificationsConfigured) return () => {};

  notificationsConfigured = true;
  void ensureAndroidChannel().catch(() => undefined);

  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    onOpen?.(
      normalizeRoutePayload(
        response.notification.request.content.data as Record<string, unknown> | undefined
      )
    );
  });

  void Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (!response) return;
      onOpen?.(
        normalizeRoutePayload(
          response.notification.request.content.data as Record<string, unknown> | undefined
        )
      );
    })
    .catch((error) => logger.error('Failed to inspect initial notification response:', error));

  return () => {
    responseSub.remove();
    notificationsConfigured = false;
  };
}
