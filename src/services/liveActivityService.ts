import { NativeModules, Platform } from 'react-native';

type LiveActivityPayload = {
  courseName: string;
  teeLabel: string;
  holeNumber: number;
  frontYards: string;
  centerYards: string;
  backYards: string;
};

type LiveActivityModule = {
  isSupported?: () => Promise<boolean>;
  upsert?: (
    courseName: string,
    teeLabel: string,
    holeNumber: number,
    frontYards: string,
    centerYards: string,
    backYards: string
  ) => Promise<boolean>;
  end?: () => Promise<boolean>;
};

const moduleRef = NativeModules.GolfSumLiveActivityBridge as LiveActivityModule | undefined;

export async function isLiveActivitySupported(): Promise<boolean> {
  if (Platform.OS !== 'ios' || !moduleRef?.isSupported) return false;
  try {
    return await moduleRef.isSupported();
  } catch {
    return false;
  }
}

export async function upsertLiveActivity(payload: LiveActivityPayload): Promise<boolean> {
  if (Platform.OS !== 'ios' || !moduleRef?.upsert) return false;
  try {
    return await moduleRef.upsert(
      payload.courseName,
      payload.teeLabel,
      payload.holeNumber,
      payload.frontYards,
      payload.centerYards,
      payload.backYards
    );
  } catch {
    return false;
  }
}

export async function endLiveActivity(): Promise<boolean> {
  if (Platform.OS !== 'ios' || !moduleRef?.end) return false;
  try {
    return await moduleRef.end();
  } catch {
    return false;
  }
}
