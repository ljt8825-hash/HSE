import{B as e,Ht as t,J as n,L as r,Ut as i,ct as a,g as o,gt as s,k as c,o as l,tt as u,vn as d,wn as f}from"./runtime-core.esm-bundler-Blp3D1W4.js";import{B as p,F as m,H as h,L as g,R as _,U as ee,V as v,j as te,n as y}from"./use-theme-BPxAT0OQ.js";import{t as ne}from"./use-rtl-BtnaqIOl.js";import{f as b,s as x,t as S}from"./Scrollbar-BGIkiQ6T.js";import{r as re}from"./css-DEmdllcC.js";import{n as ie}from"./light-DZKN5sjf.js";import{n as C,t as w}from"./delegate-CjSREZdL.js";import{t as T}from"./use-memo-5BlGN31V.js";import{t as ae}from"./use-merged-state-zglAmQ1M.js";import{a as E,i as D,o as O,s as k,t as oe}from"./use-form-item-DMd-WY4m.js";import{t as se}from"./use-locale-JIz5NweQ.js";import{n as ce}from"./Loading-FRI83lZm.js";import{n as A,t as j}from"./Suffix-BP0O5XbA.js";import{t as M}from"./Eye-D_lP7mc8.js";import{t as le}from"./browser-B_EWS_Ix.js";import{t as ue}from"./light-C1cZYQ-i.js";var N=c({name:`EyeOff`,render(){return e(`svg`,{xmlns:`http://www.w3.org/2000/svg`,viewBox:`0 0 512 512`},e(`path`,{d:`M432 448a15.92 15.92 0 0 1-11.31-4.69l-352-352a16 16 0 0 1 22.62-22.62l352 352A16 16 0 0 1 432 448z`,fill:`currentColor`}),e(`path`,{d:`M255.66 384c-41.49 0-81.5-12.28-118.92-36.5c-34.07-22-64.74-53.51-88.7-91v-.08c19.94-28.57 41.78-52.73 65.24-72.21a2 2 0 0 0 .14-2.94L93.5 161.38a2 2 0 0 0-2.71-.12c-24.92 21-48.05 46.76-69.08 76.92a31.92 31.92 0 0 0-.64 35.54c26.41 41.33 60.4 76.14 98.28 100.65C162 402 207.9 416 255.66 416a239.13 239.13 0 0 0 75.8-12.58a2 2 0 0 0 .77-3.31l-21.58-21.58a4 4 0 0 0-3.83-1a204.8 204.8 0 0 1-51.16 6.47z`,fill:`currentColor`}),e(`path`,{d:`M490.84 238.6c-26.46-40.92-60.79-75.68-99.27-100.53C349 110.55 302 96 255.66 96a227.34 227.34 0 0 0-74.89 12.83a2 2 0 0 0-.75 3.31l21.55 21.55a4 4 0 0 0 3.88 1a192.82 192.82 0 0 1 50.21-6.69c40.69 0 80.58 12.43 118.55 37c34.71 22.4 65.74 53.88 89.76 91a.13.13 0 0 1 0 .16a310.72 310.72 0 0 1-64.12 72.73a2 2 0 0 0-.15 2.95l19.9 19.89a2 2 0 0 0 2.7.13a343.49 343.49 0 0 0 68.64-78.48a32.2 32.2 0 0 0-.1-34.78z`,fill:`currentColor`}),e(`path`,{d:`M256 160a95.88 95.88 0 0 0-21.37 2.4a2 2 0 0 0-1 3.38l112.59 112.56a2 2 0 0 0 3.38-1A96 96 0 0 0 256 160z`,fill:`currentColor`}),e(`path`,{d:`M165.78 233.66a2 2 0 0 0-3.38 1a96 96 0 0 0 115 115a2 2 0 0 0 1-3.38z`,fill:`currentColor`}))}}),P=m(`n-input`),de=_(`input`,`
 max-width: 100%;
 cursor: text;
 line-height: 1.5;
 z-index: auto;
 outline: none;
 box-sizing: border-box;
 position: relative;
 display: inline-flex;
 border-radius: var(--n-border-radius);
 background-color: var(--n-color);
 transition: background-color .3s var(--n-bezier);
 font-size: var(--n-font-size);
 font-weight: var(--n-font-weight);
 --n-padding-vertical: calc((var(--n-height) - 1.5 * var(--n-font-size)) / 2);
`,[p(`input, textarea`,`
 overflow: hidden;
 flex-grow: 1;
 position: relative;
 `),p(`input-el, textarea-el, input-mirror, textarea-mirror, separator, placeholder`,`
 box-sizing: border-box;
 font-size: inherit;
 line-height: 1.5;
 font-family: inherit;
 border: none;
 outline: none;
 background-color: #0000;
 text-align: inherit;
 transition:
 -webkit-text-fill-color .3s var(--n-bezier),
 caret-color .3s var(--n-bezier),
 color .3s var(--n-bezier),
 text-decoration-color .3s var(--n-bezier);
 `),p(`input-el, textarea-el`,`
 -webkit-appearance: none;
 scrollbar-width: none;
 width: 100%;
 min-width: 0;
 text-decoration-color: var(--n-text-decoration-color);
 color: var(--n-text-color);
 caret-color: var(--n-caret-color);
 background-color: transparent;
 `,[g(`&::-webkit-scrollbar, &::-webkit-scrollbar-track-piece, &::-webkit-scrollbar-thumb`,`
 width: 0;
 height: 0;
 display: none;
 `),g(`&::placeholder`,`
 color: #0000;
 -webkit-text-fill-color: transparent !important;
 `),g(`&:-webkit-autofill ~`,[p(`placeholder`,`display: none;`)])]),v(`round`,[h(`textarea`,`border-radius: calc(var(--n-height) / 2);`)]),p(`placeholder`,`
 pointer-events: none;
 position: absolute;
 left: 0;
 right: 0;
 top: 0;
 bottom: 0;
 overflow: hidden;
 color: var(--n-placeholder-color);
 `,[g(`span`,`
 width: 100%;
 display: inline-block;
 `)]),v(`textarea`,[p(`placeholder`,`overflow: visible;`)]),h(`autosize`,`width: 100%;`),v(`autosize`,[p(`textarea-el, input-el`,`
 position: absolute;
 top: 0;
 left: 0;
 height: 100%;
 `)]),_(`input-wrapper`,`
 overflow: hidden;
 display: inline-flex;
 flex-grow: 1;
 position: relative;
 padding-left: var(--n-padding-left);
 padding-right: var(--n-padding-right);
 `),p(`input-mirror`,`
 padding: 0;
 height: var(--n-height);
 line-height: var(--n-height);
 overflow: hidden;
 visibility: hidden;
 position: static;
 white-space: pre;
 pointer-events: none;
 `),p(`input-el`,`
 padding: 0;
 height: var(--n-height);
 line-height: var(--n-height);
 `,[g(`&[type=password]::-ms-reveal`,`display: none;`),g(`+`,[p(`placeholder`,`
 display: flex;
 align-items: center; 
 `)])]),h(`textarea`,[p(`placeholder`,`white-space: nowrap;`)]),p(`eye`,`
 display: flex;
 align-items: center;
 justify-content: center;
 transition: color .3s var(--n-bezier);
 `),v(`textarea`,`width: 100%;`,[_(`input-word-count`,`
 position: absolute;
 right: var(--n-padding-right);
 bottom: var(--n-padding-vertical);
 `),v(`resizable`,[_(`input-wrapper`,`
 resize: vertical;
 min-height: var(--n-height);
 `)]),p(`textarea-el, textarea-mirror, placeholder`,`
 height: 100%;
 padding-left: 0;
 padding-right: 0;
 padding-top: var(--n-padding-vertical);
 padding-bottom: var(--n-padding-vertical);
 word-break: break-word;
 display: inline-block;
 vertical-align: bottom;
 box-sizing: border-box;
 line-height: var(--n-line-height-textarea);
 margin: 0;
 resize: none;
 white-space: pre-wrap;
 scroll-padding-block-end: var(--n-padding-vertical);
 `),p(`textarea-mirror`,`
 width: 100%;
 pointer-events: none;
 overflow: hidden;
 visibility: hidden;
 position: static;
 white-space: pre-wrap;
 overflow-wrap: break-word;
 `)]),v(`pair`,[p(`input-el, placeholder`,`text-align: center;`),p(`separator`,`
 display: flex;
 align-items: center;
 transition: color .3s var(--n-bezier);
 color: var(--n-text-color);
 white-space: nowrap;
 `,[_(`icon`,`
 color: var(--n-icon-color);
 `),_(`base-icon`,`
 color: var(--n-icon-color);
 `)])]),v(`disabled`,`
 cursor: not-allowed;
 background-color: var(--n-color-disabled);
 `,[p(`border`,`border: var(--n-border-disabled);`),p(`input-el, textarea-el`,`
 cursor: not-allowed;
 color: var(--n-text-color-disabled);
 text-decoration-color: var(--n-text-color-disabled);
 `),p(`placeholder`,`color: var(--n-placeholder-color-disabled);`),p(`separator`,`color: var(--n-text-color-disabled);`,[_(`icon`,`
 color: var(--n-icon-color-disabled);
 `),_(`base-icon`,`
 color: var(--n-icon-color-disabled);
 `)]),_(`input-word-count`,`
 color: var(--n-count-text-color-disabled);
 `),p(`suffix, prefix`,`color: var(--n-text-color-disabled);`,[_(`icon`,`
 color: var(--n-icon-color-disabled);
 `),_(`internal-icon`,`
 color: var(--n-icon-color-disabled);
 `)])]),h(`disabled`,[p(`eye`,`
 color: var(--n-icon-color);
 cursor: pointer;
 `,[g(`&:hover`,`
 color: var(--n-icon-color-hover);
 `),g(`&:active`,`
 color: var(--n-icon-color-pressed);
 `)]),g(`&:hover`,[p(`state-border`,`border: var(--n-border-hover);`)]),v(`focus`,`background-color: var(--n-color-focus);`,[p(`state-border`,`
 border: var(--n-border-focus);
 box-shadow: var(--n-box-shadow-focus);
 `)])]),p(`border, state-border`,`
 box-sizing: border-box;
 position: absolute;
 left: 0;
 right: 0;
 top: 0;
 bottom: 0;
 pointer-events: none;
 border-radius: inherit;
 border: var(--n-border);
 transition:
 box-shadow .3s var(--n-bezier),
 border-color .3s var(--n-bezier);
 `),p(`state-border`,`
 border-color: #0000;
 z-index: 1;
 `),p(`prefix`,`margin-right: 4px;`),p(`suffix`,`
 margin-left: 4px;
 `),p(`suffix, prefix`,`
 transition: color .3s var(--n-bezier);
 flex-wrap: nowrap;
 flex-shrink: 0;
 line-height: var(--n-height);
 white-space: nowrap;
 display: inline-flex;
 align-items: center;
 justify-content: center;
 color: var(--n-suffix-text-color);
 `,[_(`base-loading`,`
 font-size: var(--n-icon-size);
 margin: 0 2px;
 color: var(--n-loading-color);
 `),_(`base-clear`,`
 font-size: var(--n-icon-size);
 `,[p(`placeholder`,[_(`base-icon`,`
 transition: color .3s var(--n-bezier);
 color: var(--n-icon-color);
 font-size: var(--n-icon-size);
 `)])]),g(`>`,[_(`icon`,`
 transition: color .3s var(--n-bezier);
 color: var(--n-icon-color);
 font-size: var(--n-icon-size);
 `)]),_(`base-icon`,`
 font-size: var(--n-icon-size);
 `)]),_(`input-word-count`,`
 pointer-events: none;
 line-height: 1.5;
 font-size: .85em;
 color: var(--n-count-text-color);
 transition: color .3s var(--n-bezier);
 margin-left: 4px;
 font-variant: tabular-nums;
 `),[`warning`,`error`].map(e=>v(`${e}-status`,[h(`disabled`,[_(`base-loading`,`
 color: var(--n-loading-color-${e})
 `),p(`input-el, textarea-el`,`
 caret-color: var(--n-caret-color-${e});
 `),p(`state-border`,`
 border: var(--n-border-${e});
 `),g(`&:hover`,[p(`state-border`,`
 border: var(--n-border-hover-${e});
 `)]),g(`&:focus`,`
 background-color: var(--n-color-focus-${e});
 `,[p(`state-border`,`
 box-shadow: var(--n-box-shadow-focus-${e});
 border: var(--n-border-focus-${e});
 `)]),v(`focus`,`
 background-color: var(--n-color-focus-${e});
 `,[p(`state-border`,`
 box-shadow: var(--n-box-shadow-focus-${e});
 border: var(--n-border-focus-${e});
 `)])])]))]),fe=_(`input`,[v(`disabled`,[p(`input-el, textarea-el`,`
 -webkit-text-fill-color: var(--n-text-color-disabled);
 `)])]);function F(e){let t=0;for(let n of e)t++;return t}function I(e){return e===``||e==null}function pe(e){let n=d(null);function r(){let{value:t}=e;if(!(t!=null&&t.focus)){a();return}let{selectionStart:r,selectionEnd:i,value:o}=t;if(r==null||i==null){a();return}n.value={start:r,end:i,beforeText:o.slice(0,r),afterText:o.slice(i)}}function i(){var t;let{value:r}=n,{value:i}=e;if(!r||!i)return;let{value:a}=i,{start:o,beforeText:s,afterText:c}=r,l=a.length;if(a.endsWith(c))l=a.length-c.length;else if(a.startsWith(s))l=s.length;else{let e=s[o-1],t=a.indexOf(e,o-1);t!==-1&&(l=t+1)}(t=i.setSelectionRange)==null||t.call(i,l,l)}function a(){n.value=null}return t(e,a),{recordCursor:r,restoreCursor:i}}var L=c({name:`InputWordCount`,setup(t,{slots:r}){let{mergedValueRef:i,maxlengthRef:a,mergedClsPrefixRef:s,countGraphemesRef:c}=n(P),l=o(()=>{let{value:e}=i;return e===null||Array.isArray(e)?0:(c.value||F)(e)});return()=>{let{value:t}=a,{value:n}=i;return e(`span`,{class:`${s.value}-input-word-count`},E(r.default,{value:n===null||Array.isArray(n)?``:n},()=>[t===void 0?l.value:`${l.value} / ${t}`]))}}}),R=c({name:`Input`,props:Object.assign(Object.assign({},y.props),{bordered:{type:Boolean,default:void 0},type:{type:String,default:`text`},placeholder:[Array,String],defaultValue:{type:[String,Array],default:null},value:[String,Array],disabled:{type:Boolean,default:void 0},size:String,rows:{type:[Number,String],default:3},round:Boolean,minlength:[String,Number],maxlength:[String,Number],clearable:Boolean,autosize:{type:[Boolean,Object],default:!1},pair:Boolean,separator:String,readonly:{type:[String,Boolean],default:!1},passivelyActivated:Boolean,showPasswordOn:String,stateful:{type:Boolean,default:!0},autofocus:Boolean,inputProps:Object,resizable:{type:Boolean,default:!0},showCount:Boolean,loading:{type:Boolean,default:void 0},allowInput:Function,renderCount:Function,onMousedown:Function,onKeydown:Function,onKeyup:[Function,Array],onInput:[Function,Array],onFocus:[Function,Array],onBlur:[Function,Array],onClick:[Function,Array],onChange:[Function,Array],onClear:[Function,Array],countGraphemes:Function,status:String,"onUpdate:value":[Function,Array],onUpdateValue:[Function,Array],textDecoration:[String,Array],attrSize:{type:Number,default:20},onInputBlur:[Function,Array],onInputFocus:[Function,Array],onDeactivate:[Function,Array],onActivate:[Function,Array],onWrapperFocus:[Function,Array],onWrapperBlur:[Function,Array],internalDeactivateOnEnter:Boolean,internalForceFocus:Boolean,internalLoadingBeforeSuffix:{type:Boolean,default:!0},showPasswordToggle:Boolean}),slots:Object,setup(e){let{mergedClsPrefixRef:n,mergedBorderedRef:c,inlineThemeDisabled:l,mergedRtlRef:p,mergedComponentPropsRef:m}=te(e),h=y(`Input`,`-input`,de,ue,e,n);le&&ce(`-input-safari`,fe,n);let g=d(null),_=d(null),v=d(null),b=d(null),x=d(null),S=d(null),E=d(null),D=pe(E),O=d(null),{localeRef:A}=se(`Input`),j=d(e.defaultValue),M=ae(f(e,`value`),j),N=oe(e,{mergedSize:t=>{var n,r;let{size:i}=e;if(i)return i;let{mergedSize:a}=t||{};return a!=null&&a.value?a.value:((r=(n=m==null?void 0:m.value)==null?void 0:n.Input)==null?void 0:r.size)||`medium`}}),{mergedSizeRef:F,mergedDisabledRef:L,mergedStatusRef:R}=N,z=d(!1),B=d(!1),V=d(!1),H=d(!1),U=null,W=o(()=>{let{placeholder:t,pair:n}=e;return n?Array.isArray(t)?t:t===void 0?[``,``]:[t,t]:t===void 0?[A.value.placeholder]:[t]}),me=o(()=>{let{value:e}=V,{value:t}=M,{value:n}=W;return!e&&(I(t)||Array.isArray(t)&&I(t[0]))&&n[0]}),he=o(()=>{let{value:e}=V,{value:t}=M,{value:n}=W;return!e&&n[1]&&(I(t)||Array.isArray(t)&&I(t[1]))}),G=T(()=>e.internalForceFocus||z.value),ge=T(()=>{if(L.value||e.readonly||!e.clearable||!G.value&&!B.value)return!1;let{value:t}=M,{value:n}=G;return e.pair?!!(Array.isArray(t)&&(t[0]||t[1]))&&(B.value||n):!!t&&(B.value||n)}),K=o(()=>{let{showPasswordOn:t}=e;if(t)return t;if(e.showPasswordToggle)return`click`}),q=d(!1),_e=o(()=>{let{textDecoration:t}=e;return t?Array.isArray(t)?t.map(e=>({textDecoration:e})):[{textDecoration:t}]:[``,``]}),ve=d(void 0),ye=()=>{var t,n;if(e.type===`textarea`){let{autosize:r}=e;if(r&&(ve.value=(n=(t=O.value)==null?void 0:t.$el)==null?void 0:n.offsetWidth),!_.value||typeof r==`boolean`)return;let{paddingTop:i,paddingBottom:a,lineHeight:o}=window.getComputedStyle(_.value),s=Number(i.slice(0,-2)),c=Number(a.slice(0,-2)),l=Number(o.slice(0,-2)),{value:u}=v;if(!u)return;if(r.minRows){let e=Math.max(r.minRows,1),t=`${s+c+l*e}px`;u.style.minHeight=t}if(r.maxRows){let e=`${s+c+l*r.maxRows}px`;u.style.maxHeight=e}}},be=o(()=>{let{maxlength:t}=e;return t===void 0?void 0:Number(t)});a(()=>{let{value:e}=M;Array.isArray(e)||rt(e)});let xe=r().proxy;function J(t,n){let{onUpdateValue:r,"onUpdate:value":i,onInput:a}=e,{nTriggerFormInput:o}=N;r&&k(r,t,n),i&&k(i,t,n),a&&k(a,t,n),j.value=t,o()}function Y(t,n){let{onChange:r}=e,{nTriggerFormChange:i}=N;r&&k(r,t,n),j.value=t,i()}function Se(t){let{onBlur:n}=e,{nTriggerFormBlur:r}=N;n&&k(n,t),r()}function Ce(t){let{onFocus:n}=e,{nTriggerFormFocus:r}=N;n&&k(n,t),r()}function we(t){let{onClear:n}=e;n&&k(n,t)}function Te(t){let{onInputBlur:n}=e;n&&k(n,t)}function Ee(t){let{onInputFocus:n}=e;n&&k(n,t)}function De(){let{onDeactivate:t}=e;t&&k(t)}function Oe(){let{onActivate:t}=e;t&&k(t)}function ke(t){let{onClick:n}=e;n&&k(n,t)}function Ae(t){let{onWrapperFocus:n}=e;n&&k(n,t)}function je(t){let{onWrapperBlur:n}=e;n&&k(n,t)}function Me(){V.value=!0}function Ne(e){V.value=!1,e.target===S.value?X(e,1):X(e,0)}function X(t,n=0,r=`input`){let i=t.target.value;if(rt(i),t instanceof InputEvent&&!t.isComposing&&(V.value=!1),e.type===`textarea`){let{value:e}=O;e&&e.syncUnifiedContainer()}if(U=i,V.value)return;D.recordCursor();let a=Pe(i);if(a)if(!e.pair)r===`input`?J(i,{source:n}):Y(i,{source:n});else{let{value:e}=M;e=Array.isArray(e)?[e[0],e[1]]:[``,``],e[n]=i,r===`input`?J(e,{source:n}):Y(e,{source:n})}xe.$forceUpdate(),a||u(D.restoreCursor)}function Pe(t){let{countGraphemes:n,maxlength:r,minlength:i}=e;if(n){let e;if(r!==void 0&&(e===void 0&&(e=n(t)),e>Number(r))||i!==void 0&&(e===void 0&&(e=n(t)),e<Number(r)))return!1}let{allowInput:a}=e;return typeof a!=`function`||a(t)}function Fe(e){Te(e),e.relatedTarget===g.value&&De(),e.relatedTarget!==null&&(e.relatedTarget===x.value||e.relatedTarget===S.value||e.relatedTarget===_.value)||(H.value=!1),Z(e,`blur`),E.value=null}function Ie(e,t){Ee(e),z.value=!0,H.value=!0,Oe(),Z(e,`focus`),t===0?E.value=x.value:t===1?E.value=S.value:t===2&&(E.value=_.value)}function Le(t){e.passivelyActivated&&(je(t),Z(t,`blur`))}function Re(t){e.passivelyActivated&&(z.value=!0,Ae(t),Z(t,`focus`))}function Z(e,t){e.relatedTarget!==null&&(e.relatedTarget===x.value||e.relatedTarget===S.value||e.relatedTarget===_.value||e.relatedTarget===g.value)||(t===`focus`?(Ce(e),z.value=!0):t===`blur`&&(Se(e),z.value=!1))}function ze(e,t){X(e,t,`change`)}function Be(e){ke(e)}function Ve(e){we(e),He()}function He(){e.pair?(J([``,``],{source:`clear`}),Y([``,``],{source:`clear`})):(J(``,{source:`clear`}),Y(``,{source:`clear`}))}function Ue(t){let{onMousedown:n}=e;n&&n(t);let{tagName:r}=t.target;if(r!==`INPUT`&&r!==`TEXTAREA`){if(e.resizable){let{value:e}=g;if(e){let{left:n,top:r,width:i,height:a}=e.getBoundingClientRect();if(n+i-14<t.clientX&&t.clientX<n+i&&r+a-14<t.clientY&&t.clientY<r+a)return}}t.preventDefault(),z.value||Ze()}}function We(){var t;B.value=!0,e.type===`textarea`&&((t=O.value)==null||t.handleMouseEnterWrapper())}function Ge(){var t;B.value=!1,e.type===`textarea`&&((t=O.value)==null||t.handleMouseLeaveWrapper())}function Ke(){L.value||K.value===`click`&&(q.value=!q.value)}function qe(e){if(L.value)return;e.preventDefault();let t=e=>{e.preventDefault(),w(`mouseup`,document,t)};if(C(`mouseup`,document,t),K.value!==`mousedown`)return;q.value=!0;let n=()=>{q.value=!1,w(`mouseup`,document,n)};C(`mouseup`,document,n)}function Je(t){e.onKeyup&&k(e.onKeyup,t)}function Ye(t){switch(e.onKeydown&&k(e.onKeydown,t),t.key){case`Escape`:Q();break;case`Enter`:Xe(t);break}}function Xe(t){var n,r;if(e.passivelyActivated){let{value:i}=H;if(i){e.internalDeactivateOnEnter&&Q();return}t.preventDefault(),e.type===`textarea`?(n=_.value)==null||n.focus():(r=x.value)==null||r.focus()}}function Q(){e.passivelyActivated&&(H.value=!1,u(()=>{var e;(e=g.value)==null||e.focus()}))}function Ze(){var t,n,r;L.value||(e.passivelyActivated?(t=g.value)==null||t.focus():((n=_.value)==null||n.focus(),(r=x.value)==null||r.focus()))}function Qe(){var e;(e=g.value)!=null&&e.contains(document.activeElement)&&document.activeElement.blur()}function $e(){var e,t;(e=_.value)==null||e.select(),(t=x.value)==null||t.select()}function et(){L.value||(_.value?_.value.focus():x.value&&x.value.focus())}function tt(){let{value:e}=g;e!=null&&e.contains(document.activeElement)&&e!==document.activeElement&&Q()}function nt(t){if(e.type===`textarea`){let{value:e}=_;e==null||e.scrollTo(t)}else{let{value:e}=x;e==null||e.scrollTo(t)}}function rt(t){let{type:n,pair:r,autosize:i}=e;if(!r&&i)if(n===`textarea`){let{value:e}=v;e&&(e.textContent=`${t==null?``:t}\r\n`)}else{let{value:e}=b;e&&(t?e.textContent=t:e.innerHTML=`&nbsp;`)}}function it(){ye()}let at=d({top:`0`});function ot(e){var t;let{scrollTop:n}=e.target;at.value.top=`${-n}px`,(t=O.value)==null||t.syncUnifiedContainer()}let st=null;i(()=>{let{autosize:n,type:r}=e;n&&r===`textarea`?st=t(M,e=>{!Array.isArray(e)&&e!==U&&rt(e)}):st==null||st()});let ct=null;i(()=>{e.type===`textarea`?ct=t(M,e=>{var t;!Array.isArray(e)&&e!==U&&((t=O.value)==null||t.syncUnifiedContainer())}):ct==null||ct()}),s(P,{mergedValueRef:M,maxlengthRef:be,mergedClsPrefixRef:n,countGraphemesRef:f(e,`countGraphemes`)});let lt={wrapperElRef:g,inputElRef:x,textareaElRef:_,isCompositing:V,clear:He,focus:Ze,blur:Qe,select:$e,deactivate:tt,activate:et,scrollTo:nt},ut=ne(`Input`,p,n),dt=o(()=>{let{value:e}=F,{common:{cubicBezierEaseInOut:t},self:{color:n,borderRadius:r,textColor:i,caretColor:a,caretColorError:o,caretColorWarning:s,textDecorationColor:c,border:l,borderDisabled:u,borderHover:d,borderFocus:f,placeholderColor:p,placeholderColorDisabled:m,lineHeightTextarea:g,colorDisabled:_,colorFocus:v,textColorDisabled:te,boxShadowFocus:y,iconSize:ne,colorFocusWarning:b,boxShadowFocusWarning:x,borderWarning:S,borderFocusWarning:ie,borderHoverWarning:C,colorFocusError:w,boxShadowFocusError:T,borderError:ae,borderFocusError:E,borderHoverError:D,clearSize:O,clearColor:k,clearColorHover:oe,clearColorPressed:se,iconColor:ce,iconColorDisabled:A,suffixTextColor:j,countTextColor:M,countTextColorDisabled:le,iconColorHover:ue,iconColorPressed:N,loadingColor:P,loadingColorError:de,loadingColorWarning:fe,fontWeight:I,[ee(`padding`,e)]:pe,[ee(`fontSize`,e)]:L,[ee(`height`,e)]:R}}=h.value,{left:z,right:B}=re(pe);return{"--n-bezier":t,"--n-count-text-color":M,"--n-count-text-color-disabled":le,"--n-color":n,"--n-font-size":L,"--n-font-weight":I,"--n-border-radius":r,"--n-height":R,"--n-padding-left":z,"--n-padding-right":B,"--n-text-color":i,"--n-caret-color":a,"--n-text-decoration-color":c,"--n-border":l,"--n-border-disabled":u,"--n-border-hover":d,"--n-border-focus":f,"--n-placeholder-color":p,"--n-placeholder-color-disabled":m,"--n-icon-size":ne,"--n-line-height-textarea":g,"--n-color-disabled":_,"--n-color-focus":v,"--n-text-color-disabled":te,"--n-box-shadow-focus":y,"--n-loading-color":P,"--n-caret-color-warning":s,"--n-color-focus-warning":b,"--n-box-shadow-focus-warning":x,"--n-border-warning":S,"--n-border-focus-warning":ie,"--n-border-hover-warning":C,"--n-loading-color-warning":fe,"--n-caret-color-error":o,"--n-color-focus-error":w,"--n-box-shadow-focus-error":T,"--n-border-error":ae,"--n-border-focus-error":E,"--n-border-hover-error":D,"--n-loading-color-error":de,"--n-clear-color":k,"--n-clear-size":O,"--n-clear-color-hover":oe,"--n-clear-color-pressed":se,"--n-icon-color":ce,"--n-icon-color-hover":ue,"--n-icon-color-pressed":N,"--n-icon-color-disabled":A,"--n-suffix-text-color":j}}),$=l?ie(`input`,o(()=>{let{value:e}=F;return e[0]}),dt,e):void 0;return Object.assign(Object.assign({},lt),{wrapperElRef:g,inputElRef:x,inputMirrorElRef:b,inputEl2Ref:S,textareaElRef:_,textareaMirrorElRef:v,textareaScrollbarInstRef:O,rtlEnabled:ut,uncontrolledValue:j,mergedValue:M,passwordVisible:q,mergedPlaceholder:W,showPlaceholder1:me,showPlaceholder2:he,mergedFocus:G,isComposing:V,activated:H,showClearButton:ge,mergedSize:F,mergedDisabled:L,textDecorationStyle:_e,mergedClsPrefix:n,mergedBordered:c,mergedShowPasswordOn:K,placeholderStyle:at,mergedStatus:R,textAreaScrollContainerWidth:ve,handleTextAreaScroll:ot,handleCompositionStart:Me,handleCompositionEnd:Ne,handleInput:X,handleInputBlur:Fe,handleInputFocus:Ie,handleWrapperBlur:Le,handleWrapperFocus:Re,handleMouseEnter:We,handleMouseLeave:Ge,handleMouseDown:Ue,handleChange:ze,handleClick:Be,handleClear:Ve,handlePasswordToggleClick:Ke,handlePasswordToggleMousedown:qe,handleWrapperKeydown:Ye,handleWrapperKeyup:Je,handleTextAreaMirrorResize:it,getTextareaScrollContainer:()=>_.value,mergedTheme:h,cssVars:l?void 0:dt,themeClass:$==null?void 0:$.themeClass,onRender:$==null?void 0:$.onRender})},render(){var t,n,r,i,a,o,s;let{mergedClsPrefix:c,mergedStatus:u,themeClass:d,type:f,countGraphemes:p,onRender:m}=this,h=this.$slots;return m==null||m(),e(`div`,{ref:`wrapperElRef`,class:[`${c}-input`,`${c}-input--${this.mergedSize}-size`,d,u&&`${c}-input--${u}-status`,{[`${c}-input--rtl`]:this.rtlEnabled,[`${c}-input--disabled`]:this.mergedDisabled,[`${c}-input--textarea`]:f===`textarea`,[`${c}-input--resizable`]:this.resizable&&!this.autosize,[`${c}-input--autosize`]:this.autosize,[`${c}-input--round`]:this.round&&f!==`textarea`,[`${c}-input--pair`]:this.pair,[`${c}-input--focus`]:this.mergedFocus,[`${c}-input--stateful`]:this.stateful}],style:this.cssVars,tabindex:!this.mergedDisabled&&this.passivelyActivated&&!this.activated?0:void 0,onFocus:this.handleWrapperFocus,onBlur:this.handleWrapperBlur,onClick:this.handleClick,onMousedown:this.handleMouseDown,onMouseenter:this.handleMouseEnter,onMouseleave:this.handleMouseLeave,onCompositionstart:this.handleCompositionStart,onCompositionend:this.handleCompositionEnd,onKeyup:this.handleWrapperKeyup,onKeydown:this.handleWrapperKeydown},e(`div`,{class:`${c}-input-wrapper`},O(h.prefix,t=>t&&e(`div`,{class:`${c}-input__prefix`},t)),f===`textarea`?e(S,{ref:`textareaScrollbarInstRef`,class:`${c}-input__textarea`,container:this.getTextareaScrollContainer,theme:(n=(t=this.theme)==null?void 0:t.peers)==null?void 0:n.Scrollbar,themeOverrides:(i=(r=this.themeOverrides)==null?void 0:r.peers)==null?void 0:i.Scrollbar,triggerDisplayManually:!0,useUnifiedContainer:!0,internalHoistYRail:!0},{default:()=>{var t,n;let{textAreaScrollContainerWidth:r}=this,i={width:this.autosize&&r&&`${r}px`};return e(l,null,e(`textarea`,Object.assign({},this.inputProps,{ref:`textareaElRef`,class:[`${c}-input__textarea-el`,(t=this.inputProps)==null?void 0:t.class],autofocus:this.autofocus,rows:Number(this.rows),placeholder:this.placeholder,value:this.mergedValue,disabled:this.mergedDisabled,maxlength:p?void 0:this.maxlength,minlength:p?void 0:this.minlength,readonly:this.readonly,tabindex:this.passivelyActivated&&!this.activated?-1:void 0,style:[this.textDecorationStyle[0],(n=this.inputProps)==null?void 0:n.style,i],onBlur:this.handleInputBlur,onFocus:e=>{this.handleInputFocus(e,2)},onInput:this.handleInput,onChange:this.handleChange,onScroll:this.handleTextAreaScroll})),this.showPlaceholder1?e(`div`,{class:`${c}-input__placeholder`,style:[this.placeholderStyle,i],key:`placeholder`},this.mergedPlaceholder[0]):null,this.autosize?e(b,{onResize:this.handleTextAreaMirrorResize},{default:()=>e(`div`,{ref:`textareaMirrorElRef`,class:`${c}-input__textarea-mirror`,key:`mirror`})}):null)}}):e(`div`,{class:`${c}-input__input`},e(`input`,Object.assign({type:f===`password`&&this.mergedShowPasswordOn&&this.passwordVisible?`text`:f},this.inputProps,{ref:`inputElRef`,class:[`${c}-input__input-el`,(a=this.inputProps)==null?void 0:a.class],style:[this.textDecorationStyle[0],(o=this.inputProps)==null?void 0:o.style],tabindex:this.passivelyActivated&&!this.activated?-1:(s=this.inputProps)==null?void 0:s.tabindex,placeholder:this.mergedPlaceholder[0],disabled:this.mergedDisabled,maxlength:p?void 0:this.maxlength,minlength:p?void 0:this.minlength,value:Array.isArray(this.mergedValue)?this.mergedValue[0]:this.mergedValue,readonly:this.readonly,autofocus:this.autofocus,size:this.attrSize,onBlur:this.handleInputBlur,onFocus:e=>{this.handleInputFocus(e,0)},onInput:e=>{this.handleInput(e,0)},onChange:e=>{this.handleChange(e,0)}})),this.showPlaceholder1?e(`div`,{class:`${c}-input__placeholder`},e(`span`,null,this.mergedPlaceholder[0])):null,this.autosize?e(`div`,{class:`${c}-input__input-mirror`,key:`mirror`,ref:`inputMirrorElRef`},`\xA0`):null),!this.pair&&O(h.suffix,t=>t||this.clearable||this.showCount||this.mergedShowPasswordOn||this.loading!==void 0?e(`div`,{class:`${c}-input__suffix`},[O(h[`clear-icon-placeholder`],t=>(this.clearable||t)&&e(A,{clsPrefix:c,show:this.showClearButton,onClear:this.handleClear},{placeholder:()=>t,icon:()=>{var e,t;return(t=(e=this.$slots)[`clear-icon`])==null?void 0:t.call(e)}})),this.internalLoadingBeforeSuffix?null:t,this.loading===void 0?null:e(j,{clsPrefix:c,loading:this.loading,showArrow:!1,showClear:!1,style:this.cssVars}),this.internalLoadingBeforeSuffix?t:null,this.showCount&&this.type!==`textarea`?e(L,null,{default:e=>{var t;let{renderCount:n}=this;return n?n(e):(t=h.count)==null?void 0:t.call(h,e)}}):null,this.mergedShowPasswordOn&&this.type===`password`?e(`div`,{class:`${c}-input__eye`,onMousedown:this.handlePasswordToggleMousedown,onClick:this.handlePasswordToggleClick},this.passwordVisible?D(h[`password-visible-icon`],()=>[e(x,{clsPrefix:c},{default:()=>e(M,null)})]):D(h[`password-invisible-icon`],()=>[e(x,{clsPrefix:c},{default:()=>e(N,null)})])):null]):null)),this.pair?e(`span`,{class:`${c}-input__separator`},D(h.separator,()=>[this.separator])):null,this.pair?e(`div`,{class:`${c}-input-wrapper`},e(`div`,{class:`${c}-input__input`},e(`input`,{ref:`inputEl2Ref`,type:this.type,class:`${c}-input__input-el`,tabindex:this.passivelyActivated&&!this.activated?-1:void 0,placeholder:this.mergedPlaceholder[1],disabled:this.mergedDisabled,maxlength:p?void 0:this.maxlength,minlength:p?void 0:this.minlength,value:Array.isArray(this.mergedValue)?this.mergedValue[1]:void 0,readonly:this.readonly,style:this.textDecorationStyle[1],onBlur:this.handleInputBlur,onFocus:e=>{this.handleInputFocus(e,1)},onInput:e=>{this.handleInput(e,1)},onChange:e=>{this.handleChange(e,1)}}),this.showPlaceholder2?e(`div`,{class:`${c}-input__placeholder`},e(`span`,null,this.mergedPlaceholder[1])):null),O(h.suffix,t=>(this.clearable||t)&&e(`div`,{class:`${c}-input__suffix`},[this.clearable&&e(A,{clsPrefix:c,show:this.showClearButton,onClear:this.handleClear},{icon:()=>{var e;return(e=h[`clear-icon`])==null?void 0:e.call(h)},placeholder:()=>{var e;return(e=h[`clear-icon-placeholder`])==null?void 0:e.call(h)}}),t]))):null,this.mergedBordered?e(`div`,{class:`${c}-input__border`}):null,this.mergedBordered?e(`div`,{class:`${c}-input__state-border`}):null,this.showCount&&f===`textarea`?e(L,null,{default:e=>{var t;let{renderCount:n}=this;return n?n(e):(t=h.count)==null?void 0:t.call(h,e)}}):null)}});export{R as t};