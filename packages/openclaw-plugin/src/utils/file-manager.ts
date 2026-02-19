import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';

const TASKCLAW_PREFIX = 'taskclaw-';

/**
 * Resolve the skills base path, expanding ~ to the home directory.
 */
export function resolveBasePath(configPath: string): string {
  if (configPath.startsWith('~')) {
    return path.join(os.homedir(), configPath.slice(1));
  }
  return configPath;
}

/**
 * Get the full directory path for a category's skill.
 */
export function getSkillDir(basePath: string, categorySlug: string): string {
  return path.join(resolveBasePath(basePath), `${TASKCLAW_PREFIX}${categorySlug}`);
}

/**
 * Get the full path to a category's SKILL.md file.
 */
export function getSkillFilePath(basePath: string, categorySlug: string): string {
  return path.join(getSkillDir(basePath, categorySlug), 'SKILL.md');
}

/**
 * Compute SHA-256 hash of content.
 */
export function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Write a SKILL.md file for a category. Creates the directory if needed.
 */
export function writeSkillFile(basePath: string, categorySlug: string, content: string): {
  path: string;
  hash: string;
} {
  const dir = getSkillDir(basePath, categorySlug);
  const filePath = getSkillFilePath(basePath, categorySlug);

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');

  return { path: filePath, hash: computeHash(content) };
}

/**
 * Read a SKILL.md file and return its content + hash. Returns null if file doesn't exist.
 */
export function readSkillFile(basePath: string, categorySlug: string): {
  content: string;
  hash: string;
} | null {
  const filePath = getSkillFilePath(basePath, categorySlug);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  return { content, hash: computeHash(content) };
}

/**
 * Delete a category's skill directory and all its files.
 */
export function deleteSkillFile(basePath: string, categorySlug: string): boolean {
  const dir = getSkillDir(basePath, categorySlug);

  if (!fs.existsSync(dir)) {
    return false;
  }

  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

/**
 * List all taskclaw-* skill directories. Returns category slugs (without the prefix).
 */
export function listSkillSlugs(basePath: string): string[] {
  const resolved = resolveBasePath(basePath);

  if (!fs.existsSync(resolved)) {
    return [];
  }

  return fs.readdirSync(resolved, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(TASKCLAW_PREFIX))
    .map((entry) => entry.name.slice(TASKCLAW_PREFIX.length));
}

/**
 * Check that the base path is writable.
 */
export function checkWriteAccess(basePath: string): boolean {
  const resolved = resolveBasePath(basePath);
  try {
    fs.mkdirSync(resolved, { recursive: true });
    const testFile = path.join(resolved, '.taskclaw-write-test');
    fs.writeFileSync(testFile, 'test', 'utf-8');
    fs.unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
}
