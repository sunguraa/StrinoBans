# StrinoBans

A peer-to-peer map veto tool for [Strinova](https://store.steampowered.com/app/1282270/Strinova/). No accounts or backend required.

## How to use

1. Choose a Default format, Grand final, or a custom preset.
2. Select **Create Room**.
3. Send the **Team A** link to Team A and the **Team B** link to Team B.
4. Both teams enter their names and select **Ready up**.
5. Follow the map bans, picks, and side choices until the veto is complete.

Share the spectator link with anyone who wants to watch. Completed vetoes appear in History, where you can view or export the results.

The coin-flip winner chooses which team starts. **Advanced Settings** also offers **Seeded**, where Team A chooses, and **Fixed**, where Team A starts.

**Grand final** is a BO5 format for double-elimination tournaments without a bracket reset. The winners-bracket team (Team A) gets both bans. Team A also chooses which team picks first.

## Custom presets

1. Open **Custom**.
2. Choose the maps, series length, and preset name.
3. Open **Advanced Settings** to change the starting policy, timers, or sequence.
4. Select **Create Room** when the preset is ready.

You can create a room without saving the preset first. **Preset Room Code** is the Strinova game-room settings code, separate from a StrinoBans invitation link.

### Editing the sequence

Start with Standard, Picks first, or Legacy split bans, then adjust the blocks as needed.

**Team 1** acts first and **Team 2** acts second. Either can be the room's Team A or Team B.

Drag a block by its handle, or use its up/down buttons. With a keyboard, press Space on the handle to pick it up. Use the arrow keys to move it, Space to drop it, or Escape to cancel.

A **Pick + Side** block keeps the pick and side choice together. The final decider stays at the bottom.

After changing the maps or series length, rebuild from a template or adjust the existing blocks. The builder shows any errors before you save or create a room.

### Formats

These examples use seven maps. In the table, **1** means Team 1 and **2** means Team 2.

| Format | Map actions, in order | Decider side |
| --- | --- | --- |
| Standard BO1 | 1 ban, 2 ban, 1 ban, 2 ban, 1 ban, 2 ban | Team 1 |
| Standard BO3 | 1 ban, 2 ban, 1 pick, 2 pick, 1 ban, 2 ban | Team 1 |
| Standard BO5: Two opening bans | 1 ban, 2 ban, 1 pick, 2 pick, 1 pick, 2 pick | Team 1 |
| Standard / Picks first BO7 | 1 pick, 2 pick, 1 pick, 2 pick, 1 pick, 2 pick | Team 1 |
| Picks first BO3 | 1 pick, 2 pick, 1 ban, 2 ban, 1 ban, 2 ban | Team 1 |
| Picks first BO5 | 1 pick, 2 pick, 1 pick, 2 pick, 1 ban, 2 ban | Team 1 |
| Legacy split bans BO5 | 1 ban, 2 pick, 1 pick, 2 pick, 1 pick, 2 ban | Team 1 |

After each pick, the other team chooses its starting side. The last map is the decider.

The Two opening bans BO5 template requires seven maps. For other pool sizes, use Picks first, Legacy split bans, or a manual sequence.

### Saving and loading presets

Open **Browser preset library & JSON backup** and select **Save as new** to keep a preset. Select a saved preset and choose **Load / Edit** to use it again. You can also rename, duplicate, or delete it there.

Saved presets stay in this browser on this device. Clearing site data removes them. Use **Export draft JSON** for backup or transfer, and **Import JSON for preview** to load a file.

Preset files contain the rules, not room links or match history. Editing or deleting a saved preset does not change rooms already created from it.

## Connections

Keep at least one participant connected while others join or reload. Connection recovery is automatic. If it fails, keep both captains' rooms open and select **Retry connection**. Some networks block peer-to-peer connections, so another network may be needed.

## Development

Requires Node.js 20+.

```sh
npm ci
npm run dev      # http://localhost:3000/StrinoBans/
npm run build    # static export -> out/
```

The app uses Next.js static export with the `/StrinoBans` base path. Built-in presets live in `public/presets/`, with the catalog in `public/presets/index.json`.

### Checks

```sh
npm run lint
npm exec -- tsc --noEmit
npm run build
npm run test:e2e
node --import tsx --test tests/transport-provider.node.ts
```

For browser tests, keep the development server running. Set `PW_BASE_URL` to its address and `CI=1` for headless Chromium.

When updating the deployed app, let active rooms finish first. The current connection protocol cannot join rooms running an older cached client.

## License

This project is licensed under the GNU General Public License v3 (GPLv3) with additional attribution terms under Section 7(b). See the `LICENSE` and `NOTICE` files in the root of this repository for the full legal text and attribution requirements.
Map intro images are credited to the [Strinova Wiki](https://strinova.wiki/).
