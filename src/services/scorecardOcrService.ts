import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export interface BackendScorecardHole {
  hole: number;
  par?: number | null;
  handicap_men?: number | null;
  handicap_women?: number | null;
  yardages_by_tee?: Record<string, number | null>;
}

export interface BackendScorecardPlayerHole {
  hole: number;
  score?: number | null;
  putts?: number | null;
  fairway?: boolean | null;
  green?: boolean | null;
  up_down?: boolean | null;
  penalties?: number | null;
}

export interface BackendScorecardPlayer {
  name?: string | null;
  date?: string | null;
  holes?: BackendScorecardPlayerHole[];
}

export interface BackendScorecardResponse {
  confidence: number;
  holes: BackendScorecardHole[];
  totals?: Record<string, number | null>;
  flags?: string[];
  metadata?: {
    tee_boxes?: string[];
    rating_men_by_tee?: Record<string, number>;
    slope_men_by_tee?: Record<string, number>;
    rating_women_by_tee?: Record<string, number>;
    slope_women_by_tee?: Record<string, number>;
  };
  player?: BackendScorecardPlayer | null;
}

const getBackendConfig = () => {
  const isUsableUrl = (value?: string) => {
    if (!value) return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    if (
      lower.includes('your-vercel') ||
      lower.includes('your-') ||
      lower.includes('placeholder')
    ) {
      return false;
    }
    return /^https?:\/\//i.test(trimmed);
  };

  const proxyUrl = process.env.EXPO_PUBLIC_OCR_PROXY_URL;
  const directUrl = process.env.EXPO_PUBLIC_SCORECARD_OCR_URL;
  const baseUrl = isUsableUrl(proxyUrl)
    ? proxyUrl!
    : isUsableUrl(directUrl)
    ? directUrl!
    : '';
  if (!baseUrl) {
    throw new Error('Scorecard scanning is not available in this build. Please try again later.');
  }
  return { baseUrl: baseUrl.replace(/\/+$/, '') };
};

const buildSignature = (timestamp: string, method: string, path: string, mode: string) => {
  const key = process.env.EXPO_PUBLIC_API_SIGNING_KEY;
  if (!key) return null;
  const payload = `${timestamp}.${method}.${path}.${mode}`;
  const sig = hmac(sha256, utf8ToBytes(key), utf8ToBytes(payload));
  return bytesToHex(sig);
};

export const parseScorecardWithBackend = async (
  imageUri: string,
  mode: 'course' | 'completed' = 'course'
): Promise<BackendScorecardResponse> => {
  const { baseUrl } = getBackendConfig();
  if (!baseUrl) {
    throw new Error('Scorecard OCR backend not configured');
  }

  const formData = new FormData();
  formData.append('image', {
    uri: imageUri,
    name: 'scorecard.jpg',
    type: 'image/jpeg',
  } as any);

  const controller = new AbortController();
  const timeoutMs = 180000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    const isProxyEndpoint = baseUrl.endsWith('/api/ocr');
    const endpoint = isProxyEndpoint
      ? `${baseUrl}?mode=${mode}`
      : `${baseUrl}/scorecard/parse?mode=${mode}`;
    const signaturePath = isProxyEndpoint ? '/api/ocr' : '/scorecard/parse';
    const timestamp = Date.now().toString();
    const signature = buildSignature(timestamp, 'POST', signaturePath, mode);
    const ocrApiKey = process.env.EXPO_PUBLIC_OCR_API_KEY || '';
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'X-GS-Timestamp': timestamp,
        ...(signature ? { 'X-GS-Signature': signature } : {}),
        ...(ocrApiKey ? { 'X-API-Key': ocrApiKey } : {}),
      },
      body: formData,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Scorecard OCR timeout');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || 'Scorecard OCR request failed');
  }

  return (await response.json()) as BackendScorecardResponse;
};
