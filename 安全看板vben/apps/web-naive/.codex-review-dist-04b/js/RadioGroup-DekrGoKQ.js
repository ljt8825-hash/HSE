import{B as e,J as t,g as n,gt as r,k as i,vn as a,wn as o}from"./runtime-core.esm-bundler-Blp3D1W4.js";import{B as s,F as c,H as l,L as u,R as d,U as f,V as p,j as m,n as h}from"./use-theme-BPxAT0OQ.js";import{t as g}from"./use-rtl-BtnaqIOl.js";import{n as _}from"./light-DZKN5sjf.js";import{t as v}from"./use-memo-5BlGN31V.js";import{t as y}from"./use-merged-state-zglAmQ1M.js";import{a as b,o as x}from"./resolve-slot-DbAlC7Z4.js";import{t as S}from"./flatten-CoLVt70p.js";import{t as C}from"./get-slot-6kXJmSMP.js";import{n as w}from"./use-form-item-D_m56wdL.js";import{t as T}from"./light-BykwJKRD.js";var E=d(`radio`,`
 line-height: var(--n-label-line-height);
 outline: none;
 position: relative;
 user-select: none;
 -webkit-user-select: none;
 display: inline-flex;
 align-items: flex-start;
 flex-wrap: nowrap;
 font-size: var(--n-font-size);
 word-break: break-word;
`,[p(`checked`,[s(`dot`,`
 background-color: var(--n-color-active);
 `)]),s(`dot-wrapper`,`
 position: relative;
 flex-shrink: 0;
 flex-grow: 0;
 width: var(--n-radio-size);
 `),d(`radio-input`,`
 position: absolute;
 border: 0;
 width: 0;
 height: 0;
 opacity: 0;
 margin: 0;
 `),s(`dot`,`
 position: absolute;
 top: 50%;
 left: 0;
 transform: translateY(-50%);
 height: var(--n-radio-size);
 width: var(--n-radio-size);
 background: var(--n-color);
 box-shadow: var(--n-box-shadow);
 border-radius: 50%;
 transition:
 background-color .3s var(--n-bezier),
 box-shadow .3s var(--n-bezier);
 `,[u(`&::before`,`
 content: "";
 opacity: 0;
 position: absolute;
 left: 4px;
 top: 4px;
 height: calc(100% - 8px);
 width: calc(100% - 8px);
 border-radius: 50%;
 transform: scale(.8);
 background: var(--n-dot-color-active);
 transition: 
 opacity .3s var(--n-bezier),
 background-color .3s var(--n-bezier),
 transform .3s var(--n-bezier);
 `),p(`checked`,{boxShadow:`var(--n-box-shadow-active)`},[u(`&::before`,`
 opacity: 1;
 transform: scale(1);
 `)])]),s(`label`,`
 color: var(--n-text-color);
 padding: var(--n-label-padding);
 font-weight: var(--n-label-font-weight);
 display: inline-block;
 transition: color .3s var(--n-bezier);
 `),l(`disabled`,`
 cursor: pointer;
 `,[u(`&:hover`,[s(`dot`,{boxShadow:`var(--n-box-shadow-hover)`})]),p(`focus`,[u(`&:not(:active)`,[s(`dot`,{boxShadow:`var(--n-box-shadow-focus)`})])])]),p(`disabled`,`
 cursor: not-allowed;
 `,[s(`dot`,{boxShadow:`var(--n-box-shadow-disabled)`,backgroundColor:`var(--n-color-disabled)`},[u(`&::before`,{backgroundColor:`var(--n-dot-color-disabled)`}),p(`checked`,`
 opacity: 1;
 `)]),s(`label`,{color:`var(--n-text-color-disabled)`}),d(`radio-input`,`
 cursor: not-allowed;
 `)])]),D={name:String,value:{type:[String,Number,Boolean],default:`on`},checked:{type:Boolean,default:void 0},defaultChecked:Boolean,disabled:{type:Boolean,default:void 0},label:String,size:String,onUpdateChecked:[Function,Array],"onUpdate:checked":[Function,Array],checkedValue:{type:Boolean,default:void 0}},O=c(`n-radio-group`);function k(e){let n=t(O,null),{mergedClsPrefixRef:r,mergedComponentPropsRef:i}=m(e),s=w(e,{mergedSize(t){var r,a;let{size:o}=e;if(o!==void 0)return o;if(n){let{mergedSizeRef:{value:e}}=n;if(e!==void 0)return e}return t?t.mergedSize.value:((a=(r=i==null?void 0:i.value)==null?void 0:r.Radio)==null?void 0:a.size)||`medium`},mergedDisabled(t){return!!(e.disabled||n!=null&&n.disabledRef.value||t!=null&&t.disabled.value)}}),{mergedSizeRef:c,mergedDisabledRef:l}=s,u=a(null),d=a(null),f=a(e.defaultChecked),p=y(o(e,`checked`),f),h=v(()=>n?n.valueRef.value===e.value:p.value),g=v(()=>{let{name:t}=e;if(t!==void 0)return t;if(n)return n.nameRef.value}),_=a(!1);function b(){if(n){let{doUpdateValue:t}=n,{value:r}=e;x(t,r)}else{let{onUpdateChecked:t,"onUpdate:checked":n}=e,{nTriggerFormInput:r,nTriggerFormChange:i}=s;t&&x(t,!0),n&&x(n,!0),r(),i(),f.value=!0}}function S(){l.value||h.value||b()}function C(){S(),u.value&&(u.value.checked=h.value)}function T(){_.value=!1}function E(){_.value=!0}return{mergedClsPrefix:n?n.mergedClsPrefixRef:r,inputRef:u,labelRef:d,mergedName:g,mergedDisabled:l,renderSafeChecked:h,focus:_,mergedSize:c,handleRadioInputChange:C,handleRadioInputBlur:T,handleRadioInputFocus:E}}var A=i({name:`Radio`,props:Object.assign(Object.assign({},h.props),D),setup(e){let t=k(e),r=h(`Radio`,`-radio`,E,T,e,t.mergedClsPrefix),i=n(()=>{let{mergedSize:{value:e}}=t,{common:{cubicBezierEaseInOut:n},self:{boxShadow:i,boxShadowActive:a,boxShadowDisabled:o,boxShadowFocus:s,boxShadowHover:c,color:l,colorDisabled:u,colorActive:d,textColor:p,textColorDisabled:m,dotColorActive:h,dotColorDisabled:g,labelPadding:_,labelLineHeight:v,labelFontWeight:y,[f(`fontSize`,e)]:b,[f(`radioSize`,e)]:x}}=r.value;return{"--n-bezier":n,"--n-label-line-height":v,"--n-label-font-weight":y,"--n-box-shadow":i,"--n-box-shadow-active":a,"--n-box-shadow-disabled":o,"--n-box-shadow-focus":s,"--n-box-shadow-hover":c,"--n-color":l,"--n-color-active":d,"--n-color-disabled":u,"--n-dot-color-active":h,"--n-dot-color-disabled":g,"--n-font-size":b,"--n-radio-size":x,"--n-text-color":p,"--n-text-color-disabled":m,"--n-label-padding":_}}),{inlineThemeDisabled:a,mergedClsPrefixRef:o,mergedRtlRef:s}=m(e),c=g(`Radio`,s,o),l=a?_(`radio`,n(()=>t.mergedSize.value[0]),i,e):void 0;return Object.assign(t,{rtlEnabled:c,cssVars:a?void 0:i,themeClass:l==null?void 0:l.themeClass,onRender:l==null?void 0:l.onRender})},render(){let{$slots:t,mergedClsPrefix:n,onRender:r,label:i}=this;return r==null||r(),e(`label`,{class:[`${n}-radio`,this.themeClass,this.rtlEnabled&&`${n}-radio--rtl`,this.mergedDisabled&&`${n}-radio--disabled`,this.renderSafeChecked&&`${n}-radio--checked`,this.focus&&`${n}-radio--focus`],style:this.cssVars},e(`div`,{class:`${n}-radio__dot-wrapper`},`\xA0`,e(`div`,{class:[`${n}-radio__dot`,this.renderSafeChecked&&`${n}-radio__dot--checked`]}),e(`input`,{ref:`inputRef`,type:`radio`,class:`${n}-radio-input`,value:this.value,name:this.mergedName,checked:this.renderSafeChecked,disabled:this.mergedDisabled,onChange:this.handleRadioInputChange,onFocus:this.handleRadioInputFocus,onBlur:this.handleRadioInputBlur})),b(t.default,t=>!t&&!i?null:e(`div`,{ref:`labelRef`,class:`${n}-radio__label`},t||i)))}}),j=d(`radio-group`,`
 display: inline-block;
 font-size: var(--n-font-size);
`,[s(`splitor`,`
 display: inline-block;
 vertical-align: bottom;
 width: 1px;
 transition:
 background-color .3s var(--n-bezier),
 opacity .3s var(--n-bezier);
 background: var(--n-button-border-color);
 `,[p(`checked`,{backgroundColor:`var(--n-button-border-color-active)`}),p(`disabled`,{opacity:`var(--n-opacity-disabled)`})]),p(`button-group`,`
 white-space: nowrap;
 height: var(--n-height);
 line-height: var(--n-height);
 `,[d(`radio-button`,{height:`var(--n-height)`,lineHeight:`var(--n-height)`}),s(`splitor`,{height:`var(--n-height)`})]),d(`radio-button`,`
 vertical-align: bottom;
 outline: none;
 position: relative;
 user-select: none;
 -webkit-user-select: none;
 display: inline-block;
 box-sizing: border-box;
 padding-left: 14px;
 padding-right: 14px;
 white-space: nowrap;
 transition:
 background-color .3s var(--n-bezier),
 opacity .3s var(--n-bezier),
 border-color .3s var(--n-bezier),
 color .3s var(--n-bezier);
 background: var(--n-button-color);
 color: var(--n-button-text-color);
 border-top: 1px solid var(--n-button-border-color);
 border-bottom: 1px solid var(--n-button-border-color);
 `,[d(`radio-input`,`
 pointer-events: none;
 position: absolute;
 border: 0;
 border-radius: inherit;
 left: 0;
 right: 0;
 top: 0;
 bottom: 0;
 opacity: 0;
 z-index: 1;
 `),s(`state-border`,`
 z-index: 1;
 pointer-events: none;
 position: absolute;
 box-shadow: var(--n-button-box-shadow);
 transition: box-shadow .3s var(--n-bezier);
 left: -1px;
 bottom: -1px;
 right: -1px;
 top: -1px;
 `),u(`&:first-child`,`
 border-top-left-radius: var(--n-button-border-radius);
 border-bottom-left-radius: var(--n-button-border-radius);
 border-left: 1px solid var(--n-button-border-color);
 `,[s(`state-border`,`
 border-top-left-radius: var(--n-button-border-radius);
 border-bottom-left-radius: var(--n-button-border-radius);
 `)]),u(`&:last-child`,`
 border-top-right-radius: var(--n-button-border-radius);
 border-bottom-right-radius: var(--n-button-border-radius);
 border-right: 1px solid var(--n-button-border-color);
 `,[s(`state-border`,`
 border-top-right-radius: var(--n-button-border-radius);
 border-bottom-right-radius: var(--n-button-border-radius);
 `)]),l(`disabled`,`
 cursor: pointer;
 `,[u(`&:hover`,[s(`state-border`,`
 transition: box-shadow .3s var(--n-bezier);
 box-shadow: var(--n-button-box-shadow-hover);
 `),l(`checked`,{color:`var(--n-button-text-color-hover)`})]),p(`focus`,[u(`&:not(:active)`,[s(`state-border`,{boxShadow:`var(--n-button-box-shadow-focus)`})])])]),p(`checked`,`
 background: var(--n-button-color-active);
 color: var(--n-button-text-color-active);
 border-color: var(--n-button-border-color-active);
 `),p(`disabled`,`
 cursor: not-allowed;
 opacity: var(--n-opacity-disabled);
 `)])]);function M(t,n,r){var i;let a=[],o=!1;for(let s=0;s<t.length;++s){let c=t[s],l=(i=c.type)==null?void 0:i.name;l===`RadioButton`&&(o=!0);let u=c.props;if(l!==`RadioButton`){a.push(c);continue}if(s===0)a.push(c);else{let t=a[a.length-1].props,i=n===t.value,o=t.disabled,s=n===u.value,l=u.disabled,d=(i?2:0)+ +!o,f=(s?2:0)+ +!l,p={[`${r}-radio-group__splitor--disabled`]:o,[`${r}-radio-group__splitor--checked`]:i},m={[`${r}-radio-group__splitor--disabled`]:l,[`${r}-radio-group__splitor--checked`]:s},h=d<f?m:p;a.push(e(`div`,{class:[`${r}-radio-group__splitor`,h]}),c)}}return{children:a,isButtonGroup:o}}var N=i({name:`RadioGroup`,props:Object.assign(Object.assign({},h.props),{name:String,value:[String,Number,Boolean],defaultValue:{type:[String,Number,Boolean],default:null},size:String,disabled:{type:Boolean,default:void 0},"onUpdate:value":[Function,Array],onUpdateValue:[Function,Array]}),setup(e){let t=a(null),{mergedSizeRef:i,mergedDisabledRef:s,nTriggerFormChange:c,nTriggerFormInput:l,nTriggerFormBlur:u,nTriggerFormFocus:d}=w(e),{mergedClsPrefixRef:p,inlineThemeDisabled:v,mergedRtlRef:b}=m(e),S=h(`Radio`,`-radio-group`,j,T,e,p),C=a(e.defaultValue),E=y(o(e,`value`),C);function D(t){let{onUpdateValue:n,"onUpdate:value":r}=e;n&&x(n,t),r&&x(r,t),C.value=t,c(),l()}function k(e){let{value:n}=t;n&&(n.contains(e.relatedTarget)||d())}function A(e){let{value:n}=t;n&&(n.contains(e.relatedTarget)||u())}r(O,{mergedClsPrefixRef:p,nameRef:o(e,`name`),valueRef:E,disabledRef:s,mergedSizeRef:i,doUpdateValue:D});let M=g(`Radio`,b,p),N=n(()=>{let{value:e}=i,{common:{cubicBezierEaseInOut:t},self:{buttonBorderColor:n,buttonBorderColorActive:r,buttonBorderRadius:a,buttonBoxShadow:o,buttonBoxShadowFocus:s,buttonBoxShadowHover:c,buttonColor:l,buttonColorActive:u,buttonTextColor:d,buttonTextColorActive:p,buttonTextColorHover:m,opacityDisabled:h,[f(`buttonHeight`,e)]:g,[f(`fontSize`,e)]:_}}=S.value;return{"--n-font-size":_,"--n-bezier":t,"--n-button-border-color":n,"--n-button-border-color-active":r,"--n-button-border-radius":a,"--n-button-box-shadow":o,"--n-button-box-shadow-focus":s,"--n-button-box-shadow-hover":c,"--n-button-color":l,"--n-button-color-active":u,"--n-button-text-color":d,"--n-button-text-color-hover":m,"--n-button-text-color-active":p,"--n-height":g,"--n-opacity-disabled":h}}),P=v?_(`radio-group`,n(()=>i.value[0]),N,e):void 0;return{selfElRef:t,rtlEnabled:M,mergedClsPrefix:p,mergedValue:E,handleFocusout:A,handleFocusin:k,cssVars:v?void 0:N,themeClass:P==null?void 0:P.themeClass,onRender:P==null?void 0:P.onRender}},render(){var t;let{mergedValue:n,mergedClsPrefix:r,handleFocusin:i,handleFocusout:a}=this,{children:o,isButtonGroup:s}=M(S(C(this)),n,r);return(t=this.onRender)==null||t.call(this),e(`div`,{onFocusin:i,onFocusout:a,ref:`selfElRef`,class:[`${r}-radio-group`,this.rtlEnabled&&`${r}-radio-group--rtl`,this.themeClass,s&&`${r}-radio-group--button-group`],style:this.cssVars},o)}});export{k as i,A as n,D as r,N as t};