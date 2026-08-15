/**
 * Hero id → short name.
 *
 * Fetched from OpenDota rather than vendored: the list grows every patch, and a
 * stale hardcoded table shows `#145` for exactly the heroes people care about
 * during a new patch's tournament. A failed fetch degrades to `#id`, never throws.
 */
const HEROES_URL = 'https://api.opendota.com/api/heroes';

/** Names that stay readable when clipped to a few characters. */
const SHORT_NAMES: Record<string, string> = {
  'Anti-Mage': 'AM',
  'Centaur Warrunner': 'Centaur',
  'Crystal Maiden': 'CM',
  'Dark Willow': 'DarkWill',
  'Dragon Knight': 'DK',
  'Drow Ranger': 'Drow',
  'Ember Spirit': 'Ember',
  'Earth Spirit': 'EarthSp',
  'Elder Titan': 'Titan',
  'Faceless Void': 'Void',
  'Keeper of the Light': 'KotL',
  'Legion Commander': 'LC',
  "Nature's Prophet": 'NP',
  'Nyx Assassin': 'Nyx',
  'Outworld Destroyer': 'OD',
  'Phantom Assassin': 'PA',
  'Phantom Lancer': 'PL',
  'Queen of Pain': 'QoP',
  'Shadow Fiend': 'SF',
  'Shadow Demon': 'SD',
  'Shadow Shaman': 'Shaman',
  'Skywrath Mage': 'Skymage',
  'Storm Spirit': 'Storm',
  'Templar Assassin': 'TA',
  'Treant Protector': 'Treant',
  'Troll Warlord': 'Troll',
  'Vengeful Spirit': 'Venge',
  'Void Spirit': 'VoidSp',
  'Winter Wyvern': 'Wyvern',
  'Witch Doctor': 'WD',
  'Wraith King': 'WK',
};

type OpenDotaHero = { id?: unknown; localized_name?: unknown };

export class HeroCatalog {
  private names = new Map<number, string>();
  private loaded = false;

  constructor(private readonly fetchImpl: typeof fetch = fetch) { }

  get ready(): boolean {
    return this.loaded;
  }

  /** Resolves to `false` when the catalog could not be loaded; never rejects. */
  async load(signal?: AbortSignal): Promise<boolean> {
    try {
      const response = await this.fetchImpl(HEROES_URL, signal ? { signal } : {});
      if (!response.ok) {
        return false;
      }
      const body: unknown = await response.json();
      if (!Array.isArray(body)) {
        return false;
      }
      for (const entry of body as OpenDotaHero[]) {
        const id = Number(entry.id);
        const name = typeof entry.localized_name === 'string' ? entry.localized_name : '';
        if (Number.isFinite(id) && name) {
          this.names.set(id, SHORT_NAMES[name] ?? name);
        }
      }
      this.loaded = this.names.size > 0;
      return this.loaded;
    } catch {
      return false;
    }
  }

  name(heroId: number): string {
    if (!heroId) {
      return '-';
    }
    return this.names.get(heroId) ?? `#${heroId}`;
  }
}
