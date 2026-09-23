import test from 'node:test'
import assert from 'node:assert/strict'
import { renderResearch } from '../client/research.mjs'
import { analyzeResearch } from '../src/research-analysis.mjs'

// A small text-tree checks report content without claiming browser acceptance.
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.textContent=''}
  append(...children){this.children.push(...children)}
  replaceChildren(...children){this.children=children}
  get text(){return this.textContent+this.children.map(child=>child.text).join('\n')}
}
const document={createElement:tag=>new Element(tag),createDocumentFragment:()=>new Element('fragment')}
const rows=(id,passes)=>['A','B','C','D'].map((recipe,i)=>({protocolId:id.repeat(64),mode:'live',attempt:1,launched:true,evidenceValid:true,
  recipe,repetition:1,taskId:'stale-fee',containerImage:'sha256:'+'f'.repeat(64),status:'completed',test:{pass:passes[i]},costTwd:null,durationMs:null}))

test('research panel separates protocols and keeps missing cost differences unknown',()=>{
  const target=new Element('div')
  renderResearch(document,target,analyzeResearch([...rows('a',[true,true,true,true]),...rows('b',[false,false,false,false])]))
  assert.match(target.text,/協定 aaaaaaaaaaaa/);assert.match(target.text,/協定 bbbbbbbbbbbb/)
  assert.match(target.text,/100\.0%/);assert.match(target.text,/0\.0%/);assert.doesNotMatch(target.text,/50\.0%/)
  assert.match(target.text,/總費用 未知/);assert.doesNotMatch(target.text,/NT\$0\.00/)
})

test('partial and ineligible results do not produce paired effects',()=>{
  const target=new Element('div')
  renderResearch(document,target,analyzeResearch(rows('a',[true,true,true,true]).slice(0,3)))
  assert.match(target.text,/尚無完整/);assert.doesNotMatch(target.text,/百分點/)
  renderResearch(document,target,analyzeResearch(rows('a',[true,true,true,true]).map(row=>({...row,mode:'offline'}))))
  assert.match(target.text,/尚無符合研究條件/);assert.match(target.text,/離線 4/);assert.doesNotMatch(target.text,/協定 a/)
})
