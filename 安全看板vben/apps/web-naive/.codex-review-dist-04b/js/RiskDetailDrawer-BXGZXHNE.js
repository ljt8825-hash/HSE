import{n as e}from"./rolldown-runtime-QTnfLwEv.js";import{B as t,D as n,E as r,Ht as i,J as a,On as o,St as s,Ut as c,Yt as l,_ as u,b as d,bt as f,ct as p,et as m,g as h,gt as g,h as _,k as v,mt as y,o as b,qt as x,tr as S,tt as C,v as w,vn as T,wn as E,y as D}from"./runtime-core.esm-bundler-Blp3D1W4.js";import{S as O,n as k}from"./runtime-dom.esm-bundler-CEFztc8a.js";import{t as A}from"./asyncToGenerator-BVcl5FgL.js";import{l as ee}from"./naive-BMniTMHP.js";import{A as j,B as M,F as N,H as te,L as P,P as F,R as I,T as L,U as R,V as z,j as ne,n as re}from"./use-theme-BPxAT0OQ.js";import{l as ie,n as B,r as V}from"./Follower-CgHcuyay.js";import{f as H,s as ae,u as oe}from"./Scrollbar-CWE-8E6x.js";import{r as U,t as se}from"./css-DEmdllcC.js";import{i as ce,n as le}from"./light-DZKN5sjf.js";import{t as ue}from"./use-merged-state-zglAmQ1M.js";import{n as de}from"./format-length-mj6Hk3Qj.js";import{a as W,o as G}from"./resolve-slot-DbAlC7Z4.js";import{t as fe}from"./flatten-CoLVt70p.js";import{n as K,r as pe,t as me}from"./Spin-CSWaPwNI.js";import{t as q}from"./omit-_j9wL4dr.js";import{t as he}from"./render-ipbixR-R.js";import{t as J}from"./Add-gpc8CwAA.js";import{a as ge,t as _e}from"./Upload-BRCJNaZt.js";import{t as ve}from"./Close-BaKf5mos.js";import{n as Y,t as X}from"./Tag-DPfkrLmL.js";import{t as Z}from"./Button-D3KYnRDa.js";import{a as ye}from"./use-notification-DoGXsPXS.js";import{n as be,t as xe}from"./DrawerContent-VCqWg97p.js";import{t as Q}from"./Space-BcBisEzC.js";import{n as Se,t as Ce}from"./ListItem-CvydVLZV.js";import{t as we}from"./Popconfirm-D8PgyH-X.js";import{t as $}from"./text-C8p4Nz9V.js";import{a as Te,c as Ee,h as De,l as Oe,p as ke,s as Ae,t as je,u as Me}from"./RiskAssessModal-DHY9vDRN.js";var Ne=B(`.v-x-scroll`,{overflow:`auto`,scrollbarWidth:`none`},[B(`&::-webkit-scrollbar`,{width:0,height:0})]),Pe=v({name:`XScroll`,props:{disabled:Boolean,onScroll:Function},setup(){let e=T(null);function t(e){!(e.currentTarget.offsetWidth<e.currentTarget.scrollWidth)||e.deltaY===0||(e.currentTarget.scrollLeft+=e.deltaY+e.deltaX,e.preventDefault())}let n=F();return Ne.mount({id:`vueuc/x-scroll`,head:!0,anchorMetaName:V,ssr:n}),Object.assign({selfRef:e,handleWheel:t},{scrollTo(...t){var n;(n=e.value)==null||n.scrollTo(...t)}})},render(){return t(`div`,{ref:`selfRef`,onScroll:this.onScroll,onWheel:this.disabled?void 0:this.handleWheel,class:`v-x-scroll`},this.$slots)}}),Fe=/\s/;function Ie(e){for(var t=e.length;t--&&Fe.test(e.charAt(t)););return t}var Le=/^\s+/;function Re(e){return e&&e.slice(0,Ie(e)+1).replace(Le,``)}var ze=NaN,Be=/^[-+]0x[0-9a-f]+$/i,Ve=/^0b[01]+$/i,He=/^0o[0-7]+$/i,Ue=parseInt;function We(e){if(typeof e==`number`)return e;if(oe(e))return ze;if(L(e)){var t=typeof e.valueOf==`function`?e.valueOf():e;e=L(t)?t+``:t}if(typeof e!=`string`)return e===0?e:+e;e=Re(e);var n=Ve.test(e);return n||He.test(e)?Ue(e.slice(2),n?2:8):Be.test(e)?ze:+e}var Ge=function(){return j.Date.now()},Ke=`Expected a function`,qe=Math.max,Je=Math.min;function Ye(e,t,n){var r,i,a,o,s,c,l=0,u=!1,d=!1,f=!0;if(typeof e!=`function`)throw TypeError(Ke);t=We(t)||0,L(n)&&(u=!!n.leading,d=`maxWait`in n,a=d?qe(We(n.maxWait)||0,t):a,f=`trailing`in n?!!n.trailing:f);function p(t){var n=r,a=i;return r=i=void 0,l=t,o=e.apply(a,n),o}function m(e){return l=e,s=setTimeout(_,t),u?p(e):o}function h(e){var n=e-c,r=e-l,i=t-n;return d?Je(i,a-r):i}function g(e){var n=e-c,r=e-l;return c===void 0||n>=t||n<0||d&&r>=a}function _(){var e=Ge();if(g(e))return v(e);s=setTimeout(_,h(e))}function v(e){return s=void 0,f&&r?p(e):(r=i=void 0,o)}function y(){s!==void 0&&clearTimeout(s),l=0,r=c=i=s=void 0}function b(){return s===void 0?o:v(Ge())}function x(){var e=Ge(),n=g(e);if(r=arguments,i=this,c=e,n){if(s===void 0)return m(c);if(d)return clearTimeout(s),s=setTimeout(_,t),p(c)}return s===void 0&&(s=setTimeout(_,t)),o}return x.cancel=y,x.flush=b,x}var Xe=`Expected a function`;function Ze(e,t,n){var r=!0,i=!0;if(typeof e!=`function`)throw TypeError(Xe);return L(n)&&(r=`leading`in n?!!n.leading:r,i=`trailing`in n?!!n.trailing:i),Ye(e,t,{leading:r,maxWait:t,trailing:i})}var Qe=N(`n-tabs`),$e={tab:[String,Number,Object,Function],name:{type:[String,Number],required:!0},disabled:Boolean,displayDirective:{type:String,default:`if`},closable:{type:Boolean,default:void 0},tabProps:Object,label:[String,Number,Object,Function]},et=v({__TAB_PANE__:!0,name:`TabPane`,alias:[`TabPanel`],props:$e,slots:Object,setup(e){let t=a(Qe,null);return t||ce(`tab-pane`,"`n-tab-pane` must be placed inside `n-tabs`."),{style:t.paneStyleRef,class:t.paneClassRef,mergedClsPrefix:t.mergedClsPrefixRef}},render(){return t(`div`,{class:[`${this.mergedClsPrefix}-tab-pane`,this.class],style:this.style},this.$slots)}}),tt=v({__TAB__:!0,inheritAttrs:!1,name:`Tab`,props:Object.assign({internalLeftPadded:Boolean,internalAddable:Boolean,internalCreatedByPane:Boolean},q($e,[`displayDirective`])),setup(e){let{mergedClsPrefixRef:t,valueRef:n,typeRef:r,closableRef:i,tabStyleRef:o,addTabStyleRef:s,tabClassRef:c,addTabClassRef:l,tabChangeIdRef:u,onBeforeLeaveRef:d,triggerRef:f,handleAdd:p,activateTab:m,handleClose:g}=a(Qe);return{trigger:f,mergedClosable:h(()=>{if(e.internalAddable)return!1;let{closable:t}=e;return t===void 0?i.value:t}),style:o,addStyle:s,tabClass:c,addTabClass:l,clsPrefix:t,value:n,type:r,handleClose(t){t.stopPropagation(),!e.disabled&&g(e.name)},activateTab(){if(e.disabled)return;if(e.internalAddable){p();return}let{name:t}=e,r=++u.id;if(t!==n.value){let{value:i}=d;i?Promise.resolve(i(e.name,n.value)).then(e=>{e&&u.id===r&&m(t)}):m(t)}}}},render(){let{internalAddable:e,clsPrefix:n,name:r,disabled:i,label:a,tab:o,value:s,mergedClosable:c,trigger:l,$slots:{default:u}}=this,d=a==null?o:a;return t(`div`,{class:`${n}-tabs-tab-wrapper`},this.internalLeftPadded?t(`div`,{class:`${n}-tabs-tab-pad`}):null,t(`div`,Object.assign({key:r,"data-name":r,"data-disabled":i?!0:void 0},m({class:[`${n}-tabs-tab`,s===r&&`${n}-tabs-tab--active`,i&&`${n}-tabs-tab--disabled`,c&&`${n}-tabs-tab--closable`,e&&`${n}-tabs-tab--addable`,e?this.addTabClass:this.tabClass],onClick:l===`click`?this.activateTab:void 0,onMouseenter:l===`hover`?this.activateTab:void 0,style:e?this.addStyle:this.style},this.internalCreatedByPane?this.tabProps||{}:this.$attrs)),t(`span`,{class:`${n}-tabs-tab__label`},e?t(b,null,t(`div`,{class:`${n}-tabs-tab__height-placeholder`},`\xA0`),t(ae,{clsPrefix:n},{default:()=>t(J,null)})):u?u():typeof d==`object`?d:he(d==null?r:d)),c&&this.type===`card`?t(ve,{clsPrefix:n,class:`${n}-tabs-tab__close`,onClick:this.handleClose,disabled:i}):null))}}),nt=I(`tabs`,`
 box-sizing: border-box;
 width: 100%;
 display: flex;
 flex-direction: column;
 transition:
 background-color .3s var(--n-bezier),
 border-color .3s var(--n-bezier);
`,[z(`segment-type`,[I(`tabs-rail`,[P(`&.transition-disabled`,[I(`tabs-capsule`,`
 transition: none;
 `)])])]),z(`top`,[I(`tab-pane`,`
 padding: var(--n-pane-padding-top) var(--n-pane-padding-right) var(--n-pane-padding-bottom) var(--n-pane-padding-left);
 `)]),z(`left`,[I(`tab-pane`,`
 padding: var(--n-pane-padding-right) var(--n-pane-padding-bottom) var(--n-pane-padding-left) var(--n-pane-padding-top);
 `)]),z(`left, right`,`
 flex-direction: row;
 `,[I(`tabs-bar`,`
 width: 2px;
 right: 0;
 transition:
 top .2s var(--n-bezier),
 max-height .2s var(--n-bezier),
 background-color .3s var(--n-bezier);
 `),I(`tabs-tab`,`
 padding: var(--n-tab-padding-vertical); 
 `)]),z(`right`,`
 flex-direction: row-reverse;
 `,[I(`tab-pane`,`
 padding: var(--n-pane-padding-left) var(--n-pane-padding-top) var(--n-pane-padding-right) var(--n-pane-padding-bottom);
 `),I(`tabs-bar`,`
 left: 0;
 `)]),z(`bottom`,`
 flex-direction: column-reverse;
 justify-content: flex-end;
 `,[I(`tab-pane`,`
 padding: var(--n-pane-padding-bottom) var(--n-pane-padding-right) var(--n-pane-padding-top) var(--n-pane-padding-left);
 `),I(`tabs-bar`,`
 top: 0;
 `)]),I(`tabs-rail`,`
 position: relative;
 padding: 3px;
 border-radius: var(--n-tab-border-radius);
 width: 100%;
 background-color: var(--n-color-segment);
 transition: background-color .3s var(--n-bezier);
 display: flex;
 align-items: center;
 `,[I(`tabs-capsule`,`
 border-radius: var(--n-tab-border-radius);
 position: absolute;
 pointer-events: none;
 background-color: var(--n-tab-color-segment);
 box-shadow: 0 1px 3px 0 rgba(0, 0, 0, .08);
 transition: transform 0.3s var(--n-bezier);
 `),I(`tabs-tab-wrapper`,`
 flex-basis: 0;
 flex-grow: 1;
 display: flex;
 align-items: center;
 justify-content: center;
 `,[I(`tabs-tab`,`
 overflow: hidden;
 border-radius: var(--n-tab-border-radius);
 width: 100%;
 display: flex;
 align-items: center;
 justify-content: center;
 `,[z(`active`,`
 font-weight: var(--n-font-weight-strong);
 color: var(--n-tab-text-color-active);
 `),P(`&:hover`,`
 color: var(--n-tab-text-color-hover);
 `)])])]),z(`flex`,[I(`tabs-nav`,`
 width: 100%;
 position: relative;
 `,[I(`tabs-wrapper`,`
 width: 100%;
 `,[I(`tabs-tab`,`
 margin-right: 0;
 `)])])]),I(`tabs-nav`,`
 box-sizing: border-box;
 line-height: 1.5;
 display: flex;
 transition: border-color .3s var(--n-bezier);
 `,[M(`prefix, suffix`,`
 display: flex;
 align-items: center;
 `),M(`prefix`,`padding-right: 16px;`),M(`suffix`,`padding-left: 16px;`)]),z(`top, bottom`,[P(`>`,[I(`tabs-nav`,[I(`tabs-nav-scroll-wrapper`,[P(`&::before`,`
 top: 0;
 bottom: 0;
 left: 0;
 width: 20px;
 `),P(`&::after`,`
 top: 0;
 bottom: 0;
 right: 0;
 width: 20px;
 `),z(`shadow-start`,[P(`&::before`,`
 box-shadow: inset 10px 0 8px -8px rgba(0, 0, 0, .12);
 `)]),z(`shadow-end`,[P(`&::after`,`
 box-shadow: inset -10px 0 8px -8px rgba(0, 0, 0, .12);
 `)])])])])]),z(`left, right`,[I(`tabs-nav-scroll-content`,`
 flex-direction: column;
 `),P(`>`,[I(`tabs-nav`,[I(`tabs-nav-scroll-wrapper`,[P(`&::before`,`
 top: 0;
 left: 0;
 right: 0;
 height: 20px;
 `),P(`&::after`,`
 bottom: 0;
 left: 0;
 right: 0;
 height: 20px;
 `),z(`shadow-start`,[P(`&::before`,`
 box-shadow: inset 0 10px 8px -8px rgba(0, 0, 0, .12);
 `)]),z(`shadow-end`,[P(`&::after`,`
 box-shadow: inset 0 -10px 8px -8px rgba(0, 0, 0, .12);
 `)])])])])]),I(`tabs-nav-scroll-wrapper`,`
 flex: 1;
 position: relative;
 overflow: hidden;
 `,[I(`tabs-nav-y-scroll`,`
 height: 100%;
 width: 100%;
 overflow-y: auto; 
 scrollbar-width: none;
 `,[P(`&::-webkit-scrollbar, &::-webkit-scrollbar-track-piece, &::-webkit-scrollbar-thumb`,`
 width: 0;
 height: 0;
 display: none;
 `)]),P(`&::before, &::after`,`
 transition: box-shadow .3s var(--n-bezier);
 pointer-events: none;
 content: "";
 position: absolute;
 z-index: 1;
 `)]),I(`tabs-nav-scroll-content`,`
 display: flex;
 position: relative;
 min-width: 100%;
 min-height: 100%;
 width: fit-content;
 box-sizing: border-box;
 `),I(`tabs-wrapper`,`
 display: inline-flex;
 flex-wrap: nowrap;
 position: relative;
 `),I(`tabs-tab-wrapper`,`
 display: flex;
 flex-wrap: nowrap;
 flex-shrink: 0;
 flex-grow: 0;
 `),I(`tabs-tab`,`
 cursor: pointer;
 white-space: nowrap;
 flex-wrap: nowrap;
 display: inline-flex;
 align-items: center;
 color: var(--n-tab-text-color);
 font-size: var(--n-tab-font-size);
 background-clip: padding-box;
 padding: var(--n-tab-padding);
 transition:
 box-shadow .3s var(--n-bezier),
 color .3s var(--n-bezier),
 background-color .3s var(--n-bezier),
 border-color .3s var(--n-bezier);
 `,[z(`disabled`,{cursor:`not-allowed`}),M(`close`,`
 margin-left: 6px;
 transition:
 background-color .3s var(--n-bezier),
 color .3s var(--n-bezier);
 `),M(`label`,`
 display: flex;
 align-items: center;
 z-index: 1;
 `)]),I(`tabs-bar`,`
 position: absolute;
 bottom: 0;
 height: 2px;
 border-radius: 1px;
 background-color: var(--n-bar-color);
 transition:
 left .2s var(--n-bezier),
 max-width .2s var(--n-bezier),
 opacity .3s var(--n-bezier),
 background-color .3s var(--n-bezier);
 `,[P(`&.transition-disabled`,`
 transition: none;
 `),z(`disabled`,`
 background-color: var(--n-tab-text-color-disabled)
 `)]),I(`tabs-pane-wrapper`,`
 position: relative;
 overflow: hidden;
 transition: max-height .2s var(--n-bezier);
 `),I(`tab-pane`,`
 color: var(--n-pane-text-color);
 width: 100%;
 transition:
 color .3s var(--n-bezier),
 background-color .3s var(--n-bezier),
 opacity .2s var(--n-bezier);
 left: 0;
 right: 0;
 top: 0;
 `,[P(`&.next-transition-leave-active, &.prev-transition-leave-active, &.next-transition-enter-active, &.prev-transition-enter-active`,`
 transition:
 color .3s var(--n-bezier),
 background-color .3s var(--n-bezier),
 transform .2s var(--n-bezier),
 opacity .2s var(--n-bezier);
 `),P(`&.next-transition-leave-active, &.prev-transition-leave-active`,`
 position: absolute;
 `),P(`&.next-transition-enter-from, &.prev-transition-leave-to`,`
 transform: translateX(32px);
 opacity: 0;
 `),P(`&.next-transition-leave-to, &.prev-transition-enter-from`,`
 transform: translateX(-32px);
 opacity: 0;
 `),P(`&.next-transition-leave-from, &.next-transition-enter-to, &.prev-transition-leave-from, &.prev-transition-enter-to`,`
 transform: translateX(0);
 opacity: 1;
 `)]),I(`tabs-tab-pad`,`
 box-sizing: border-box;
 width: var(--n-tab-gap);
 flex-grow: 0;
 flex-shrink: 0;
 `),z(`line-type, bar-type`,[I(`tabs-tab`,`
 font-weight: var(--n-tab-font-weight);
 box-sizing: border-box;
 vertical-align: bottom;
 `,[P(`&:hover`,{color:`var(--n-tab-text-color-hover)`}),z(`active`,`
 color: var(--n-tab-text-color-active);
 font-weight: var(--n-tab-font-weight-active);
 `),z(`disabled`,{color:`var(--n-tab-text-color-disabled)`})])]),I(`tabs-nav`,[z(`line-type`,[z(`top`,[M(`prefix, suffix`,`
 border-bottom: 1px solid var(--n-tab-border-color);
 `),I(`tabs-nav-scroll-content`,`
 border-bottom: 1px solid var(--n-tab-border-color);
 `),I(`tabs-bar`,`
 bottom: -1px;
 `)]),z(`left`,[M(`prefix, suffix`,`
 border-right: 1px solid var(--n-tab-border-color);
 `),I(`tabs-nav-scroll-content`,`
 border-right: 1px solid var(--n-tab-border-color);
 `),I(`tabs-bar`,`
 right: -1px;
 `)]),z(`right`,[M(`prefix, suffix`,`
 border-left: 1px solid var(--n-tab-border-color);
 `),I(`tabs-nav-scroll-content`,`
 border-left: 1px solid var(--n-tab-border-color);
 `),I(`tabs-bar`,`
 left: -1px;
 `)]),z(`bottom`,[M(`prefix, suffix`,`
 border-top: 1px solid var(--n-tab-border-color);
 `),I(`tabs-nav-scroll-content`,`
 border-top: 1px solid var(--n-tab-border-color);
 `),I(`tabs-bar`,`
 top: -1px;
 `)]),M(`prefix, suffix`,`
 transition: border-color .3s var(--n-bezier);
 `),I(`tabs-nav-scroll-content`,`
 transition: border-color .3s var(--n-bezier);
 `),I(`tabs-bar`,`
 border-radius: 0;
 `)]),z(`card-type`,[M(`prefix, suffix`,`
 transition: border-color .3s var(--n-bezier);
 `),I(`tabs-pad`,`
 flex-grow: 1;
 transition: border-color .3s var(--n-bezier);
 `),I(`tabs-tab-pad`,`
 transition: border-color .3s var(--n-bezier);
 `),I(`tabs-tab`,`
 font-weight: var(--n-tab-font-weight);
 border: 1px solid var(--n-tab-border-color);
 background-color: var(--n-tab-color);
 box-sizing: border-box;
 position: relative;
 vertical-align: bottom;
 display: flex;
 justify-content: space-between;
 font-size: var(--n-tab-font-size);
 color: var(--n-tab-text-color);
 `,[z(`addable`,`
 padding-left: 8px;
 padding-right: 8px;
 font-size: 16px;
 justify-content: center;
 `,[M(`height-placeholder`,`
 width: 0;
 font-size: var(--n-tab-font-size);
 `),te(`disabled`,[P(`&:hover`,`
 color: var(--n-tab-text-color-hover);
 `)])]),z(`closable`,`padding-right: 8px;`),z(`active`,`
 background-color: #0000;
 font-weight: var(--n-tab-font-weight-active);
 color: var(--n-tab-text-color-active);
 `),z(`disabled`,`color: var(--n-tab-text-color-disabled);`)])]),z(`left, right`,`
 flex-direction: column; 
 `,[M(`prefix, suffix`,`
 padding: var(--n-tab-padding-vertical);
 `),I(`tabs-wrapper`,`
 flex-direction: column;
 `),I(`tabs-tab-wrapper`,`
 flex-direction: column;
 `,[I(`tabs-tab-pad`,`
 height: var(--n-tab-gap-vertical);
 width: 100%;
 `)])]),z(`top`,[z(`card-type`,[I(`tabs-scroll-padding`,`border-bottom: 1px solid var(--n-tab-border-color);`),M(`prefix, suffix`,`
 border-bottom: 1px solid var(--n-tab-border-color);
 `),I(`tabs-tab`,`
 border-top-left-radius: var(--n-tab-border-radius);
 border-top-right-radius: var(--n-tab-border-radius);
 `,[z(`active`,`
 border-bottom: 1px solid #0000;
 `)]),I(`tabs-tab-pad`,`
 border-bottom: 1px solid var(--n-tab-border-color);
 `),I(`tabs-pad`,`
 border-bottom: 1px solid var(--n-tab-border-color);
 `)])]),z(`left`,[z(`card-type`,[I(`tabs-scroll-padding`,`border-right: 1px solid var(--n-tab-border-color);`),M(`prefix, suffix`,`
 border-right: 1px solid var(--n-tab-border-color);
 `),I(`tabs-tab`,`
 border-top-left-radius: var(--n-tab-border-radius);
 border-bottom-left-radius: var(--n-tab-border-radius);
 `,[z(`active`,`
 border-right: 1px solid #0000;
 `)]),I(`tabs-tab-pad`,`
 border-right: 1px solid var(--n-tab-border-color);
 `),I(`tabs-pad`,`
 border-right: 1px solid var(--n-tab-border-color);
 `)])]),z(`right`,[z(`card-type`,[I(`tabs-scroll-padding`,`border-left: 1px solid var(--n-tab-border-color);`),M(`prefix, suffix`,`
 border-left: 1px solid var(--n-tab-border-color);
 `),I(`tabs-tab`,`
 border-top-right-radius: var(--n-tab-border-radius);
 border-bottom-right-radius: var(--n-tab-border-radius);
 `,[z(`active`,`
 border-left: 1px solid #0000;
 `)]),I(`tabs-tab-pad`,`
 border-left: 1px solid var(--n-tab-border-color);
 `),I(`tabs-pad`,`
 border-left: 1px solid var(--n-tab-border-color);
 `)])]),z(`bottom`,[z(`card-type`,[I(`tabs-scroll-padding`,`border-top: 1px solid var(--n-tab-border-color);`),M(`prefix, suffix`,`
 border-top: 1px solid var(--n-tab-border-color);
 `),I(`tabs-tab`,`
 border-bottom-left-radius: var(--n-tab-border-radius);
 border-bottom-right-radius: var(--n-tab-border-radius);
 `,[z(`active`,`
 border-top: 1px solid #0000;
 `)]),I(`tabs-tab-pad`,`
 border-top: 1px solid var(--n-tab-border-color);
 `),I(`tabs-pad`,`
 border-top: 1px solid var(--n-tab-border-color);
 `)])])])]),rt=Ze,it=v({name:`Tabs`,props:Object.assign(Object.assign({},re.props),{value:[String,Number],defaultValue:[String,Number],trigger:{type:String,default:`click`},type:{type:String,default:`bar`},closable:Boolean,justifyContent:String,size:String,placement:{type:String,default:`top`},tabStyle:[String,Object],tabClass:String,addTabStyle:[String,Object],addTabClass:String,barWidth:Number,paneClass:String,paneStyle:[String,Object],paneWrapperClass:String,paneWrapperStyle:[String,Object],addable:[Boolean,Object],tabsPadding:{type:Number,default:0},animated:Boolean,onBeforeLeave:Function,onAdd:Function,"onUpdate:value":[Function,Array],onUpdateValue:[Function,Array],onClose:[Function,Array],labelSize:String,activeName:[String,Number],onActiveNameChange:[Function,Array]}),slots:Object,setup(e,{slots:t}){var n,r,a,o;let{mergedClsPrefixRef:s,inlineThemeDisabled:l,mergedComponentPropsRef:u}=ne(e),d=re(`Tabs`,`-tabs`,nt,ee,e,s),f=T(null),m=T(null),_=T(null),v=T(null),y=T(null),b=T(null),x=T(!0),S=T(!0),w=de(e,[`labelSize`,`size`]),D=h(()=>{var e,t;return w.value?w.value:((t=(e=u==null?void 0:u.value)==null?void 0:e.Tabs)==null?void 0:t.size)||`medium`}),O=de(e,[`activeName`,`value`]),k=T((r=(n=O.value)==null?e.defaultValue:n)==null?t.default?(o=(a=fe(t.default())[0])==null?void 0:a.props)==null?void 0:o.name:null:r),A=ue(O,k),j={id:0},M=h(()=>{if(!(!e.justifyContent||e.type===`card`))return{display:`flex`,justifyContent:e.justifyContent}});i(A,()=>{j.id=0,I(),L()});function N(){var e;let{value:t}=A;return t===null?null:(e=f.value)==null?void 0:e.querySelector(`[data-name="${t}"]`)}function te(t){if(e.type===`card`)return;let{value:n}=m;if(!n)return;let r=n.style.opacity===`0`;if(t){let i=`${s.value}-tabs-bar--disabled`,{barWidth:a,placement:o}=e;if(t.dataset.disabled===`true`?n.classList.add(i):n.classList.remove(i),[`top`,`bottom`].includes(o)){if(F([`top`,`maxHeight`,`height`]),typeof a==`number`&&t.offsetWidth>=a){let e=Math.floor((t.offsetWidth-a)/2)+t.offsetLeft;n.style.left=`${e}px`,n.style.maxWidth=`${a}px`}else n.style.left=`${t.offsetLeft}px`,n.style.maxWidth=`${t.offsetWidth}px`;n.style.width=`8192px`,r&&(n.style.transition=`none`),n.offsetWidth,r&&(n.style.transition=``,n.style.opacity=`1`)}else{if(F([`left`,`maxWidth`,`width`]),typeof a==`number`&&t.offsetHeight>=a){let e=Math.floor((t.offsetHeight-a)/2)+t.offsetTop;n.style.top=`${e}px`,n.style.maxHeight=`${a}px`}else n.style.top=`${t.offsetTop}px`,n.style.maxHeight=`${t.offsetHeight}px`;n.style.height=`8192px`,r&&(n.style.transition=`none`),n.offsetHeight,r&&(n.style.transition=``,n.style.opacity=`1`)}}}function P(){if(e.type===`card`)return;let{value:t}=m;t&&(t.style.opacity=`0`)}function F(e){let{value:t}=m;if(t)for(let n of e)t.style[n]=``}function I(){if(e.type===`card`)return;let t=N();t?te(t):P()}function L(){var e;let t=(e=y.value)==null?void 0:e.$el;if(!t)return;let n=N();if(!n)return;let{scrollLeft:r,offsetWidth:i}=t,{offsetLeft:a,offsetWidth:o}=n;r>a?t.scrollTo({top:0,left:a,behavior:`smooth`}):a+o>r+i&&t.scrollTo({top:0,left:a+o-i,behavior:`smooth`})}let z=T(null),B=0,V=null;function H(e){let t=z.value;if(t){B=e.getBoundingClientRect().height;let n=`${B}px`,r=()=>{t.style.height=n,t.style.maxHeight=n};V?(r(),V(),V=null):V=r}}function ae(e){let t=z.value;if(t){let n=e.getBoundingClientRect().height,r=()=>{document.body.offsetHeight,t.style.maxHeight=`${n}px`,t.style.height=`${Math.max(B,n)}px`};V?(V(),V=null,r()):V=r}}function oe(){let t=z.value;if(t){t.style.maxHeight=``,t.style.height=``;let{paneWrapperStyle:n}=e;if(typeof n==`string`)t.style.cssText=n;else if(n){let{maxHeight:e,height:r}=n;e!==void 0&&(t.style.maxHeight=e),r!==void 0&&(t.style.height=r)}}}let ce={value:[]},W=T(`next`);function K(e){let t=A.value,n=`next`;for(let r of ce.value){if(r===t)break;if(r===e){n=`prev`;break}}W.value=n,pe(e)}function pe(t){let{onActiveNameChange:n,onUpdateValue:r,"onUpdate:value":i}=e;n&&G(n,t),r&&G(r,t),i&&G(i,t),k.value=t}function me(t){let{onClose:n}=e;n&&G(n,t)}let q=!0;function he(){let{value:e}=m;if(!e)return;q||(q=!1);let t=`transition-disabled`;e.classList.add(t),I(),e.classList.remove(t)}let J=T(null);function ge({transitionDisabled:e}){let t=f.value;if(!t)return;e&&t.classList.add(`transition-disabled`);let n=N();n&&J.value&&(J.value.style.width=`${n.offsetWidth}px`,J.value.style.height=`${n.offsetHeight}px`,J.value.style.transform=`translateX(${n.offsetLeft-se(getComputedStyle(t).paddingLeft)}px)`,e&&J.value.offsetWidth),e&&t.classList.remove(`transition-disabled`)}i([A],()=>{e.type===`segment`&&C(()=>{ge({transitionDisabled:!1})})}),p(()=>{e.type===`segment`&&ge({transitionDisabled:!0})});let _e=0;function ve(t){var n,r;if(t.contentRect.width===0&&t.contentRect.height===0||_e===t.contentRect.width)return;_e=t.contentRect.width;let{type:i}=e;if((i===`line`||i===`bar`)&&(q||(n=e.justifyContent)!=null&&n.startsWith(`space`))&&he(),i!==`segment`){let{placement:t}=e;xe((t===`top`||t===`bottom`?(r=y.value)==null?void 0:r.$el:b.value)||null)}}let Y=rt(ve,64);i([()=>e.justifyContent,()=>e.size],()=>{C(()=>{let{type:t}=e;(t===`line`||t===`bar`)&&he()})});let X=T(!1);function Z(t){var n;let{target:r,contentRect:{width:i,height:a}}=t,o=r.parentElement.parentElement.offsetWidth,s=r.parentElement.parentElement.offsetHeight,{placement:c}=e;if(!X.value)c===`top`||c===`bottom`?o<i&&(X.value=!0):s<a&&(X.value=!0);else{let{value:e}=v;if(!e)return;c===`top`||c===`bottom`?o-i>e.$el.offsetWidth&&(X.value=!1):s-a>e.$el.offsetHeight&&(X.value=!1)}xe(((n=y.value)==null?void 0:n.$el)||null)}let ye=rt(Z,64);function be(){let{onAdd:t}=e;t&&t(),C(()=>{let e=N(),{value:t}=y;!e||!t||t.scrollTo({left:e.offsetLeft,top:0,behavior:`smooth`})})}function xe(t){if(!t)return;let{placement:n}=e;if(n===`top`||n===`bottom`){let{scrollLeft:e,scrollWidth:n,offsetWidth:r}=t;x.value=e<=0,S.value=e+r>=n}else{let{scrollTop:e,scrollHeight:n,offsetHeight:r}=t;x.value=e<=0,S.value=e+r>=n}}let Q=rt(e=>{xe(e.target)},64);g(Qe,{triggerRef:E(e,`trigger`),tabStyleRef:E(e,`tabStyle`),tabClassRef:E(e,`tabClass`),addTabStyleRef:E(e,`addTabStyle`),addTabClassRef:E(e,`addTabClass`),paneClassRef:E(e,`paneClass`),paneStyleRef:E(e,`paneStyle`),mergedClsPrefixRef:s,typeRef:E(e,`type`),closableRef:E(e,`closable`),valueRef:A,tabChangeIdRef:j,onBeforeLeaveRef:E(e,`onBeforeLeave`),activateTab:K,handleClose:me,handleAdd:be}),ie(()=>{I(),L()}),c(()=>{let{value:e}=_;if(!e)return;let{value:t}=s,n=`${t}-tabs-nav-scroll-wrapper--shadow-start`,r=`${t}-tabs-nav-scroll-wrapper--shadow-end`;x.value?e.classList.remove(n):e.classList.add(n),S.value?e.classList.remove(r):e.classList.add(r)});let Se={syncBarPosition:()=>{I()}},Ce=()=>{ge({transitionDisabled:!0})},we=h(()=>{let{value:t}=D,{type:n}=e,r=`${t}${{card:`Card`,bar:`Bar`,line:`Line`,segment:`Segment`}[n]}`,{self:{barColor:i,closeIconColor:a,closeIconColorHover:o,closeIconColorPressed:s,tabColor:c,tabBorderColor:l,paneTextColor:u,tabFontWeight:f,tabBorderRadius:p,tabFontWeightActive:m,colorSegment:h,fontWeightStrong:g,tabColorSegment:_,closeSize:v,closeIconSize:y,closeColorHover:b,closeColorPressed:x,closeBorderRadius:S,[R(`panePadding`,t)]:C,[R(`tabPadding`,r)]:w,[R(`tabPaddingVertical`,r)]:T,[R(`tabGap`,r)]:E,[R(`tabGap`,`${r}Vertical`)]:O,[R(`tabTextColor`,n)]:k,[R(`tabTextColorActive`,n)]:A,[R(`tabTextColorHover`,n)]:ee,[R(`tabTextColorDisabled`,n)]:j,[R(`tabFontSize`,t)]:M},common:{cubicBezierEaseInOut:N}}=d.value;return{"--n-bezier":N,"--n-color-segment":h,"--n-bar-color":i,"--n-tab-font-size":M,"--n-tab-text-color":k,"--n-tab-text-color-active":A,"--n-tab-text-color-disabled":j,"--n-tab-text-color-hover":ee,"--n-pane-text-color":u,"--n-tab-border-color":l,"--n-tab-border-radius":p,"--n-close-size":v,"--n-close-icon-size":y,"--n-close-color-hover":b,"--n-close-color-pressed":x,"--n-close-border-radius":S,"--n-close-icon-color":a,"--n-close-icon-color-hover":o,"--n-close-icon-color-pressed":s,"--n-tab-color":c,"--n-tab-font-weight":f,"--n-tab-font-weight-active":m,"--n-tab-padding":w,"--n-tab-padding-vertical":T,"--n-tab-gap":E,"--n-tab-gap-vertical":O,"--n-pane-padding-left":U(C,`left`),"--n-pane-padding-right":U(C,`right`),"--n-pane-padding-top":U(C,`top`),"--n-pane-padding-bottom":U(C,`bottom`),"--n-font-weight-strong":g,"--n-tab-color-segment":_}}),$=l?le(`tabs`,h(()=>`${D.value[0]}${e.type[0]}`),we,e):void 0;return Object.assign({mergedClsPrefix:s,mergedValue:A,renderedNames:new Set,segmentCapsuleElRef:J,tabsPaneWrapperRef:z,tabsElRef:f,barElRef:m,addTabInstRef:v,xScrollInstRef:y,scrollWrapperElRef:_,addTabFixed:X,tabWrapperStyle:M,handleNavResize:Y,mergedSize:D,handleScroll:Q,handleTabsResize:ye,cssVars:l?void 0:we,themeClass:$==null?void 0:$.themeClass,animationDirection:W,renderNameListRef:ce,yScrollElRef:b,handleSegmentResize:Ce,onAnimationBeforeLeave:H,onAnimationEnter:ae,onAnimationAfterEnter:oe,onRender:$==null?void 0:$.onRender},Se)},render(){let{mergedClsPrefix:e,type:n,placement:r,addTabFixed:i,addable:a,mergedSize:o,renderNameListRef:s,onRender:c,paneWrapperClass:l,paneWrapperStyle:u,$slots:{default:d,prefix:f,suffix:p}}=this;c==null||c();let m=d?fe(d()).filter(e=>e.type.__TAB_PANE__===!0):[],h=d?fe(d()).filter(e=>e.type.__TAB__===!0):[],g=!h.length,_=n===`card`,v=n===`segment`,y=!_&&!v&&this.justifyContent;s.value=[];let b=()=>{let n=t(`div`,{style:this.tabWrapperStyle,class:`${e}-tabs-wrapper`},y?null:t(`div`,{class:`${e}-tabs-scroll-padding`,style:r===`top`||r===`bottom`?{width:`${this.tabsPadding}px`}:{height:`${this.tabsPadding}px`}}),g?m.map((e,n)=>(s.value.push(e.props.name),ct(t(tt,Object.assign({},e.props,{internalCreatedByPane:!0,internalLeftPadded:n!==0&&(!y||y===`center`||y===`start`||y===`end`)}),e.children?{default:e.children.tab}:void 0)))):h.map((e,t)=>(s.value.push(e.props.name),ct(t!==0&&!y?st(e):e))),!i&&a&&_?ot(a,(g?m.length:h.length)!==0):null,y?null:t(`div`,{class:`${e}-tabs-scroll-padding`,style:{width:`${this.tabsPadding}px`}}));return t(`div`,{ref:`tabsElRef`,class:`${e}-tabs-nav-scroll-content`},_&&a?t(H,{onResize:this.handleTabsResize},{default:()=>n}):n,_?t(`div`,{class:`${e}-tabs-pad`}):null,_?null:t(`div`,{ref:`barElRef`,class:`${e}-tabs-bar`}))},x=v?`top`:r;return t(`div`,{class:[`${e}-tabs`,this.themeClass,`${e}-tabs--${n}-type`,`${e}-tabs--${o}-size`,y&&`${e}-tabs--flex`,`${e}-tabs--${x}`],style:this.cssVars},t(`div`,{class:[`${e}-tabs-nav--${n}-type`,`${e}-tabs-nav--${x}`,`${e}-tabs-nav`]},W(f,n=>n&&t(`div`,{class:`${e}-tabs-nav__prefix`},n)),v?t(H,{onResize:this.handleSegmentResize},{default:()=>t(`div`,{class:`${e}-tabs-rail`,ref:`tabsElRef`},t(`div`,{class:`${e}-tabs-capsule`,ref:`segmentCapsuleElRef`},t(`div`,{class:`${e}-tabs-wrapper`},t(`div`,{class:`${e}-tabs-tab`}))),g?m.map((e,n)=>(s.value.push(e.props.name),t(tt,Object.assign({},e.props,{internalCreatedByPane:!0,internalLeftPadded:n!==0}),e.children?{default:e.children.tab}:void 0))):h.map((e,t)=>(s.value.push(e.props.name),t===0?e:st(e))))}):t(H,{onResize:this.handleNavResize},{default:()=>t(`div`,{class:`${e}-tabs-nav-scroll-wrapper`,ref:`scrollWrapperElRef`},[`top`,`bottom`].includes(x)?t(Pe,{ref:`xScrollInstRef`,onScroll:this.handleScroll},{default:b}):t(`div`,{class:`${e}-tabs-nav-y-scroll`,onScroll:this.handleScroll,ref:`yScrollElRef`},b()))}),i&&a&&_?ot(a,!0):null,W(p,n=>n&&t(`div`,{class:`${e}-tabs-nav__suffix`},n))),g&&(this.animated&&(x===`top`||x===`bottom`)?t(`div`,{ref:`tabsPaneWrapperRef`,style:u,class:[`${e}-tabs-pane-wrapper`,l]},at(m,this.mergedValue,this.renderedNames,this.onAnimationBeforeLeave,this.onAnimationEnter,this.onAnimationAfterEnter,this.animationDirection)):at(m,this.mergedValue,this.renderedNames)))}});function at(e,n,r,i,a,o,s){let c=[];return e.forEach(e=>{let{name:t,displayDirective:i,"display-directive":a}=e.props,o=e=>i===e||a===e,s=n===t;if(e.key!==void 0&&(e.key=t),s||o(`show`)||o(`show:lazy`)&&r.has(t)){r.has(t)||r.add(t);let n=!o(`if`);c.push(n?l(e,[[O,s]]):e)}}),s?t(k,{name:`${s}-transition`,onBeforeLeave:i,onEnter:a,onAfterEnter:o},{default:()=>c}):c}function ot(e,n){return t(tt,{ref:`addTabInstRef`,key:`__addable`,name:`__addable`,internalCreatedByPane:!0,internalAddable:!0,internalLeftPadded:n,disabled:typeof e==`object`&&e.disabled})}function st(e){let t=_(e);return t.props?t.props.internalLeftPadded=!0:t.props={internalLeftPadded:!0},t}function ct(e){return Array.isArray(e.dynamicProps)?e.dynamicProps.includes(`internalLeftPadded`)||e.dynamicProps.push(`internalLeftPadded`):e.dynamicProps=[`internalLeftPadded`],e}var lt={class:`mb-3`},ut=v({__name:`RiskDetailDrawer`,props:{open:{type:Boolean},riskId:{},riskName:{}},emits:[`update:open`,`refreshed`],setup(e,{emit:t}){let a=e,c=t,l=ye(),p=T(null),m=T(!1),g=T([]),_=T([]),v=T([]),C=T(0),E=T(!1),O={一级:`danger`,二级:`warning`,三级:`info`,四级:`success`},k={正常:`success`,已处置:`info`,监控中:`warning`};function ee(e){if(!e)return`-`;let t=e/1024;return t<1024?`${t.toFixed(1)} KB`:`${(t/1024).toFixed(2)} MB`}function j(e){return e==null||e===``?`-`:String(e)}function M(e){return N.apply(this,arguments)}function N(){return N=A(function*(e){m.value=!0;try{var t;let[n,r,i,a]=yield Promise.all([Me(e),Oe(e),ke(e),Ee(e)]);p.value=n,g.value=r||[],_.value=i||[],v.value=a.list||[],C.value=(t=a.total)==null?0:t}catch(e){}finally{m.value=!1}}),N.apply(this,arguments)}i(()=>a.open,e=>{e&&a.riskId&&(p.value=null,g.value=[],_.value=[],v.value=[],M(a.riskId))});function te({file:e}){var t;let n=(t=e==null?void 0:e.file)==null?e:t;!n||!(n instanceof File)||!a.riskId||De(a.riskId,n).then(()=>{l.success(`上传成功`),M(a.riskId)}).catch(()=>{})}function P(e){a.riskId&&Te(a.riskId,e).then(()=>{l.success(`删除成功`),M(a.riskId)}).catch(()=>{})}function F(){a.riskId&&Ae(a.riskId,{}).then(()=>{l.success(`已从该风险点生成隐患`),M(a.riskId),c(`refreshed`)}).catch(()=>{})}function I(){E.value=!0}function L(){a.riskId&&M(a.riskId),c(`refreshed`)}function R(){c(`update:open`,!1)}let z=h(()=>a.riskName?`风险点详情 - ${a.riskName}`:`风险点详情`);return(e,t)=>{let i=s(`NThing`);return y(),w(o(be),{show:a.open,width:760,placement:`right`,"onUpdate:show":R},{default:x(()=>{var e,s;return[n(o(xe),{title:z.value,"native-scrollbar":!0},{footer:x(()=>[n(o(Q),{justify:`end`},{default:x(()=>[n(o(Z),{type:`primary`,onClick:I},{default:x(()=>[...t[6]||(t[6]=[r(`评估`,-1)])]),_:1}),n(o(Z),{onClick:R},{default:x(()=>[...t[7]||(t[7]=[r(`关闭`,-1)])]),_:1})]),_:1})]),default:x(()=>[n(o(me),{show:m.value},{default:x(()=>[n(o(it),{type:`line`,animated:``},{default:x(()=>[n(o(et),{name:`basic`,tab:`基本信息`},{default:x(()=>[p.value?(y(),w(o(pe),{key:0,"label-placement":`left`,column:1,bordered:``,size:`small`},{default:x(()=>[n(o(K),{label:`风险点编号`},{default:x(()=>[r(S(j(p.value.sourceId)),1)]),_:1}),n(o(K),{label:`风险点名称`},{default:x(()=>[r(S(j(p.value.name)),1)]),_:1}),n(o(K),{label:`等级`},{default:x(()=>[n(o(X),{type:O[p.value.level]||`neutral`},{default:x(()=>[r(S(p.value.level),1)]),_:1},8,[`type`])]),_:1}),n(o(K),{label:`类型`},{default:x(()=>[r(S(j(p.value.type)),1)]),_:1}),n(o(K),{label:`类别`},{default:x(()=>[r(S(j(p.value.category)),1)]),_:1}),n(o(K),{label:`区域`},{default:x(()=>[r(S(j(p.value.area)),1)]),_:1}),n(o(K),{label:`位置`},{default:x(()=>[r(S(j(p.value.location)),1)]),_:1}),n(o(K),{label:`责任对象`},{default:x(()=>[r(S(j(p.value.accidentType)),1)]),_:1}),n(o(K),{label:`状态`},{default:x(()=>[n(o(X),{type:k[p.value.status]||`neutral`},{default:x(()=>[r(S(p.value.status),1)]),_:1},8,[`type`])]),_:1}),n(o(K),{label:`评估日期`},{default:x(()=>[r(S(j(p.value.assessmentDate)),1)]),_:1}),n(o(K),{label:`复评周期(月)`},{default:x(()=>[r(S(j(p.value.reviewCycle)),1)]),_:1}),n(o(K),{label:`评估方法`},{default:x(()=>[r(S(j(p.value.assessmentMethod)),1)]),_:1}),n(o(K),{label:`评估得分`},{default:x(()=>[r(S(j(p.value.assessmentScore)),1)]),_:1}),n(o(K),{label:`管控措施`},{default:x(()=>[r(S(j(p.value.measures)),1)]),_:1}),n(o(K),{label:`应急措施`},{default:x(()=>[r(S(j(p.value.emergency)),1)]),_:1})]),_:1})):(y(),w(o(Y),{key:1,description:`加载中或数据缺失`}))]),_:1}),n(o(et),{name:`attachment`,tab:`附件`},{default:x(()=>[u(`div`,lt,[n(o(_e),{"default-upload":!1,"show-file-list":!1,onChange:te},{default:x(()=>[n(o(ge),null,{default:x(()=>[...t[1]||(t[1]=[u(`div`,{class:`py-3 text-center text-sm`},`点击或拖拽文件上传附件`,-1)])]),_:1})]),_:1})]),g.value.length?(y(),w(o(Se),{key:0,bordered:``},{default:x(()=>[(y(!0),d(b,null,f(g.value,e=>(y(),w(o(Ce),{key:e.id},{suffix:x(()=>[n(o(Q),null,{default:x(()=>[n(o(Z),{text:``,tag:`a`,href:e.fileUrl,target:`_blank`,type:`primary`},{default:x(()=>[...t[2]||(t[2]=[r(` 下载 `,-1)])]),_:1},8,[`href`]),n(o(we),{onPositiveClick:t=>P(e.id)},{trigger:x(()=>[n(o(Z),{text:``,type:`error`},{default:x(()=>[...t[3]||(t[3]=[r(`删除`,-1)])]),_:1})]),default:x(()=>[t[4]||(t[4]=r(` 确定删除该附件吗？ `,-1))]),_:1},8,[`onPositiveClick`])]),_:2},1024)]),default:x(()=>[n(i,{title:e.originalName},{description:x(()=>[n(o(Q),{size:`small`},{default:x(()=>[n(o(X),{size:`small`},{default:x(()=>[r(S(e.fileType||`file`),1)]),_:2},1024),n(o($),{depth:`3`},{default:x(()=>[r(S(ee(e.fileSize)),1)]),_:2},1024),n(o($),{depth:`3`},{default:x(()=>[r(`v`+S(e.version),1)]),_:2},1024),n(o($),{depth:`3`},{default:x(()=>[r(S(e.uploadedBy),1)]),_:2},1024)]),_:2},1024)]),_:2},1032,[`title`])]),_:2},1024))),128))]),_:1})):(y(),w(o(Y),{key:1,description:`暂无附件`}))]),_:1}),n(o(et),{name:`version`,tab:`版本履历`},{default:x(()=>[_.value.length?(y(),w(o(Se),{key:0,bordered:``},{default:x(()=>[(y(!0),d(b,null,f(_.value,e=>(y(),w(o(Ce),{key:e.id},{default:x(()=>[n(i,{title:`v${e.version} · ${e.changeType}`},{description:x(()=>[n(o(Q),{size:`small`},{default:x(()=>[n(o($),{depth:`3`},{default:x(()=>[r(S(e.changeSummary||`无摘要`),1)]),_:2},1024),n(o($),{depth:`3`},{default:x(()=>[r(S(e.changedBy),1)]),_:2},1024),n(o($),{depth:`3`},{default:x(()=>[r(S(e.createdAt),1)]),_:2},1024)]),_:2},1024)]),_:2},1032,[`title`])]),_:2},1024))),128))]),_:1})):(y(),w(o(Y),{key:1,description:`暂无版本履历`}))]),_:1}),n(o(et),{name:`hazard`,tab:`关联隐患 (${C.value})`},{default:x(()=>[n(o(Q),{class:`mb-3`},{default:x(()=>[n(o(Z),{type:`primary`,secondary:``,onClick:F},{default:x(()=>[...t[5]||(t[5]=[r(` 从该风险点生成隐患 `,-1)])]),_:1})]),_:1}),v.value.length?(y(),w(o(Se),{key:0,bordered:``},{default:x(()=>[(y(!0),d(b,null,f(v.value,e=>(y(),w(o(Ce),{key:e.id},{default:x(()=>{var t;return[n(i,{title:`#${(t=e.no)==null?e.id:t} ${e.description}`},{description:x(()=>[n(o(Q),{size:`small`},{default:x(()=>[n(o(X),{size:`small`,type:e.isResolved===`是`?`success`:`warning`},{default:x(()=>[r(S(e.isResolved===`是`?`已整改`:`未整改`),1)]),_:2},1032,[`type`]),n(o($),{depth:`3`},{default:x(()=>[r(`检查人：`+S(e.checker),1)]),_:2},1024),n(o($),{depth:`3`},{default:x(()=>[r(`整改人：`+S(e.fixer),1)]),_:2},1024),n(o($),{depth:`3`},{default:x(()=>[r(S(e.checkDate),1)]),_:2},1024),e.riskLevel?(y(),w(o(X),{key:0,size:`small`},{default:x(()=>[r(S(e.riskLevel),1)]),_:2},1024)):D(``,!0)]),_:2},1024)]),_:2},1032,[`title`])]}),_:2},1024))),128))]),_:1})):(y(),w(o(Y),{key:1,description:`暂无关联隐患`}))]),_:1},8,[`tab`])]),_:1})]),_:1},8,[`show`])]),_:1},8,[`title`]),n(je,{open:E.value,"onUpdate:open":t[0]||(t[0]=e=>E.value=e),"risk-id":a.riskId,"risk-name":a.riskName,"current-method":(e=p.value)==null?void 0:e.assessmentMethod,"current-score":(s=p.value)==null?void 0:s.assessmentScore,onSuccess:L},null,8,[`open`,`risk-id`,`risk-name`,`current-method`,`current-score`])]}),_:1},8,[`show`])}}}),dt=e({default:()=>ft}),ft=ut;export{dt as n,ft as t};