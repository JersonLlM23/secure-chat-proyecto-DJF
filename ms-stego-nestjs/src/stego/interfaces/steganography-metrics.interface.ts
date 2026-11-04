export interface ChannelMetrics {
  bitZeroCount: number;
  bitOneCount: number;
  lsbEntropy: number;
  poVScore: number;
  chiSquareValue: number;
  chiSquareDegreesOfFreedom: number;
  chiSquarePValue: number;
}

export interface SteganographyMetrics extends ChannelMetrics {
  width: number;
  height: number;
  analyzedPixels: number;
  analyzedBytes: number;
  analyzedBits: number;
  anomalyScore: number;
  threshold: number;
  perChannel: {
    red: ChannelMetrics;
    green: ChannelMetrics;
    blue: ChannelMetrics;
  };
}
