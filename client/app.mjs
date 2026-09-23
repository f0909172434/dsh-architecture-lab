const $=id=>document.getElementById(id)
const token=document.querySelector('meta[name="lab-token"]').content
let state=null,busy=false,refreshing=false,evidenceRun=null,connected=false
const names={A:['原生 DSH','不加記憶與規劃'],B:['加入記憶','Engram'],C:['加入規劃','Plan-and-Execute'],D:['記憶＋規劃','Engram ＋ Plan-and-Execute']}
const labels={running:'執行中',completed:'已完成',interrupted:'已中斷',failed:'失敗'}
const money=value=>value==null?'待核對':`NT$${value.toFixed(2)}`
const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;if(className)el.className=className;return el}
function notice(text,error=false){$('notice').textContent=text;$('notice').className=error?'error':''}
async function api(path,options={}){
  const response=await fetch('/api/architecture-lab/'+path,{...options,headers:{'x-architecture-lab-token':token,...options.headers},signal:AbortSignal.timeout(10000),cache:'no-store'})
  const value=await response.json()
  if(!response.ok)throw new Error(value.error??'無法完成操作')
  return value
}
function buttons(){
  const idle=connected&&!busy&&!state?.active
  for(const el of document.querySelectorAll('.recipe'))el.disabled=!idle
  $('check').disabled=!idle||state?.availability?.[state.selectedRecipe]?.available===false
  $('repetition').disabled=!idle
  $('start').disabled=!idle||!state?.liveReady
  $('batch').disabled=!idle||!state?.liveReady
  $('stop').disabled=!connected||busy||!state?.active
  $('export').disabled=!connected||busy
}
async function action(input){
  busy=true;buttons();notice('正在處理…')
  try{const response=await api('action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});await refresh();notice(response.text??(input.action==='stop'?'已送出停止要求，正在保存紀錄。':'操作已完成。'))}
  catch(error){notice(error.message,true)}
  finally{busy=false;buttons()}
}
function recipeCards(){
  const fragment=document.createDocumentFragment()
  for(const [id,[name,detail]] of Object.entries(names)){
    const button=node('button',null,'recipe');button.type='button';button.setAttribute('aria-pressed',String(state.selectedRecipe===id));button.append(node('strong',id),node('span',name),node('small',detail))
    const availability=state.availability?.[id]
    if(availability?.available===false)button.append(node('small','目前不可執行：'+availability.reason))
    button.addEventListener('click',()=>action({action:'select',recipe:id}));fragment.append(button)
  }
  $('recipes').replaceChildren(fragment)
}
function renderRuns(){
  const rows=[...state.runs].reverse().filter(row=>$('filter').value==='all'||row.recipe===$('filter').value)
  $('empty').hidden=rows.length>0
  const fragment=document.createDocumentFragment()
  for(const row of rows){
    const tr=node('tr'),title=node('td');title.append(node('strong',`${row.recipe} · ${row.taskId}`),node('small',`${row.mode==='offline'?'離線驗證':'正式試驗'} · 第 ${row.repetition} 次 · 嘗試 ${row.attempt}`),node('small',row.startedAt?new Date(row.startedAt).toLocaleString('zh-TW'):'時間未知'))
    const status=node('td');status.append(node('span',labels[row.status]??row.status,'badge'));if(row.error)status.append(node('small',row.error))
    const pass=node('td',row.test?.pass===true?'通過':row.test?.pass===false?'未通過':'尚無結果')
    const claim=node('td',row.claimedCompletion===true?'宣稱完成':row.claimedCompletion===false?'尚未完成':'未判定')
    const usage=node('td',`${row.requests??'—'} 次請求`);usage.append(node('small',row.durationMs==null?'耗時待確認':`${(row.durationMs/1000).toFixed(1)} 秒`),node('small',`${row.mode==='offline'?'模擬成本':'估計成本'} ${money(row.costTwd)}`))
    const controls=node('td'),view=node('button','查看證據');view.addEventListener('click',()=>showEvidence(row.runId));controls.append(view)
    if(row.status==='interrupted'){
      const resume=node('button','明確恢復');resume.disabled=busy||!!state.active||row.cleanupVerified===false||(row.mode==='live'&&!state.liveReady)
      resume.addEventListener('click',()=>action({action:row.mode==='offline'?'resume-check':'resume',recipe:row.recipe,taskId:row.taskId,repetition:row.repetition}));controls.append(resume)
      if(row.cleanupVerified===false)controls.append(node('small','清理狀態未確認，暫停恢復'))
    }
    tr.append(title,status,pass,claim,usage,controls);fragment.append(tr)
  }
  $('runs').replaceChildren(fragment)
}
function render(){
  $('backend').textContent=state.executionBackend==='linux'?'Linux 隔離環境':'原生診斷環境'
  $('budget').textContent=money(state.budget.committedTwd)+' / 300'
  $('counts').textContent=String(state.runs.length)
  $('counts-note').textContent=`${state.runs.filter(r=>r.status==='completed').length} 次完成 · ${state.runs.filter(r=>r.status==='interrupted').length} 次中斷`
  const eligible=Object.values(state.summary).reduce((n,r)=>n+r.eligibleFirstAttempts,0)
  $('eligible').textContent=eligible?`${eligible} 次有效試驗`:'尚無有效比較'
  $('blockers').replaceChildren(...state.blockers.map(text=>node('li',text)))
  if(!$('task').options.length)for(const task of state.tasks){const option=node('option',task.id);option.value=task.id;$('task').append(option)}
  $('legacy').textContent=`保留 ${state.legacy.trials.length} 筆舊紀錄，均排除於正式比較。${state.budget.unknownRequests??'未知數量'} 次用量仍需核對。`
  $('comparison').replaceChildren(...Object.entries(state.summary).map(([id,row])=>{const article=node('article');article.append(node('span',`${id} · ${names[id][0]}`),node('strong',row.successRate==null?'—':`${(row.successRate*100).toFixed(1)}%`),node('small',`${row.eligibleFirstAttempts} 次有效首試 · ${row.falseCompletions} 次錯誤完成宣稱`));return article}))
  recipeCards();renderRuns();buttons()
}
async function refresh(){
  if(refreshing)return
  refreshing=true
  try{state=await api('state');connected=true;render();if(state.attention)notice(state.attention,true)}
  catch(error){connected=false;buttons();notice('連線中斷：'+error.message+'。既有紀錄仍會保留。',true)}
  finally{refreshing=false}
}
async function showEvidence(id){evidenceRun=id;if(!$('evidence').open)$('evidence').showModal();$('evidence-text').textContent='讀取中…';try{const value=await api(`evidence?runId=${encodeURIComponent(id)}&kind=${encodeURIComponent($('evidence-kind').value)}`);if(evidenceRun===id)$('evidence-text').textContent=JSON.stringify(value,null,2)}catch(error){$('evidence-text').textContent=error.message}}
$('check').onclick=()=>action({action:'check',recipe:state.selectedRecipe,repetition:Number($('repetition').value)})
$('start').onclick=()=>action({action:'start',recipe:state.selectedRecipe,taskId:$('task').value,repetition:Number($('repetition').value)})
$('batch').onclick=()=>action({action:'batch'})
$('stop').onclick=()=>action({action:'stop'})
$('filter').onchange=()=>state&&renderRuns()
$('close-evidence').onclick=()=>$('evidence').close()
$('evidence-kind').onchange=()=>showEvidence(evidenceRun)
$('export').onclick=async()=>{try{const value=await api('report'),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));const a=node('a');a.href=url;a.download='architecture-lab-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('報告已匯出。')}catch(error){notice(error.message,true)}}
await refresh()
if(connected)notice(state.active?'實驗進行中；紀錄會自動更新。':'選擇配方後即可開始離線驗證；正式實驗仍受驗收與預算限制。')
setInterval(()=>{if(!document.hidden)refresh()},2000)
