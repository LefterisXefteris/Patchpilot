import { NextResponse } from 'next/server';

import { runCommand, type CommandName } from '@/src/ui/next-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = (await request.json()) as { command?: CommandName };

  return NextResponse.json(await runCommand(body.command));
}
