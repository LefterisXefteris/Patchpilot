import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const templatePath = join(root, 'templates/target-repo/back-to-service-codex.yml');

console.log(`# Target repo Codex workflow

Create this file in the broken app repo:

  .github/workflows/back-to-service-codex.yml

Then add this GitHub Actions repository secret in that target repo:

  OPENAI_API_KEY

Set Back To Service to dispatch this workflow:

  BTS_REPAIR_PROVIDER=codex
  AUTOPILOT_ALLOWED_ACTIONS=update_issue,trigger_agent

The Back To Service GitHub App must be installed on the target repo with:

  - Metadata: read
  - Issues: read/write
  - Contents: read/write

Workflow file:
`);

console.log(readFileSync(templatePath, 'utf8'));
