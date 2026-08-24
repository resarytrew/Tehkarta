import { createContext, useContext, useMemo, type ReactNode } from 'react';

interface SessionActions {
  endSession(): void;
}

const SessionActionsContext = createContext<SessionActions | null>(null);

export function SessionActionsProvider({ onSessionEnded, children }: { onSessionEnded(): void; children: ReactNode }) {
  const value = useMemo(() => ({ endSession: onSessionEnded }), [onSessionEnded]);
  return (
    <SessionActionsContext.Provider value={value}>
      {children}
    </SessionActionsContext.Provider>
  );
}

export function useSessionActions(): SessionActions {
  const value = useContext(SessionActionsContext);
  if (!value) throw new Error('useSessionActions must be used inside SessionActionsProvider.');
  return value;
}
