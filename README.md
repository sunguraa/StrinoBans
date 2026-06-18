# StrinoBans

A serverless, peer-to-peer map veto tool for [Strinova](https://store.steampowered.com/app/2459960/Strinova/). It mirrors the structure of [StrinoPlant](https://sunguraa.github.io/StrinoPlant/) so tournament lobbies can run pick/ban phases without a backend.

## Development

Requires Node.js 20+.

```bash
npm ci
npm run dev      # http://localhost:3000
npm run build    # static export -> out/
```

The app is configured for static export via `next.config.ts` (`output: 'export'`, `basePath: '/StrinoBans'`).

## Presets

Presets are static JSON files under `public/presets/`. The live preset list is `public/presets/index.json`. Tournament organizers can submit new presets to `sunguraa` on Discord or GitHub.

The **Papercut Series** presets use a 7-map pool (one map is excluded via a community vote - the current placeholder exclusion is windy-town). Tournament organizers running Papercut should update the excluded map via PR or by contacting sunguraa.

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
  seededPick?: boolean;               // true = seeded team picks first, false = coinflip
  pickBanTimerSeconds?: number | null; // optional; minimum 30
  sideTimerSeconds?: number | null;    // optional; minimum 20
  timerEnforcement?: "none" | "random-after-timeout";
  roomImportCode?: string;             // optional share/import code
  notes?: string;                      // free-form organizer notes
}
```

### Example preset

```json
{
  "id": "tournament-bo3",
  "name": "Tournament — Bo3",
  "author": "sunguraa",
  "description": "Standard Bo3 alternate ban/pick with side selection on each pick and a final decider.",
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
  "pickBanTimerSeconds": 60,
  "sideTimerSeconds": 30,
  "timerEnforcement": "random-after-timeout",
  "roomImportCode": null,
  "notes": "All eight current competitive maps. Timer enforced after timeout."
}
```

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