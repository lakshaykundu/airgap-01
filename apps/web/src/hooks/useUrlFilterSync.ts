import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { useAppDispatch, useAppSelector } from '../store';
import {
  filtersActions,
  filtersFromSearchParams,
  filtersToSearchParams,
} from '../store/filtersSlice';

/**
 * Two-way binding between Redux filter state and the URL query string, so a
 * refreshed or shared `/incidents?severity=critical&status=open` restores the
 * same view. The URL wins on first load; afterwards Redux drives the URL.
 */
export function useUrlFilterSync(): void {
  const [params, setParams] = useSearchParams();
  const filters = useAppSelector((state) => state.filters);
  const dispatch = useAppDispatch();
  const firstRun = useRef(true);

  useEffect(() => {
    dispatch(filtersActions.replaceFilters(filtersFromSearchParams(params)));
    // Only on mount: later URL changes originate from this hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Skip the mount pass: `filters` still holds the pre-hydration value here.
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const next = filtersToSearchParams(filters);
    const selected = params.get('id');
    if (selected) next.set('id', selected);
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [filters, params, setParams]);
}
