import type { Ability, AbilityReadContext } from '@/combat'
import { UNIT_TYPES } from '@/constants/units'
import type { DiceGroup } from '@/types'

/** The strongest own unit with a capacity value: the one whose extra die
 *  hits most easily (lowest combat value; ties keep UI unit order). */
function bestCapacityDie(ctx: AbilityReadContext): DiceGroup | undefined {
  let best: number | undefined
  for (const baseType of UNIT_TYPES) {
    const stats = ctx.api.own.getUnitStats(baseType)
    if (!stats?.COMBAT) continue
    const capacity = stats.CAPACITY
    if (stats.CAPACITY_COST != null || capacity == null || capacity <= 0) {
      continue
    }
    if (ctx.api.own.countUnits(baseType, { includeVariants: true }) === 0) {
      continue
    }
    const combat = stats.COMBAT[0]
    if (best === undefined || combat < best) best = combat
  }
  return best === undefined ? undefined : [best, 1]
}

// The Saint of Swords mech. "While this unit is being transported, choose 1
// unit in its system that has a capacity value to roll 1 additional die on its
// combat rolls." The toggle asserts the mech is being transported; the target
// is chosen automatically each round — the strongest unit with a capacity
// value (lowest combat value, so the extra die hits most easily), re-picked
// per roll so the bonus moves on if the carrier dies. The die is added as a
// TF_COLADA dice group at the chosen unit's combat value; each transported
// mech grants one die (the invoke fires once per mech instance).
export const colada: Ability = {
  key: 'TF_COLADA',
  name: 'Colada',
  description:
    'While this unit is being transported, choose 1 unit in its system that has a capacity value to roll 1 additional die on its combat rolls.',
  context: 'SPACE',
  params: {
    isEnabled: true,
    uses: Infinity,
  },
  readOnly: true,
  headerUI: 'isEnabled',
  invoke: [
    {
      timing: 'BEFORE_DICE_ROLL',
      context: 'SPACE_COMBAT',
      isCallable: (_params, ctx) => bestCapacityDie(ctx) !== undefined,
      call: ctx => {
        const die = bestCapacityDie(ctx)
        if (die) ctx.api.own.addDiceGroup(die)
      },
    },
  ],
}
