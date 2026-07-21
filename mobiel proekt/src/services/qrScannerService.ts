export type QrScanResult = {
  qrCodeHash: string;
  scannedAtLocal: string;
};

export function createQrScanResult(qrCodeHash: string): QrScanResult {
  return {
    qrCodeHash: normalizeQrValue(qrCodeHash),
    scannedAtLocal: new Date().toISOString()
  };
}

export function normalizeQrValue(value: string) {
  return value.trim();
}
