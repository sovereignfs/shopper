import { describe, expect, it } from 'vitest';
import { householdLabel } from './label';

describe('what a household is called', () => {
  it('is its name when it has one', () => {
    expect(householdLabel({ name: 'Home', viewerIsOwner: false, ownerName: 'Kasun' })).toBe('Home');
  });

  it('is "My lists" to its owner and the owner’s name to everyone else, until it has a name', () => {
    expect(householdLabel({ name: null, viewerIsOwner: true, ownerName: 'Kasun' })).toBe(
      'My lists',
    );
    expect(householdLabel({ name: null, viewerIsOwner: false, ownerName: 'Kasun' })).toBe(
      'Kasun’s lists',
    );
    expect(householdLabel({ name: '  ', viewerIsOwner: false, ownerName: ' Kasun ' })).toBe(
      'Kasun’s lists',
    );
  });

  it('is "Shared lists" when its owner is gone, or it was never anyone’s first', () => {
    expect(householdLabel({ name: null, viewerIsOwner: false, ownerName: null })).toBe(
      'Shared lists',
    );
    expect(householdLabel({ name: null, viewerIsOwner: false, ownerName: '' })).toBe(
      'Shared lists',
    );
  });
});
