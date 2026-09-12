import{B as e,et as t,g as n,k as r,vn as i}from"./runtime-core.esm-bundler-Blp3D1W4.js";import{B as a,L as o,R as s,U as c,V as l,j as u,n as d}from"./use-theme-BPxAT0OQ.js";import{t as f}from"./use-rtl-BtnaqIOl.js";import{s as p}from"./Scrollbar-CWE-8E6x.js";import{r as m}from"./css-DEmdllcC.js";import{n as h}from"./light-DZKN5sjf.js";import{s as g}from"./light-BmqVi9Hd.js";import{a as _,r as v}from"./resolve-slot-DbAlC7Z4.js";import{t as y}from"./Close-BaKf5mos.js";import{i as b,n as x,r as S,t as C}from"./Warning-Blhk-Wp8.js";import{t as w}from"./FadeInExpandTransition-BFkHtQH1.js";import{t as T}from"./fade-in-height-expand.cssr-8v5SwGLD.js";var E=s(`alert`,`
 line-height: var(--n-line-height);
 border-radius: var(--n-border-radius);
 position: relative;
 transition: background-color .3s var(--n-bezier);
 background-color: var(--n-color);
 text-align: start;
 word-break: break-word;
`,[a(`border`,`
 border-radius: inherit;
 position: absolute;
 left: 0;
 right: 0;
 top: 0;
 bottom: 0;
 transition: border-color .3s var(--n-bezier);
 border: var(--n-border);
 pointer-events: none;
 `),l(`closable`,[s(`alert-body`,[a(`title`,`
 padding-right: 24px;
 `)])]),a(`icon`,{color:`var(--n-icon-color)`}),s(`alert-body`,{padding:`var(--n-padding)`},[a(`title`,{color:`var(--n-title-text-color)`}),a(`content`,{color:`var(--n-content-text-color)`})]),T({originalTransition:`transform .3s var(--n-bezier)`,enterToProps:{transform:`scale(1)`},leaveToProps:{transform:`scale(0.9)`}}),a(`icon`,`
 position: absolute;
 left: 0;
 top: 0;
 align-items: center;
 justify-content: center;
 display: flex;
 width: var(--n-icon-size);
 height: var(--n-icon-size);
 font-size: var(--n-icon-size);
 margin: var(--n-icon-margin);
 `),a(`close`,`
 transition:
 color .3s var(--n-bezier),
 background-color .3s var(--n-bezier);
 position: absolute;
 right: 0;
 top: 0;
 margin: var(--n-close-margin);
 `),l(`show-icon`,[s(`alert-body`,{paddingLeft:`calc(var(--n-icon-margin-left) + var(--n-icon-size) + var(--n-icon-margin-right))`})]),l(`right-adjust`,[s(`alert-body`,{paddingRight:`calc(var(--n-close-size) + var(--n-padding) + 2px)`})]),s(`alert-body`,`
 border-radius: var(--n-border-radius);
 transition: border-color .3s var(--n-bezier);
 `,[a(`title`,`
 transition: color .3s var(--n-bezier);
 font-size: 16px;
 line-height: 19px;
 font-weight: var(--n-title-font-weight);
 `,[o(`& +`,[a(`content`,{marginTop:`9px`})])]),a(`content`,{transition:`color .3s var(--n-bezier)`,fontSize:`var(--n-font-size)`})]),a(`icon`,{transition:`color .3s var(--n-bezier)`})]),D=r({name:`Alert`,inheritAttrs:!1,props:Object.assign(Object.assign({},d.props),{title:String,showIcon:{type:Boolean,default:!0},type:{type:String,default:`default`},bordered:{type:Boolean,default:!0},closable:Boolean,onClose:Function,onAfterLeave:Function,onAfterHide:Function}),slots:Object,setup(e){let{mergedClsPrefixRef:t,mergedBorderedRef:r,inlineThemeDisabled:a,mergedRtlRef:o}=u(e),s=d(`Alert`,`-alert`,E,g,e,t),l=f(`Alert`,o,t),p=n(()=>{let{common:{cubicBezierEaseInOut:t},self:n}=s.value,{fontSize:r,borderRadius:i,titleFontWeight:a,lineHeight:o,iconSize:l,iconMargin:u,iconMarginRtl:d,closeIconSize:f,closeBorderRadius:p,closeSize:h,closeMargin:g,closeMarginRtl:_,padding:v}=n,{type:y}=e,{left:b,right:x}=m(u);return{"--n-bezier":t,"--n-color":n[c(`color`,y)],"--n-close-icon-size":f,"--n-close-border-radius":p,"--n-close-color-hover":n[c(`closeColorHover`,y)],"--n-close-color-pressed":n[c(`closeColorPressed`,y)],"--n-close-icon-color":n[c(`closeIconColor`,y)],"--n-close-icon-color-hover":n[c(`closeIconColorHover`,y)],"--n-close-icon-color-pressed":n[c(`closeIconColorPressed`,y)],"--n-icon-color":n[c(`iconColor`,y)],"--n-border":n[c(`border`,y)],"--n-title-text-color":n[c(`titleTextColor`,y)],"--n-content-text-color":n[c(`contentTextColor`,y)],"--n-line-height":o,"--n-border-radius":i,"--n-font-size":r,"--n-title-font-weight":a,"--n-icon-size":l,"--n-icon-margin":u,"--n-icon-margin-rtl":d,"--n-close-size":h,"--n-close-margin":g,"--n-close-margin-rtl":_,"--n-padding":v,"--n-icon-margin-left":b,"--n-icon-margin-right":x}}),_=a?h(`alert`,n(()=>e.type[0]),p,e):void 0,v=i(!0),y=()=>{let{onAfterLeave:t,onAfterHide:n}=e;t&&t(),n&&n()};return{rtlEnabled:l,mergedClsPrefix:t,mergedBordered:r,visible:v,handleCloseClick:()=>{var t;Promise.resolve((t=e.onClose)==null?void 0:t.call(e)).then(e=>{e!==!1&&(v.value=!1)})},handleAfterLeave:()=>{y()},mergedTheme:s,cssVars:a?void 0:p,themeClass:_==null?void 0:_.themeClass,onRender:_==null?void 0:_.onRender}},render(){var n;return(n=this.onRender)==null||n.call(this),e(w,{onAfterLeave:this.handleAfterLeave},{default:()=>{let{mergedClsPrefix:n,$slots:r}=this,i={class:[`${n}-alert`,this.themeClass,this.closable&&`${n}-alert--closable`,this.showIcon&&`${n}-alert--show-icon`,!this.title&&this.closable&&`${n}-alert--right-adjust`,this.rtlEnabled&&`${n}-alert--rtl`],style:this.cssVars,role:`alert`};return this.visible?e(`div`,Object.assign({},t(this.$attrs,i)),this.closable&&e(y,{clsPrefix:n,class:`${n}-alert__close`,onClick:this.handleCloseClick}),this.bordered&&e(`div`,{class:`${n}-alert__border`}),this.showIcon&&e(`div`,{class:`${n}-alert__icon`,"aria-hidden":`true`},v(r.icon,()=>[e(p,{clsPrefix:n},{default:()=>{switch(this.type){case`success`:return e(x,null);case`info`:return e(S,null);case`warning`:return e(C,null);case`error`:return e(b,null);default:return null}}})])),e(`div`,{class:[`${n}-alert-body`,this.mergedBordered&&`${n}-alert-body--bordered`]},_(r.header,t=>{let r=t||this.title;return r?e(`div`,{class:`${n}-alert-body__title`},r):null}),r.default&&e(`div`,{class:`${n}-alert-body__content`},r))):null}})}});export{D as t};