import { createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit';

export interface Toast {
  id: string;
  tone: 'info' | 'success' | 'warning' | 'error';
  title: string;
  description?: string;
}

export interface UiState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  commandPaletteOpen: boolean;
  queueDrawerOpen: boolean;
  devConsoleOpen: boolean;
  /** null = closed; 'new' = create form; otherwise the incident id being edited. */
  editor: 'new' | string | null;
  /** Incident whose details drawer is open. */
  detailId: string | null;
  conflictEntityId: string | null;
  toasts: Toast[];
}

const SIDEBAR_KEY = 'airgap-01:sidebar-collapsed';

function initialSidebar(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
}

const initialState: UiState = {
  sidebarCollapsed: initialSidebar(),
  mobileNavOpen: false,
  commandPaletteOpen: false,
  queueDrawerOpen: false,
  devConsoleOpen: false,
  editor: null,
  detailId: null,
  conflictEntityId: null,
  toasts: [],
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      try {
        localStorage.setItem(SIDEBAR_KEY, state.sidebarCollapsed ? '1' : '0');
      } catch {
        /* storage unavailable — preference just won't persist */
      }
    },
    setMobileNav(state, action: PayloadAction<boolean>) {
      state.mobileNavOpen = action.payload;
    },
    setCommandPalette(state, action: PayloadAction<boolean>) {
      state.commandPaletteOpen = action.payload;
    },
    setQueueDrawer(state, action: PayloadAction<boolean>) {
      state.queueDrawerOpen = action.payload;
    },
    toggleDevConsole(state) {
      state.devConsoleOpen = !state.devConsoleOpen;
    },
    setDevConsole(state, action: PayloadAction<boolean>) {
      state.devConsoleOpen = action.payload;
    },
    openEditor(state, action: PayloadAction<'new' | string>) {
      state.editor = action.payload;
    },
    closeEditor(state) {
      state.editor = null;
    },
    openDetail(state, action: PayloadAction<string | null>) {
      state.detailId = action.payload;
    },
    openConflict(state, action: PayloadAction<string | null>) {
      state.conflictEntityId = action.payload;
    },
    pushToast: {
      reducer(state, action: PayloadAction<Toast>) {
        state.toasts.push(action.payload);
        if (state.toasts.length > 4) state.toasts.shift();
      },
      prepare: (toast: Omit<Toast, 'id'>) => ({ payload: { ...toast, id: nanoid() } }),
    },
    dismissToast(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter((toast) => toast.id !== action.payload);
    },
  },
});

export const uiActions = uiSlice.actions;
export default uiSlice.reducer;
