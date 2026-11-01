import { ExternalLink, FileText, Github, Globe, Mail, Phone, PlayCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { PageContainer, PageHeader } from '../components/layout/PageHeader';
import { Panel, PanelHeader } from '../components/ui/Panel';
import { candidate } from '../config/candidate';

function LinkButton({
  href,
  icon,
  children,
  primary = false,
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
  primary?: boolean;
}) {
  const external = !href.startsWith('mailto:') && !href.startsWith('tel:');
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      className={
        primary
          ? 'inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 font-mono text-xs font-semibold tracking-[0.08em] text-[#03140f] uppercase hover:bg-[#4ff0d0]'
          : 'inline-flex h-10 items-center gap-2 rounded-lg border border-line px-4 font-mono text-xs tracking-[0.08em] text-fg-2 uppercase hover:border-primary/50 hover:text-fg'
      }
    >
      {icon}
      {children}
      {external && <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />}
    </a>
  );
}

const FEATURES = [
  'Local-first CRUD on IndexedDB, identical online and offline',
  'Durable ordered mutation queue with idempotency keys',
  'Exponential backoff with jitter, bounded retries, permanent-failure surfacing',
  'Optimistic concurrency with a field-level conflict resolver',
  'Cross-tab coordination (Web Locks + BroadcastChannel)',
  'Service worker app shell — reload with no network',
  'Server-Sent Events with cursor-based catch-up and polling fallback',
  'Chaos Lab: simulated disconnect, latency, failure injection, lost responses',
  '1,000-record load test with virtualization and measured timings',
];

const LIMITATIONS = [
  'Conflict detection is per incident (whole-record version), not per field; the merge UI is how field-level intent is preserved.',
  'Simulated latency delays requests; it does not emulate bandwidth or packet loss.',
  'The SSE stream is not routed through the simulated transport; it is closed while the simulated disconnect is active.',
  'Demo sessions are isolation for fictional data — not authentication. Never use this pattern to protect real data.',
  'A first visit needs the network once, to download the app shell and create the demo workspace.',
];

export default function AboutPage() {
  const { links, contact } = candidate;
  return (
    <PageContainer>
      <PageHeader
        eyebrow="About the project"
        title="AIRGAP/01"
        description="NO SIGNAL. STILL IN CONTROL. A fictional infrastructure operations console that demonstrates reliable frontend behaviour when connectivity is intermittent, slow, or absent."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel lit>
          <PanelHeader eyebrow="What it demonstrates" title="Engineering beyond the happy path" />
          <div className="p-5">
            <ul className="space-y-2">
              {FEATURES.map((feature) => (
                <li key={feature} className="flex gap-3 text-sm text-fg-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" aria-hidden />
                  {feature}
                </li>
              ))}
            </ul>
            <p className="label-xs mt-6">Known limitations</p>
            <ul className="mt-2 space-y-2">
              {LIMITATIONS.map((item) => (
                <li key={item} className="flex gap-3 text-[13px] text-fg-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-fg-3" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link
                to="/architecture"
                className="inline-flex h-10 items-center rounded-lg border border-line px-4 font-mono text-xs tracking-[0.08em] text-fg-2 uppercase hover:border-primary/50 hover:text-fg"
              >
                Explore the architecture
              </Link>
              <Link
                to="/lab"
                className="inline-flex h-10 items-center rounded-lg border border-line px-4 font-mono text-xs tracking-[0.08em] text-fg-2 uppercase hover:border-primary/50 hover:text-fg"
              >
                Open the Chaos Lab
              </Link>
            </div>
          </div>
        </Panel>

        <Panel lit className="relative overflow-hidden" aria-labelledby="built-by">
          <div
            className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl"
            aria-hidden
          />
          <div className="relative p-6">
            <p className="label-xs text-primary">Built by</p>
            <h2 id="built-by" className="mt-2 text-3xl font-semibold tracking-tight">
              {candidate.name}
            </h2>
            <p className="mt-1 font-mono text-[12px] tracking-[0.14em] text-fg-2 uppercase">
              {candidate.role}
            </p>
            <p className="mt-4 text-sm text-fg-2">
              {candidate.summary} {candidate.previously}
            </p>
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {candidate.experience.map((skill) => (
                <li
                  key={skill}
                  className="rounded-md border border-line bg-bg/50 px-2 py-1 text-[12px] text-fg-2"
                >
                  {skill}
                </li>
              ))}
            </ul>
            <blockquote className="mt-6 border-l-2 border-primary/60 pl-4 text-[15px] leading-relaxed text-fg">
              “{candidate.statement}”
            </blockquote>
            <div className="mt-6 flex flex-wrap gap-2" data-testid="candidate-links">
              {links.github && (
                <LinkButton href={links.github} icon={<Github className="h-4 w-4" />} primary>
                  View GitHub
                </LinkButton>
              )}
              {links.portfolio && (
                <LinkButton href={links.portfolio} icon={<Globe className="h-4 w-4" />}>
                  View portfolio
                </LinkButton>
              )}
              {links.video && (
                <LinkButton href={links.video} icon={<PlayCircle className="h-4 w-4" />}>
                  Watch the 35-second film
                </LinkButton>
              )}
              {links.resume && (
                <LinkButton href={links.resume} icon={<FileText className="h-4 w-4" />}>
                  View resume
                </LinkButton>
              )}
              {contact.email && (
                <LinkButton href={`mailto:${contact.email}`} icon={<Mail className="h-4 w-4" />}>
                  Contact me
                </LinkButton>
              )}
              {contact.phone && (
                <LinkButton
                  href={`tel:${contact.phone.replace(/\s+/g, '')}`}
                  icon={<Phone className="h-4 w-4" />}
                >
                  {contact.phone}
                </LinkButton>
              )}
            </div>
            <p className="mt-8 border-t border-line/70 pt-4 text-[11px] text-fg-3">
              Independent engineering demonstration. Not affiliated with Sarvam AI. All
              infrastructure, locations, operators and incidents are fictional.
            </p>
          </div>
        </Panel>
      </div>
    </PageContainer>
  );
}
