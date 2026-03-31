import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

type CapabilityScriptExecutionInput = {
  tenantId: string;
  customerId?: string | null;
  conversationId?: string | null;
  capability: {
    capabilityId: string;
    slug: string;
    name: string;
    description?: string | null;
  };
  script: {
    scriptKey: string;
    name: string;
    fileName: string;
    language: string;
    sourceCode: string;
    requirements?: string[];
    envRefs?: string[];
    envBindings?: Array<{
      envKey: string;
      envValue: string;
    }>;
  };
  args: Record<string, unknown>;
};

function normalizeLanguage(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["python", "python3", "py"].includes(normalized)) return "python";
  if (["javascript", "js", "node", "nodejs"].includes(normalized)) return "javascript";
  if (["bash", "sh", "shell"].includes(normalized)) return "bash";
  return normalized;
}

function resolveRunner(language: string) {
  if (language === "python") return { command: "python3", extension: ".py" };
  if (language === "javascript") return { command: "node", extension: ".js" };
  if (language === "bash") return { command: "bash", extension: ".sh" };
  throw new Error(`unsupported_script_language:${language}`);
}

function buildScriptEnv(
  envRefs: string[] | undefined,
  envBindings: Array<{ envKey: string; envValue: string }> | undefined
) {
  const refs = Array.isArray(envRefs) ? envRefs.map((item) => item.trim()).filter(Boolean) : [];
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "TZ"]) {
    const value = process.env[key];
    if (typeof value === "string" && value.length > 0) {
      env[key] = value;
    }
  }
  const bindingMap = new Map(
    Array.isArray(envBindings)
      ? envBindings
          .filter((item) => item && typeof item.envKey === "string" && item.envKey.trim())
          .map((item) => [item.envKey.trim(), typeof item.envValue === "string" ? item.envValue : ""])
      : []
  );
  const missing: string[] = [];

  for (const ref of refs) {
    const boundValue = bindingMap.get(ref);
    if (typeof boundValue === "string" && boundValue.length > 0) {
      env[ref] = boundValue;
    } else {
      missing.push(ref);
    }
  }

  if (missing.length > 0) {
    throw new Error(`missing_script_env_refs:${missing.join(",")}`);
  }

  return env;
}

function parseScriptOutput(stdout: string) {
  const trimmed = stdout.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { result: parsed };
  } catch {
    return { resultText: trimmed };
  }
}

async function runProcess(input: {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd?: string;
  stdin?: string;
  timeoutMs: number;
}) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      env: input.env,
      cwd: input.cwd,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`script_timeout:${input.timeoutMs}ms`));
    }, input.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`script_failed:${code}:${stderr.trim().slice(0, 1000) || stdout.trim().slice(0, 400)}`));
        return;
      }
      resolve({ stdout, stderr });
    });
    if (input.stdin) child.stdin.write(input.stdin);
    child.stdin.end();
  });
}

async function preparePythonRunner(input: {
  tempDir: string;
  requirements?: string[];
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}) {
  const requirements = Array.isArray(input.requirements)
    ? [...new Set(input.requirements.map((item) => String(item).trim()).filter(Boolean))]
    : [];
  if (requirements.length === 0) {
    return { command: "python3" };
  }

  const cacheRoot = process.env.CAPABILITY_SCRIPT_CACHE_DIR?.trim()
    || path.join(os.tmpdir(), "nuychat-capability-python");
  await mkdir(cacheRoot, { recursive: true });

  const normalizedRequirements = [...new Set(requirements.map((item) => item.trim()).filter(Boolean))].sort();
  const cacheKey = createHash("sha1")
    .update(`python3|${normalizedRequirements.join("|")}`)
    .digest("hex");
  const cachedVenvDir = path.join(cacheRoot, cacheKey);
  const cachedPythonBin = path.join(cachedVenvDir, "bin", "python");

  try {
    await access(cachedPythonBin);
    return { command: cachedPythonBin };
  } catch {
    // cache miss; build below
  }

  const buildDir = await mkdtemp(path.join(cacheRoot, `${cacheKey}-build-`));
  const venvDir = path.join(buildDir, ".venv");

  try {
    await runProcess({
      command: "python3",
      args: ["-m", "venv", venvDir],
      env: input.env,
      timeoutMs: Math.max(input.timeoutMs, 30000)
    });

    const pythonBin = path.join(venvDir, "bin", "python");
    await runProcess({
      command: pythonBin,
      args: ["-m", "pip", "install", "--disable-pip-version-check", ...normalizedRequirements],
      env: input.env,
      timeoutMs: Math.max(input.timeoutMs, 120000)
    });

    try {
      await rename(venvDir, cachedVenvDir);
    } catch {
      // Another process may have populated the cache first.
    }

    try {
      await access(cachedPythonBin);
      return { command: cachedPythonBin };
    } catch {
      return { command: pythonBin };
    }
  } finally {
    await rm(buildDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function runCapabilityScriptExecution(input: CapabilityScriptExecutionInput) {
  const language = normalizeLanguage(input.script.language);
  const runner = resolveRunner(language);
  const timeoutMs = Number(process.env.CAPABILITY_SCRIPT_TIMEOUT_MS ?? 15000);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "nuychat-skill-"));
  const scriptPath = path.join(
    tempDir,
    input.script.fileName?.trim() || `${input.script.scriptKey}${runner.extension}`
  );

  try {
    await writeFile(scriptPath, input.script.sourceCode, "utf8");
    const env = buildScriptEnv(input.script.envRefs, input.script.envBindings);
    env.NUYCHAT_CAPABILITY_ID = input.capability.capabilityId;
    env.NUYCHAT_CAPABILITY_CODE = input.capability.slug;
    env.NUYCHAT_CAPABILITY_NAME = input.capability.name;
    env.NUYCHAT_SCRIPT_KEY = input.script.scriptKey;
    const pythonRunner = language === "python"
      ? await preparePythonRunner({
          tempDir,
          requirements: input.script.requirements,
          env,
          timeoutMs
        })
      : null;

    const payload = JSON.stringify({
      tenantId: input.tenantId,
      customerId: input.customerId ?? null,
      conversationId: input.conversationId ?? null,
      capability: input.capability,
      script: {
        scriptKey: input.script.scriptKey,
        name: input.script.name,
        fileName: input.script.fileName,
        language
      },
      args: input.args
    });

    const result = await runProcess({
      command: pythonRunner?.command ?? runner.command,
      args: [scriptPath],
      env,
      stdin: payload,
      timeoutMs
    });

    const parsed = parseScriptOutput(result.stdout);
    return {
      ...parsed,
      scriptKey: input.script.scriptKey,
      scriptName: input.script.name,
      runtime: language,
      stderr: result.stderr.trim() || null,
      _async: true
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
