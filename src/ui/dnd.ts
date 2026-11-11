import {
  type Announcements,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useCallback, useEffect, useRef } from 'react';

/**
 * What every drag-to-reorder in the app shares (DESIGN.md §9.6), so that what each of those paid to learn is paid for once:
 *
 *  - **The sensors.** A pointer has to move a few pixels before it is a drag, so that a click on a row follows its link and ticks its box, and the
 *    keyboard picks a row up with Space, moves it with the arrows and puts it down with Space or lets it go with Escape. **Enter is left alone**, as it is not a way to lift a row.
 *  - **Auto-scroll only up and down.** dnd-kit scrolls whatever scrolls while a row is dragged near an edge; the horizontal threshold is zero, so nothing
 *    scrolls sideways.
 *  - **The click that ends a drag is not a tick.** The row is under the pointer when it is let go, and the browser clicks it.
 *
 * Each `DndContext` needs an explicit `id`, or the server and the browser name its pieces differently and React reports a mismatch.
 */
export function useReorderSensors() {
  return useSensors(
    // A mouse lifts after a few pixels; a touch after a press, so that a tap is a tick and a scroll is a scroll (DESIGN.md §16.11).
    // Separate sensors, because a pointer sensor would take a finger at once and the page would not scroll.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  );
}

/** Pass to `DndContext`'s `autoScroll`: vertical only. */
export const VERTICAL_AUTOSCROLL = { threshold: { x: 0, y: 0.2 } } as const;

/**
 * Swallows the click that ends a drag. Call `begin()` when a drag starts and `end()` when it ends or is cancelled; the click comes straight after the
 * pointer is released, so the guard is held a moment longer. One listener, put on the window once.
 */
export function useDragClickGuard(): { begin: () => void; end: () => void } {
  const dragging = useRef(false);
  useEffect(() => {
    const swallow = (event: MouseEvent) => {
      if (!dragging.current) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('click', swallow, true);
    return () => window.removeEventListener('click', swallow, true);
  }, []);
  const begin = useCallback(() => {
    dragging.current = true;
  }, []);
  const end = useCallback(() => {
    setTimeout(() => (dragging.current = false), 150);
  }, []);
  return { begin, end };
}

/** What a drag says of a thing it is moving or has come over. */
export interface Spoken {
  /** `list` or `item`. */
  readonly noun: string;
  /** What a person calls it (its title). **Never its id**: dnd-kit's own words read the id aloud. */
  readonly name: string;
  /** Where it is among its neighbours, from 1. */
  readonly position: number;
  readonly total: number;
  /** The category it is in, which is where it can be moved. */
  readonly inside?: string;
}

const where = (about: Spoken) =>
  `position ${about.position} of ${about.total}${about.inside ? ` in ${about.inside}` : ''}`;

/**
 * What a drag says aloud (DESIGN.md §9.6). dnd-kit announces a pick-up, a move, a drop and a cancel in a live region, but in its own words, which name a thing by
 * its id ("Draggable item f0ed12b5-… was moved over droppable area f0ed…"): nothing a person could use. These say what it is and where it is, in order, so that a
 * drag by the keyboard can be done and checked by ear. `about` names a thing by its id, as the screen knows it, or `undefined` for what it does not know.
 */
export function spokenDrag(about: (id: string) => Spoken | undefined): {
  announcements: Announcements;
  screenReaderInstructions: { draggable: string };
} {
  const of = (id: string | number) => about(String(id));
  const pickedUp = (it: Spoken) =>
    `Picked up ${it.noun} ${it.name}, ${where(it)}. Move it with the arrow keys, drop it with Space, cancel with Escape.`;
  return {
    screenReaderInstructions: {
      draggable:
        'To pick this up, press Space. Move it with the arrow keys, drop it with Space, or cancel with Escape.',
    },
    announcements: {
      onDragStart({ active }) {
        const it = of(active.id);
        return it ? pickedUp(it) : 'Picked up.';
      },
      onDragOver({ active, over }) {
        const it = of(active.id);
        const there = over ? of(over.id) : undefined;
        if (!it || !there) return undefined;
        // The first thing after a pick-up is "over itself", in the same render as the pick-up, which would be replaced by it unheard: so it says the pick-up.
        if (over && String(over.id) === String(active.id)) return pickedUp(it);
        return there.noun === it.noun
          ? `${it.name} is over ${where(there)}.`
          : `${it.name} is over ${there.noun} ${there.name}.`;
      },
      onDragEnd({ active, over }) {
        const it = of(active.id);
        const there = over ? of(over.id) : undefined;
        if (!it) return 'Dropped.';
        return there && there.noun === it.noun
          ? `Dropped ${it.noun} ${it.name} at ${where(there)}.`
          : `Dropped ${it.noun} ${it.name}.`;
      },
      onDragCancel({ active }) {
        const it = of(active.id);
        return it ? `Cancelled. ${it.name} stays where it was.` : 'Cancelled.';
      },
    },
  };
}
