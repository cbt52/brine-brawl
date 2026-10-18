# Likeness pass

Per fighter: the three visual cues taken from the source **archetype** (proportions, silhouette, costume
shape, signature prop, colour blocking) and what was changed so the result is our own character.

Rules for this file: no franchise names, no character names, no catchphrases (§2.8 in `TASKS-LOOP.md`).
"Archetype" means the kind of character the audience already knows how to read at 48 px — a round mascot,
a hooded caster, a lanky sniper — never a specific copyrighted design.

Every cue below is implemented in `scripts/art-models.mjs` and visible in the blockouts
(`client/public/art/ref/<id>-q34.png`). `default` (Deckhand) is the generic fallback fighter and takes no
archetype cues beyond "friendly sailor".

## Critterkin

| id | matched cues | to stay legal |
|---|---|---|
| `voltbun` | round body with oversized head · long upright ears · zigzag energy motif | teal ear tips + battery-shaped tail instead of a lightning-bolt tail; cream/teal palette; no cheek patches |
| `embercub` | chubby cub proportions · tufted triangular ears · glowing ember carried at the tail | red-panda coat and soot-smudged nose; a ring of embers instead of a flame tip; no head flame |
| `mossback` | dome shell with plate seams · squat low stance · tiny head poking forward | bonsai tree growing out of the shell, leaf-green palette, gold collar instead of a shell rim |
| `gloomoth` | rounded fuzzy body · four-lobed wings · glowing antenna tips | lavender fur-moth instead of a sheet ghost; lantern-bead antennae; sleepy half-lidded eyes |
| `pebblor` | egg-shaped stone body · faceted crest on the head · stubby wings | gem crest in the faction gold; granite palette; the egg is a prop, not a body |
| `dozelump` | huge round belly · tiny flippers · nightcap with a pom | manatee snout with a drool bubble; ocean-grey palette; gold nightcap |

## Elemental Weavers

| id | matched cues | to stay legal |
|---|---|---|
| `mira` | hooded parka silhouette · beaded braid · ribbon of water around the hands | teal wave trim on the hood; shell beads; ribbon is a whip, not a staff |
| `pip` | small kid in an oversized poncho · wild curls · flying kite on the back | sky-blue poncho, teal paper kite; no glider and no arrows |
| `brak` | stocky build · huge gauntlets · fur-trimmed hat | granite gauntlets, teal sash, layered fur hat without horns |
| `ashka` | spiky hair · waist sash · trailing ember ribbons | orange ember hair, teal collar as the faction accent; no flame crown |
| `kip` | lanky frame · bone-white curved boomerang · mud face paint | teal smoke scarf, mud-brown hair, unmarked boomerang |
| `tobo` | round jolly build · teapot prop · curled moustache | gold moustache, teal teapot, waistcoat instead of robes |

## Saltwind Crew

| id | matched cues | to stay legal |
|---|---|---|
| `noodle` | sea hat with upturned brims · striped shirt · rubbery grin | seashell tricorn in teal; no hay-coloured headwear and no red vest; stripes are faction red on teal |
| `sable` | eye patch · twin sabers · mechanical claw arm | crab-claw third blade; navy coat with a single red sash |
| `bisque` | long bill · chef's toque · bird legs with a ladle in hand | orange bill, cream feathers, red toque band (faction accent) |
| `nova` | compass staff · map scarf · cloud companion | gold compass dial, red scarf, cloud pet as a small puff |
| `lenny` | tall lanky frame · oversized slingshot · parrot on the shoulder | wooden slingshot, red headband, no hat |
| `fawnsworth` | curled prehensile tail · long snout · top hat | seafoam palette, gold dart, monocle lens instead of goggle glasses |

## Bubblebottom Folk

| id | matched cues | to stay legal |
|---|---|---|
| `sudsy` | round mesh-textured body · apron · spatula | pink loofah with bubble clusters, cream apron, wooden spatula (not metal) |
| `lumpy` | soft lumpy body with warts · tiny party hat · stubby limbs | lime-green sea cucumber, gold pom, pink faction hat |
| `squall` | mantle head with side fins · tentacle skirt · brass instrument | mauve palette, dented tuba, pink beret |
| `pinchpenny` | big claws · shopkeeper's till belly · coin motif | blue shell, pink claws, cream register keys, gold coins |
| `hammy` | round hamster head in a glass dome · air tank · headband | tinted fishbowl dome, pink headband, tank as the metal detail |
| `krill` | tiny body inside an oversized suit · single lens · antenna | pink krill, grey mech frame, gold lens light |
