import{B as e,J as t,g as n,it as r,k as i,tt as a,vn as o,wn as s}from"./runtime-core.esm-bundler-Blp3D1W4.js";import{B as c,F as l,H as u,L as d,R as f,U as p,V as m,i as h,j as g,n as _}from"./use-theme-BPxAT0OQ.js";import{t as v}from"./use-rtl-BtnaqIOl.js";import{n as y,o as b,s as x,t as S}from"./light-DZKN5sjf.js";import{t as C}from"./use-memo-5BlGN31V.js";import{n as w,t as T}from"./icon-switch.cssr-DvNC2T5C.js";import{t as E}from"./is-browser-e-NGrvPW.js";import{t as D}from"./color-to-class-G4jmrDIg.js";import{o as O,r as k,s as A,t as j}from"./use-form-item-DMd-WY4m.js";import{n as M,t as N}from"./Loading-FRI83lZm.js";import{t as P}from"./FadeInExpandTransition-BFkHtQH1.js";import{t as F}from"./browser-B_EWS_Ix.js";var{cubicBezierEaseInOut:I}=h;function L({duration:e=`.2s`,delay:t=`.1s`}={}){return[d(`&.fade-in-width-expand-transition-leave-from, &.fade-in-width-expand-transition-enter-to`,{opacity:1}),d(`&.fade-in-width-expand-transition-leave-to, &.fade-in-width-expand-transition-enter-from`,`
 opacity: 0!important;
 margin-left: 0!important;
 margin-right: 0!important;
 `),d(`&.fade-in-width-expand-transition-leave-active`,`
 overflow: hidden;
 transition:
 opacity ${e} ${I},
 max-width ${e} ${I} ${t},
 margin-left ${e} ${I} ${t},
 margin-right ${e} ${I} ${t};
 `),d(`&.fade-in-width-expand-transition-enter-active`,`
 overflow: hidden;
 transition:
 opacity ${e} ${I} ${t},
 max-width ${e} ${I},
 margin-left ${e} ${I},
 margin-right ${e} ${I};
 `)]}var R=f(`base-wave`,`
 position: absolute;
 left: 0;
 right: 0;
 top: 0;
 bottom: 0;
 border-radius: inherit;
`),z=i({name:`BaseWave`,props:{clsPrefix:{type:String,required:!0}},setup(e){M(`-base-wave`,R,s(e,`clsPrefix`));let t=o(null),n=o(!1),i=null;return r(()=>{i!==null&&window.clearTimeout(i)}),{active:n,selfRef:t,play(){i!==null&&(window.clearTimeout(i),n.value=!1,i=null),a(()=>{var e;(e=t.value)==null||e.offsetHeight,n.value=!0,i=window.setTimeout(()=>{n.value=!1,i=null},1e3)})}}},render(){let{clsPrefix:t}=this;return e(`div`,{ref:`selfRef`,"aria-hidden":!0,class:[`${t}-base-wave`,this.active&&`${t}-base-wave--active`]})}});function B(e){return x(e,[255,255,255,.16])}function V(e){return x(e,[0,0,0,.12])}var H=l(`n-button-group`),U={paddingTiny:`0 6px`,paddingSmall:`0 10px`,paddingMedium:`0 14px`,paddingLarge:`0 18px`,paddingRoundTiny:`0 10px`,paddingRoundSmall:`0 14px`,paddingRoundMedium:`0 18px`,paddingRoundLarge:`0 22px`,iconMarginTiny:`6px`,iconMarginSmall:`6px`,iconMarginMedium:`6px`,iconMarginLarge:`6px`,iconSizeTiny:`14px`,iconSizeSmall:`18px`,iconSizeMedium:`18px`,iconSizeLarge:`20px`,rippleDuration:`.6s`};function W(e){let{heightTiny:t,heightSmall:n,heightMedium:r,heightLarge:i,borderRadius:a,fontSizeTiny:o,fontSizeSmall:s,fontSizeMedium:c,fontSizeLarge:l,opacityDisabled:u,textColor2:d,textColor3:f,primaryColorHover:p,primaryColorPressed:m,borderColor:h,primaryColor:g,baseColor:_,infoColor:v,infoColorHover:y,infoColorPressed:b,successColor:x,successColorHover:S,successColorPressed:C,warningColor:w,warningColorHover:T,warningColorPressed:E,errorColor:D,errorColorHover:O,errorColorPressed:k,fontWeight:A,buttonColor2:j,buttonColor2Hover:M,buttonColor2Pressed:N,fontWeightStrong:P}=e;return Object.assign(Object.assign({},U),{heightTiny:t,heightSmall:n,heightMedium:r,heightLarge:i,borderRadiusTiny:a,borderRadiusSmall:a,borderRadiusMedium:a,borderRadiusLarge:a,fontSizeTiny:o,fontSizeSmall:s,fontSizeMedium:c,fontSizeLarge:l,opacityDisabled:u,colorOpacitySecondary:`0.16`,colorOpacitySecondaryHover:`0.22`,colorOpacitySecondaryPressed:`0.28`,colorSecondary:j,colorSecondaryHover:M,colorSecondaryPressed:N,colorTertiary:j,colorTertiaryHover:M,colorTertiaryPressed:N,colorQuaternary:`#0000`,colorQuaternaryHover:M,colorQuaternaryPressed:N,color:`#0000`,colorHover:`#0000`,colorPressed:`#0000`,colorFocus:`#0000`,colorDisabled:`#0000`,textColor:d,textColorTertiary:f,textColorHover:p,textColorPressed:m,textColorFocus:p,textColorDisabled:d,textColorText:d,textColorTextHover:p,textColorTextPressed:m,textColorTextFocus:p,textColorTextDisabled:d,textColorGhost:d,textColorGhostHover:p,textColorGhostPressed:m,textColorGhostFocus:p,textColorGhostDisabled:d,border:`1px solid ${h}`,borderHover:`1px solid ${p}`,borderPressed:`1px solid ${m}`,borderFocus:`1px solid ${p}`,borderDisabled:`1px solid ${h}`,rippleColor:g,colorPrimary:g,colorHoverPrimary:p,colorPressedPrimary:m,colorFocusPrimary:p,colorDisabledPrimary:g,textColorPrimary:_,textColorHoverPrimary:_,textColorPressedPrimary:_,textColorFocusPrimary:_,textColorDisabledPrimary:_,textColorTextPrimary:g,textColorTextHoverPrimary:p,textColorTextPressedPrimary:m,textColorTextFocusPrimary:p,textColorTextDisabledPrimary:d,textColorGhostPrimary:g,textColorGhostHoverPrimary:p,textColorGhostPressedPrimary:m,textColorGhostFocusPrimary:p,textColorGhostDisabledPrimary:g,borderPrimary:`1px solid ${g}`,borderHoverPrimary:`1px solid ${p}`,borderPressedPrimary:`1px solid ${m}`,borderFocusPrimary:`1px solid ${p}`,borderDisabledPrimary:`1px solid ${g}`,rippleColorPrimary:g,colorInfo:v,colorHoverInfo:y,colorPressedInfo:b,colorFocusInfo:y,colorDisabledInfo:v,textColorInfo:_,textColorHoverInfo:_,textColorPressedInfo:_,textColorFocusInfo:_,textColorDisabledInfo:_,textColorTextInfo:v,textColorTextHoverInfo:y,textColorTextPressedInfo:b,textColorTextFocusInfo:y,textColorTextDisabledInfo:d,textColorGhostInfo:v,textColorGhostHoverInfo:y,textColorGhostPressedInfo:b,textColorGhostFocusInfo:y,textColorGhostDisabledInfo:v,borderInfo:`1px solid ${v}`,borderHoverInfo:`1px solid ${y}`,borderPressedInfo:`1px solid ${b}`,borderFocusInfo:`1px solid ${y}`,borderDisabledInfo:`1px solid ${v}`,rippleColorInfo:v,colorSuccess:x,colorHoverSuccess:S,colorPressedSuccess:C,colorFocusSuccess:S,colorDisabledSuccess:x,textColorSuccess:_,textColorHoverSuccess:_,textColorPressedSuccess:_,textColorFocusSuccess:_,textColorDisabledSuccess:_,textColorTextSuccess:x,textColorTextHoverSuccess:S,textColorTextPressedSuccess:C,textColorTextFocusSuccess:S,textColorTextDisabledSuccess:d,textColorGhostSuccess:x,textColorGhostHoverSuccess:S,textColorGhostPressedSuccess:C,textColorGhostFocusSuccess:S,textColorGhostDisabledSuccess:x,borderSuccess:`1px solid ${x}`,borderHoverSuccess:`1px solid ${S}`,borderPressedSuccess:`1px solid ${C}`,borderFocusSuccess:`1px solid ${S}`,borderDisabledSuccess:`1px solid ${x}`,rippleColorSuccess:x,colorWarning:w,colorHoverWarning:T,colorPressedWarning:E,colorFocusWarning:T,colorDisabledWarning:w,textColorWarning:_,textColorHoverWarning:_,textColorPressedWarning:_,textColorFocusWarning:_,textColorDisabledWarning:_,textColorTextWarning:w,textColorTextHoverWarning:T,textColorTextPressedWarning:E,textColorTextFocusWarning:T,textColorTextDisabledWarning:d,textColorGhostWarning:w,textColorGhostHoverWarning:T,textColorGhostPressedWarning:E,textColorGhostFocusWarning:T,textColorGhostDisabledWarning:w,borderWarning:`1px solid ${w}`,borderHoverWarning:`1px solid ${T}`,borderPressedWarning:`1px solid ${E}`,borderFocusWarning:`1px solid ${T}`,borderDisabledWarning:`1px solid ${w}`,rippleColorWarning:w,colorError:D,colorHoverError:O,colorPressedError:k,colorFocusError:O,colorDisabledError:D,textColorError:_,textColorHoverError:_,textColorPressedError:_,textColorFocusError:_,textColorDisabledError:_,textColorTextError:D,textColorTextHoverError:O,textColorTextPressedError:k,textColorTextFocusError:O,textColorTextDisabledError:d,textColorGhostError:D,textColorGhostHoverError:O,textColorGhostPressedError:k,textColorGhostFocusError:O,textColorGhostDisabledError:D,borderError:`1px solid ${D}`,borderHoverError:`1px solid ${O}`,borderPressedError:`1px solid ${k}`,borderFocusError:`1px solid ${O}`,borderDisabledError:`1px solid ${D}`,rippleColorError:D,waveOpacity:`0.6`,fontWeight:A,fontWeightStrong:P})}var G={name:`Button`,common:S,self:W},K=d([f(`button`,`
 margin: 0;
 font-weight: var(--n-font-weight);
 line-height: 1;
 font-family: inherit;
 padding: var(--n-padding);
 height: var(--n-height);
 font-size: var(--n-font-size);
 border-radius: var(--n-border-radius);
 color: var(--n-text-color);
 background-color: var(--n-color);
 width: var(--n-width);
 white-space: nowrap;
 outline: none;
 position: relative;
 z-index: auto;
 border: none;
 display: inline-flex;
 flex-wrap: nowrap;
 flex-shrink: 0;
 align-items: center;
 justify-content: center;
 user-select: none;
 -webkit-user-select: none;
 text-align: center;
 cursor: pointer;
 text-decoration: none;
 transition:
 color .3s var(--n-bezier),
 background-color .3s var(--n-bezier),
 opacity .3s var(--n-bezier),
 border-color .3s var(--n-bezier);
 `,[m(`color`,[c(`border`,{borderColor:`var(--n-border-color)`}),m(`disabled`,[c(`border`,{borderColor:`var(--n-border-color-disabled)`})]),u(`disabled`,[d(`&:focus`,[c(`state-border`,{borderColor:`var(--n-border-color-focus)`})]),d(`&:hover`,[c(`state-border`,{borderColor:`var(--n-border-color-hover)`})]),d(`&:active`,[c(`state-border`,{borderColor:`var(--n-border-color-pressed)`})]),m(`pressed`,[c(`state-border`,{borderColor:`var(--n-border-color-pressed)`})])])]),m(`disabled`,{backgroundColor:`var(--n-color-disabled)`,color:`var(--n-text-color-disabled)`},[c(`border`,{border:`var(--n-border-disabled)`})]),u(`disabled`,[d(`&:focus`,{backgroundColor:`var(--n-color-focus)`,color:`var(--n-text-color-focus)`},[c(`state-border`,{border:`var(--n-border-focus)`})]),d(`&:hover`,{backgroundColor:`var(--n-color-hover)`,color:`var(--n-text-color-hover)`},[c(`state-border`,{border:`var(--n-border-hover)`})]),d(`&:active`,{backgroundColor:`var(--n-color-pressed)`,color:`var(--n-text-color-pressed)`},[c(`state-border`,{border:`var(--n-border-pressed)`})]),m(`pressed`,{backgroundColor:`var(--n-color-pressed)`,color:`var(--n-text-color-pressed)`},[c(`state-border`,{border:`var(--n-border-pressed)`})])]),m(`loading`,`cursor: wait;`),f(`base-wave`,`
 pointer-events: none;
 top: 0;
 right: 0;
 bottom: 0;
 left: 0;
 animation-iteration-count: 1;
 animation-duration: var(--n-ripple-duration);
 animation-timing-function: var(--n-bezier-ease-out), var(--n-bezier-ease-out);
 `,[m(`active`,{zIndex:1,animationName:`button-wave-spread, button-wave-opacity`})]),E&&`MozBoxSizing`in document.createElement(`div`).style?d(`&::moz-focus-inner`,{border:0}):null,c(`border, state-border`,`
 position: absolute;
 left: 0;
 top: 0;
 right: 0;
 bottom: 0;
 border-radius: inherit;
 transition: border-color .3s var(--n-bezier);
 pointer-events: none;
 `),c(`border`,`
 border: var(--n-border);
 `),c(`state-border`,`
 border: var(--n-border);
 border-color: #0000;
 z-index: 1;
 `),c(`icon`,`
 margin: var(--n-icon-margin);
 margin-left: 0;
 height: var(--n-icon-size);
 width: var(--n-icon-size);
 max-width: var(--n-icon-size);
 font-size: var(--n-icon-size);
 position: relative;
 flex-shrink: 0;
 `,[f(`icon-slot`,`
 height: var(--n-icon-size);
 width: var(--n-icon-size);
 position: absolute;
 left: 0;
 top: 50%;
 transform: translateY(-50%);
 display: flex;
 align-items: center;
 justify-content: center;
 `,[T({top:`50%`,originalTransform:`translateY(-50%)`})]),L()]),c(`content`,`
 display: flex;
 align-items: center;
 flex-wrap: nowrap;
 min-width: 0;
 `,[d(`~`,[c(`icon`,{margin:`var(--n-icon-margin)`,marginRight:0})])]),m(`block`,`
 display: flex;
 width: 100%;
 `),m(`dashed`,[c(`border, state-border`,{borderStyle:`dashed !important`})]),m(`disabled`,{cursor:`not-allowed`,opacity:`var(--n-opacity-disabled)`})]),d(`@keyframes button-wave-spread`,{from:{boxShadow:`0 0 0.5px 0 var(--n-ripple-color)`},to:{boxShadow:`0 0 0.5px 4.5px var(--n-ripple-color)`}}),d(`@keyframes button-wave-opacity`,{from:{opacity:`var(--n-wave-opacity)`},to:{opacity:0}})]),q=i({name:`Button`,props:Object.assign(Object.assign({},_.props),{color:String,textColor:String,text:Boolean,block:Boolean,loading:Boolean,disabled:Boolean,circle:Boolean,size:String,ghost:Boolean,round:Boolean,secondary:Boolean,tertiary:Boolean,quaternary:Boolean,strong:Boolean,focusable:{type:Boolean,default:!0},keyboard:{type:Boolean,default:!0},tag:{type:String,default:`button`},type:{type:String,default:`default`},dashed:Boolean,renderIcon:Function,iconPlacement:{type:String,default:`left`},attrType:{type:String,default:`button`},bordered:{type:Boolean,default:!0},onClick:[Function,Array],nativeFocusBehavior:{type:Boolean,default:!F},spinProps:Object}),slots:Object,setup(e){let r=o(null),i=o(null),a=o(!1),s=C(()=>!e.quaternary&&!e.tertiary&&!e.secondary&&!e.text&&(!e.color||e.ghost||e.dashed)&&e.bordered),c=t(H,{}),{inlineThemeDisabled:l,mergedClsPrefixRef:u,mergedRtlRef:d,mergedComponentPropsRef:f}=g(e),{mergedSizeRef:m}=j({},{defaultSize:`medium`,mergedSize:t=>{var n,r;let{size:i}=e;if(i)return i;let{size:a}=c;if(a)return a;let{mergedSize:o}=t||{};return o?o.value:((r=(n=f==null?void 0:f.value)==null?void 0:n.Button)==null?void 0:r.size)||`medium`}}),h=n(()=>e.focusable&&!e.disabled),x=t=>{var n;h.value||t.preventDefault(),!e.nativeFocusBehavior&&(t.preventDefault(),!e.disabled&&h.value&&((n=r.value)==null||n.focus({preventScroll:!0})))},S=t=>{var n;if(!e.disabled&&!e.loading){let{onClick:r}=e;r&&A(r,t),e.text||(n=i.value)==null||n.play()}},w=t=>{switch(t.key){case`Enter`:if(!e.keyboard)return;a.value=!1}},T=t=>{switch(t.key){case`Enter`:if(!e.keyboard||e.loading){t.preventDefault();return}a.value=!0}},E=()=>{a.value=!1},O=_(`Button`,`-button`,K,G,e,u),k=v(`Button`,d,u),M=n(()=>{let{common:{cubicBezierEaseInOut:t,cubicBezierEaseOut:n},self:r}=O.value,{rippleDuration:i,opacityDisabled:a,fontWeight:o,fontWeightStrong:s}=r,c=m.value,{dashed:l,type:u,ghost:d,text:f,color:h,round:g,circle:_,textColor:v,secondary:y,tertiary:x,quaternary:S,strong:C}=e,w={"--n-font-weight":C?s:o},T={"--n-color":`initial`,"--n-color-hover":`initial`,"--n-color-pressed":`initial`,"--n-color-focus":`initial`,"--n-color-disabled":`initial`,"--n-ripple-color":`initial`,"--n-text-color":`initial`,"--n-text-color-hover":`initial`,"--n-text-color-pressed":`initial`,"--n-text-color-focus":`initial`,"--n-text-color-disabled":`initial`},E=u===`tertiary`,D=u==="default",k=E?`default`:u;if(f){let e=v||h;T={"--n-color":`#0000`,"--n-color-hover":`#0000`,"--n-color-pressed":`#0000`,"--n-color-focus":`#0000`,"--n-color-disabled":`#0000`,"--n-ripple-color":`#0000`,"--n-text-color":e||r[p(`textColorText`,k)],"--n-text-color-hover":e?B(e):r[p(`textColorTextHover`,k)],"--n-text-color-pressed":e?V(e):r[p(`textColorTextPressed`,k)],"--n-text-color-focus":e?B(e):r[p(`textColorTextHover`,k)],"--n-text-color-disabled":e||r[p(`textColorTextDisabled`,k)]}}else if(d||l){let e=v||h;T={"--n-color":`#0000`,"--n-color-hover":`#0000`,"--n-color-pressed":`#0000`,"--n-color-focus":`#0000`,"--n-color-disabled":`#0000`,"--n-ripple-color":h||r[p(`rippleColor`,k)],"--n-text-color":e||r[p(`textColorGhost`,k)],"--n-text-color-hover":e?B(e):r[p(`textColorGhostHover`,k)],"--n-text-color-pressed":e?V(e):r[p(`textColorGhostPressed`,k)],"--n-text-color-focus":e?B(e):r[p(`textColorGhostHover`,k)],"--n-text-color-disabled":e||r[p(`textColorGhostDisabled`,k)]}}else if(y){let e=D?r.textColor:E?r.textColorTertiary:r[p(`color`,k)],t=h||e,n=u!=="default"&&u!==`tertiary`;T={"--n-color":n?b(t,{alpha:Number(r.colorOpacitySecondary)}):r.colorSecondary,"--n-color-hover":n?b(t,{alpha:Number(r.colorOpacitySecondaryHover)}):r.colorSecondaryHover,"--n-color-pressed":n?b(t,{alpha:Number(r.colorOpacitySecondaryPressed)}):r.colorSecondaryPressed,"--n-color-focus":n?b(t,{alpha:Number(r.colorOpacitySecondaryHover)}):r.colorSecondaryHover,"--n-color-disabled":r.colorSecondary,"--n-ripple-color":`#0000`,"--n-text-color":t,"--n-text-color-hover":t,"--n-text-color-pressed":t,"--n-text-color-focus":t,"--n-text-color-disabled":t}}else if(x||S){let e=D?r.textColor:E?r.textColorTertiary:r[p(`color`,k)],t=h||e;x?(T[`--n-color`]=r.colorTertiary,T[`--n-color-hover`]=r.colorTertiaryHover,T[`--n-color-pressed`]=r.colorTertiaryPressed,T[`--n-color-focus`]=r.colorSecondaryHover,T[`--n-color-disabled`]=r.colorTertiary):(T[`--n-color`]=r.colorQuaternary,T[`--n-color-hover`]=r.colorQuaternaryHover,T[`--n-color-pressed`]=r.colorQuaternaryPressed,T[`--n-color-focus`]=r.colorQuaternaryHover,T[`--n-color-disabled`]=r.colorQuaternary),T[`--n-ripple-color`]=`#0000`,T[`--n-text-color`]=t,T[`--n-text-color-hover`]=t,T[`--n-text-color-pressed`]=t,T[`--n-text-color-focus`]=t,T[`--n-text-color-disabled`]=t}else T={"--n-color":h||r[p(`color`,k)],"--n-color-hover":h?B(h):r[p(`colorHover`,k)],"--n-color-pressed":h?V(h):r[p(`colorPressed`,k)],"--n-color-focus":h?B(h):r[p(`colorFocus`,k)],"--n-color-disabled":h||r[p(`colorDisabled`,k)],"--n-ripple-color":h||r[p(`rippleColor`,k)],"--n-text-color":v||(h?r.textColorPrimary:E?r.textColorTertiary:r[p(`textColor`,k)]),"--n-text-color-hover":v||(h?r.textColorHoverPrimary:r[p(`textColorHover`,k)]),"--n-text-color-pressed":v||(h?r.textColorPressedPrimary:r[p(`textColorPressed`,k)]),"--n-text-color-focus":v||(h?r.textColorFocusPrimary:r[p(`textColorFocus`,k)]),"--n-text-color-disabled":v||(h?r.textColorDisabledPrimary:r[p(`textColorDisabled`,k)])};let A={"--n-border":`initial`,"--n-border-hover":`initial`,"--n-border-pressed":`initial`,"--n-border-focus":`initial`,"--n-border-disabled":`initial`};A=f?{"--n-border":`none`,"--n-border-hover":`none`,"--n-border-pressed":`none`,"--n-border-focus":`none`,"--n-border-disabled":`none`}:{"--n-border":r[p(`border`,k)],"--n-border-hover":r[p(`borderHover`,k)],"--n-border-pressed":r[p(`borderPressed`,k)],"--n-border-focus":r[p(`borderFocus`,k)],"--n-border-disabled":r[p(`borderDisabled`,k)]};let{[p(`height`,c)]:j,[p(`fontSize`,c)]:M,[p(`padding`,c)]:N,[p(`paddingRound`,c)]:P,[p(`iconSize`,c)]:F,[p(`borderRadius`,c)]:I,[p(`iconMargin`,c)]:L,waveOpacity:R}=r,z={"--n-width":_&&!f?j:`initial`,"--n-height":f?`initial`:j,"--n-font-size":M,"--n-padding":_||f?`initial`:g?P:N,"--n-icon-size":F,"--n-icon-margin":L,"--n-border-radius":f?`initial`:_||g?j:I};return Object.assign(Object.assign(Object.assign(Object.assign({"--n-bezier":t,"--n-bezier-ease-out":n,"--n-ripple-duration":i,"--n-opacity-disabled":a,"--n-wave-opacity":R},w),T),A),z)}),N=l?y(`button`,n(()=>{let t=``,{dashed:n,type:r,ghost:i,text:a,color:o,round:s,circle:c,textColor:l,secondary:u,tertiary:d,quaternary:f,strong:p}=e;n&&(t+=`a`),i&&(t+=`b`),a&&(t+=`c`),s&&(t+=`d`),c&&(t+=`e`),u&&(t+=`f`),d&&(t+=`g`),f&&(t+=`h`),p&&(t+=`i`),o&&(t+=`j${D(o)}`),l&&(t+=`k${D(l)}`);let{value:h}=m;return t+=`l${h[0]}`,t+=`m${r[0]}`,t}),M,e):void 0;return{selfElRef:r,waveElRef:i,mergedClsPrefix:u,mergedFocusable:h,mergedSize:m,showBorder:s,enterPressed:a,rtlEnabled:k,handleMousedown:x,handleKeydown:T,handleBlur:E,handleKeyup:w,handleClick:S,customColorCssVars:n(()=>{let{color:t}=e;if(!t)return null;let n=B(t);return{"--n-border-color":t,"--n-border-color-hover":n,"--n-border-color-pressed":V(t),"--n-border-color-focus":n,"--n-border-color-disabled":t}}),cssVars:l?void 0:M,themeClass:N==null?void 0:N.themeClass,onRender:N==null?void 0:N.onRender}},render(){let{mergedClsPrefix:t,tag:n,onRender:r}=this;r==null||r();let i=O(this.$slots.default,n=>n&&e(`span`,{class:`${t}-button__content`},n));return e(n,{ref:`selfElRef`,class:[this.themeClass,`${t}-button`,`${t}-button--${this.type}-type`,`${t}-button--${this.mergedSize}-type`,this.rtlEnabled&&`${t}-button--rtl`,this.disabled&&`${t}-button--disabled`,this.block&&`${t}-button--block`,this.enterPressed&&`${t}-button--pressed`,!this.text&&this.dashed&&`${t}-button--dashed`,this.color&&`${t}-button--color`,this.secondary&&`${t}-button--secondary`,this.loading&&`${t}-button--loading`,this.ghost&&`${t}-button--ghost`],tabindex:this.mergedFocusable?0:-1,type:this.attrType,style:this.cssVars,disabled:this.disabled,onClick:this.handleClick,onBlur:this.handleBlur,onMousedown:this.handleMousedown,onKeyup:this.handleKeyup,onKeydown:this.handleKeydown},this.iconPlacement===`right`&&i,e(P,{width:!0},{default:()=>O(this.$slots.icon,n=>(this.loading||this.renderIcon||n)&&e(`span`,{class:`${t}-button__icon`,style:{margin:k(this.$slots.default)?`0`:``}},e(w,null,{default:()=>this.loading?e(N,Object.assign({clsPrefix:t,key:`loading`,class:`${t}-icon-slot`,strokeWidth:20},this.spinProps)):e(`div`,{key:`icon`,class:`${t}-icon-slot`,role:`none`},this.renderIcon?this.renderIcon():n)})))}),this.iconPlacement===`left`&&i,this.text?null:e(z,{ref:`waveElRef`,clsPrefix:t}),this.showBorder?e(`div`,{"aria-hidden":!0,class:`${t}-button__border`,style:this.customColorCssVars}):null,this.showBorder?e(`div`,{"aria-hidden":!0,class:`${t}-button__state-border`,style:this.customColorCssVars}):null)}}),J=q;export{W as i,J as n,G as r,q as t};