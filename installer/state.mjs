import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const kitVersion = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
export const hashContent = (content) => createHash('sha256').update(content).digest('hex');
export const statePath = (home = os.homedir()) => path.join(home, '.vibecoding-devtools', 'state.json');

export function readState({ home = os.homedir() } = {}) {
  try {
    const state = JSON.parse(fs.readFileSync(statePath(home), 'utf8'));
    if (!state || !Array.isArray(state.items) || typeof state.version !== 'string') {
      throw new Error('Invalid installer state');
    }
    return state;
  } catch (error) {
    if (error.code === 'ENOENT') return { version: kitVersion, date: null, items: [] };
    throw error; // Corrupt state never becomes an empty installation.
  }
}

export function writeAtomic(destination, content) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  let fd;
  try {
    let mode = 0o600;
    try { mode = fs.statSync(destination).mode & 0o777; } catch (e) { if (e.code !== 'ENOENT') throw e; }
    fd = fs.openSync(temporary, 'wx', mode);
    fs.writeFileSync(fd, content);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporary, destination);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    fs.rmSync(temporary, { force: true });
  }
}

export function saveState(state, { home = os.homedir() } = {}) {
  const content = JSON.stringify({ ...state, version: kitVersion, date: new Date().toISOString() }, null, 2) + '\n';
  writeAtomic(statePath(home), content);
}

export const lockPath = (home) => path.join(home, '.vibecoding-devtools', 'installer.lock');

// The lock covers the whole read, effect and write transaction, including JSON replacement.
// Live PIDs never expire; incomplete locks can be recovered only after 30 seconds.
export function withLock(home, work, { dryRun = false } = {}) {
  if (dryRun) return work(); // Dry-run creates and removes no files.
  const file = lockPath(home);
  for (let p = path.dirname(file); ; p = path.dirname(p)) {
    try { if (fs.lstatSync(p).isSymbolicLink()) throw new Error(`Link in state directory: ${p}`); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (p === path.dirname(p)) break;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const token = randomUUID();
  let fd;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fd = fs.openSync(file, 'wx', 0o600);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const st = fs.lstatSync(file);
      if (!st.isFile() || st.isSymbolicLink()) throw new Error('Invalid installer lock');
      const text = fs.readFileSync(file, 'utf8');
      let stale = false;
      try {
        const lock = JSON.parse(text);
        if (!Number.isInteger(lock.pid) || lock.pid <= 0 || typeof lock.token !== 'string') throw new Error();
        try { process.kill(lock.pid, 0); }
        catch (e) { if (e.code === 'ESRCH') stale = true; }
      } catch {
        stale = Date.now() - st.mtimeMs > 30000;
      }
      if (!stale) throw new Error('Another installation is in progress (active lock)');
      if (fs.readFileSync(file, 'utf8') !== text) continue;
      fs.unlinkSync(file);
    }
  }
  if (fd === undefined) throw new Error('Could not acquire the installer lock');
  const acquired = fs.fstatSync(fd);
  try {
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, token }));
    fs.fsyncSync(fd);
    return work();
  } finally {
    fs.closeSync(fd);
    // Never release a lock now owned by another process.
    try {
      const current = fs.lstatSync(file);
      if (current.dev === acquired.dev && current.ino === acquired.ino) {
        let mine = true;
        try { mine = JSON.parse(fs.readFileSync(file, 'utf8')).token === token; }
        catch (e) { if (!(e instanceof SyntaxError)) throw e; } // The initial lock write failed.
        if (mine) fs.unlinkSync(file);
      }
    }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}
