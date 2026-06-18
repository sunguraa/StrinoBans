# StrinoBans

A serverless, peer-to-peer map veto tool for [Strinova](https://store.steampowered.com/app/1282270/Strinova/). It mirrors the structure of [StrinoPlant](https://sunguraa.github.io/StrinoPlant/) so tournament lobbies can run pick/ban phases without a backend.

## Development

Requires Node.js 20+.

```bash
npm ci
npm run dev      # http://localhost:3000
npm run build    # static export -> out/
```

The app is configured for static export via `next.config.ts` (`output: 'export'`, `basePath: '/StrinoBans'`).

## Presets

Presets are static JSON files under `public/presets/`. The live preset list is `public/presets/index.json`. Tournament organizers can submit new presets to `sunguraa` on Discord or GitHub (or make a PR/Issue).

### Preset JSON schema

```ts
interface VetoPreset {
  id: string;                         // unique slug, e.g. "my-tournament-bo3"
  name: string;                       // display name
  author: string;                     // preset creator
  description: string;                // short human-readable summary
  updatedAt: string;                  // ISO 8601 UTC, e.g. "2026-06-16T00:00:00Z"
  format: "bo1" | "bo3" | "bo5" | "bo7" | "custom";
  ruleset: string;                    // ruleset identifier (used by the veto engine)
  mapPool: string[];                  // competitive map IDs in this preset
  seededPick?: boolean;               // true = seeded team picks first, false = coinflip (deprecated in favor of coinFlipMode)
  coinFlipMode?: "random" | "seeded" | "choose-team"; // coinflip first-actor method (seeded = seededPick)
  steps?: VetoStep[];                  // optional custom step sequence overriding default best-of rules (see below)
  pickBanTimerSeconds?: number | null; // optional; minimum 30
  sideTimerSeconds?: number | null;    // optional; minimum 20
  timerEnforcement?: "none" | "random-after-timeout";
  roomImportCode?: string;             // optional share/import code
  notes?: string;                      // free-form organizer notes
}
```

### Custom Ruleset Overrides (`steps`)

If you omit `steps`, the engine builds a fair default sequence for the chosen best-of and pool size (alternating bans, alternating picks where the *opposing* team chooses the side, and the leftover map as the decider). Define `steps` only when you want a bespoke order — e.g. "all bans first, then all picks, then decider side".

When present, `steps` is executed top-to-bottom. Each step is a `VetoStep`:

```ts
interface VetoStep {
  team: "a" | "b";              // which team acts on this step
  type: "ban" | "pick" | "side"; // ban a map, pick a map to play, or choose a side
  forPickIndex?: number;         // for type "side" only: the 0-based index of the
                                 // earlier `pick` step this side choice applies to
                                 // (the 1st pick is 0, the 2nd is 1, …)
  forDecider?: boolean;          // for type "side" only: true means this side choice
                                 // is for the leftover decider map (the map that
                                 // remains after all bans/picks), not for a pick
}
```

Notes:

- Write `steps` from the perspective of **team `a` being the first mover**. If the coin flip / first-mover choice lands on team `b`, the engine mirrors the whole sequence automatically — so `"a"`/`"b"` describe the *first* and *second* mover, not fixed sides.
- A `side` step must reference its map via either `forPickIndex` (a picked map) or `forDecider` (the decider). A side choice on a picked map is conventionally made by the team that did **not** pick it.
- The number of `pick` steps plus the single decider should equal the maps actually played (`bestOf`); every other map in the pool needs a `ban` step.

### Example preset

This is a Bo3 on the full 8-map pool with `steps` written out explicitly. The sequence below **is** the default ruleset for a Bo3 / 8-map pool — the same order the engine generates when you set `"ruleset": "default"` and omit `steps`. It's spelled out here so the order is clear and easy to tweak:

```json
{
  "id": "tournament-bo3",
  "name": "Tournament — Bo3",
  "author": "sunguraa",
  "description": "Standard Bo3: alternate bans, two picks (opponent chooses side), then a decider.",
  "updatedAt": "2026-06-16T00:00:00Z",
  "format": "bo3",
  "ruleset": "default",
  "mapPool": [
    "area-88",
    "base-404",
    "cauchy-street",
    "cosmite",
    "le-brun-city",
    "ocarnus",
    "space-lab",
    "windy-town"
  ],
  "seededPick": false,
  "coinFlipMode": "random",
  "steps": [
    { "team": "a", "type": "ban" },
    { "team": "b", "type": "ban" },
    { "team": "a", "type": "pick" },
    { "team": "b", "type": "side", "forPickIndex": 0 },
    { "team": "b", "type": "pick" },
    { "team": "a", "type": "side", "forPickIndex": 1 },
    { "team": "a", "type": "ban" },
    { "team": "b", "type": "ban" },
    { "team": "a", "type": "ban" },
    { "team": "b", "type": "side", "forDecider": true }
  ],
  "pickBanTimerSeconds": 60,
  "sideTimerSeconds": 30,
  "timerEnforcement": "random-after-timeout",
  "roomImportCode": null,
  "notes": "All eight current competitive maps. Timer enforced after timeout."
}
```

Read the steps as: first mover (`a`) and second mover (`b`) each ban one map; `a` picks the game-1 map and `b` chooses its side; `b` picks the game-2 map and `a` chooses its side; the teams ban the remaining pool down to one map, and `b` chooses the side on that leftover decider.

### Competitive map IDs

- `area-88`
- `base-404`
- `cauchy-street`
- `cosmite`
- `le-brun-city`
- `ocarnus`
- `space-lab`
- `windy-town`

## License

This project is licensed under the GNU General Public License v3 (GPLv3) with additional attribution terms under Section 7(b). See the `LICENSE` and `NOTICE` files in the root of this repository for the full legal text and attribution requirements.

Map intro images are credited to the [Strinova Wiki](https://strinova.wiki/).