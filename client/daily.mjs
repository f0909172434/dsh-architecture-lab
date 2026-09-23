export function mountDaily({api}){
  const $=id=>document.getElementById('daily-'+id)
  const node=(tag,text)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;return el}
  let state=null,busy=false,refreshing=false,previewId=null,connected=false,renderedRevision=null
  const notify=(text,error=false)=>{$('notice').textContent=text;$('notice').className=error?'error':''}
  const call=input=>api('daily-action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)})
  function controls(){
    const idle=connected&&!busy&&!state?.active
    for(const button of $('panel').querySelectorAll('button'))button.disabled=!idle
    $('stop').disabled=!connected||busy||!state?.active
    for(const button of $('jobs').querySelectorAll('[data-held]'))button.disabled=true
    $('adopt').disabled=!idle||!previewId||state?.runs.find(r=>r.runId===previewId)?.status!=='completed'
    $('export').disabled=!connected||busy||!previewId
  }
  async function action(input,message='操作已完成。'){
    if(busy)return
    busy=true;controls();notify('正在處理…')
    try{const value=await call(input);await refresh();notify(value.text??message);return value}
    catch(error){notify(error.message,true)}finally{busy=false;controls()}
  }
  async function preview(row){
    previewId=row.runId;$('preview-text').textContent='讀取中…';$('preview').showModal();controls()
    try{
      const result=await call({action:'preview',runId:row.runId})
      if(previewId!==row.runId)return
      const changes=result.changes.map(file=>`${file.kind} · ${file.path}${file.truncated?'（僅顯示前 64 KiB）':''}\n${file.binary?'二進位檔案':file.content??'檔案已移除'}`).join('\n\n')
      $('preview-text').textContent=(row.finalText??'尚無模型完成說明')+'\n\n'+(changes||'沒有檔案變更。')
    }catch(error){$('preview-text').textContent=error.message;previewId=null;controls()}
  }
  function render(){
    $('readiness').textContent=state.paidReady?'日常付費任務已開放。':`付費任務暫停：${state.blockers.join('；')}。仍可儲存草稿與執行固定離線範例。`
    const selected=$('project').value
    $('project').replaceChildren(...(state.projects??[]).map(item=>{const option=node('option',item.label);option.value=item.id;return option}))
    if((state.projects??[]).some(item=>item.id===selected))$('project').value=selected
    const labels={running:'執行中',completed:'程序完成，待檢閱',interrupted:'中斷',failed:'失敗'}
    const items=[]
    for(const job of [...(state.jobs??[])].reverse()){
      const attempts=state.runs.filter(row=>row.jobId===job.id),last=attempts.at(-1),item=node('article')
      item.append(node('strong',`${job.recipe} · ${state.projects.find(p=>p.id===job.projectId)?.label??'專案'} · ${job.kind==='installation-check'?'固定離線範例':'使用者任務'}`),node('p',job.prompt))
      const buttons=node('div');buttons.className='controls'
      const button=(text,fn,held=false)=>{const el=node('button',text);el.onclick=fn;if(held)el.dataset.held='true';buttons.append(el)}
      if(!last&&job.kind==='user-task')button('開始任務',()=>action({action:'start',jobId:job.id}),!state.paidReady)
      if(last?.status==='interrupted')button('明確恢復',()=>action({action:last.mode==='offline'?'resume-check':'resume',jobId:job.id}),last.cleanupVerified===false||(last.mode==='live'&&!state.paidReady))
      item.append(node('p',last?`${labels[last.status]??last.status} · 累計 ${attempts.reduce((n,r)=>n+(r.requests??0),0)} 次請求 · ${last.claimedCompletion?'模型宣稱完成':'尚無完成宣稱'}`:'草稿，尚未執行'))
      for(const row of attempts){
        const details=node('details');details.append(node('summary',`嘗試 ${row.attempt} · ${labels[row.status]??row.status}`),node('pre',row.finalText??row.error??row.artifactError??'尚無輸出'))
        if(row.outputManifest&&row.cleanupVerified){const view=node('button','查看此次成果');view.onclick=()=>preview(row);details.append(view)}
        item.append(details)
      }
      item.append(buttons);items.push(item)
    }
    $('jobs').replaceChildren(...(items.length?items:[node('p','建立專案後，即可儲存日常任務草稿。')]))
    controls()
  }
  async function refresh(){
    if(refreshing)return
    refreshing=true
    try{state=await api('daily');connected=true;if(renderedRevision!==state.revision){render();renderedRevision=state.revision}else controls();if(state.attention)notify(state.attention,true)}
    catch(error){connected=false;controls();notify('日常任務連線中斷：'+error.message,true)}finally{refreshing=false}
  }
  $('import-form').onsubmit=async event=>{event.preventDefault();const value=await action({action:'import',label:$('label').value,source:$('source').value},'已建立獨立副本。');if(value)$('project').value=value.id}
  $('task-form').onsubmit=async event=>{event.preventDefault();const value=await action({action:'task',projectId:$('project').value,recipe:$('recipe').value,prompt:$('prompt').value},'任務草稿已儲存。');if(value)$('prompt').value=''}
  $('check').onclick=()=>action({action:'check',recipe:$('recipe').value})
  $('stop').onclick=()=>action({action:'stop'},'已送出停止要求，正在保存紀錄。')
  $('adopt').onclick=()=>action({action:'adopt',runId:previewId},'已採用成果；下次任務會從此版本開始。')
  $('export').onclick=()=>action({action:'export',runId:previewId,destination:$('destination').value},'成果副本已匯出。')
  $('close').onclick=()=>{$('preview').close();previewId=null;controls()}
  refresh();setInterval(()=>{if(!document.hidden)refresh()},2000)
}
