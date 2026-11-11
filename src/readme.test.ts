import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The documents say every setting there is (task 12.3): a setting that is in `.env.example` is in the README, and one the code reads is in `.env.example`, so a
 * setting cannot be added and left for someone to find in the source. And what the README tells an operator to run is what the repository has: its commands, its
 * files and the port.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');
const names = (text: string) => new Set(text.match(/\bSHOPPER_[A-Z0-9]+(?:_[A-Z0-9]+)*\b/g) ?? []);

function walk(folder: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(ROOT, folder))) {
    const relative = path.join(folder, entry);
    if (statSync(path.join(ROOT, relative)).isDirectory()) out.push(...walk(relative));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(relative);
  }
  return out;
}

describe('the settings', () => {
  const example = names(read('.env.example'));
  const readme = read('README.md');

  it('are in .env.example, which is a list of them', () => {
    expect(example.size).toBeGreaterThan(25);
    for (const required of [
      'SHOPPER_URL',
      'SHOPPER_AUTH_SECRET',
      'SHOPPER_ENCRYPTION_KEY',
      'SHOPPER_DB_DIALECT',
    ])
      expect(example.has(required), required).toBe(true);
  });

  it('are each in the README, with what they do', () => {
    const missing = [...example].filter((name) => !readme.includes(`\`${name}\``));
    expect(missing).toEqual([]);
  });

  it('that the code reads are each in .env.example', () => {
    const used = new Set<string>();
    for (const file of [
      ...walk('src'),
      ...walk('app'),
      'proxy.ts',
      'instrumentation.ts',
      'instrumentation-node.ts',
    ])
      for (const name of names(readFileSync(path.join(ROOT, file), 'utf8'))) used.add(name);
    const files = (name: string) =>
      name.endsWith('_FILE') && example.has(name.slice(0, -'_FILE'.length));
    const unlisted = [...used].filter(
      (name) => !example.has(name) && !files(name) && !name.startsWith('SHOPPER_TEST_'),
    );
    expect(unlisted).toEqual([]);
  });

  it('are not listed in the README unless they are real', () => {
    const real = new Set([...example, ...[...example].map((name) => `${name}_FILE`)]);
    const invented = [...names(readme)].filter((name) => !real.has(name));
    expect(invented).toEqual([]);
  });

  it('are the ones the deployment files set, and every one of those is a setting', () => {
    const real = new Set([...example, ...[...example].map((name) => `${name}_FILE`)]);
    const deployed = new Set<string>();
    for (const file of [
      'deploy/compose.yaml',
      'deploy/compose.file.yaml',
      'deploy/compose.postgres.yaml',
      'deploy/.env.example',
      'deploy/README.md',
    ])
      for (const name of names(read(file))) deployed.add(name);
    // `SHOPPER_IMAGE` and `SHOPPER_PORT` belong to Compose, not to the app.
    const unknown = [...deployed].filter(
      (name) => !real.has(name) && !['SHOPPER_IMAGE', 'SHOPPER_PORT'].includes(name),
    );
    expect(unknown).toEqual([]);
  });
});

describe('what the README tells an operator to run', () => {
  const readme = read('README.md');

  it('is in the repository: the compose files, the example, the scripts it names', () => {
    for (const file of [
      'deploy/compose.yaml',
      'deploy/compose.file.yaml',
      'deploy/compose.postgres.yaml',
      'deploy/.env.example',
      'deploy/README.md',
      'Dockerfile',
      'sovereign.manifest.json',
      '.env.example',
      'scripts/deploy-check.sh',
      'RELEASING.md',
      'docs/working-offline.md',
      'docs/sharing.md',
      'docs/encryption.md',
    ])
      expect(() => read(file), file).not.toThrow();
  });

  it('listens where the manifest says, and names the commands the package has', () => {
    const port = (JSON.parse(read('sovereign.manifest.json')) as { port: number }).port;
    expect(readme).toContain(`127.0.0.1:${port}:${port}`);
    expect(readme).toContain('sovereign-manifest docker-args');
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> })
      .scripts;
    expect(scripts['seed']).toBeDefined();
    expect(scripts['dev']).toBeDefined();
    expect(readme).toContain('pnpm seed');
    expect(readme).toContain('pnpm dev');
  });

  it('says what SHOPPER_AUTH_SIGNUP does in both of its values, and what is not protected by the key', () => {
    expect(readme).toMatch(/SHOPPER_AUTH_SIGNUP=open/);
    expect(readme).toMatch(/\*\*`closed`\*\*/);
    expect(readme).toMatch(/does not protect/i);
    expect(readme).toMatch(/lost key means/i);
  });

  it('links to documents that are there', () => {
    const links = [...readme.matchAll(/\]\(((?!https?:)[^)#]+)(#[^)]*)?\)/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(8);
    for (const link of links)
      expect(() => statSync(path.join(ROOT, link ?? '')), link).not.toThrow();
  });
});
