export const touchTargets = {
  minimum: 44,
  comfortable: 48,
  large: 56,
};

export const ensureTouchTarget = (size: number): number =>
  Math.max(size, touchTargets.minimum);
