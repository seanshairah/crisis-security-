/** A QR scan and the fresh position acquired for it are two separate facts. */
export function gpsTimeCorrelates(scanAt: Date, gpsAt: Date, receivedAt: Date): boolean {
  const scan = +scanAt,
    gps = +gpsAt,
    received = +receivedAt;
  return (
    [scan, gps, received].every(Number.isFinite) &&
    gps >= scan - 10000 &&
    gps <= scan + 90000 &&
    gps <= received + 30000
  );
}
