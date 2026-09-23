export const formatCost=value=>value!==0&&Math.abs(value)<1?value.toPrecision(4):value.toFixed(2)
// Text-only rendering: run metadata must never become HTML. Protocols remain
// separate even when their task names, recipes and repetitions match.
export function renderResearch(document, target, analysis) {
  const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;if(className)el.className=className;return el}
  const percentage=value=>value==null?'—':`${(value*100).toFixed(1)}%`
  const difference=(value,scale,unit)=>value==null?'未知':`${value>0?'+':''}${unit==='NT$'?formatCost(value*scale):(value*scale).toFixed(2)} ${unit}`
  const fragment=document.createDocumentFragment()
  const protocols=analysis?.protocols??[]
  if(!protocols.length)fragment.append(node('p','尚無符合研究條件的正式試驗。離線驗證與歷史 pilot 不產生架構效果結論。','muted'))
  for(const protocol of protocols){
    const section=node('section',null,'research-protocol')
    const heading=node('h3',`協定 ${protocol.protocolId.slice(0,12)}`);heading.title=protocol.protocolId;section.append(heading)
    if(protocol.integrityErrors?.length){
      section.append(node('p','證據一致性檢查未通過；本協定不產生比較結果。'))
      const errors=node('ul');for(const error of protocol.integrityErrors)errors.append(node('li',error))
      section.append(errors);fragment.append(section);continue
    }
    const c=protocol.coverage
    section.append(node('p',`完整四組 ${c.completeQuartets} / ${c.plannedQuartets}；未齊組 ${c.incompleteQuartets}；未啟動組 ${c.unlaunchedQuartets}。完整配對涵蓋 ${c.representedTasks} / 6 個固定任務。`,'muted'))
    const cards=node('div',null,'comparison')
    for(const [id,row] of Object.entries(protocol.recipes)){
      const article=node('article');article.append(node('span',`${id} · 外部測試驗證通過率`),node('strong',percentage(row.verifiedPassRate)),
        node('small',`${row.verifiedPasses} / ${row.launchedFirstAttempts} 次已啟動首試；${row.unknownTestResults} 次測試未知；${row.falseCompletions} 次錯誤完成宣稱。`),
        node('small',`總費用 ${row.costTwd.total==null?'未知':`NT$${formatCost(row.costTwd.total)}`}；${row.costTwd.unknown} 次費用未知。`))
      cards.append(article)
    }
    section.append(cards)
    if(protocol.comparisonAvailable){
      const wrap=node('div',null,'table-wrap'),table=node('table'),head=node('thead'),titles=node('tr')
      for(const title of ['配對差異','通過率差','費用差','耗時差'])titles.append(node('th',title))
      head.append(titles);table.append(head)
      const body=node('tbody'),labels={memory:'記憶 B − A',planning:'規劃 C − A',combined:'合併 D − A',interaction:'交互作用 D − C − B ＋ A'}
      for(const [id,row] of Object.entries(protocol.contrasts)){
        const tr=node('tr');tr.append(node('th',labels[id]),node('td',difference(row.verifiedPass.taskBalancedMeanDifference,100,'百分點')),
          node('td',difference(row.costTwd.taskBalancedMeanDifference,1,'NT$')),node('td',difference(row.durationMs.taskBalancedMeanDifference,.001,'秒')));body.append(tr)
      }
      table.append(body);wrap.append(table);section.append(wrap)
    }else section.append(node('p','尚無完整 A／B／C／D 配對，不計算效果差異。','muted'))
    section.append(node('p','差異只使用完整配對，先平均各任務的重複執行，再給各任務相同權重。通過率越高越好；費用與耗時越低越好。缺少用量維持未知，結果不自動選出勝者。','muted'))
    fragment.append(section)
  }
  const e=analysis?.excluded
  if(e)fragment.append(node('p',`未納入研究：離線 ${e.offline}、恢復 ${e.resumed}、未啟動 ${e.unlaunched}、證據不合格 ${e.ineligible}、未結束 ${e.nonterminal}、資料格式有誤 ${e.malformed}。詳情保留於匯出報告。`,'muted'))
  target.replaceChildren(fragment)
}
