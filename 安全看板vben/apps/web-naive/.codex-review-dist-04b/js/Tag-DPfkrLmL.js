import{B as e,g as t,gt as n,k as r,vn as i,wn as a}from"./runtime-core.esm-bundler-Blp3D1W4.js";import{B as o,F as s,H as c,L as l,R as u,U as d,V as f,j as p,n as m}from"./use-theme-BPxAT0OQ.js";import{t as h}from"./use-rtl-BtnaqIOl.js";import{s as g}from"./Scrollbar-CWE-8E6x.js";import{r as _}from"./css-DEmdllcC.js";import{n as v}from"./light-DZKN5sjf.js";import{t as y}from"./color-to-class-G4jmrDIg.js";import{a as b,o as x}from"./resolve-slot-DbAlC7Z4.js";import{t as S}from"./use-locale-JIz5NweQ.js";import{t as C}from"./Close-BaKf5mos.js";import{r as w,t as T}from"./light-su370HQQ.js";var E=r({name:`Empty`,render(){return e(`svg`,{viewBox:`0 0 28 28`,fill:`none`,xmlns:`http://www.w3.org/2000/svg`},e(`path`,{d:`M26 7.5C26 11.0899 23.0899 14 19.5 14C15.9101 14 13 11.0899 13 7.5C13 3.91015 15.9101 1 19.5 1C23.0899 1 26 3.91015 26 7.5ZM16.8536 4.14645C16.6583 3.95118 16.3417 3.95118 16.1464 4.14645C15.9512 4.34171 15.9512 4.65829 16.1464 4.85355L18.7929 7.5L16.1464 10.1464C15.9512 10.3417 15.9512 10.6583 16.1464 10.8536C16.3417 11.0488 16.6583 11.0488 16.8536 10.8536L19.5 8.20711L22.1464 10.8536C22.3417 11.0488 22.6583 11.0488 22.8536 10.8536C23.0488 10.6583 23.0488 10.3417 22.8536 10.1464L20.2071 7.5L22.8536 4.85355C23.0488 4.65829 23.0488 4.34171 22.8536 4.14645C22.6583 3.95118 22.3417 3.95118 22.1464 4.14645L19.5 6.79289L16.8536 4.14645Z`,fill:`currentColor`}),e(`path`,{d:`M25 22.75V12.5991C24.5572 13.0765 24.053 13.4961 23.5 13.8454V16H17.5L17.3982 16.0068C17.0322 16.0565 16.75 16.3703 16.75 16.75C16.75 18.2688 15.5188 19.5 14 19.5C12.4812 19.5 11.25 18.2688 11.25 16.75L11.2432 16.6482C11.1935 16.2822 10.8797 16 10.5 16H4.5V7.25C4.5 6.2835 5.2835 5.5 6.25 5.5H12.2696C12.4146 4.97463 12.6153 4.47237 12.865 4H6.25C4.45507 4 3 5.45507 3 7.25V22.75C3 24.5449 4.45507 26 6.25 26H21.75C23.5449 26 25 24.5449 25 22.75ZM4.5 22.75V17.5H9.81597L9.85751 17.7041C10.2905 19.5919 11.9808 21 14 21L14.215 20.9947C16.2095 20.8953 17.842 19.4209 18.184 17.5H23.5V22.75C23.5 23.7165 22.7165 24.5 21.75 24.5H6.25C5.2835 24.5 4.5 23.7165 4.5 22.75Z`,fill:`currentColor`}))}}),D=u(`empty`,`
 display: flex;
 flex-direction: column;
 align-items: center;
 font-size: var(--n-font-size);
`,[o(`icon`,`
 width: var(--n-icon-size);
 height: var(--n-icon-size);
 font-size: var(--n-icon-size);
 line-height: var(--n-icon-size);
 color: var(--n-icon-color);
 transition:
 color .3s var(--n-bezier);
 `,[l(`+`,[o(`description`,`
 margin-top: 8px;
 `)])]),o(`description`,`
 transition: color .3s var(--n-bezier);
 color: var(--n-text-color);
 `),o(`extra`,`
 text-align: center;
 transition: color .3s var(--n-bezier);
 margin-top: 12px;
 color: var(--n-extra-text-color);
 `)]),O=r({name:`Empty`,props:Object.assign(Object.assign({},m.props),{description:String,showDescription:{type:Boolean,default:!0},showIcon:{type:Boolean,default:!0},size:{type:String,default:`medium`},renderIcon:Function}),slots:Object,setup(n){let{mergedClsPrefixRef:r,inlineThemeDisabled:i,mergedComponentPropsRef:a}=p(n),o=m(`Empty`,`-empty`,D,w,n,r),{localeRef:s}=S(`Empty`),c=t(()=>{var e,t,r;return(e=n.description)==null?(r=(t=a==null?void 0:a.value)==null?void 0:t.Empty)==null?void 0:r.description:e}),l=t(()=>{var t,n;return((n=(t=a==null?void 0:a.value)==null?void 0:t.Empty)==null?void 0:n.renderIcon)||(()=>e(E,null))}),u=t(()=>{let{size:e}=n,{common:{cubicBezierEaseInOut:t},self:{[d(`iconSize`,e)]:r,[d(`fontSize`,e)]:i,textColor:a,iconColor:s,extraTextColor:c}}=o.value;return{"--n-icon-size":r,"--n-font-size":i,"--n-bezier":t,"--n-text-color":a,"--n-icon-color":s,"--n-extra-text-color":c}}),f=i?v(`empty`,t(()=>{let e=``,{size:t}=n;return e+=t[0],e}),u,n):void 0;return{mergedClsPrefix:r,mergedRenderIcon:l,localizedDescription:t(()=>c.value||s.value.description),cssVars:i?void 0:u,themeClass:f==null?void 0:f.themeClass,onRender:f==null?void 0:f.onRender}},render(){let{$slots:t,mergedClsPrefix:n,onRender:r}=this;return r==null||r(),e(`div`,{class:[`${n}-empty`,this.themeClass],style:this.cssVars},this.showIcon?e(`div`,{class:`${n}-empty__icon`},t.icon?t.icon():e(g,{clsPrefix:n},{default:this.mergedRenderIcon})):null,this.showDescription?e(`div`,{class:`${n}-empty__description`},t.default?t.default():this.localizedDescription):null,t.extra?e(`div`,{class:`${n}-empty__extra`},t.extra()):null)}}),k={color:Object,type:{type:String,default:`default`},round:Boolean,size:String,closable:Boolean,disabled:{type:Boolean,default:void 0}},A=u(`tag`,`
 --n-close-margin: var(--n-close-margin-top) var(--n-close-margin-right) var(--n-close-margin-bottom) var(--n-close-margin-left);
 white-space: nowrap;
 position: relative;
 box-sizing: border-box;
 cursor: default;
 display: inline-flex;
 align-items: center;
 flex-wrap: nowrap;
 padding: var(--n-padding);
 border-radius: var(--n-border-radius);
 color: var(--n-text-color);
 background-color: var(--n-color);
 transition: 
 border-color .3s var(--n-bezier),
 background-color .3s var(--n-bezier),
 color .3s var(--n-bezier),
 box-shadow .3s var(--n-bezier),
 opacity .3s var(--n-bezier);
 line-height: 1;
 height: var(--n-height);
 font-size: var(--n-font-size);
`,[f(`strong`,`
 font-weight: var(--n-font-weight-strong);
 `),o(`border`,`
 pointer-events: none;
 position: absolute;
 left: 0;
 right: 0;
 top: 0;
 bottom: 0;
 border-radius: inherit;
 border: var(--n-border);
 transition: border-color .3s var(--n-bezier);
 `),o(`icon`,`
 display: flex;
 margin: 0 4px 0 0;
 color: var(--n-text-color);
 transition: color .3s var(--n-bezier);
 font-size: var(--n-avatar-size-override);
 `),o(`avatar`,`
 display: flex;
 margin: 0 6px 0 0;
 `),o(`close`,`
 margin: var(--n-close-margin);
 transition:
 background-color .3s var(--n-bezier),
 color .3s var(--n-bezier);
 `),f(`round`,`
 padding: 0 calc(var(--n-height) / 3);
 border-radius: calc(var(--n-height) / 2);
 `,[o(`icon`,`
 margin: 0 4px 0 calc((var(--n-height) - 8px) / -2);
 `),o(`avatar`,`
 margin: 0 6px 0 calc((var(--n-height) - 8px) / -2);
 `),f(`closable`,`
 padding: 0 calc(var(--n-height) / 4) 0 calc(var(--n-height) / 3);
 `)]),f(`icon, avatar`,[f(`round`,`
 padding: 0 calc(var(--n-height) / 3) 0 calc(var(--n-height) / 2);
 `)]),f(`disabled`,`
 cursor: not-allowed !important;
 opacity: var(--n-opacity-disabled);
 `),f(`checkable`,`
 cursor: pointer;
 box-shadow: none;
 color: var(--n-text-color-checkable);
 background-color: var(--n-color-checkable);
 `,[c(`disabled`,[l(`&:hover`,`background-color: var(--n-color-hover-checkable);`,[c(`checked`,`color: var(--n-text-color-hover-checkable);`)]),l(`&:active`,`background-color: var(--n-color-pressed-checkable);`,[c(`checked`,`color: var(--n-text-color-pressed-checkable);`)])]),f(`checked`,`
 color: var(--n-text-color-checked);
 background-color: var(--n-color-checked);
 `,[c(`disabled`,[l(`&:hover`,`background-color: var(--n-color-checked-hover);`),l(`&:active`,`background-color: var(--n-color-checked-pressed);`)])])])]),j=Object.assign(Object.assign(Object.assign({},m.props),k),{bordered:{type:Boolean,default:void 0},checked:Boolean,checkable:Boolean,strong:Boolean,triggerClickOnClose:Boolean,onClose:[Array,Function],onMouseenter:Function,onMouseleave:Function,"onUpdate:checked":Function,onUpdateChecked:Function,internalCloseFocusable:{type:Boolean,default:!0},internalCloseIsButtonTag:{type:Boolean,default:!0},onCheckedChange:Function}),M=s(`n-tag`),N=r({name:`Tag`,props:j,slots:Object,setup(e){let r=i(null),{mergedBorderedRef:o,mergedClsPrefixRef:s,inlineThemeDisabled:c,mergedRtlRef:l,mergedComponentPropsRef:u}=p(e),f=t(()=>{var t,n;return e.size||((n=(t=u==null?void 0:u.value)==null?void 0:t.Tag)==null?void 0:n.size)||`medium`}),g=m(`Tag`,`-tag`,A,T,e,s);n(M,{roundRef:a(e,`round`)});function b(){if(!e.disabled&&e.checkable){let{checked:t,onCheckedChange:n,onUpdateChecked:r,"onUpdate:checked":i}=e;r&&r(!t),i&&i(!t),n&&n(!t)}}function S(t){if(e.triggerClickOnClose||t.stopPropagation(),!e.disabled){let{onClose:n}=e;n&&x(n,t)}}let C={setTextContent(e){let{value:t}=r;t&&(t.textContent=e)}},w=h(`Tag`,l,s),E=t(()=>{let{type:t,color:{color:n,textColor:r}={}}=e,i=f.value,{common:{cubicBezierEaseInOut:a},self:{padding:s,closeMargin:c,borderRadius:l,opacityDisabled:u,textColorCheckable:p,textColorHoverCheckable:m,textColorPressedCheckable:h,textColorChecked:v,colorCheckable:y,colorHoverCheckable:b,colorPressedCheckable:x,colorChecked:S,colorCheckedHover:C,colorCheckedPressed:w,closeBorderRadius:T,fontWeightStrong:E,[d(`colorBordered`,t)]:D,[d(`closeSize`,i)]:O,[d(`closeIconSize`,i)]:k,[d(`fontSize`,i)]:A,[d(`height`,i)]:j,[d(`color`,t)]:M,[d(`textColor`,t)]:N,[d(`border`,t)]:P,[d(`closeIconColor`,t)]:F,[d(`closeIconColorHover`,t)]:I,[d(`closeIconColorPressed`,t)]:L,[d(`closeColorHover`,t)]:R,[d(`closeColorPressed`,t)]:z}}=g.value,B=_(c);return{"--n-font-weight-strong":E,"--n-avatar-size-override":`calc(${j} - 8px)`,"--n-bezier":a,"--n-border-radius":l,"--n-border":P,"--n-close-icon-size":k,"--n-close-color-pressed":z,"--n-close-color-hover":R,"--n-close-border-radius":T,"--n-close-icon-color":F,"--n-close-icon-color-hover":I,"--n-close-icon-color-pressed":L,"--n-close-icon-color-disabled":F,"--n-close-margin-top":B.top,"--n-close-margin-right":B.right,"--n-close-margin-bottom":B.bottom,"--n-close-margin-left":B.left,"--n-close-size":O,"--n-color":n||(o.value?D:M),"--n-color-checkable":y,"--n-color-checked":S,"--n-color-checked-hover":C,"--n-color-checked-pressed":w,"--n-color-hover-checkable":b,"--n-color-pressed-checkable":x,"--n-font-size":A,"--n-height":j,"--n-opacity-disabled":u,"--n-padding":s,"--n-text-color":r||N,"--n-text-color-checkable":p,"--n-text-color-checked":v,"--n-text-color-hover-checkable":m,"--n-text-color-pressed-checkable":h}}),D=c?v(`tag`,t(()=>{let t=``,{type:n,color:{color:r,textColor:i}={}}=e;return t+=n[0],t+=f.value[0],r&&(t+=`a${y(r)}`),i&&(t+=`b${y(i)}`),o.value&&(t+=`c`),t}),E,e):void 0;return Object.assign(Object.assign({},C),{rtlEnabled:w,mergedClsPrefix:s,contentRef:r,mergedBordered:o,handleClick:b,handleCloseClick:S,cssVars:c?void 0:E,themeClass:D==null?void 0:D.themeClass,onRender:D==null?void 0:D.onRender})},render(){var t,n;let{mergedClsPrefix:r,rtlEnabled:i,closable:a,color:{borderColor:o}={},round:s,onRender:c,$slots:l}=this;c==null||c();let u=b(l.avatar,t=>t&&e(`div`,{class:`${r}-tag__avatar`},t)),d=b(l.icon,t=>t&&e(`div`,{class:`${r}-tag__icon`},t));return e(`div`,{class:[`${r}-tag`,this.themeClass,{[`${r}-tag--rtl`]:i,[`${r}-tag--strong`]:this.strong,[`${r}-tag--disabled`]:this.disabled,[`${r}-tag--checkable`]:this.checkable,[`${r}-tag--checked`]:this.checkable&&this.checked,[`${r}-tag--round`]:s,[`${r}-tag--avatar`]:u,[`${r}-tag--icon`]:d,[`${r}-tag--closable`]:a}],style:this.cssVars,onClick:this.handleClick,onMouseenter:this.onMouseenter,onMouseleave:this.onMouseleave},d||u,e(`span`,{class:`${r}-tag__content`,ref:`contentRef`},(n=(t=this.$slots).default)==null?void 0:n.call(t)),!this.checkable&&a?e(C,{clsPrefix:r,class:`${r}-tag__close`,disabled:this.disabled,onClick:this.handleCloseClick,focusable:this.internalCloseFocusable,round:s,isButtonTag:this.internalCloseIsButtonTag,absolute:!0}):null,!this.checkable&&this.mergedBordered?e(`div`,{class:`${r}-tag__border`,style:{borderColor:o}}):null)}});export{O as n,N as t};