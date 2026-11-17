import { copyFile, mkdir } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(repositoryRoot, 'functions', 'src', 'shared');
const sharedFiles = [
  'src/app/shared/workflow/idea-workflow.ts',
  'src/app/shared/models/automated-review.model.ts',
];

await mkdir(destination, { recursive: true });

for (const relativePath of sharedFiles) {
  const source = resolve(repositoryRoot, relativePath);
  await copyFile(source, resolve(destination, basename(source)));
}
