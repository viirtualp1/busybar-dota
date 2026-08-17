const HEROES_URL = 'https://api.opendota.com/api/heroes';

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

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  get ready() {
    return this.loaded;
  }

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

  name(heroId: number) {
    if (!heroId) {
      return '-';
    }

    return this.names.get(heroId) ?? `#${heroId}`;
  }
}
