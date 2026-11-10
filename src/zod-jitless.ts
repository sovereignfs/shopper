import { z } from 'zod';

/**
 * Zod's schemas compile themselves with `new Function` when the environment allows it, and **find out whether it does by trying**. The browser is given a
 * Content-Security-Policy that does not allow it (DESIGN.md §21), so the try is a violation, reported and shown in the console, on every page that loads a
 * schema: the validators run on the device as well as on the server (DESIGN.md §12.2). Turning the compiler off costs a little speed on a mutation and
 * removes the violation. **Import this first**, before a schema is made: the choice is read when an object schema is built.
 */
z.config({ jitless: true });
