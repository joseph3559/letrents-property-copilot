import { NextResponse } from 'next/server';

export function ok<T>(data: T, message = 'OK', status = 200) {
  return NextResponse.json({ success: true, message, data }, { status });
}

export function fail(message: string, status = 400, code = 'BAD_REQUEST') {
  return NextResponse.json({ success: false, message, code }, { status });
}

export function toSafeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    // Never leak secrets/tokens that may appear in provider errors.
    return error.message
      .replace(/sk-[A-Za-z0-9-_]+/g, '[redacted]')
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/=]+/gi, 'Bearer [redacted]')
      .slice(0, 500);
  }
  return fallback;
}
