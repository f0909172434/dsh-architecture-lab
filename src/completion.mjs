import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { streamUsage } from './broker/server.mjs'

export const completionSection='Architecture Lab completion declaration'
export const completionInstruction=`${completionSection}\nAt the end of your final answer, use exactly one last line: ARCHITECTURE_LAB_RESULT=complete if you claim the requested task is solved, ARCHITECTURE_LAB_RESULT=blocked if it is not solved, or ARCHITECTURE_LAB_RESULT=continue for an intermediate planning turn. This is your claim only; an external test independently checks correctness.`

export function parseCompletionStream(sse){
  if(!streamUsage(sse).complete)return {claimedCompletion:null,finalText:'',finishReason:null}
  let finalText='',finishReason=null,toolCall=false
  for(const event of sse.replaceAll('\r\n','\n').split('\n\n')){
    const data=event.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n')
    if(!data||data==='[DONE]')continue
    const chunk=JSON.parse(data)
    for(const choice of chunk.choices??[]){
      if(choice.index!==0)continue
      if(choice.delta?.content!=null){if(typeof choice.delta.content!=='string')return {claimedCompletion:null,finalText:'',finishReason:null};finalText+=choice.delta.content}
      if(choice.delta?.tool_calls?.length)toolCall=true
      if(choice.finish_reason!=null)finishReason=choice.finish_reason
    }
  }
  const declarations=[...finalText.matchAll(/^ARCHITECTURE_LAB_RESULT=(complete|blocked|continue)$/gm)]
  const last=finalText.trimEnd().split('\n').at(-1)
  const value=declarations.length===1&&last===declarations[0][0]?declarations[0][1]:null
  return {claimedCompletion:finishReason==='stop'&&!toolCall?(value==='complete'?true:value==='blocked'?false:null):null,finalText,finishReason}
}

/** Uses broker-owned provider bytes, never the candidate-writable session log.
 * A later failed/incomplete main request invalidates an earlier completion claim.
 */
export async function brokerCompletion(root,entries){
  let result={claimedCompletion:null,finalText:'',finishReason:null,requestId:null}
  for(const entry of entries){
    if(!/^[a-f0-9-]{36}$/.test(entry.id))throw new Error('invalid broker evidence identity')
    let request
    try{request=JSON.parse(await readFile(join(root,'broker-evidence',`${entry.id}.request.json`),'utf8'))}
    catch(error){if(error.code!=='ENOENT')throw error;result={claimedCompletion:null,finalText:'',finishReason:null,requestId:entry.id};continue}
    const primary=Array.isArray(request.tools)&&request.messages?.some(message=>message.role==='system'&&message.content?.includes(completionSection))
    if(!primary)continue
    result={claimedCompletion:null,finalText:'',finishReason:null,requestId:entry.id}
    try{result={...parseCompletionStream(await readFile(join(root,'broker-evidence',`${entry.id}.sse`),'utf8')),requestId:entry.id}}
    catch(error){if(error.code!=='ENOENT')throw error}
  }
  return result
}
