const HEROES_URL = 'https://api.steampowered.com/IEconDOTA2_570/GetHeroes/v1/';

const HERO_PREFIX = 'npc_dota_hero_';

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

type SteamHero = { id?: unknown; name?: unknown; localized_name?: unknown };

export class HeroCatalog {
  private names = new Map<number, string>();
  private slugs = new Map<number, string>();
  private loaded = false;

  constructor(
    private readonly apiKey = '',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get ready() {
    return this.loaded;
  }

  async load(signal?: AbortSignal): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      const url = new URL(HEROES_URL);
      url.searchParams.set('key', this.apiKey);
      url.searchParams.set('language', 'en');
      const response = await this.fetchImpl(url, signal ? { signal } : {});
      if (!response.ok) {
        return false;
      }
      const body: unknown = await response.json();
      const heroes = readHeroes(body);

      for (const entry of heroes) {
        const id = Number(entry.id);
        const name = typeof entry.localized_name === 'string' ? entry.localized_name : '';
        if (Number.isFinite(id) && name) {
          this.names.set(id, SHORT_NAMES[name] ?? name);
        }
        const slug = typeof entry.name === 'string' ? entry.name : '';
        if (Number.isFinite(id) && slug.startsWith(HERO_PREFIX)) {
          this.slugs.set(id, slug.slice(HERO_PREFIX.length));
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

  slug(heroId: number) {
    return this.slugs.get(heroId) ?? '';
  }
}

function readHeroes(body: unknown): SteamHero[] {
  if (typeof body !== 'object' || body === null) {
    return [];
  }
  const result = (body as { result?: unknown }).result;
  if (typeof result !== 'object' || result === null) {
    return [];
  }
  const heroes = (result as { heroes?: unknown }).heroes;

  return Array.isArray(heroes) ? (heroes as SteamHero[]) : [];
}
