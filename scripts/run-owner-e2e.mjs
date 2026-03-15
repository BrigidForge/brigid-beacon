import { execFileSync, spawn } from 'node:child_process';

const localLibDir = new URL('../.local/lib/extract/usr/lib/x86_64-linux-gnu/', import.meta.url).pathname;

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
      env: {
        ...process.env,
        LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH
          ? `${localLibDir}:${process.env.LD_LIBRARY_PATH}`
          : localLibDir,
      },
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

async function waitFor(url, attempts = 30) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // keep retrying
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  execFileSync('node', ['scripts/dev-runtime.mjs', 'down'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH
        ? `${localLibDir}:${process.env.LD_LIBRARY_PATH}`
        : localLibDir,
    },
  });
  execFileSync('node', ['scripts/dev-runtime.mjs', 'up'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH
        ? `${localLibDir}:${process.env.LD_LIBRARY_PATH}`
        : localLibDir,
    },
  });
  await waitFor('http://127.0.0.1:3000/health');
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  await run('./node_modules/.bin/playwright', ['test', 'e2e/owner-flow.spec.ts']);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
