import {
  Activity,
  FlaskConical,
  Info,
  LayoutDashboard,
  ListTodo,
  Map,
  Network,
  RefreshCcwDot,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  section: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', section: 'Operations Overview', icon: LayoutDashboard },
  { to: '/map', label: 'Operations Map', section: 'Operations Map', icon: Map },
  { to: '/incidents', label: 'Incidents', section: 'Incident Explorer', icon: ListTodo },
  { to: '/activity', label: 'Activity Log', section: 'Activity Log', icon: Activity },
  {
    to: '/sync',
    label: 'Synchronization Center',
    section: 'Synchronization Center',
    icon: RefreshCcwDot,
  },
  { to: '/lab', label: 'Engineering Playground', section: 'Chaos Lab', icon: FlaskConical },
  { to: '/architecture', label: 'Architecture', section: 'Architecture Viewer', icon: Network },
  { to: '/about', label: 'About AIRGAP/01', section: 'About', icon: Info },
];

export function sectionFor(pathname: string): NavItem {
  return (
    NAV_ITEMS.find((item) => item.to !== '/' && pathname.startsWith(item.to)) ??
    (pathname === '/'
      ? NAV_ITEMS[0]!
      : { to: pathname, label: 'Not found', section: 'Not Found', icon: Info })
  );
}
