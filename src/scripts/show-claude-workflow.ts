import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const templatePath = join(root, 'templates/target-repo/back-to-service-claude.yml');

console.log(`# Target repo workflow

Create this file in the broken app repo:

  .github/workflows/back-to-service-claude.yml

Then add this GitHub Actions repository secret in that target repo:

  ANTHROPIC_API_KEY

The Patchpilot GitHub App must be installed on the target repo with:

  - Metadata: read
  - Issues: read/write
  - Contents: read/write

Workflow file:
`);

console.log(readFileSync(templatePath, 'utf8'));

