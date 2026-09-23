// Candidate-visible declaration contract, without any trusted broker code.
export const completionSection='Architecture Lab completion declaration'
export const completionInstruction=`${completionSection}\nThis logical trial has at most 12 model requests and 10 minutes, including planning and auxiliary memory requests and any resumed attempts. Plan for a final answer within that shared allowance; avoid unnecessary demonstration or repeated verification after finishing. External tests are not available to you. At the end of your final answer, use exactly one last line: ARCHITECTURE_LAB_RESULT=complete if you claim the requested task is solved, ARCHITECTURE_LAB_RESULT=blocked if it is not solved, or ARCHITECTURE_LAB_RESULT=continue for an intermediate planning turn. This is your claim only; an external test independently checks correctness.`

export function completionInstructionFor(purpose='research'){
  if(purpose==='research')return completionInstruction
  if(purpose!=='daily')throw new Error('unknown run purpose')
  return `${completionSection}\nThis user task runs in an isolated copy of a selected workspace. Its shared allowance is 12 model requests and 10 minutes, including planning, memory queries and resumed attempts. Work on the requested task and verify your changes with suitable local checks. Summarize results, changed files and unresolved issues. There is no benchmark judge for this task; do not claim external acceptance. End your final answer with exactly one last line: ARCHITECTURE_LAB_RESULT=complete if you claim it is solved, ARCHITECTURE_LAB_RESULT=blocked if it is not solved, or ARCHITECTURE_LAB_RESULT=continue for an intermediate turn. This is a completion claim, not proof of correctness.`
}
