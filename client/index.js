// DSH's documented client-module wrapper. Kept as readable source: no generated
// framework bundle and no extra copy of React. The host provides React/slots.
window.__ModuleLoader__.load({id:'dsh-architecture-lab',factory:require=>{
  const {createElement:h}=require('react')
  const Panel=()=>h('iframe',{src:'/architecture-lab',title:'架構實驗室',style:{width:'100%',height:'100%',border:0,minHeight:480}})
  const Icon=({size=18})=>h('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,'aria-hidden':true},h('path',{d:'M8 3h8M10 3v7L4 20h16L14 10V3M8 15h8'}))
  return {inject:['slots'],apply(ctx){
    ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:'architecture-lab'},Panel))
    ctx.slots.inject('sidebar.panellist',()=>ctx.slots.register({name:'sidebar.panellist',id:'architecture-lab',order:30,label:'架構實驗室'},Icon))
  }}
}})
