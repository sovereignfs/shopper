'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Dialog } from '@sovereignfs/ui';
import type { Found } from '../cards/scan';
import { pickDecoder } from '../cards/zxing-client';
import styles from './ScanDialog.module.css';

type State = 'starting' | 'scanning' | 'denied' | 'none' | 'broken';

/**
 * **Scanning a card with the camera** (DESIGN.md §22.3, RFC 0007, task 24.4): the camera through `getUserMedia`, a frame read every moment by the decoder (`pickDecoder`) **on this device**, and
 * the first code of one of the six kinds handed on. **No frame goes anywhere:** it is drawn to a canvas, read, and dropped; nothing is requested while this is open once the decoder is loaded
 * (from this app's own origin, and only now). The camera is let go the moment this closes. **Typing is always a way:** where there is no camera, or the person said no, or the decoder
 * will not load, this says so in a sentence and offers the form; it never leaves a person with a dead end.
 */
export function ScanDialog({
  onFound,
  onType,
  onClose,
}: {
  onFound: (found: Found) => void;
  /** The form, empty: the way when there is no camera or the person would rather type. */
  onType: () => void;
  onClose: () => void;
}) {
  // The picture's element and the camera's stream arrive on their own time (the dialog draws its content a moment after it opens, and a camera answers when it likes), so each is held in
  // state and the reading starts when both are there.
  const [element, setElement] = useState<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<State>('starting');
  // The callback as it is now, without restarting the camera when a parent draws again.
  const latest = useRef({ onFound });
  latest.current = { onFound };

  // The camera: asked for once, and let go the moment this closes, whether or not it had answered yet.
  useEffect(() => {
    let closed = false;
    let got: MediaStream | undefined;
    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setState('none');
      try {
        got = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch (error) {
        return setState(
          error instanceof DOMException &&
            (error.name === 'NotAllowedError' || error.name === 'SecurityError')
            ? 'denied'
            : 'none',
        );
      }
      if (closed) return got.getTracks().forEach((track) => track.stop());
      setStream(got);
    })();
    return () => {
      closed = true;
      for (const track of got?.getTracks() ?? []) track.stop();
    };
  }, []);

  // The reading: a frame every moment, from when the picture and the camera are both there until a code is found or this closes.
  useEffect(() => {
    if (!stream || !element) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    element.srcObject = stream;
    // Not waited for: a picture that has not started has no width yet, which the loop below waits for, and a promise that is slow to settle must not hold the decoder back.
    void element.play().catch(() => undefined);
    void (async () => {
      let decoder;
      try {
        decoder = await pickDecoder();
        // Fetched and compiled before the first frame is read, so that reading a frame asks for nothing.
        await decoder.ready();
      } catch {
        for (const track of stream.getTracks()) track.stop();
        return setState('broken');
      }
      if (stopped) return;
      setState('scanning');
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const tick = async () => {
        if (stopped) return;
        if (context && element.videoWidth > 0) {
          // A frame at a size a decoder reads quickly, and no larger than the camera gave.
          const scale = Math.min(1, 960 / element.videoWidth);
          canvas.width = Math.round(element.videoWidth * scale);
          canvas.height = Math.round(element.videoHeight * scale);
          context.drawImage(element, 0, 0, canvas.width, canvas.height);
          const found = await decoder
            .decode(context.getImageData(0, 0, canvas.width, canvas.height))
            .catch(() => null);
          if (found && !stopped) {
            stopped = true;
            for (const track of stream.getTracks()) track.stop();
            latest.current.onFound(found);
            return;
          }
        }
        if (!stopped) timer = setTimeout(() => void tick(), 150);
      };
      void tick();
    })();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [stream, element]);

  const stuck = state === 'denied' || state === 'none' || state === 'broken';
  return (
    // A header, not a title: a title is shown on a phone only, and on a desktop the close button would float over the body.
    <Dialog open onClose={onClose} size="md" header="Scan a card" aria-label="Scan a card">
      <div className={styles.scan}>
        {stuck ? (
          <Alert variant="info">
            {state === 'denied'
              ? 'The camera is not allowed here, so a card cannot be scanned. You can type its number instead.'
              : state === 'broken'
                ? 'Scanning is not available on this device right now. You can type the number instead.'
                : 'There is no camera to scan with. You can type the number instead.'}
          </Alert>
        ) : (
          <>
            {/* A live picture of the camera and nothing else: it has no sound, and nothing in it is recorded or sent. */}
            <video
              ref={setElement}
              className={styles.video}
              playsInline
              muted
              aria-label="Camera"
            />
            <p className={styles.hint} role="status">
              {state === 'starting'
                ? 'Starting the camera…'
                : 'Hold the card’s code steady in view. It is read on this device and goes nowhere.'}
            </p>
          </>
        )}
        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant={stuck ? 'primary' : 'secondary'} onClick={onType}>
            Type the number instead
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
