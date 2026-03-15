import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';

const ROOT = process.cwd();
const RUNTIME_DIR = path.join(ROOT, '.runtime');

dotenv.config({ path: path.join(ROOT, '.env') });

const SERVICES = [
  {
    name: 'api',
    cwd: path.join(ROOT, 'apps/api'),
    command: ['npm', 'run', 'dev'],
    port: 3000,
  },
  {
    name: 'worker',
    cwd: path.join(ROOT, 'apps/worker'),
    command: ['npm', 'run', 'dev'],
    port: null,
  },
  {
    name: 'viewer',
    cwd: path.join(ROOT, 'apps/viewer'),
    command: ['npm', 'run', 'dev'],
    port: 5174,
  },
];

async function ensureRuntimeDir() {
  await fs.mkdir(RUNTIME_DIR, { recursive: true });
}

function pidFile(name) {
  return path.join(RUNTIME_DIR, `${name}.pid`);
}

function logFile(name) {
  return path.join(RUNTIME_DIR, `${name}.log`);
}

async function readPid(name) {
  try {
    const value = await fs.readFile(pidFile(name), 'utf8');
    return Number(value.trim());
  } catch {
    return null;
  }
}

async function writePid(name, pid) {
  await fs.writeFile(pidFile(name), `${pid}\n`, 'utf8');
}

async function removePid(name) {
  await fs.rm(pidFile(name), { force: true });
}

function isRunning(pid) {
  if (!pid || Number.isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function safeReadlink(target) {
  try {
    return await fs.readlink(target);
  } catch {
    return null;
  }
}

async function safeReadFile(target) {
  try {
    return await fs.readFile(target, 'utf8');
  } catch {
    return null;
  }
}

async function listProcesses() {
  const entries = await fs.readdir('/proc', { withFileTypes: true });
  const processes = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    const pid = Number(entry.name);
    const cwd = await safeReadlink(path.join('/proc', entry.name, 'cwd'));
    const cmdlineRaw = await safeReadFile(path.join('/proc', entry.name, 'cmdline'));
    if (!cwd || !cmdlineRaw) continue;
    const cmdline = cmdlineRaw
      .split('\0')
      .map((part) => part.trim())
      .filter(Boolean);
    processes.push({ pid, cwd, cmdline });
  }

  return processes;
}

async function findServiceProcesses(service) {
  const processes = await listProcesses();
  return processes.filter((proc) => {
    if (proc.cwd !== service.cwd) return false;
    const joined = proc.cmdline.join(' ');
    return joined.includes('vite') || joined.includes('tsx watch src/index.ts') || joined.includes('src/index.ts');
  });
}

async function killPid(pid) {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!isRunning(pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // ignore
  }
}

async function cleanupService(service) {
  const stale = await findServiceProcesses(service);
  for (const proc of stale) {
    await killPid(proc.pid);
  }
  await removePid(service.name);
}

async function cleanupAll() {
  for (const service of SERVICES) {
    await cleanupService(service);
  }
}

function spawnService(service) {
  const stdio = ['ignore', 'pipe', 'pipe'];
  const child = spawn(service.command[0], service.command.slice(1), {
    cwd: service.cwd,
    detached: true,
    stdio,
    env: process.env,
  });

  const outputPath = logFile(service.name);
  const append = async (chunk) => {
    await fs.appendFile(outputPath, chunk);
  };

  child.stdout.on('data', (chunk) => {
    void append(chunk);
  });
  child.stderr.on('data', (chunk) => {
    void append(chunk);
  });

  child.unref();
  return child.pid;
}

async function waitForPort(port) {
  if (!port) return;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${port === 3000 ? '/health' : '/'}`);
      if (response.ok || response.status < 500) {
        return;
      }
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${port}`);
}

async function startAll() {
  await ensureRuntimeDir();
  await cleanupAll();

  const rpcUrl = process.env.RPC_URL ?? 'http://127.0.0.1:8545';
  let rpcHost = '';
  try {
    rpcHost = new URL(rpcUrl).hostname;
  } catch {
    rpcHost = '';
  }

  if ((rpcHost === '127.0.0.1' || rpcHost === 'localhost') && !(await fetch(rpcUrl).then(() => true).catch(() => false))) {
    console.warn(`Warning: no local RPC detected at ${rpcUrl}`);
  }

  for (const service of SERVICES) {
    await fs.writeFile(logFile(service.name), '', 'utf8');
    const pid = spawnService(service);
    await writePid(service.name, pid);
    await waitForPort(service.port);
  }
}

async function statusAll() {
  const rows = [];
  for (const service of SERVICES) {
    const pid = await readPid(service.name);
    rows.push({
      service: service.name,
      pid: pid ?? '-',
      running: pid != null && isRunning(pid) ? 'yes' : 'no',
      log: path.relative(ROOT, logFile(service.name)),
    });
  }
  console.table(rows);
}

const action = process.argv[2];

if (action === 'up') {
  await startAll();
  await statusAll();
} else if (action === 'down') {
  await cleanupAll();
  await statusAll();
} else if (action === 'status') {
  await statusAll();
} else {
  console.error('Usage: node scripts/dev-runtime.mjs <up|down|status>');
  process.exit(1);
}
