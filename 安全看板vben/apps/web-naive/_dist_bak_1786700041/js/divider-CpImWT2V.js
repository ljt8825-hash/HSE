import{B as e,g as t,k as n,o as r}from"./runtime-core.esm-bundler-Blp3D1W4.js";import{B as i,H as a,R as o,V as s,j as c,n as l}from"./use-theme-BPxAT0OQ.js";import{n as u}from"./light-DZKN5sjf.js";import{t as d}from"./light-BsqmyEhm.js";var f=o(`divider`,`
 position: relative;
 display: flex;
 width: 100%;
 box-sizing: border-box;
 font-size: 16px;
 color: var(--n-text-color);
 transition:
 color .3s var(--n-bezier),
 background-color .3s var(--n-bezier);
`,[a(`vertical`,`
 margin-top: 24px;
 margin-bottom: 24px;
 `,[a(`no-title`,`
 display: flex;
 align-items: center;
 `)]),i(`title`,`
 display: flex;
 align-items: center;
 margin-left: 12px;
 margin-right: 12px;
 white-space: nowrap;
 font-weight: var(--n-font-weight);
 `),s(`title-position-left`,[i(`line`,[s(`left`,{width:`28px`})])]),s(`title-position-right`,[i(`line`,[s(`right`,{width:`28px`})])]),s(`dashed`,[i(`line`,`
 background-color: #0000;
 height: 0px;
 width: 100%;
 border-style: dashed;
 border-width: 1px 0 0;
 `)]),s(`vertical`,`
 display: inline-block;
 height: 1em;
 margin: 0 8px;
 vertical-align: middle;
 width: 1px;
 `),i(`line`,`
 border: none;
 transition: background-color .3s var(--n-bezier), border-color .3s var(--n-bezier);
 height: 1px;
 width: 100%;
 margin: 0;
 `),a(`dashed`,[i(`line`,{backgroundColor:`var(--n-color)`})]),s(`dashed`,[i(`line`,{borderColor:`var(--n-color)`})]),s(`vertical`,{backgroundColor:`var(--n-color)`})]),p=n({name:`Divider`,props:Object.assign(Object.assign({},l.props),{titlePlacement:{type:String,default:`center`},dashed:Boolean,vertical:Boolean}),setup(e){let{mergedClsPrefixRef:n,inlineThemeDisabled:r}=c(e),i=l(`Divider`,`-divider`,f,d,e,n),a=t(()=>{let{common:{cubicBezierEaseInOut:e},self:{color:t,textColor:n,fontWeight:r}}=i.value;return{"--n-bezier":e,"--n-color":t,"--n-text-color":n,"--n-font-weight":r}}),o=r?u(`divider`,void 0,a,e):void 0;return{mergedClsPrefix:n,cssVars:r?void 0:a,themeClass:o==null?void 0:o.themeClass,onRender:o==null?void 0:o.onRender}},render(){var t;let{$slots:n,titlePlacement:i,vertical:a,dashed:o,cssVars:s,mergedClsPrefix:c}=this;return(t=this.onRender)==null||t.call(this),e(`div`,{role:`separator`,class:[`${c}-divider`,this.themeClass,{[`${c}-divider--vertical`]:a,[`${c}-divider--no-title`]:!n.default,[`${c}-divider--dashed`]:o,[`${c}-divider--title-position-${i}`]:n.default&&i}],style:s},a?null:e(`div`,{class:`${c}-divider__line ${c}-divider__line--left`}),!a&&n.default?e(r,null,e(`div`,{class:`${c}-divider__title`},this.$slots),e(`div`,{class:`${c}-divider__line ${c}-divider__line--right`})):null)}});export{p as NDivider};