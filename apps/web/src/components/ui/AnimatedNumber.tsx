import { animate, useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';

/** Tweens between integer values; jumps instantly when reduced motion is preferred. */
export function AnimatedNumber({
  value,
  pad = 0,
  className,
}: {
  value: number;
  pad?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(value);
  const reduce = useReducedMotion();
  const format = (n: number) => String(Math.round(n)).padStart(pad, '0');

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduce || previous.current === value) {
      node.textContent = format(value);
      previous.current = value;
      return;
    }
    const controls = animate(previous.current, value, {
      duration: 0.35,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        node.textContent = format(latest);
      },
    });
    previous.current = value;
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce]);

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {format(value)}
    </span>
  );
}
