// Non-secret revision marker only. No identity, password or provider credential.
export function demoAccessHeaders(): Record<string, string> {
  return { 'X-HireSense-UI': 'preview-no-code-v1' };
}

export function demoErrorMessage(code: unknown, message: string): { code?: string; message: string } {
  if (typeof code === 'string' && /^DEMO_CODE_|^DEMO_PROTECTION_MISSING$/.test(code)) {
    return {
      code: 'PREVIEW_VERSION_MISMATCH',
      message: 'This Preview reached an older or differently configured API. This development demo does not require an access code. Open the main HireSense Preview and check availability there.',
    };
  }
  return { code: typeof code === 'string' ? code : undefined, message };
}
