// Integration tests hit the real sqlite db via getTestContext(), which never
// pushes the schema itself — only `keystone dev`/`keystone build` do that.
// Without this, a clean checkout (or CI) fails with "table does not exist"
// on the first test run.

import { execFileSync } from 'node:child_process'

export default function globalSetup() {
  execFileSync('bunx', ['prisma', 'db', 'push'], { stdio: 'inherit' })
}
