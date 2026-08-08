import { useState } from 'react';
import { JsonParseTab } from './components/panels/JsonParseTab';
import { RegexMatchTab } from './components/panels/RegexMatchTab';
import { RuntimeStatus } from './components/RuntimeStatus';
import { Tabs, type TabDef } from './components/Tabs';

type BenchmarkTab = 'json' | 'regex';

const TABS: TabDef<BenchmarkTab>[] = [
  { id: 'json', label: 'JSON Parse' },
  { id: 'regex', label: 'Regex Match' },
];

/**
 * Dashboard shell: live runtime status, benchmark-type tabs, and the active
 * benchmark workspace. The backend contract lives in @bench/shared; requests
 * go through the API client under lib/api.ts.
 */
export function App() {
  const [active, setActive] = useState<BenchmarkTab>('json');

  return (
    <main className="shell">
      <header>
        <h1>Bun Benchmark Platform</h1>
        <p>Open, transparent real-world performance measurements on the Bun runtime.</p>
      </header>

      <RuntimeStatus />

      <Tabs tabs={TABS} active={active} onChange={setActive} />

      <section className="tab-panel">
        {active === 'json' ? <JsonParseTab /> : <RegexMatchTab />}
      </section>

      <footer className="shell-footer">
        ns-precision timing · memory deltas · GC awareness · server + HTTP trace headers
      </footer>
    </main>
  );
}
