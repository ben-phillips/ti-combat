import { describe, expect, it } from 'vitest'

import { pendingHits } from '../utils/branches'
import { combatTest } from '../utils/combat-test'

describe('TF_COLADA + CROWN_OF_THALNOS', () => {
  it("Crown's safe reroll does not cover Colada's die", () => {
    // Colada adds its die as its own TF_COLADA group at the target's combat
    // value rather than as a second die on the target, so the roll is two
    // independent 1-die sources at hit 3. Crown's safe path only transforms
    // an entry with hit value 2 or more than 1 die per unit, so neither
    // source qualifies and nothing is rerolled: plain (0.2 + 0.8)^2.
    const t = combatTest({
      mode: 'SPACE',
      attacker: {
        faction: 'SAINT_OF_SWORDS',
        units: { FLAGSHIP: 1, MECH: 1 },
        abilities: {
          TF_COLADA: true,
          CROWN_OF_THALNOS: { isEnabled: true, safeReroll: true },
        },
      },
      defender: { faction: 'ARBOREC', units: { CARRIER: 1 } },
    })

    const branches = t.advance()

    expect(branches).toHaveBranches(pendingHits('defender'), [
      { value: 0, probability: 0.04 },
      { value: 1, probability: 0.32 },
      { value: 2, probability: 0.64 },
    ])
  })

  it('does not feed Crown an extra die in ground combat', () => {
    // Colada is space-only, and the mech is never a legal target anyway, so
    // it stays at [6,1] — one die per unit, which Crown's safe path leaves
    // alone. Plain 0.5/0.5.
    const t = combatTest({
      mode: 'GROUND',
      attacker: {
        faction: 'SAINT_OF_SWORDS',
        units: { MECH: 1 },
        abilities: {
          TF_COLADA: true,
          CROWN_OF_THALNOS: { isEnabled: true, safeReroll: true },
        },
      },
      defender: { faction: 'ARBOREC', units: { INFANTRY: 1 } },
    })

    const branches = t.advance()

    expect(branches).toHaveBranches(pendingHits('defender'), [
      { value: 0, probability: 0.5 },
      { value: 1, probability: 0.5 },
    ])
  })
})
