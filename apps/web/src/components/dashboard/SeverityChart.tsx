import { SECTORS } from '@airgap/shared';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { LocalIncident } from '../../database/db';

const COLORS = { critical: '#ff5364', high: '#ff8a5c', medium: '#ffbb55', low: '#4b5b75' };

/** Open incidents per sector, stacked by severity. Derived from IndexedDB. */
export default function SeverityChart({ incidents }: { incidents: LocalIncident[] }) {
  const data = useMemo(
    () =>
      SECTORS.map((sector) => {
        const row = {
          sector: sector.code.replace('SECTOR ', 'S'),
          name: sector.name,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
        };
        for (const incident of incidents) {
          if (incident.sectorId === sector.id && incident.status !== 'resolved')
            row[incident.severity]++;
        }
        return row;
      }),
    [incidents],
  );
  return (
    <div
      className="h-56 w-full"
      role="img"
      aria-label="Open incidents by sector, stacked by severity"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 4, right: 4, bottom: 0, left: -24 }}
          barCategoryGap="28%"
        >
          <CartesianGrid vertical={false} stroke="#233147" strokeDasharray="2 4" />
          <XAxis
            dataKey="sector"
            tick={{ fill: '#7b8aa3', fontSize: 10, fontFamily: 'Geist Mono Variable' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: '#7b8aa3', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'rgba(36,229,192,0.06)' }}
            contentStyle={{
              background: '#111b2d',
              border: '1px solid #233147',
              borderRadius: 10,
              fontSize: 12,
            }}
            labelStyle={{ color: '#f5f7fa' }}
            labelFormatter={(_, payload) =>
              (payload?.[0]?.payload as { name?: string } | undefined)?.name ?? ''
            }
          />
          {(['low', 'medium', 'high', 'critical'] as const).map((key, index) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="s"
              fill={COLORS[key]}
              radius={index === 3 ? [3, 3, 0, 0] : 0}
              isAnimationActive
              animationDuration={300}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
