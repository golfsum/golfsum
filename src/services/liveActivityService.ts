export type LiveActivityPayload = {
  courseName: string;
  teeLabel: string;
  holeNumber: number;
  frontYards: string;
  centerYards: string;
  backYards: string;
};

/** Live Activities / widget extension removed; native bridge is not available. */
export async function isLiveActivitySupported(): Promise<boolean> {
  return false;
}

export async function upsertLiveActivity(_payload: LiveActivityPayload): Promise<boolean> {
  return false;
}

export async function endLiveActivity(): Promise<boolean> {
  return false;
}
