/**
 * Deterministic preset payloads so benchmark runs are reproducible across
 * sessions and machines. All randomness uses a fixed-seed PRNG.
 */

/** Deterministic pseudo-random generator (mulberry32). */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomIso(rand: () => number, startYear = 2026): string {
  const year = startYear;
  const month = 1 + Math.floor(rand() * 12);
  const day = 1 + Math.floor(rand() * 28);
  const hour = Math.floor(rand() * 24);
  const minute = Math.floor(rand() * 60);
  const second = Math.floor(rand() * 60);
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}.${pad(Math.floor(rand() * 1000), 3)}Z`;
}

const HEAVY_JSON_TARGET_BYTES = 1_400_000;

function buildHeavyJson(): string {
  const rand = mulberry32(20260808);
  const words = [
    'albedo',
    'baseline',
    'cache',
    'delta',
    'epsilon',
    'flux',
    'gamma',
    'hash',
    'inode',
    'jitter',
    'kernel',
    'latency',
  ];
  const regions = ['us-east-1', 'eu-west-2', 'ap-south-1', 'sa-east-1'];
  const kinds = ['read', 'write', 'flush', 'rebalance', 'probe'];
  const teams = ['core', 'platform', 'edge'];
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;

  const generateRecords = (count: number): unknown[] => {
    const records: unknown[] = [];
    for (let i = 0; i < count; i += 1) {
      const events: unknown[] = [];
      const eventCount = 4 + Math.floor(rand() * 9);
      for (let e = 0; e < eventCount; e += 1) {
        events.push({
          seq: e,
          at: randomIso(rand),
          kind: pick(kinds),
          latencyNs: Math.floor(rand() * 1_000_000),
          tags: [pick(words), pick(words), pick(words)],
          ok: rand() > 0.1,
        });
      }
      records.push({
        id: `rec_${String(i).padStart(5, '0')}`,
        name: `${pick(words)}-${pick(words)}-${i}`,
        active: rand() > 0.25,
        weight: +(rand() * 10).toFixed(4),
        region: pick(regions),
        meta: {
          created: randomIso(rand),
          updated: randomIso(rand),
          owner: {
            team: pick(teams),
            email: `${pick(words)}@example.com`,
          },
        },
        events,
      });
    }
    return records;
  };

  // Estimate bytes per record from a small sample, then generate enough
  // records to reach the target (fixed seed keeps this deterministic).
  const sampleBytes =
    Buffer.byteLength(JSON.stringify({ records: generateRecords(20) }), 'utf8') / 20;
  const recordsNeeded = Math.ceil(HEAVY_JSON_TARGET_BYTES / sampleBytes) + 10;

  const document = {
    schema: 'bench.heavy.v1',
    generated: '2026-08-08T00:00:00.000Z',
    count: recordsNeeded,
    records: generateRecords(recordsNeeded),
  };
  return JSON.stringify(document);
}

let heavyJsonCache: string | null = null;

/** ~1.4MB nested JSON document for the json_parse benchmark. */
export function heavyJsonPreset(): string {
  if (heavyJsonCache === null) heavyJsonCache = buildHeavyJson();
  return heavyJsonCache;
}

export interface RegexPreset {
  label: string;
  pattern: string;
  flags: string;
  description: string;
}

/** Challenging-but-linear pattern: full email scan over a large log. */
export const EMAIL_SCAN_PRESET: RegexPreset = {
  label: 'Email scan',
  pattern: '\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b',
  flags: 'gi',
  description: 'Scan a ~200KB generated log for email addresses.',
};

/**
 * Classic catastrophic-backtracking pattern. On most regex engines this
 * hangs or times out; Bun's engine keeps it bounded (~1s, size-independent).
 * Exercises the worst-case guard path without locking the worker.
 */
export const BACKTRACKING_STRESS_PRESET: RegexPreset = {
  label: 'Backtracking stress',
  pattern: '(a+)+$',
  flags: '',
  description:
    'Classic catastrophic pattern on a 10KB failing buffer — Bun stays bounded (~1s).',
};

/** Large failing buffer that makes the stress pattern work hard. */
export function backtrackingStressText(): string {
  return 'a'.repeat(10_000) + '!';
}

const EMAIL_LOG_TARGET_BYTES = 200_000;

function buildEmailLog(): string {
  const rand = mulberry32(424242);
  const users = ['albedo', 'baseline', 'cache', 'delta', 'epsilon', 'flux'];
  const domains = ['example.com', 'example.org', 'corp.example'];
  const lines: string[] = [];
  let total = 0;
  while (total < EMAIL_LOG_TARGET_BYTES) {
    const includeEmail = rand() > 0.35;
    const line = `${randomIso(rand)} [info] request ${Math.floor(rand() * 100_000)} ` +
      `user=${users[Math.floor(rand() * users.length)]} ` +
      `ip=203.0.113.${Math.floor(rand() * 254) + 1} ` +
      `dur=${(rand() * 500).toFixed(1)}ms` +
      (includeEmail
        ? ` contact=${users[Math.floor(rand() * users.length)]}@${domains[Math.floor(rand() * domains.length)]}`
        : '') +
      '\n';
    total += line.length;
    lines.push(line);
  }
  return lines.join('');
}

let emailLogCache: string | null = null;

/** ~200KB log buffer peppered with emails for the regex_match benchmark. */
export function emailLogText(): string {
  if (emailLogCache === null) emailLogCache = buildEmailLog();
  return emailLogCache;
}
