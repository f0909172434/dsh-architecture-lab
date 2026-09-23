export const trialDurationMs=600000

export function remainingTrialMs(deadlineAt,now=Date.now()){
  if(!Number.isSafeInteger(deadlineAt)||deadlineAt>now+trialDurationMs)throw new Error('invalid trial deadline')
  if(deadlineAt<=now)throw new Error('trial deadline reached')
  return deadlineAt-now
}

export function trialClock(prior,startedAt){
  const times=[Date.parse(startedAt),...prior.flatMap(row=>[Date.parse(row.startedAt),Date.parse(row.firstStartedAt??row.startedAt)])]
  if(times.some(value=>!Number.isFinite(value)))throw new Error('invalid original trial start')
  const first=Math.min(...times),deadlineAt=first+trialDurationMs
  remainingTrialMs(deadlineAt)
  return {firstStartedAt:new Date(first).toISOString(),deadlineAt}
}
