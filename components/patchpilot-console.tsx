'use client';

import {
  Activity,
  Bot,
  CheckCircle2,
  ClipboardList,
  Code2,
  GitBranch,
  KeyRound,
  Loader2,
  Play,
  Radar,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Terminal,
  type LucideIcon,
} from 'lucide-react';
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type ConfigPayload = {
  values: Record<string, string>;
  secretStatus: Record<string, boolean>;
};

type CommandPayload = {
  ok: boolean;
  command: string;
  output: string;
};

type Field = {
  key: string;
  label: string;
  type?: 'text' | 'password' | 'number' | 'textarea' | 'checkbox';
  placeholder?: string;
  rows?: number;
  min?: string;
  max?: string;
  step?: string;
};

type FieldGroup = {
  id: string;
  title: string;
  icon: LucideIcon;
  fields: Field[];
};

type CommandName =
  | 'validate'
  | 'syncDryRun'
  | 'syncApply'
  | 'agentRun'
  | 'eval'
  | 'claudeWorkflow'
  | 'codexWorkflow'
  | 'redispatchClaude';

const fieldGroups: FieldGroup[] = [
  {
    id: 'sentry',
    title: 'Sentry',
    icon: Radar,
    fields: [
      { key: 'SENTRY_AUTH_TOKEN', label: 'Auth token', type: 'password' },
      { key: 'SENTRY_ORG_SLUG', label: 'Organization' },
      { key: 'SENTRY_PROJECT_SLUG', label: 'Project' },
      { key: 'SENTRY_ENVIRONMENT', label: 'Environment' },
      { key: 'SENTRY_REGION_URL', label: 'Region URL' },
    ],
  },
  {
    id: 'github',
    title: 'GitHub App',
    icon: GitBranch,
    fields: [
      { key: 'GITHUB_APP_ID', label: 'App ID' },
      { key: 'GITHUB_INSTALLATION_ID', label: 'Installation ID' },
      { key: 'GITHUB_APP_PRIVATE_KEY', label: 'Private key', type: 'textarea', rows: 5 },
      { key: 'GITHUB_OWNER', label: 'Agent owner' },
      { key: 'GITHUB_REPO', label: 'Agent repo' },
      { key: 'GITHUB_TARGET_OWNER', label: 'Target owner' },
      { key: 'GITHUB_TARGET_REPO', label: 'Target repo' },
      { key: 'GITHUB_BASE_BRANCH', label: 'Base branch' },
    ],
  },
  {
    id: 'vercel',
    title: 'Vercel',
    icon: Activity,
    fields: [
      { key: 'VERCEL_TOKEN', label: 'Token', type: 'password' },
      { key: 'VERCEL_TEAM_ID', label: 'Team ID' },
      { key: 'VERCEL_PROJECT_ID', label: 'Project ID' },
      { key: 'VERCEL_PROJECT_NAME', label: 'Project name' },
    ],
  },
  {
    id: 'worker',
    title: 'Repair Worker',
    icon: Bot,
    fields: [
      { key: 'BTS_REPAIR_PROVIDER', label: 'Provider', placeholder: 'claude or codex' },
      { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API key', type: 'password' },
      { key: 'OPENAI_API_KEY', label: 'OpenAI API key', type: 'password' },
    ],
  },
  {
    id: 'autopilot',
    title: 'Autopilot Policy',
    icon: ShieldCheck,
    fields: [
      { key: 'AUTOPILOT_ENABLED', label: 'Enabled', type: 'checkbox' },
      { key: 'AUTOPILOT_DRY_RUN', label: 'Dry run', type: 'checkbox' },
      { key: 'AUTOPILOT_EMERGENCY_STOP', label: 'Emergency stop', type: 'checkbox' },
      { key: 'AUTOPILOT_ALLOWED_ACTIONS', label: 'Allowed actions' },
      {
        key: 'AUTOPILOT_CONFIDENCE_THRESHOLD',
        label: 'Confidence threshold',
        type: 'number',
        min: '0',
        max: '1',
        step: '0.01',
      },
    ],
  },
];

const commands: Array<{ command: CommandName; label: string; icon: LucideIcon; variant?: 'default' | 'outline' | 'destructive' | 'secondary' }> = [
  { command: 'validate', label: 'Validate', icon: ShieldCheck },
  { command: 'syncDryRun', label: 'Watch Dry Run', icon: Radar, variant: 'secondary' },
  { command: 'syncApply', label: 'Apply Watch', icon: Siren, variant: 'destructive' },
  { command: 'agentRun', label: 'Agent Loop', icon: Play, variant: 'outline' },
  { command: 'eval', label: 'Offline Eval', icon: ClipboardList, variant: 'outline' },
  { command: 'claudeWorkflow', label: 'Claude Workflow', icon: Terminal, variant: 'outline' },
  { command: 'codexWorkflow', label: 'Codex Workflow', icon: Code2, variant: 'outline' },
  { command: 'redispatchClaude', label: 'Dispatch Accepted', icon: RotateCcw, variant: 'destructive' },
];

const secretLabels = {
  SENTRY_AUTH_TOKEN: 'Sentry',
  SENTRY_WEBHOOK_SECRET: 'Sentry webhook',
  GITHUB_APP_PRIVATE_KEY: 'GitHub key',
  GITHUB_WEBHOOK_SECRET: 'GitHub webhook',
  VERCEL_TOKEN: 'Vercel',
  ANTHROPIC_API_KEY: 'Anthropic',
  OPENAI_API_KEY: 'OpenAI',
};

const defaultGroup = fieldGroups[0]!;

export function PatchpilotConsole() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [secretStatus, setSecretStatus] = useState<Record<string, boolean>>({});
  const [activeGroup, setActiveGroup] = useState(defaultGroup.id);
  const [busy, setBusy] = useState<string | null>('loading');
  const [status, setStatus] = useState<'local' | 'saved' | 'passed' | 'failed' | 'error'>('local');
  const [output, setOutput] = useState('Ready.');

  const activeFields = useMemo(() => fieldGroups.find((group) => group.id === activeGroup) ?? defaultGroup, [activeGroup]);
  const configuredSecrets = Object.values(secretStatus).filter(Boolean).length;

  useEffect(() => {
    void loadConfig();
  }, []);

  async function loadConfig() {
    setBusy('loading');
    try {
      const response = await fetch('/api/config');
      renderConfig(await response.json());
      setStatus('local');
    } catch (error) {
      setOutput(String(error));
      setStatus('error');
    } finally {
      setBusy(null);
    }
  }

  function renderConfig(payload: ConfigPayload) {
    setValues(payload.values ?? {});
    setSecretStatus(payload.secretStatus ?? {});
  }

  function setFieldValue(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function saveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('save');
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ values }),
      });
      const payload = await response.json();
      renderConfig(payload.config);
      setStatus('saved');
      setOutput('Saved .env locally. Secret values were not echoed back.');
    } catch (error) {
      setOutput(String(error));
      setStatus('error');
    } finally {
      setBusy(null);
    }
  }

  async function runCommand(command: CommandName, label: string) {
    setBusy(command);
    setOutput(`Running ${label}...`);
    try {
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      const payload = (await response.json()) as CommandPayload;
      setOutput(`$ ${payload.command}\n\n${payload.output}`);
      setStatus(payload.ok ? 'passed' : 'failed');
    } catch (error) {
      setOutput(String(error));
      setStatus('error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_18px_rgba(69,195,163,0.9)]" />
            Sentry + GitHub + Vercel
          </div>
          <h1 className="text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">Patchpilot</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Production recovery control for intake, policy, repair workers, and verification.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={status === 'failed' || status === 'error' ? 'destructive' : status === 'passed' ? 'success' : 'secondary'}>
            {statusLabel(status)}
          </Badge>
          <Badge variant={configuredSecrets >= 4 ? 'success' : 'warning'}>
            <KeyRound className="mr-1 size-3" />
            {configuredSecrets}/{Object.keys(secretLabels).length} secrets
          </Badge>
        </div>
      </header>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <form onSubmit={saveConfig} className="min-w-0">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
              {fieldGroups.map((group) => {
                const Icon = group.icon;
                const isActive = group.id === activeGroup;

                return (
                  <Button
                    key={group.id}
                    type="button"
                    variant={isActive ? 'default' : 'outline'}
                    className="shrink-0"
                    onClick={() => setActiveGroup(group.id)}
                  >
                    <Icon />
                    {group.title}
                  </Button>
                );
              })}
            </div>
            <Button type="submit" disabled={Boolean(busy)} className="w-full sm:w-auto">
              {busy === 'save' ? <Loader2 className="animate-spin" /> : <Save />}
              Save
            </Button>
          </div>

          <ConfigGroup
            group={activeFields}
            values={values}
            secretStatus={secretStatus}
            busy={Boolean(busy)}
            onChange={setFieldValue}
          />
        </form>

        <aside className="grid content-start gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Runbook</CardTitle>
              <CardDescription>Local commands execute with redacted output.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {commands.map(({ command, label, icon: Icon, variant }) => (
                <Button
                  key={command}
                  type="button"
                  variant={variant}
                  disabled={Boolean(busy)}
                  className="justify-start"
                  onClick={() => runCommand(command, label)}
                >
                  {busy === command ? <Loader2 className="animate-spin" /> : <Icon />}
                  {label}
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Secrets</CardTitle>
              <CardDescription>Stored values stay masked in the browser.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {Object.entries(secretLabels).map(([key, label]) => {
                const configured = secretStatus[key];

                return (
                  <div key={key} className="rounded-md border border-border bg-muted/40 p-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                      {configured ? <CheckCircle2 className="size-3 text-primary" /> : <ShieldAlert className="size-3 text-amber-300" />}
                      {label}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{configured ? 'Configured' : 'Missing'}</div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </aside>
      </section>

      <section className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Command Output</h2>
          {busy ? <Badge variant="outline">Running</Badge> : <Badge variant="secondary">Idle</Badge>}
        </div>
        <pre className="min-h-72 max-h-[560px] overflow-auto rounded-lg border border-border bg-[#07100e] p-4 font-mono text-xs leading-6 text-[#d4f7ee] shadow-inner whitespace-pre-wrap">
          {output}
        </pre>
      </section>
    </main>
  );
}

function ConfigGroup({
  group,
  values,
  secretStatus,
  busy,
  onChange,
}: {
  group: FieldGroup;
  values: Record<string, string>;
  secretStatus: Record<string, boolean>;
  busy: boolean;
  onChange: (key: string, value: string) => void;
}) {
  const Icon = group.icon;

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <div className="flex size-10 items-center justify-center rounded-md border border-border bg-muted">
          <Icon className="size-5 text-primary" />
        </div>
        <div>
          <CardTitle>{group.title}</CardTitle>
          <CardDescription>{group.fields.length} controls</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          {group.fields.map((field) => (
            <FieldControl
              key={field.key}
              field={field}
              value={values[field.key] ?? ''}
              configured={secretStatus[field.key]}
              disabled={busy}
              onChange={onChange}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function FieldControl({
  field,
  value,
  configured,
  disabled,
  onChange,
}: {
  field: Field;
  value: string;
  configured?: boolean;
  disabled: boolean;
  onChange: (key: string, value: string) => void;
}) {
  if (field.type === 'checkbox') {
    return (
      <label className="flex min-h-10 items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
        <input
          type="checkbox"
          checked={value === 'true'}
          disabled={disabled}
          onChange={(event) => onChange(field.key, String(event.target.checked))}
          className="size-4 accent-primary"
        />
        <span>{field.label}</span>
      </label>
    );
  }

  const sharedProps = {
    id: field.key,
    value,
    disabled,
    placeholder: configured ? 'Saved. Leave blank to keep.' : field.placeholder,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(field.key, event.target.value),
  };

  return (
    <label className={cn('grid gap-2 text-sm text-muted-foreground', field.type === 'textarea' && 'md:col-span-2')}>
      <span className="flex items-center justify-between gap-3">
        {field.label}
        {configured ? <Badge variant="success">Saved</Badge> : null}
      </span>
      {field.type === 'textarea' ? (
        <Textarea {...sharedProps} rows={field.rows} className="font-mono text-xs" />
      ) : (
        <Input
          {...sharedProps}
          type={field.type ?? 'text'}
          min={field.min}
          max={field.max}
          step={field.step}
          autoComplete={field.type === 'password' ? 'off' : undefined}
        />
      )}
    </label>
  );
}

function statusLabel(status: 'local' | 'saved' | 'passed' | 'failed' | 'error') {
  switch (status) {
    case 'saved':
      return 'Saved';
    case 'passed':
      return 'Passed';
    case 'failed':
      return 'Failed';
    case 'error':
      return 'Error';
    default:
      return 'Local';
  }
}
