// Barcode handling, kept in one place so a real scanner integration only has
// to produce codes — everything downstream (register, product lookup) just
// calls onScan(code).
//
// Today: USB/Bluetooth scanners in "keyboard wedge" mode type the code and
// press Enter, which useBarcodeScanner (client) picks up. Later: a camera
// scanner or a scanner vendor API can call the same onScan callback, or POST
// to /api/scan (see src/app/api/scan/route.ts).

// Scanners can add prefixes/suffixes or whitespace; codes are compared as
// trimmed strings.
export function normalizeBarcode(raw: string): string {
  return raw.trim();
}

// Keystrokes arriving faster than this apart are treated as a scanner, not
// a person typing. Bluetooth scanners are a bit slower than USB ones.
export const SCAN_KEY_GAP_MS = 80;

// Most scanners end a scan with Enter; some are configured for Tab.
export const SCAN_TERMINATORS = ["Enter", "Tab"];
export const MIN_BARCODE_LENGTH = 4;
