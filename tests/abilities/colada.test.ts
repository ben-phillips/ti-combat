import { describe, expect, it } from 'vitest'

import { combatTest } from '../utils/combat-test'

describe.forEachSide('TF_COLADA', () => {
  it('grants an extra die at the strongest capacity unit’s combat value', () => {
    const t = combatTest({
      mode: 'SPACE',
      attacker: {
        faction: 'SAINT_OF_SWORDS',
        // Tizona (combat 3, capacity 4) beats the carrier (combat 9,
        // capacity 4) — the extra die rolls at 3.
        units: { FLAGSHIP: 1, CARRIER: 1, MECH: 1 },
        abilities: { TF_COLADA: true },
      },
      defender: { faction: 'AVARICE_REX', units: { CRUISER: 1 } },
    })

    t.advanceTo('SPACE_COMBAT')
    t.advanceRound()

    expect(t.dicePool().attacker).toContainDice('TF_COLADA', [3, 1])
  })

  it('does nothing when no fielded unit has a capacity value', () => {
    const t = combatTest({
      mode: 'SPACE',
      attacker: {
        faction: 'SAINT_OF_SWORDS',
        // The TF cruiser has no capacity — nothing qualifies.
        units: { CRUISER: 1, MECH: 1 },
        abilities: { TF_COLADA: true },
      },
      defender: { faction: 'AVARICE_REX', units: { CRUISER: 1 } },
    })

    t.advanceTo('SPACE_COMBAT')
    t.advanceRound()

    expect(t.abilityLog('TF_COLADA')).toHaveLength(0)
    expect(t.dicePool().attacker.TF_COLADA).toBeUndefined()
  })

  it('re-picks the target when the best carrier dies', () => {
    const t = combatTest({
      mode: 'SPACE',
      attacker: {
        faction: 'SAINT_OF_SWORDS',
        units: { FLAGSHIP: 1, CARRIER: 1, MECH: 1 },
        abilities: {
          TF_COLADA: true,
          // Deterministic: the flagship soaks first and cannot sustain.
          SUSTAIN_DAMAGE: { isEnabled: false },
          UNIT_PRIORITY: {
            spaceUnitPriority: [['FLAGSHIP'], ['CARRIER'], ['MECH']],
          },
        },
      },
      defender: { faction: 'AVARICE_REX', units: { CRUISER: 2 } },
    })

    t.advanceTo('SPACE_COMBAT')
    // Round 1: the flagship dies — its die was rolled at 3.
    t.advanceRound({ attacker: 1, defender: 0 })
    expect(t.attacker.units.FLAGSHIP).toBeUndefined()

    // Round 2: the bonus falls through to the carrier (combat 9).
    t.advanceRound()
    expect(t.dicePool().attacker).toContainDice('TF_COLADA', [9, 1])
  })

  it('each transported Colada mech grants a die', () => {
    const t = combatTest({
      mode: 'SPACE',
      attacker: {
        faction: 'SAINT_OF_SWORDS',
        units: { FLAGSHIP: 1, MECH: 2 },
        abilities: { TF_COLADA: true },
      },
      defender: { faction: 'AVARICE_REX', units: { CRUISER: 1 } },
    })

    t.advanceTo('SPACE_COMBAT')
    t.advanceRound()

    // One [3, 1] group per mech — the invoke fires once per unit instance.
    expect(t.dicePool().attacker).toContainDice('TF_COLADA', [3, 1], [3, 1])
  })
})
