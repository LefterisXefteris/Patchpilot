'use client';

import {
  Activity,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ClipboardList,
  Code2,
  Cpu,
  GitBranch,
  Gauge,
  KeyRound,
  Loader2,
  LockKeyhole,
  Network,
  Play,
  Radar,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  Terminal,
  Zap,
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
  kicker: string;
  description: string;
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
    kicker: 'Evidence',
    description: 'Production issue, event, stack trace, and performance signal lookup.',
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
    kicker: 'Record',
    description: 'Incident issues, worker dispatch, pull requests, comments, and checks.',
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
    kicker: 'Deploy',
    description: 'Deployment lookup, production verification, and fallback recovery hooks.',
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
    kicker: 'Patch',
    description: 'The agent runtime that turns accepted incidents into patch attempts.',
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
    kicker: 'Control',
    description: 'Confidence gates, allowed actions, dry-run mode, and emergency stop.',
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

const commands: Array<{
  command: CommandName;
  label: string;
  description: string;
  icon: LucideIcon;
  variant?: 'default' | 'outline' | 'destructive' | 'secondary';
}> = [
  { command: 'validate', label: 'Validate', description: 'Check credentials, policy, and provider reachability.', icon: ShieldCheck },
  { command: 'syncDryRun', label: 'Watch Dry Run', description: 'Scan eligible GitHub issues without mutation.', icon: Radar, variant: 'secondary' },
  { command: 'syncApply', label: 'Apply Watch', description: 'Accept matching incidents and update issue state.', icon: Siren, variant: 'destructive' },
  { command: 'agentRun', label: 'Agent Loop', description: 'Run one recovery pass through the configured agent.', icon: Play, variant: 'outline' },
  { command: 'eval', label: 'Offline Eval', description: 'Exercise the adversarial scenario harness.', icon: ClipboardList, variant: 'outline' },
  { command: 'claudeWorkflow', label: 'Claude Workflow', description: 'Print the target-repo Claude worker template.', icon: Terminal, variant: 'outline' },
  { command: 'codexWorkflow', label: 'Codex Workflow', description: 'Print the target-repo Codex worker template.', icon: Code2, variant: 'outline' },
  { command: 'redispatchClaude', label: 'Dispatch Accepted', description: 'Redispatch accepted issues to repair workers.', icon: RotateCcw, variant: 'destructive' },
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
  const secretTotal = Object.keys(secretLabels).length;
  const autopilotEnabled = values.AUTOPILOT_ENABLED === 'true';
  const emergencyStopped = values.AUTOPILOT_EMERGENCY_STOP === 'true';
  const dryRun = values.AUTOPILOT_DRY_RUN === 'true';
  const confidence = values.AUTOPILOT_CONFIDENCE_THRESHOLD || '0.70';

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
    <main className="mx-auto grid min-h-screen w-full max-w-[1680px] gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="overflow-hidden rounded-lg border border-border/80 bg-card/70 shadow-2xl shadow-black/30 backdrop-blur-xl">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_460px]">
          <div className="relative min-w-0 p-5 sm:p-7">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/80 to-transparent" />
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <Badge variant="success" className="gap-1.5">
                <Sparkles className="size-3" />
                2027 console
              </Badge>
              <Badge variant={status === 'failed' || status === 'error' ? 'destructive' : status === 'passed' ? 'success' : 'secondary'}>
                {statusLabel(status)}
              </Badge>
              <Badge variant={configuredSecrets >= 4 ? 'success' : 'warning'} className="gap-1.5">
                <KeyRound className="size-3" />
                {configuredSecrets}/{secretTotal} secrets
              </Badge>
            </div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Sentry + GitHub + Vercel recovery plane</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-normal text-foreground sm:text-6xl">Patchpilot</h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
              Intake production evidence, decide recovery policy, trigger repair workers, and verify the deploy path from one focused operator surface.
            </p>
          </div>
          <div className="grid border-t border-border/80 bg-background/35 p-4 sm:grid-cols-3 lg:grid-cols-1 lg:border-l lg:border-t-0">
            <SignalTile icon={ShieldCheck} label="Autopilot" value={emergencyStopped ? 'Stopped' : autopilotEnabled ? 'Armed' : 'Manual'} tone={emergencyStopped ? 'danger' : autopilotEnabled ? 'good' : 'muted'} />
            <SignalTile icon={Gauge} label="Confidence gate" value={confidence} tone="good" />
            <SignalTile icon={LockKeyhole} label="Mode" value={dryRun ? 'Dry run' : 'Apply'} tone={dryRun ? 'muted' : 'warn'} />
          </div>
        </div>
      </header>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="grid min-w-0 content-start gap-5">
          <section className="grid gap-3 md:grid-cols-3">
            <MetricCard icon={Radar} label="Incident intake" value={values.GITHUB_TARGET_REPO || 'Target repo'} detail={values.SENTRY_ENVIRONMENT || 'production'} />
            <MetricCard icon={Network} label="Provider mesh" value={`${fieldGroups.filter((group) => groupReadiness(group, values, secretStatus).ready).length}/${fieldGroups.length}`} detail="surfaces ready" />
            <MetricCard icon={Cpu} label="Repair provider" value={values.BTS_REPAIR_PROVIDER || 'unset'} detail="worker runtime" />
          </section>

          <form onSubmit={saveConfig} className="min-w-0">
            <div className="mb-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_120px]">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {fieldGroups.map((group) => {
                  const Icon = group.icon;
                  const isActive = group.id === activeGroup;
                  const readiness = groupReadiness(group, values, secretStatus);

                  return (
                    <button
                      key={group.id}
                      type="button"
                      className={cn(
                        'group grid min-h-24 rounded-lg border p-3 text-left transition-all',
                        isActive
                          ? 'border-primary/70 bg-primary/12 shadow-[0_0_30px_rgba(69,195,163,0.14)]'
                          : 'border-border bg-card/55 hover:border-primary/35 hover:bg-card',
                      )}
                      onClick={() => setActiveGroup(group.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Icon className={cn('size-4', isActive ? 'text-primary' : 'text-muted-foreground')} />
                        <span className={cn('h-1.5 w-1.5 rounded-full', readiness.ready ? 'bg-primary' : 'bg-amber-300')} />
                      </div>
                      <div className="mt-4 min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">{group.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{readiness.filled}/{readiness.total} configured</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <Button type="submit" disabled={Boolean(busy)} className="h-full min-h-16 w-full self-stretch">
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
        </div>

        <aside className="grid content-start gap-5">
          <Card className="overflow-hidden bg-card/80 backdrop-blur-xl">
            <CardHeader className="border-b border-border/70">
              <CardTitle className="flex items-center gap-2">
                <Zap className="size-4 text-primary" />
                Runbook
              </CardTitle>
              <CardDescription>Local commands execute with redacted output.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 pt-5">
              {commands.map(({ command, label, description, icon: Icon, variant }) => (
                <button
                  key={command}
                  type="button"
                  disabled={Boolean(busy)}
                  className={cn(
                    'group grid grid-cols-[36px_minmax(0,1fr)_18px] items-center gap-3 rounded-lg border p-3 text-left transition-all disabled:cursor-wait disabled:opacity-60',
                    variant === 'destructive'
                      ? 'border-destructive/30 bg-destructive/10 hover:bg-destructive/15'
                      : variant === 'secondary'
                        ? 'border-primary/25 bg-primary/10 hover:bg-primary/15'
                        : 'border-border bg-background/45 hover:border-primary/30 hover:bg-muted/60',
                  )}
                  onClick={() => runCommand(command, label)}
                >
                  <span className="flex size-9 items-center justify-center rounded-md border border-border bg-card">
                    {busy === command ? <Loader2 className="size-4 animate-spin text-primary" /> : <Icon className="size-4 text-primary" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{label}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{description}</span>
                  </span>
                  <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-card/70 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>Secret Readiness</CardTitle>
              <CardDescription>Stored values stay masked in the browser.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {Object.entries(secretLabels).map(([key, label]) => {
                const configured = secretStatus[key];

                return (
                  <div key={key} className="rounded-md border border-border bg-background/45 p-3">
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

      <section className="min-w-0 rounded-lg border border-border bg-card/70 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Terminal className="size-4 text-primary" />
            Command Output
          </h2>
          {busy ? <Badge variant="outline">Running</Badge> : <Badge variant="secondary">Idle</Badge>}
        </div>
        <pre className="min-h-72 max-h-[560px] overflow-auto rounded-lg border border-[#1d3b36] bg-[#04100d] p-4 font-mono text-xs leading-6 text-[#d4f7ee] shadow-inner whitespace-pre-wrap">
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
  const readiness = groupReadiness(group, values, secretStatus);

  return (
    <Card className="overflow-hidden bg-card/80 backdrop-blur-xl">
      <CardHeader className="border-b border-border/70">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-md border border-primary/25 bg-primary/10">
              <Icon className="size-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium uppercase text-muted-foreground">{group.kicker}</div>
              <CardTitle className="mt-1">{group.title}</CardTitle>
              <CardDescription className="mt-2 max-w-2xl">{group.description}</CardDescription>
            </div>
          </div>
          <Badge variant={readiness.ready ? 'success' : 'warning'} className="w-fit">
            {readiness.filled}/{readiness.total} configured
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-5">
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
      <label className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-border bg-background/55 px-4 py-3 text-sm transition-colors hover:bg-background/75">
        <span>{field.label}</span>
        <span className={cn('relative h-6 w-11 rounded-full border transition-colors', value === 'true' ? 'border-primary/60 bg-primary/30' : 'border-border bg-muted')}>
          <input
            type="checkbox"
            checked={value === 'true'}
            disabled={disabled}
            onChange={(event) => onChange(field.key, String(event.target.checked))}
            className="peer sr-only"
          />
          <span className="absolute left-1 top-1 size-4 rounded-full bg-muted-foreground transition-transform peer-checked:translate-x-5 peer-checked:bg-primary" />
        </span>
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

function SignalTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: 'good' | 'warn' | 'danger' | 'muted';
}) {
  return (
    <div className="border-b border-border/70 p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 lg:border-b lg:border-r-0 lg:last:border-b-0">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Icon className={cn('size-4', toneClass(tone))} />
        <span className={cn('h-2 w-2 rounded-full', dotClass(tone))} />
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return (
    <Card className="bg-card/65 backdrop-blur-xl">
      <CardContent className="grid gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex size-9 items-center justify-center rounded-md border border-border bg-background/50">
            <Icon className="size-4 text-primary" />
          </div>
          <Badge variant="outline">live</Badge>
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 truncate text-xl font-semibold text-foreground">{value}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{detail}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function groupReadiness(group: FieldGroup, values: Record<string, string>, secretStatus: Record<string, boolean>) {
  const filled = group.fields.filter((field) => {
    if (field.type === 'checkbox') {
      return values[field.key] === 'true';
    }

    return Boolean(values[field.key]) || Boolean(secretStatus[field.key]);
  }).length;

  return {
    filled,
    total: group.fields.length,
    ready: filled === group.fields.length,
  };
}

function toneClass(tone: 'good' | 'warn' | 'danger' | 'muted') {
  switch (tone) {
    case 'good':
      return 'text-primary';
    case 'warn':
      return 'text-amber-300';
    case 'danger':
      return 'text-destructive';
    default:
      return 'text-muted-foreground';
  }
}

function dotClass(tone: 'good' | 'warn' | 'danger' | 'muted') {
  switch (tone) {
    case 'good':
      return 'bg-primary shadow-[0_0_18px_rgba(69,195,163,0.9)]';
    case 'warn':
      return 'bg-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.65)]';
    case 'danger':
      return 'bg-destructive shadow-[0_0_18px_rgba(230,95,76,0.8)]';
    default:
      return 'bg-muted-foreground';
  }
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
