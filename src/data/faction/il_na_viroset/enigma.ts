import type { Ability } from '@/combat'

// Il Na Viroset flagship. "This unit ignores the effects of all anomalies."
// The card says "effects", not "movement effects", so it also ignores the
// nebula's combat effect: when this side defends in a nebula, every other
// ship gets the +1 to its combat rolls but the Enigma does not — cancelled
// here with a -1 scoped to the flagship. The move-value clause is out of
// combat scope. The Entropic Scar's unit-ability lockout is NOT exempted —
// the restriction system has no per-unit carve-outs (see abilities-list.md).
export const enigma: Ability = {
  key: 'TF_ENIGMA',
  name: 'Enigma',
  description: 'This unit ignores the effects of all anomalies.',
  context: 'SPACE',
  params: {
    isEnabled: true,
    uses: Infinity,
  },
  headerUI: 'isEnabled',
  readOnly: true,
  invoke: [
    {
      timing: 'BEFORE_DICE_ROLL',
      context: 'SPACE_COMBAT',
      isCallable: (_params, ctx) =>
        ctx.side === 'defender' &&
        ctx.api.own.getAbilityConfig('NEBULA' as keyof AbilityConfigMap)
          ?.isEnabled === true,
      call: ctx => {
        ctx.api.own.applyBonusToResult(-1, 'FLAGSHIP')
      },
    },
  ],
}
