# gta6-01-v3

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/naufalumer/gta6-01-v3/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/naufalumer/gta6-01-v3/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

AZURA BAY: Neon Tide is an open-world crime game set in a sun-soaked coastal city with a turquoise bay, a white-sand beachfront, a neon downtown strip, a working container port, hillside villas, and an old cannery quarter. You play Rico Vane, a driver building a crew with Lena the planner, Tank the muscle, and Mira the hacker-driver, running six chained story missions against Victor Kane and the Harbor Syndicate while the city watches your every move.

The city has five named districts, and each one keeps its own standing with you: Seaglass Beach, Sundial Square, Saltflats Port, Palm Heights, and Old Cannery. Standing changes mission payouts, shop prices, and how fast the police respond where you are. Around 26 traffic cars share the roads with around 64 pedestrians who walk, cross streets, chat, flee from trouble, and climb into cars. Eighteen parked cars can be stolen, and there is also a rideable motorcycle, a flyable helicopter with two helipads, and a jetpack with thrust and fuel to manage.

The police ladder runs from foot cops at one star up to patrol cars, roadblocks, PIT maneuvers, and a helicopter at four and five stars, with a live patrol list on the HUD showing each unit's distance and tactic. Combat uses a pistol, an SMG, and a shotgun, with drifting that leaves skid marks and smoke and pays a cash bonus.

Between missions there is plenty to do: courier jobs, street races with checkpoints, opponents, a countdown, and a best lap, fishing at Pier 9 with a cast, bite, and reel minigame, basketball at Seaglass Court with a 60-second challenge, casino slots, a garage with upgrades and weapons for sale, a gun shop, and hidden packages scattered around the map. The HUD packs in a circular minimap with the current district, wanted stars, cash, respect rank, a mission tracker with crew portraits, a speedometer, health and armor bars, a nitro bar, and a radio with three original hip-hop stations that gets more intense during chases. All sound is synthesized live with WebAudio, from sirens and engines to the radio, and a full day cycle moves from bright morning through pink dusk to a neon night that stays bright and readable.

There is no build step and no network: the game is plain static files plus a vendored three.js, served locally by the included server. Progress saves to localStorage, and a map screen shows all five districts with your stats.

Controls: WASD or arrows to move and drive, mouse to look and aim, click to fire, F to enter or exit a vehicle, E to interact, Space for handbrake, jump, jetpack, or helicopter climb, Shift for nitro or sprint, 1/2/3 to switch weapons, R to reload, Q to switch radio stations, M for the map, and Esc to pause. Touch controls with a joystick plus FIRE, JUMP, ENTER, and USE buttons appear on phones.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a browser.

---

<sub>Entered on [make.fun](https://make.fun/?ref=bye4mn13&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
