# Engine Gotchas

Non-obvious invariants of the combat engine, dice-math kernel, and test
harness. Each of these was discovered the hard way while debugging; check
here before re-deriving behavior empirically. Keep entries short: the
gotcha, what to do instead, and a reference implementation.

Statically checkable invariants (invoke identity/dedup rules, uiConfig
shape, finite number-input defaults, select option values) are enforced by
`tests/ability-invariants.test.ts` — when adding a gotcha of that kind, add
a check there too.

## Ability engine

- **One invoke per (ability, timing).** A second invoke with the same timing
  on one ability is silently skipped. Compose extra work into the single
  invoke instead (see `onPrepare` in
  `tf-unit-upgrade/create-tf-unit-upgrade.ts`, added for Hel-Titan).

- **Invoke dedup is by object identity.** Two abilities sharing the same
  invoke objects (e.g. a shallow-cloned ability with a new key) fire only
  once between them. When re-keying a clone, clone the invokes too:
  `invoke: original.invoke.map(inv => ({ ...inv }))` (see TF_MEDDLE in
  `twilights-fall-abilities.ts`).

- **Unit-linked GENERAL abilities become always-on when no unit definition
  carries them.** `collectAbilityCandidates` runs a config ability
  unconditionally unless its key appears in the faction's unit-definition
  ability keys — so an ability meant to ride on units (e.g.
  `DISABLE_PLANETARY_SHIELD`) silently fires for factions whose unit defs
  never mention it. Gate such abilities with
  `isCallable: (_p, ctx) => ctx.unitSource !== undefined`.

- **Abilities attached to unit stats during PREPARE are too late for their
  own PREPARE invokes.** `modifyUnitType(..., { ABILITIES: [...] })` inside a
  PREPARE cannot add another PREPARE-timed ability for this combat. Do the
  work directly in the attaching ability's PREPARE instead (see the TF war
  sun upgrades stripping Planetary Shield 2RAM-style in
  `create-tf-unit-upgrade.ts`).

- **Finite `uses` bills and gates EVERY non-system invoke — including a
  card's PREPARE.** A stat-upgrade card with a finite-uses active ability
  (TF Exotrireme) must mark its PREPARE `system: true`, or the stat
  application burns a use at PREPARE and stops applying entirely once
  `uses` reaches 0 (see `create-tf-unit-upgrade.ts`).

- **System invokes skip dispatch-time `uses` gating.** Invokes on timings
  like `REROLL_DICE_ROLL` (whose billing is deferred to the kernel) fire
  even at `uses: 0` unless you add
  `isCallable: params => params.isEnabled && params.uses > 0` explicitly
  (see Bone Picked Clean, Munitions Reserves).

- **One external invoke poisons the rest on non-owner sides.** An ability
  with ANY `external: true` invoke dispatches ONLY its external invokes on a
  side that doesn't own it (`passesCrossFactionFilter`). A wrapper ability
  that aggregates invokes from mixed sources (some agent-derived/external,
  some not) must mark ALL of them external, or the non-external ones
  silently never fire (see `wrapInvoke` in `tf-genome/clever-genome.ts`).

- **`getAvailableAbilities` feeds BOTH the panel and the engine.** Hiding a
  slot removes engine behavior, not just UI. The `ADVANCED` slot holds the
  phase drivers (AFB, Space Cannon, Bombardment, Retreat, Fleet Pool,
  Capacity) — never hide it, even for Twilight's Fall.

- **Winning SPACE combat requires participating units.** `_postAssignHits`
  uses `hasAnyUnits` for non-combat metas (so SCO/AFB wipes end things),
  but a would-be winner whose remaining units are all non-participating
  (ferried ground forces, structures) is downgraded to 'draw' in SPACE
  mode — only ship-mechs (Eidolon Maximum, Starlancer XI with ships
  fielded) win via participation. Combat-round wipes and GROUND mode are
  untouched (see `tests/engine/space-combat-winner-participation.test.ts`).

## Reconcile and config

