import { spawn, type ChildProcess } from "node:child_process";
import { createLogger } from "./logger.js";

const log = createLogger("Process");

export interface SpawnTrackedOptions {
  command: string;
  args: readonly string[];
  cwd: string;
  timeoutMs: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface TrackedProcess {
  pid: number;
  child: ChildProcess;
  /** Resolves when the process exits (code/signal). */
  exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  kill: (signal?: NodeJS.Signals) => Promise<void>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function isPidAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Spawn a process with an argument array (never a shell string).
 * Tracks the PID and provides verified termination.
 */
export function spawnTracked(options: SpawnTrackedOptions): TrackedProcess {
  const child = spawn(options.command, [...options.args], {
    cwd: options.cwd,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      PATH: process.env.PATH,
      // Do not forward secrets into child env
    },
  });

  if (child.pid === undefined) {
    throw new Error(`Failed to spawn ${options.command}`);
  }

  const pid = child.pid;
  log.info(`Spawned ${options.command} pid=${pid}`);

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on("exit", (code, signal) => {
      if (timeout) clearTimeout(timeout);
      log.info(`Process exit pid=${pid} code=${code} signal=${signal}`);
      resolve({ code, signal });
    });
  });

  // timeoutMs <= 0 disables the watchdog (used for long-running live remux jobs).
  if (options.timeoutMs > 0) {
    timeout = setTimeout(() => {
      log.warn(`Process timeout pid=${pid} after ${options.timeoutMs}ms — sending SIGTERM`);
      void killTracked(pid, child);
    }, options.timeoutMs);
  }

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => options.onStdout?.(chunk));
  child.stderr.on("data", (chunk: string) => options.onStderr?.(chunk));

  return {
    pid,
    child,
    exit,
    kill: () => killTracked(pid, child),
  };
}

export async function killTracked(
  pid: number,
  child?: ChildProcess
): Promise<void> {
  if (!(await isPidAlive(pid))) {
    log.debug(`killTracked: pid=${pid} already dead`);
    return;
  }

  try {
    child?.kill("SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already dead */
    }
  }

  for (let i = 0; i < 10; i++) {
    await sleep(100);
    if (!(await isPidAlive(pid))) {
      log.debug(`killTracked: pid=${pid} terminated after SIGTERM`);
      return;
    }
  }

  log.warn(`killTracked: pid=${pid} still alive — sending SIGKILL`);
  try {
    child?.kill("SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already dead */
    }
  }

  for (let i = 0; i < 10; i++) {
    await sleep(100);
    if (!(await isPidAlive(pid))) {
      log.info(`killTracked: pid=${pid} confirmed dead after SIGKILL`);
      return;
    }
  }

  log.error(`CRITICAL: pid=${pid} still alive after SIGKILL`);
  throw new Error(`Failed to terminate process pid=${pid}`);
}

export async function isProcessAlive(pid: number): Promise<boolean> {
  return isPidAlive(pid);
}
