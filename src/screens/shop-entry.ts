/**
 * Whether shopping mode was opened from a list in this page's life (DESIGN.md §11.2). Leaving then goes **back**, which the browser does from what it
 * already holds, so that finishing works with no network; opened from an address, a bookmark or a reload, leaving goes to the list by its address.
 * Held for the page's life and nothing more: it decides where Back goes, not what is shown.
 */
let fromList = false;

export const shopEntry = {
  setFromList(value: boolean): void {
    fromList = value;
  },
  wasFromList(): boolean {
    return fromList;
  },
};