- **`resetSettingsToBase` intentionally does NOT re-apply
  `declareParamChange`.** The asymmetry with `resetBaseGroups` is
  load-bearing (Alastor/Eidolon tests). If an ability needs its
  participation change to survive into the engine run, restore it at
  runtime in its PREPARE (see Hel-Titan's `onPrepare`).

- **`declareParamChange` additions to DERIVED settings groups survive only
  because `resetBaseGroups` re-applies them after `onParamSet`.** The
  derivation (`ships` → `spaceCombatParticipating`, etc.) recomputes derived
  groups from the base groups, clobbering anything pushed into them earlier
  in the pass. Base-group targets (Hel-Titan's `groundForces`) never hit
  this; derived-group targets (Starlancer XI's `spaceCombatParticipating`)
  rely on the post-derivation re-apply — don't remove it.

- **`declareParam` sourced params sync only at reconcile.** A runtime
  `updateAbilityConfig` to a source list (e.g.
  `SETTINGS.spaceCombatParticipating`) does not propagate to params sourced
  from it (fleet pool, sustain priorities, unit priority). Update the
  dependent ability's config directly at runtime too (see Starlancer XI
  updating `SUSTAIN_DAMAGE.spacePriority` and
  `UNIT_PRIORITY.spaceUnitPriority`).

- **`SETTINGS.ships` and `SETTINGS.spaceCombatParticipating` are distinct.**
  `ships` cascades (via `onParamSet`) into `nonFighterShips`,
  `spaceCombatParticipating`, and SCO targets; setting
  `spaceCombatParticipating` directly grants combat participation WITHOUT
  ship-ness (fleet pool, capacity, SCO targeting untouched) — that's how
  Starlancer XI mechs fight in space from the ground.

- **Sustain Damage has per-mode allow-lists.** A unit sustains only if its
  variant is in `SUSTAIN_DAMAGE.spacePriority` / `groundPriority` (sourced
  from `nonFighterShips` / `groundForces`). A unit added to combat outside
  those lists silently cannot sustain in that mode.

- **Hit-assignment order: the FRONT of `UNIT_PRIORITY.*UnitPriority` takes
  hits first.** The default list is worth-ascending, so fighters sit FIRST
  and die first. Prepend to make a unit the default hit-soaker; append to
  protect it. (Verified empirically — an earlier version of this entry had
  it backwards. Same direction in phase-priority overrides: GLS's
  `fightersLast` moves fighters to the end to PROTECT them.)

## Combat engine

- **Unlimited-use repair is the only thing that makes the state graph
  cyclic.** Without it, combat state decreases monotonically (units are
  damaged or destroyed, never restored), so the graph is a DAG and
  `subtreeCache` hits every state exactly once. Duranium Armor
  (`uses: Infinity` + `isDamaged: false`) can return the state to an earlier
  one, creating multi-node SCCs. Limited-use repair (Emergency Repairs) is
  safe — the use count strictly decreases. Before adding an always-on repair
  ability, expect a state-space cost.

- **A cached entry with non-empty `deferred` is context-dependent.**
  `deferred[k] = p` means "mass p re-enters ancestor k", so the entry is only
  usable while every such k is still in `inProgress` to absorb it. Self-loops
  resolve locally in `finalize`; longer cycles defer to a distant ancestor,
  and when that ancestor finalizes the entry goes stale. Do not simply
  discard it — `resolveEntry` substitutes the finalized dependency's own
  distribution via `value(v) = outcomes(v) + Σ deferred(v)[k] · value(k)`,
  which is exact and makes the entry unconditional (so it is repaired at most
  once). Discarding instead re-expands the whole subtree: that costs ~6x
  re-expansion per state on Duranium scenarios.

## Dice-math kernel

- **All conditional ±1 flips resolve in ONE joint pass after the attacker ×
  defender cross-product.** Positive flips act on natural misses, negative
  on natural hits (disjoint pools); a die flipped once is never re-targeted.
  Never add a second sequential pass — it re-enumerates faces the first
  pass already resolved (the Heart of Ixth + Meddle 68%-vs-70% class of
  bug). Details in `docs/dice-math.md` §5c.

- **Reroll budgets are fungible within a pool; billing debits cards in
  sorted-key order.** A 2-use card may legally spend both uses on one die
  (Wrath of Kenara). Don't impose distinct-card constraints.

- **`abilityLog` does not capture dice-roll abilities.** Verify anything
  that feeds the kernel (rerolls, conditionals, roll triggers) via branch
  probabilities (`toHaveBranches`), not log entries.

## Test harness

- **`advanceRound` hit specs are hits RECEIVED, not produced.**
  `advanceRound({ attacker: 2 })` picks the branch where the attacker's
  units take 2 hits. Same convention in `DICE_HITS` log entries.

- **Unit ids are non-printable characters.** `JSON.stringify` /
  assertion-diff dumps of `participatingUnits`, `unitType`, etc. render as
  empty strings and duplicate-looking keys. Probe with `.length`, or map
  ids through `unitType` to readable names.

- **`t.attacker.units` reads only pooled units.** A unit removed from both
  `participatingUnits` and `nonParticipatingUnits` vanishes from the side
  view even though stale `unitType` entries remain — absence from the view
  does not mean the unit was destroyed.

- **`console.log` is swallowed by the vitest config.** For one-off probes,
  assert `expect(payload).toEqual('SHOW')` and read the diff, or write a
  temporary `_probe.test.ts` (delete it afterwards).

## UI config and data modules

- **`select` uiConfig item values must be NON-EMPTY strings.** Store the
  param as a string union (`'1' | '2' | '3'`) and `Number()` it at the use
  site (see Bone Picked Clean's spend threshold). Radix Select throws on
  `value: ''` the moment the panel renders — use a sentinel like `'none'`
  for a "nothing selected" option (see TF Supercharge, Clever Genome).

- **`UnitList` entries are flat keys or tuples — match the existing shape
  when appending**, and remember `unwrapUnitListKeys` decides tuple-ness
  from the FIRST entry.

- **Watch for import cycles between faction modules and shared decks.**
  E.g. the TF unit-upgrade deck imports card invokes that import Janovet's
  helper, which reads the deck's configs — compute config-derived constants
  lazily, never at module-evaluation time (see `faces-of-janovet.ts`).
