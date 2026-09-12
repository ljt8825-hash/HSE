import{B as e,J as t,g as n,gt as r,k as i,wn as a}from"./runtime-core.esm-bundler-Blp3D1W4.js";import{B as o,F as s,G as c,L as l,R as u,V as d,W as f,j as p,n as m}from"./use-theme-BPxAT0OQ.js";import{t as h}from"./use-rtl-BtnaqIOl.js";import{i as g,n as _}from"./light-DZKN5sjf.js";import{r as v}from"./light-BmqVi9Hd.js";var y=l([u(`list`,`
 --n-merged-border-color: var(--n-border-color);
 --n-merged-color: var(--n-color);
 --n-merged-color-hover: var(--n-color-hover);
 margin: 0;
 font-size: var(--n-font-size);
 transition:
 background-color .3s var(--n-bezier),
 color .3s var(--n-bezier),
 border-color .3s var(--n-bezier);
 padding: 0;
 list-style-type: none;
 color: var(--n-text-color);
 background-color: var(--n-merged-color);
 `,[d(`show-divider`,[u(`list-item`,[l(`&:not(:last-child)`,[o(`divider`,`
 background-color: var(--n-merged-border-color);
 `)])])]),d(`clickable`,[u(`list-item`,`
 cursor: pointer;
 `)]),d(`bordered`,`
 border: 1px solid var(--n-merged-border-color);
 border-radius: var(--n-border-radius);
 `),d(`hoverable`,[u(`list-item`,`
 border-radius: var(--n-border-radius);
 `,[l(`&:hover`,`
 background-color: var(--n-merged-color-hover);
 `,[o(`divider`,`
 background-color: transparent;
 `)])])]),d(`bordered, hoverable`,[u(`list-item`,`
 padding: 12px 20px;
 `),o(`header, footer`,`
 padding: 12px 20px;
 `)]),o(`header, footer`,`
 padding: 12px 0;
 box-sizing: border-box;
 transition: border-color .3s var(--n-bezier);
 `,[l(`&:not(:last-child)`,`
 border-bottom: 1px solid var(--n-merged-border-color);
 `)]),u(`list-item`,`
 position: relative;
 padding: 12px 0; 
 box-sizing: border-box;
 display: flex;
 flex-wrap: nowrap;
 align-items: center;
 transition:
 background-color .3s var(--n-bezier),
 border-color .3s var(--n-bezier);
 `,[o(`prefix`,`
 margin-right: 20px;
 flex: 0;
 `),o(`suffix`,`
 margin-left: 20px;
 flex: 0;
 `),o(`main`,`
 flex: 1;
 `),o(`divider`,`
 height: 1px;
 position: absolute;
 bottom: 0;
 left: 0;
 right: 0;
 background-color: transparent;
 transition: background-color .3s var(--n-bezier);
 pointer-events: none;
 `)])]),f(u(`list`,`
 --n-merged-color-hover: var(--n-color-hover-modal);
 --n-merged-color: var(--n-color-modal);
 --n-merged-border-color: var(--n-border-color-modal);
 `)),c(u(`list`,`
 --n-merged-color-hover: var(--n-color-hover-popover);
 --n-merged-color: var(--n-color-popover);
 --n-merged-border-color: var(--n-border-color-popover);
 `))]),b=Object.assign(Object.assign({},m.props),{size:{type:String,default:`medium`},bordered:Boolean,clickable:Boolean,hoverable:Boolean,showDivider:{type:Boolean,default:!0}}),x=s(`n-list`),S=i({name:`List`,props:b,slots:Object,setup(e){let{mergedClsPrefixRef:t,inlineThemeDisabled:i,mergedRtlRef:o}=p(e),s=h(`List`,o,t),c=m(`List`,`-list`,y,v,e,t);r(x,{showDividerRef:a(e,`showDivider`),mergedClsPrefixRef:t});let l=n(()=>{let{common:{cubicBezierEaseInOut:e},self:{fontSize:t,textColor:n,color:r,colorModal:i,colorPopover:a,borderColor:o,borderColorModal:s,borderColorPopover:l,borderRadius:u,colorHover:d,colorHoverModal:f,colorHoverPopover:p}}=c.value;return{"--n-font-size":t,"--n-bezier":e,"--n-text-color":n,"--n-color":r,"--n-border-radius":u,"--n-border-color":o,"--n-border-color-modal":s,"--n-border-color-popover":l,"--n-color-modal":i,"--n-color-popover":a,"--n-color-hover":d,"--n-color-hover-modal":f,"--n-color-hover-popover":p}}),u=i?_(`list`,void 0,l,e):void 0;return{mergedClsPrefix:t,rtlEnabled:s,cssVars:i?void 0:l,themeClass:u==null?void 0:u.themeClass,onRender:u==null?void 0:u.onRender}},render(){var t;let{$slots:n,mergedClsPrefix:r,onRender:i}=this;return i==null||i(),e(`ul`,{class:[`${r}-list`,this.rtlEnabled&&`${r}-list--rtl`,this.bordered&&`${r}-list--bordered`,this.showDivider&&`${r}-list--show-divider`,this.hoverable&&`${r}-list--hoverable`,this.clickable&&`${r}-list--clickable`,this.themeClass],style:this.cssVars},n.header?e(`div`,{class:`${r}-list__header`},n.header()):null,(t=n.default)==null?void 0:t.call(n),n.footer?e(`div`,{class:`${r}-list__footer`},n.footer()):null)}}),C=i({name:`ListItem`,slots:Object,setup(){let e=t(x,null);return e||g(`list-item`,"`n-list-item` must be placed in `n-list`."),{showDivider:e.showDividerRef,mergedClsPrefix:e.mergedClsPrefixRef}},render(){let{$slots:t,mergedClsPrefix:n}=this;return e(`li`,{class:`${n}-list-item`},t.prefix?e(`div`,{class:`${n}-list-item__prefix`},t.prefix()):null,t.default?e(`div`,{class:`${n}-list-item__main`},t):null,t.suffix?e(`div`,{class:`${n}-list-item__suffix`},t.suffix()):null,this.showDivider&&e(`div`,{class:`${n}-list-item__divider`}))}});export{S as n,C as t};