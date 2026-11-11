'use client';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button } from '@sovereignfs/ui';
import styles from './Undo.module.css';

/**
 * **A tick, an untick and _Clear bought_ offer Undo** (DESIGN.md §12.7), for five seconds: undo is a new mutation that reverses the old, so it works
 * offline and syncs like any other. The design system's toast has no action to press, so this is the small bar that has one (a gap to raise in
 * `sovereign`). One at a time: a second change takes the place of the first, whose Undo is gone, which is what a person who has just ticked something
 * else expects, and what keeps the bar from becoming a stack.
 */
interface Offer {
  message: string;
  undo: () => void | Promise<void>;
}

const Context = createContext<((message: string, undo: Offer['undo']) => void) | null>(null);

export const UNDO_MS = 5000;

export function useUndo(): (message: string, undo: Offer['undo']) => void {
  const offer = useContext(Context);
  if (!offer) throw new Error('useUndo is used inside an UndoProvider');
  return offer;
}

export function UndoProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<(Offer & { id: number }) | null>(null);
  const counter = useRef(0);

  const offer = useCallback((message: string, undo: Offer['undo']) => {
    setCurrent({ message, undo, id: ++counter.current });
  }, []);

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => setCurrent(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [current]);

  const value = useMemo(() => offer, [offer]);
  return (
    <Context.Provider value={value}>
      {children}
      {current ? (
        <div className={styles.bar} role="status" aria-live="polite">
          <span>{current.message}</span>
          <Button
            variant="secondary"
            onClick={() => {
              const { undo } = current;
              setCurrent(null);
              void undo();
            }}
          >
            Undo
          </Button>
        </div>
      ) : null}
    </Context.Provider>
  );
}
