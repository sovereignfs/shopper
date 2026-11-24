import { describe, expect, it } from 'vitest';
import { appsKey, readApps, rememberApps, tilesOf } from './launcher-apps';

const CORE = 'https://sovereign.example.com';
const tile = (over: Record<string, unknown> = {}) => ({
  id: 'tusk',
  name: 'Tusk',
  description: 'Boards',
  icon: `${CORE}/api/branding/apps/tusk`,
  launchUrl: 'https://tusk.example.com/',
  ...over,
});

describe('the apps a person may open, as the launcher may draw them', () => {
  it('keeps an app’s name, its icon on core’s own origin and its address, and nothing else core said', () => {
    expect(tilesOf([tile()], CORE)).toEqual([
      {
        id: 'tusk',
        name: 'Tusk',
        icon: `${CORE}/api/branding/apps/tusk`,
        launchUrl: 'https://tusk.example.com/',
      },
    ]);
  });

  it('draws an app with no icon, or an icon that is not on core’s origin, by its first letter, and never from another site', () => {
    for (const icon of [
      null,
      undefined,
      '',
      'https://elsewhere.example.com/i.png',
      'data:image/png;base64,AAAA',
      'javascript:alert(1)',
      '/api/branding/apps/tusk',
      5,
    ])
      expect(tilesOf([tile({ icon })], CORE)[0]?.icon, String(icon)).toBeNull();
  });

  it('leaves out an app that cannot be opened by an http or https address, or has no name or id', () => {
    for (const over of [
      { launchUrl: 'javascript:alert(1)' },
      { launchUrl: 'data:text/html,x' },
      { launchUrl: 'https://user:pass@tusk.example.com/' },
      { launchUrl: '/relative' },
      { launchUrl: null },
      { name: '' },
      { name: '   ' },
      { name: 'x'.repeat(81) },
      { id: '' },
      { id: 7 },
    ])
      expect(tilesOf([tile(over)], CORE), JSON.stringify(over)).toEqual([]);
  });

  it('leaves out the app the launcher is in, an app named twice, what is not an app, and all past forty', () => {
    expect(
      tilesOf([tile(), tile({ id: 'shopper', name: 'Shopper' })], CORE, 'shopper').map(
        (each) => each.id,
      ),
    ).toEqual(['tusk']);
    expect(tilesOf([tile(), tile()], CORE)).toHaveLength(1);
    expect(tilesOf([null, 'x', 4, [], tile()], CORE)).toHaveLength(1);
    const many = Array.from({ length: 60 }, (_, index) => tile({ id: `app-${index}` }));
    expect(tilesOf(many, CORE)).toHaveLength(40);
    for (const raw of [null, undefined, 'x', {}, 4]) expect(tilesOf(raw, CORE)).toEqual([]);
  });
});

const storage = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => void (data[key] = value),
  };
};

describe('what the device keeps of them', () => {
  it('is per account, read back as written, and nothing of another account’s', () => {
    const kept = storage();
    const apps = tilesOf([tile()], CORE);
    rememberApps(kept, 'ada', apps);
    expect(Object.keys(kept.data)).toEqual([appsKey('ada')]);
    expect(readApps(kept, 'ada', CORE)).toEqual(apps);
    expect(readApps(kept, 'grace', CORE)).toBeUndefined();
  });

  it('is held to the same on the way out: what was changed in storage is not drawn', () => {
    const kept = storage({
      [appsKey('ada')]: JSON.stringify([
        {
          id: 'x',
          name: 'Evil',
          icon: 'https://evil.example.com/i.png',
          launchUrl: 'javascript:alert(1)',
        },
        {
          id: 'y',
          name: 'Fine',
          icon: 'https://evil.example.com/i.png',
          launchUrl: 'https://y.example.com/',
        },
      ]),
    });
    expect(readApps(kept, 'ada', CORE)).toEqual([
      { id: 'y', name: 'Fine', icon: null, launchUrl: 'https://y.example.com/' },
    ]);
  });

  it('is nothing for text that is not JSON, and survives a browser with no storage or one that refuses it', () => {
    expect(readApps(storage({ [appsKey('ada')]: 'not json' }), 'ada', CORE)).toBeUndefined();
    expect(readApps(undefined, 'ada', CORE)).toBeUndefined();
    const refusing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readApps(refusing, 'ada', CORE)).toBeUndefined();
    expect(() => rememberApps(refusing, 'ada', [])).not.toThrow();
  });
});
