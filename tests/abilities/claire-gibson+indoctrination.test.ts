import { describe, expect, it } from 'vitest'

import { combatTest } from '../utils/combat-test'

describe('CLAIRE_GIBSON + INDOCTRINATION', () => {
  it("ends combat before Claire can replace the defender's last infantry", () => {
    const t = combatTest({
      mode: 'GROUND',
      attacker: {
        faction: 'YIN_BROTHERHOOD',
        units: { INFANTRY: 1 },
        abilities: { INDOCTRINATION: true },
      },
      defender: {
        faction: 'FEDERATION_OF_SOL',
        units: { INFANTRY: 1 },
        abilities: { CLAIRE_GIBSON: true },
      },
    })

    t.advanceTo('GROUND_COMBAT')
    const dicePoolsBeforeCombat = t.log.filter(
      entry => entry.path.at(-1) === 'DICE_POOL',
    ).length

    t.advanceRound()

    expect(t.abilityLog('INDOCTRINATION')).not.toHaveLength(0)
    expect(t.abilityLog('CLAIRE_GIBSON')).toHaveLength(0)
    expect(t.defender.units.INFANTRY).toBeUndefined()
    expect(t.state.winnerSide).toBe('attacker')
    expect(t.isFinished()).toBe(true)
    expect(
      t.log.filter(entry => entry.path.at(-1) === 'DICE_POOL'),
    ).toHaveLength(dicePoolsBeforeCombat)
  })
})
