import { Dimensions } from 'react-native';

const BASE_WIDTH = 402; // iPhone 16 design width in points
const { width: SW } = Dimensions.get('window');
const scaleFactor = SW / BASE_WIDTH;

/**
 * Responsive size scaler — scales a pt value relative to iPhone 16 width.
 * Use for font sizes, icon sizes, and fixed dimensions.
 */
export const rs = (size) => Math.round(size * scaleFactor);
