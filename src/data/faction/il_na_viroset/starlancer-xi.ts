import { z } from 'zod/mini'

import type { Ability, AbilityReadContext } from '@/combat'
import { SHIPS } from '@/constants/units'
import type { UnitBaseType, UnitList } from '@/types'

type Params = {
  anomalies: number
}

declare global {
  interface AbilityConfigMap {
    TF_STARLANCER_XI: Params
  }
}

function ownShipsFielded(ctx: AbilityReadContext): boolean {
  return SHIPS.some(
    t => ctx.api.own.getUnits(t, { includeVariants: true }).length > 0,
  )
}

function mechsParticipating(ctx: AbilityReadContext): boolean {
  const participating = ctx.api.own.getAbilityConfig('SETTINGS')
    .spaceCombatParticipating as UnitBaseType[]
  return participating.includes('MECH')
}

// Il Na Viroset mech. "This unit participates in space combat as if it were a
// ship. For each anomaly this unit is in or adjacent to, apply +1 to this
// unit's rolls." The mechs fight from the ground: they only join while the
// side actually has ships in the system — with no ships fielded at the start
// there is no space combat for them to join, and once the last ship is
// destroyed the combat ends (surviving mechs stay on the ground rather than
// holding the space area). The anomaly count is a manual input (adjacency is
// out of scope for a single-system calculator).
export const starlancerXI: Ability<Params> = {
  key: 'TF_STARLANCER_XI',
  name: 'Starlancer XI',
  description:
    'This unit participates in space combat as if it were a ship. For each anomaly this unit is in or adjacent to, apply +1 to this unit’s rolls.',
  context: 'SPACE',
  paramsSchema: z.object({
    anomalies: z.number(),
  }),
  params: {
    isEnabled: true,
    uses: Infinity,
    anomalies: 0,
  },
  // The mech's printed text — always on while mechs are fielded.
  readOnly: true,
  headerUI: 'isEnabled',
  // Surface MECH in the space Unit Priority panel (Hel-Titan pattern): the
  // reconcile-time participation change makes MECH a draggable entry in
  // `UNIT_PRIORITY.spaceUnitPriority`, defaulting to its worth slot (after
  // fighters/destroyers, before cruisers). Drag it to the FRONT to sacrifice
  // mechs in space first, or to the END to save them for the ground fight.
  // `resetSettingsToBase` drops this before the engine run; the PREPARE
  // invoke below restores participation at runtime.
  declareParamChange: () => [
    { key: 'spaceCombatParticipating', value: 'MECH' },
  ],
  uiConfig: [
    {
      key: 'anomalies',
      label: 'Anomalies in or adjacent (+1 each)',
      type: 'number',
      min: 0,
      max: 6,
    },
  ],
  invoke: [
    {
      timing: 'PREPARE',
      // No ships fielded → the mechs stay on the ground and space combat
      // proceeds (or completes) without them.
      isCallable: (_params, ctx) => ownShipsFielded(ctx),
      call: ctx => {
        ctx.api.own.updateAbilityConfig('SETTINGS', {
          spaceCombatParticipating: (current: UnitBaseType[]) =>
            current.includes('MECH') ? current : [...current, 'MECH'],
        })
        // Sustain's space allow-list normally gains MECH at reconcile (its
        // source is spaceCombatParticipating, extended by the
        // declareParamChange above) — this is the runtime fallback.
        ctx.api.own.updateAbilityConfig('SUSTAIN_DAMAGE', {
          spacePriority: (current: UnitList<boolean>) =>
            current.some(([key]) => key === 'MECH')
              ? current
              : [...current, ['MECH', true]],
        })
        // Hit-assignment fallback: the reconcile-time declareParamChange
        // normally puts MECH into the priority list already (and the user
        // may have reordered it — respected via the includes check below).
        // If it's somehow absent, append at the END = most protected (the
        // FRONT of the list takes hits first).
        ctx.api.own.updateAbilityConfig('UNIT_PRIORITY', {
          spaceUnitPriority: (current: UnitList) => {
            const keys = current.map(e => (Array.isArray(e) ? e[0] : e))
            if (keys.includes('MECH')) return current
            return current.length > 0 && Array.isArray(current[0])
              ? [...current, ['MECH']]
              : [...current, 'MECH']
          },
        })
      },
    },
    {
      // When the last own ship dies, the mechs drop out of the combat —
      // a side cannot hold the space area with ground-based mechs, so the
      // wipe check ends the combat with them alive on the ground.
      timing: 'AFTER_DESTROY',
      isCallable: (_params, ctx) =>
        mechsParticipating(ctx) && !ownShipsFielded(ctx),
      call: ctx => {
        ctx.api.own.updateAbilityConfig('SETTINGS', {
          spaceCombatParticipating: (current: UnitBaseType[]) =>
            current.filter(t => t !== 'MECH'),
        })
      },
    },
    {
      timing: 'BEFORE_DICE_ROLL',
      context: 'SPACE_COMBAT',
      isCallable: params => params.anomalies > 0,
      call: (ctx, params) => {
        ctx.api.own.applyBonusToResult(params.anomalies, 'MECH')
      },
    },
  ],
}
