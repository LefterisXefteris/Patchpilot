import { NextResponse } from 'next/server';

import { configPayload, saveConfig } from '@/src/ui/next-api';
import type { EnvFileData } from '@/src/ui/env-file';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(configPayload());
}

export async function POST(request: Request) {
  const body = (await request.json()) as { values?: EnvFileData };

  return NextResponse.json({ ok: true, config: saveConfig(body.values ?? {}) });
}
