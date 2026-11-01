import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/** Measured values only (performance.now()). Nothing here is estimated or invented. */
export interface PerfMetrics {
  datasetSize: number | null;
  generateMs: number | null;
  queryMs: number | null;
  filterMs: number | null;
  renderedRows: number | null;
  visibleRecords: number | null;
  queryStrategy: string | null;
}

const initialState: PerfMetrics = {
  datasetSize: null,
  generateMs: null,
  queryMs: null,
  filterMs: null,
  renderedRows: null,
  visibleRecords: null,
  queryStrategy: null,
};

const perfSlice = createSlice({
  name: 'perf',
  initialState,
  reducers: {
    recordMetrics(state, action: PayloadAction<Partial<PerfMetrics>>) {
      Object.assign(state, action.payload);
    },
    resetMetrics: () => initialState,
  },
});

export const perfActions = perfSlice.actions;
export default perfSlice.reducer;
