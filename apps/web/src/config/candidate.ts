/**
 * Candidate details for the "Built by" section. Links come from public VITE_*
 * environment variables; any link left empty is hidden rather than rendered
 * as a broken button. Nothing here is guessed.
 */
function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export const candidate = {
  name: 'Lakshay Kumar',
  role: 'Frontend Engineer',
  summary: 'Nearly 2 years of experience building production enterprise applications.',
  previously: 'Previously worked on enterprise CRM systems at Sense.',
  experience: [
    'React and TypeScript',
    'Redux',
    'Complex enterprise workflows',
    'Performance optimization',
    'Chrome extension engineering',
    'Reusable component architecture',
    'API integrations',
  ],
  statement:
    'I built AIRGAP/01 to demonstrate how I approach frontend reliability, complex state, and engineering challenges beyond the happy path.',
  links: {
    github: clean(import.meta.env.VITE_GITHUB_URL),
    portfolio: clean(import.meta.env.VITE_PORTFOLIO_URL),
    video: clean(import.meta.env.VITE_VIDEO_URL),
    resume: clean(import.meta.env.VITE_RESUME_URL),
    source: clean(import.meta.env.VITE_SOURCE_URL) ?? clean(import.meta.env.VITE_GITHUB_URL),
  },
  contact: {
    email: clean(import.meta.env.VITE_CONTACT_EMAIL),
    phone: clean(import.meta.env.VITE_CONTACT_PHONE),
  },
} as const;

export const APP_NAME = clean(import.meta.env.VITE_APP_NAME) ?? 'AIRGAP/01';
