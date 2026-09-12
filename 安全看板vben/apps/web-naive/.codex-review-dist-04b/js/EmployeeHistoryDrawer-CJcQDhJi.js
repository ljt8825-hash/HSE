import{n as e}from"./rolldown-runtime-QTnfLwEv.js";import{B as t,D as n,E as r,Ht as i,J as a,On as o,_ as s,b as c,bt as l,g as u,gt as d,k as f,mt as p,o as m,qt as h,tr as g,v as _,vn as v,y}from"./runtime-core.esm-bundler-Blp3D1W4.js";import{t as b}from"./asyncToGenerator-BVcl5FgL.js";import{c as x}from"./naive-BMniTMHP.js";import{B as S,F as C,L as w,R as T,U as E,V as D,j as O,n as k}from"./use-theme-BPxAT0OQ.js";import{i as A,n as j}from"./light-DZKN5sjf.js";import{t as M}from"./format-length-mj6Hk3Qj.js";import{t as N}from"./is-browser-e-NGrvPW.js";import{a as P,r as F}from"./resolve-slot-DbAlC7Z4.js";import{n as I,r as L,t as ee}from"./Spin-CSWaPwNI.js";import{n as te,t as R}from"./Tag-DPfkrLmL.js";import{n as z,t as B}from"./DrawerContent-VCqWg97p.js";import{t as V}from"./text-C8p4Nz9V.js";import{o as H}from"./employee-DzyKigsc.js";var U=!1;function W(){if(N&&window.CSS&&!U&&(U=!0,`registerProperty`in(window==null?void 0:window.CSS)))try{CSS.registerProperty({name:`--n-color-start`,syntax:`<color>`,inherits:!1,initialValue:`#0000`}),CSS.registerProperty({name:`--n-color-end`,syntax:`<color>`,inherits:!1,initialValue:`#0000`})}catch(e){}}var G=1.25,K=T(`timeline`,`
 position: relative;
 width: 100%;
 display: flex;
 flex-direction: column;
 line-height: ${G};
`,[D(`horizontal`,`
 flex-direction: row;
 `,[w(`>`,[T(`timeline-item`,`
 flex-shrink: 0;
 padding-right: 40px;
 `,[D(`dashed-line-type`,[w(`>`,[T(`timeline-item-timeline`,[S(`line`,`
 background-image: linear-gradient(90deg, var(--n-color-start), var(--n-color-start) 50%, transparent 50%, transparent 100%);
 background-size: 10px 1px;
 `)])])]),w(`>`,[T(`timeline-item-content`,`
 margin-top: calc(var(--n-icon-size) + 12px);
 `,[w(`>`,[S(`meta`,`
 margin-top: 6px;
 margin-bottom: unset;
 `)])]),T(`timeline-item-timeline`,`
 width: 100%;
 height: calc(var(--n-icon-size) + 12px);
 `,[S(`line`,`
 left: var(--n-icon-size);
 top: calc(var(--n-icon-size) / 2 - 1px);
 right: 0px;
 width: unset;
 height: 2px;
 `)])])])])]),D(`right-placement`,[T(`timeline-item`,[T(`timeline-item-content`,`
 text-align: right;
 margin-right: calc(var(--n-icon-size) + 12px);
 `),T(`timeline-item-timeline`,`
 width: var(--n-icon-size);
 right: 0;
 `)])]),D(`left-placement`,[T(`timeline-item`,[T(`timeline-item-content`,`
 margin-left: calc(var(--n-icon-size) + 12px);
 `),T(`timeline-item-timeline`,`
 left: 0;
 `)])]),T(`timeline-item`,`
 position: relative;
 `,[w(`&:last-child`,[T(`timeline-item-timeline`,[S(`line`,`
 display: none;
 `)]),T(`timeline-item-content`,[S(`meta`,`
 margin-bottom: 0;
 `)])]),T(`timeline-item-content`,[S(`title`,`
 margin: var(--n-title-margin);
 font-size: var(--n-title-font-size);
 transition: color .3s var(--n-bezier);
 font-weight: var(--n-title-font-weight);
 color: var(--n-title-text-color);
 `),S(`content`,`
 transition: color .3s var(--n-bezier);
 font-size: var(--n-content-font-size);
 color: var(--n-content-text-color);
 `),S(`meta`,`
 transition: color .3s var(--n-bezier);
 font-size: 12px;
 margin-top: 6px;
 margin-bottom: 20px;
 color: var(--n-meta-text-color);
 `)]),D(`dashed-line-type`,[T(`timeline-item-timeline`,[S(`line`,`
 --n-color-start: var(--n-line-color);
 transition: --n-color-start .3s var(--n-bezier);
 background-color: transparent;
 background-image: linear-gradient(180deg, var(--n-color-start), var(--n-color-start) 50%, transparent 50%, transparent 100%);
 background-size: 1px 10px;
 `)])]),T(`timeline-item-timeline`,`
 width: calc(var(--n-icon-size) + 12px);
 position: absolute;
 top: calc(var(--n-title-font-size) * ${G} / 2 - var(--n-icon-size) / 2);
 height: 100%;
 `,[S(`circle`,`
 border: var(--n-circle-border);
 transition:
 background-color .3s var(--n-bezier),
 border-color .3s var(--n-bezier);
 width: var(--n-icon-size);
 height: var(--n-icon-size);
 border-radius: var(--n-icon-size);
 box-sizing: border-box;
 `),S(`icon`,`
 color: var(--n-icon-color);
 font-size: var(--n-icon-size);
 height: var(--n-icon-size);
 width: var(--n-icon-size);
 display: flex;
 align-items: center;
 justify-content: center;
 `),S(`line`,`
 transition: background-color .3s var(--n-bezier);
 position: absolute;
 top: var(--n-icon-size);
 left: calc(var(--n-icon-size) / 2 - 1px);
 bottom: 0px;
 width: 2px;
 background-color: var(--n-line-color);
 `)])])]),q=Object.assign(Object.assign({},k.props),{horizontal:Boolean,itemPlacement:{type:String,default:`left`},size:{type:String,default:`medium`},iconSize:Number}),J=C(`n-timeline`),Y=f({name:`Timeline`,props:q,setup(e,{slots:n}){let{mergedClsPrefixRef:r}=O(e);return d(J,{props:e,mergedThemeRef:k(`Timeline`,`-timeline`,K,x,e,r),mergedClsPrefixRef:r}),()=>{let{value:i}=r;return t(`div`,{class:[`${i}-timeline`,e.horizontal&&`${i}-timeline--horizontal`,`${i}-timeline--${e.size}-size`,!e.horizontal&&`${i}-timeline--${e.itemPlacement}-placement`]},n)}}}),X=f({name:`TimelineItem`,props:{time:[String,Number],title:String,content:String,color:String,lineType:{type:String,default:`default`},type:{type:String,default:`default`}},slots:Object,setup(e){let t=a(J);t||A(`timeline-item`,"`n-timeline-item` must be placed inside `n-timeline`."),W();let{inlineThemeDisabled:n}=O(),r=u(()=>{let{props:{size:n,iconSize:r},mergedThemeRef:i}=t,{type:a}=e,{self:{titleTextColor:o,contentTextColor:s,metaTextColor:c,lineColor:l,titleFontWeight:u,contentFontSize:d,[E(`iconSize`,n)]:f,[E(`titleMargin`,n)]:p,[E(`titleFontSize`,n)]:m,[E(`circleBorder`,a)]:h,[E(`iconColor`,a)]:g},common:{cubicBezierEaseInOut:_}}=i.value;return{"--n-bezier":_,"--n-circle-border":h,"--n-icon-color":g,"--n-content-font-size":d,"--n-content-text-color":s,"--n-line-color":l,"--n-meta-text-color":c,"--n-title-font-size":m,"--n-title-font-weight":u,"--n-title-margin":p,"--n-title-text-color":o,"--n-icon-size":M(r)||f}}),i=n?j(`timeline-item`,u(()=>{let{props:{size:n,iconSize:r}}=t,{type:i}=e;return`${n[0]}${r||`a`}${i[0]}`}),r,t.props):void 0;return{mergedClsPrefix:t.mergedClsPrefixRef,cssVars:n?void 0:r,themeClass:i==null?void 0:i.themeClass,onRender:i==null?void 0:i.onRender}},render(){let{mergedClsPrefix:e,color:n,onRender:r,$slots:i}=this;return r==null||r(),t(`div`,{class:[`${e}-timeline-item`,this.themeClass,`${e}-timeline-item--${this.type}-type`,`${e}-timeline-item--${this.lineType}-line-type`],style:this.cssVars},t(`div`,{class:`${e}-timeline-item-timeline`},t(`div`,{class:`${e}-timeline-item-timeline__line`}),P(i.icon,r=>r?t(`div`,{class:`${e}-timeline-item-timeline__icon`,style:{color:n}},r):t(`div`,{class:`${e}-timeline-item-timeline__circle`,style:{borderColor:n}}))),t(`div`,{class:`${e}-timeline-item-content`},P(i.header,n=>n||this.title?t(`div`,{class:`${e}-timeline-item-content__title`},n||this.title):null),t(`div`,{class:`${e}-timeline-item-content__content`},F(i.default,()=>[this.content])),t(`div`,{class:`${e}-timeline-item-content__meta`},F(i.footer,()=>[this.time]))))}}),Z={class:`mb-1 flex items-center gap-2`},ne={class:`text-gray-400`},re={class:`font-medium`},ie={class:`text-gray-400`},Q={class:`font-medium`},ae={class:`text-gray-400`},oe={class:`font-medium`},se=f({__name:`EmployeeHistoryDrawer`,props:{open:{type:Boolean},employeeId:{},employeeName:{}},emits:[`update:open`],setup(e,{emit:t}){let a=e,d=t,f=v(!1),x=v([]),S={入职:`success`,调岗:`info`,离职:`error`,退休:`warning`,返聘:`success`,待岗:`warning`,复岗:`success`,晋升:`info`,降级:`error`},C={入职:`#18a058`,调岗:`#2080f0`,离职:`#d03050`,退休:`#f0a020`,返聘:`#13c2c2`,待岗:`#f5a623`,复岗:`#18a058`,晋升:`#8b5cf6`,降级:`#d03050`};function w(e){return S[e]||`default`}function T(e){return C[e]||`#d0d0d0`}function E(e){return e&&e!==``?e:`-`}function D(e){return e?e.length>=10?e.slice(0,10):e:`-`}let O=u(()=>[...x.value].sort((e,t)=>{let n=e.event_date?new Date(e.event_date).getTime():0;return(t.event_date?new Date(t.event_date).getTime():0)-n}));function k(e){return A.apply(this,arguments)}function A(){return A=b(function*(e){f.value=!0;try{let t=yield H(e);x.value=Array.isArray(t)?t:[]}catch(e){x.value=[]}finally{f.value=!1}}),A.apply(this,arguments)}i(()=>a.open,e=>{e&&(x.value=[],a.employeeId&&k(a.employeeId))});function j(){d(`update:open`,!1)}let M=u(()=>a.employeeName?`${a.employeeName} - 人事变动历史`:`人事变动历史`);return(e,t)=>(p(),_(o(z),{show:a.open,width:720,placement:`right`,"onUpdate:show":j},{default:h(()=>[n(o(B),{title:M.value,"native-scrollbar":!0},{default:h(()=>[n(o(ee),{show:f.value},{default:h(()=>[!f.value&&O.value.length===0?(p(),_(o(te),{key:0,description:`暂无人事变动记录`,class:`py-12`})):(p(),_(o(Y),{key:1,class:`pt-2`},{default:h(()=>[(p(!0),c(m,null,l(O.value,e=>(p(),_(o(X),{key:e.id,color:T(e.event_type)},{default:h(()=>[s(`div`,Z,[n(o(R),{type:w(e.event_type)},{default:h(()=>[r(g(e.event_type||`其他`),1)]),_:2},1032,[`type`]),n(o(V),{depth:`3`,class:`text-sm`},{default:h(()=>[r(g(D(e.event_date)),1)]),_:2},1024)]),n(o(L),{size:`small`,column:1,bordered:``,"label-placement":`left`},{default:h(()=>[n(o(I),{label:`部门`},{default:h(()=>[s(`span`,ne,g(E(e.before_dept_name)),1),t[0]||(t[0]=s(`span`,{class:`text-primary px-1`},`→`,-1)),s(`span`,re,g(E(e.after_dept_name)),1)]),_:2},1024),n(o(I),{label:`岗位`},{default:h(()=>[s(`span`,ie,g(E(e.before_position_name)),1),t[1]||(t[1]=s(`span`,{class:`text-primary px-1`},`→`,-1)),s(`span`,Q,g(E(e.after_position_name)),1)]),_:2},1024),n(o(I),{label:`状态`},{default:h(()=>[s(`span`,ae,g(E(e.before_status)),1),t[2]||(t[2]=s(`span`,{class:`text-primary px-1`},`→`,-1)),s(`span`,oe,g(E(e.after_status)),1)]),_:2},1024),e.approval_no?(p(),_(o(I),{key:0,label:`审批单号`},{default:h(()=>[r(g(e.approval_no),1)]),_:2},1024)):y(``,!0),e.remark?(p(),_(o(I),{key:1,label:`备注`},{default:h(()=>[r(g(e.remark),1)]),_:2},1024)):y(``,!0)]),_:2},1024)]),_:2},1032,[`color`]))),128))]),_:1}))]),_:1},8,[`show`])]),_:1},8,[`title`])]),_:1},8,[`show`]))}}),ce=e({default:()=>$}),$=se;export{ce as n,$ as t};