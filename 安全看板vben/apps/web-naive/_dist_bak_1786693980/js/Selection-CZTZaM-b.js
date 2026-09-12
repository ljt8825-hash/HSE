import{B as e,Ht as t,Ut as n,ct as r,g as i,gt as a,it as o,k as s,o as c,tt as l,vn as u,wn as d,xt as f}from"./runtime-core.esm-bundler-Blp3D1W4.js";import{B as p,F as m,H as h,L as g,P as _,R as v,U as y,V as b,j as x,n as S}from"./use-theme-BPxAT0OQ.js";import{t as C}from"./use-rtl-BtnaqIOl.js";import{n as w,r as T}from"./Follower-D2NFgS8R.js";import{d as E,p as D,s as ee}from"./Scrollbar-BGIkiQ6T.js";import{r as te}from"./css-DEmdllcC.js";import{n as O}from"./light-DZKN5sjf.js";import{t as k}from"./Popover-BziH-XFe.js";import{t as A}from"./color-to-class-G4jmrDIg.js";import{o as j,s as M}from"./use-form-item-DMd-WY4m.js";import{n as N,t as P}from"./Close-CVbk4ZWe.js";import{t as F}from"./use-locale-JIz5NweQ.js";import{t as I}from"./Suffix-BP0O5XbA.js";import{a as L,r as R,t as ne}from"./light-Cfng1fO-.js";var z=`v-hidden`,re=w(`[v-hidden]`,{display:`none!important`}),B=s({name:`Overflow`,props:{getCounter:Function,getTail:Function,updateCounter:Function,onUpdateCount:Function,onUpdateOverflow:Function},setup(e,{slots:t}){let n=u(null),i=u(null);function a(r){let{value:a}=n,{getCounter:o,getTail:s}=e,c;if(c=o===void 0?i.value:o(),!a||!c)return;c.hasAttribute(z)&&c.removeAttribute(z);let{children:l}=a;if(r.showAllItemsBeforeCalculate)for(let e of l)e.hasAttribute(z)&&e.removeAttribute(z);let u=a.offsetWidth,d=[],f=t.tail?s==null?void 0:s():null,p=f?f.offsetWidth:0,m=!1,h=a.children.length-+!!t.tail;for(let t=0;t<h-1;++t){if(t<0)continue;let n=l[t];if(m){n.hasAttribute(z)||n.setAttribute(z,``);continue}else n.hasAttribute(z)&&n.removeAttribute(z);let r=n.offsetWidth;if(p+=r,d[t]=r,p>u){let{updateCounter:n}=e;for(let r=t;r>=0;--r){let i=h-1-r;n===void 0?c.textContent=`${i}`:n(i);let a=c.offsetWidth;if(p-=d[r],p+a<=u||r===0){m=!0,t=r-1,f&&(t===-1?(f.style.maxWidth=`${u-a}px`,f.style.boxSizing=`border-box`):f.style.maxWidth=``);let{onUpdateCount:n}=e;n&&n(i);break}}}}let{onUpdateOverflow:g}=e;m?g!==void 0&&g(!0):(g!==void 0&&g(!1),c.setAttribute(z,``))}let o=_();return re.mount({id:`vueuc/overflow`,head:!0,anchorMetaName:T,ssr:o}),r(()=>a({showAllItemsBeforeCalculate:!1})),{selfRef:n,counterRef:i,sync:a}},render(){let{$slots:t}=this;return l(()=>this.sync({showAllItemsBeforeCalculate:!1})),e(`div`,{class:`v-overflow`,ref:`selfRef`},[f(t,`default`),t.counter?t.counter():e(`span`,{style:{display:`inline-block`},ref:`counterRef`}),t.tail?t.tail():null])}});function ie(e,n){n&&(r(()=>{let{value:t}=e;t&&D.registerHandler(t,n)}),t(e,(e,t)=>{t&&D.unregisterHandler(t)},{deep:!1}),o(()=>{let{value:t}=e;t&&D.unregisterHandler(t)}))}function V(e){switch(typeof e){case`string`:return e||void 0;case`number`:return String(e);default:return}}var ae=s({name:`Empty`,render(){return e(`svg`,{viewBox:`0 0 28 28`,fill:`none`,xmlns:`http://www.w3.org/2000/svg`},e(`path`,{d:`M26 7.5C26 11.0899 23.0899 14 19.5 14C15.9101 14 13 11.0899 13 7.5C13 3.91015 15.9101 1 19.5 1C23.0899 1 26 3.91015 26 7.5ZM16.8536 4.14645C16.6583 3.95118 16.3417 3.95118 16.1464 4.14645C15.9512 4.34171 15.9512 4.65829 16.1464 4.85355L18.7929 7.5L16.1464 10.1464C15.9512 10.3417 15.9512 10.6583 16.1464 10.8536C16.3417 11.0488 16.6583 11.0488 16.8536 10.8536L19.5 8.20711L22.1464 10.8536C22.3417 11.0488 22.6583 11.0488 22.8536 10.8536C23.0488 10.6583 23.0488 10.3417 22.8536 10.1464L20.2071 7.5L22.8536 4.85355C23.0488 4.65829 23.0488 4.34171 22.8536 4.14645C22.6583 3.95118 22.3417 3.95118 22.1464 4.14645L19.5 6.79289L16.8536 4.14645Z`,fill:`currentColor`}),e(`path`,{d:`M25 22.75V12.5991C24.5572 13.0765 24.053 13.4961 23.5 13.8454V16H17.5L17.3982 16.0068C17.0322 16.0565 16.75 16.3703 16.75 16.75C16.75 18.2688 15.5188 19.5 14 19.5C12.4812 19.5 11.25 18.2688 11.25 16.75L11.2432 16.6482C11.1935 16.2822 10.8797 16 10.5 16H4.5V7.25C4.5 6.2835 5.2835 5.5 6.25 5.5H12.2696C12.4146 4.97463 12.6153 4.47237 12.865 4H6.25C4.45507 4 3 5.45507 3 7.25V22.75C3 24.5449 4.45507 26 6.25 26H21.75C23.5449 26 25 24.5449 25 22.75ZM4.5 22.75V17.5H9.81597L9.85751 17.7041C10.2905 19.5919 11.9808 21 14 21L14.215 20.9947C16.2095 20.8953 17.842 19.4209 18.184 17.5H23.5V22.75C23.5 23.7165 22.7165 24.5 21.75 24.5H6.25C5.2835 24.5 4.5 23.7165 4.5 22.75Z`,fill:`currentColor`}))}});function H(e){return Array.isArray(e)?e:[e]}var U={STOP:`STOP`};function W(e,t){let n=t(e);e.children!==void 0&&n!==U.STOP&&e.children.forEach(e=>W(e,t))}function G(e,t={}){let{preserveGroup:n=!1}=t,r=[],i=n?e=>{e.isLeaf||(r.push(e.key),a(e.children))}:e=>{e.isLeaf||(e.isGroup||r.push(e.key),a(e.children))};function a(e){e.forEach(i)}return a(e),r}function K(e,t){let{isLeaf:n}=e;return n===void 0?!t(e):n}function q(e){return e.children}function oe(e){return e.key}function J(){return!1}function se(e,t){let{isLeaf:n}=e;return!(n===!1&&!Array.isArray(t(e)))}function ce(e){return e.disabled===!0}function le(e,t){return e.isLeaf===!1&&!Array.isArray(t(e))}function Y(e){var t;return e==null?[]:Array.isArray(e)?e:(t=e.checkedKeys)==null?[]:t}function X(e){var t;return e==null||Array.isArray(e)||(t=e.indeterminateKeys)==null?[]:t}function ue(e,t){let n=new Set(e);return t.forEach(e=>{n.has(e)||n.add(e)}),Array.from(n)}function de(e,t){let n=new Set(e);return t.forEach(e=>{n.has(e)&&n.delete(e)}),Array.from(n)}function fe(e){return(e==null?void 0:e.type)===`group`}function pe(e){let t=new Map;return e.forEach((e,n)=>{t.set(e.key,n)}),e=>{var n;return(n=t.get(e))==null?null:n}}var me=class extends Error{constructor(){super(),this.message=`SubtreeNotLoadedError: checking a subtree whose required nodes are not fully loaded.`}};function he(e,t,n,r){return Q(t.concat(e),n,r,!1)}function ge(e,t){let n=new Set;return e.forEach(e=>{let r=t.treeNodeMap.get(e);if(r!==void 0){let e=r.parent;for(;e!==null&&!(e.disabled||n.has(e.key));)n.add(e.key),e=e.parent}}),n}function _e(e,t,n,r){let i=Q(t,n,r,!1),a=Q(e,n,r,!0),o=ge(e,n),s=[];return i.forEach(e=>{(a.has(e)||o.has(e))&&s.push(e)}),s.forEach(e=>i.delete(e)),i}function Z(e,t){let{checkedKeys:n,keysToCheck:r,keysToUncheck:i,indeterminateKeys:a,cascade:o,leafOnly:s,checkStrategy:c,allowNotLoaded:l}=e;if(!o)return r===void 0?i===void 0?{checkedKeys:Array.from(n),indeterminateKeys:Array.from(a)}:{checkedKeys:de(n,i),indeterminateKeys:Array.from(a)}:{checkedKeys:ue(n,r),indeterminateKeys:Array.from(a)};let{levelTreeNodeMap:u}=t,d;d=i===void 0?r===void 0?Q(n,t,l,!1):he(r,n,t,l):_e(i,n,t,l);let f=c===`parent`,p=c===`child`||s,m=d,h=new Set,g=Math.max.apply(null,Array.from(u.keys()));for(let e=g;e>=0;--e){let t=e===0,n=u.get(e);for(let e of n){if(e.isLeaf)continue;let{key:n,shallowLoaded:r}=e;if(p&&r&&e.children.forEach(e=>{!e.disabled&&!e.isLeaf&&e.shallowLoaded&&m.has(e.key)&&m.delete(e.key)}),e.disabled||!r)continue;let i=!0,a=!1,o=!0;for(let t of e.children){let e=t.key;if(!t.disabled){if(o&&(o=!1),m.has(e))a=!0;else if(h.has(e)){a=!0,i=!1;break}else if(i=!1,a)break}}i&&!o?(f&&e.children.forEach(e=>{!e.disabled&&m.has(e.key)&&m.delete(e.key)}),m.add(n)):a&&h.add(n),t&&p&&m.has(n)&&m.delete(n)}}return{checkedKeys:Array.from(m),indeterminateKeys:Array.from(h)}}function Q(e,t,n,r){let{treeNodeMap:i,getChildren:a}=t,o=new Set,s=new Set(e);return e.forEach(e=>{let t=i.get(e);t!==void 0&&W(t,e=>{if(e.disabled)return U.STOP;let{key:t}=e;if(!o.has(t)&&(o.add(t),s.add(t),le(e.rawNode,a))){if(r)return U.STOP;if(!n)throw new me}})}),s}function ve(e,{includeGroup:t=!1,includeSelf:n=!0},r){var i;let a=r.treeNodeMap,o=e==null||(i=a.get(e))==null?null:i,s={keyPath:[],treeNodePath:[],treeNode:o};if(o!=null&&o.ignored)return s.treeNode=null,s;for(;o;)!o.ignored&&(t||!o.isGroup)&&s.treeNodePath.push(o),o=o.parent;return s.treeNodePath.reverse(),n||s.treeNodePath.pop(),s.keyPath=s.treeNodePath.map(e=>e.key),s}function ye(e){if(e.length===0)return null;let t=e[0];return t.isGroup||t.ignored||t.disabled?t.getNext():t}function be(e,t){let n=e.siblings,r=n.length,{index:i}=e;return t?n[(i+1)%r]:i===n.length-1?null:n[i+1]}function xe(e,t,{loop:n=!1,includeDisabled:r=!1}={}){let i=t===`prev`?$:be,a={reverse:t===`prev`},o=!1,s=null;function c(t){if(t!==null){if(t===e){if(!o)o=!0;else if(!e.disabled&&!e.isGroup){s=e;return}}else if((!t.disabled||r)&&!t.ignored&&!t.isGroup){s=t;return}if(t.isGroup){let e=Ce(t,a);e===null?c(i(t,n)):s=e}else{let e=i(t,!1);if(e!==null)c(e);else{let e=Se(t);e!=null&&e.isGroup?c(i(e,n)):n&&c(i(t,!0))}}}}return c(e),s}function $(e,t){let n=e.siblings,r=n.length,{index:i}=e;return t?n[(i-1+r)%r]:i===0?null:n[i-1]}function Se(e){return e.parent}function Ce(e,t={}){let{reverse:n=!1}=t,{children:r}=e;if(r){let{length:e}=r,i=n?e-1:0,a=n?-1:e,o=n?-1:1;for(let e=i;e!==a;e+=o){let n=r[e];if(!n.disabled&&!n.ignored)if(n.isGroup){let e=Ce(n,t);if(e!==null)return e}else return n}}return null}var we={getChild(){return this.ignored?null:Ce(this)},getParent(){let{parent:e}=this;return e!=null&&e.isGroup?e.getParent():e},getNext(e={}){return xe(this,`next`,e)},getPrev(e={}){return xe(this,`prev`,e)}};function Te(e,t){let n=t?new Set(t):void 0,r=[];function i(e){e.forEach(e=>{r.push(e),!(e.isLeaf||!e.children||e.ignored)&&(e.isGroup||n===void 0||n.has(e.key))&&i(e.children)})}return i(e),r}function Ee(e,t){let n=e.key;for(;t;){if(t.key===n)return!0;t=t.parent}return!1}function De(e,t,n,r,i,a=null,o=0){let s=[];return e.forEach((c,l)=>{var u;let d=Object.create(r);if(d.rawNode=c,d.siblings=s,d.level=o,d.index=l,d.isFirstChild=l===0,d.isLastChild=l+1===e.length,d.parent=a,!d.ignored){let e=i(c);Array.isArray(e)&&(d.children=De(e,t,n,r,i,d,o+1))}s.push(d),t.set(d.key,d),n.has(o)||n.set(o,[]),(u=n.get(o))==null||u.push(d)}),s}function Oe(e,t={}){var n;let r=new Map,i=new Map,{getDisabled:a=ce,getIgnored:o=J,getIsGroup:s=fe,getKey:c=oe}=t,l=(n=t.getChildren)==null?q:n,u=t.ignoreEmptyChildren?e=>{let t=l(e);return Array.isArray(t)?t.length?t:null:t}:l,d=De(e,r,i,Object.assign({get key(){return c(this.rawNode)},get disabled(){return a(this.rawNode)},get isGroup(){return s(this.rawNode)},get isLeaf(){return K(this.rawNode,u)},get shallowLoaded(){return se(this.rawNode,u)},get ignored(){return o(this.rawNode)},contains(e){return Ee(this,e)}},we),u);function f(e){if(e==null)return null;let t=r.get(e);return t&&!t.isGroup&&!t.ignored?t:null}function p(e){if(e==null)return null;let t=r.get(e);return t&&!t.ignored?t:null}function m(e,t){let n=p(e);return n?n.getPrev(t):null}function h(e,t){let n=p(e);return n?n.getNext(t):null}function g(e){let t=p(e);return t?t.getParent():null}function _(e){let t=p(e);return t?t.getChild():null}let v={treeNodes:d,treeNodeMap:r,levelTreeNodeMap:i,maxLevel:Math.max(...i.keys()),getChildren:u,getFlattenedNodes(e){return Te(d,e)},getNode:f,getPrev:m,getNext:h,getParent:g,getChild:_,getFirstAvailableNode(){return ye(d)},getPath(e,t={}){return ve(e,t,v)},getCheckedKeys(e,t={}){let{cascade:n=!0,leafOnly:r=!1,checkStrategy:i=`all`,allowNotLoaded:a=!1}=t;return Z({checkedKeys:Y(e),indeterminateKeys:X(e),cascade:n,leafOnly:r,checkStrategy:i,allowNotLoaded:a},v)},check(e,t,n={}){let{cascade:r=!0,leafOnly:i=!1,checkStrategy:a=`all`,allowNotLoaded:o=!1}=n;return Z({checkedKeys:Y(t),indeterminateKeys:X(t),keysToCheck:e==null?[]:H(e),cascade:r,leafOnly:i,checkStrategy:a,allowNotLoaded:o},v)},uncheck(e,t,n={}){let{cascade:r=!0,leafOnly:i=!1,checkStrategy:a=`all`,allowNotLoaded:o=!1}=n;return Z({checkedKeys:Y(t),indeterminateKeys:X(t),keysToUncheck:e==null?[]:H(e),cascade:r,leafOnly:i,checkStrategy:a,allowNotLoaded:o},v)},getNonLeafKeys(e={}){return G(d,e)}};return v}var ke=v(`empty`,`
 display: flex;
 flex-direction: column;
 align-items: center;
 font-size: var(--n-font-size);
`,[p(`icon`,`
 width: var(--n-icon-size);
 height: var(--n-icon-size);
 font-size: var(--n-icon-size);
 line-height: var(--n-icon-size);
 color: var(--n-icon-color);
 transition:
 color .3s var(--n-bezier);
 `,[g(`+`,[p(`description`,`
 margin-top: 8px;
 `)])]),p(`description`,`
 transition: color .3s var(--n-bezier);
 color: var(--n-text-color);
 `),p(`extra`,`
 text-align: center;
 transition: color .3s var(--n-bezier);
 margin-top: 12px;
 color: var(--n-extra-text-color);
 `)]),Ae=s({name:`Empty`,props:Object.assign(Object.assign({},S.props),{description:String,showDescription:{type:Boolean,default:!0},showIcon:{type:Boolean,default:!0},size:{type:String,default:`medium`},renderIcon:Function}),slots:Object,setup(t){let{mergedClsPrefixRef:n,inlineThemeDisabled:r,mergedComponentPropsRef:a}=x(t),o=S(`Empty`,`-empty`,ke,L,t,n),{localeRef:s}=F(`Empty`),c=i(()=>{var e,n,r;return(e=t.description)==null?(r=(n=a==null?void 0:a.value)==null?void 0:n.Empty)==null?void 0:r.description:e}),l=i(()=>{var t,n;return((n=(t=a==null?void 0:a.value)==null?void 0:t.Empty)==null?void 0:n.renderIcon)||(()=>e(ae,null))}),u=i(()=>{let{size:e}=t,{common:{cubicBezierEaseInOut:n},self:{[y(`iconSize`,e)]:r,[y(`fontSize`,e)]:i,textColor:a,iconColor:s,extraTextColor:c}}=o.value;return{"--n-icon-size":r,"--n-font-size":i,"--n-bezier":n,"--n-text-color":a,"--n-icon-color":s,"--n-extra-text-color":c}}),d=r?O(`empty`,i(()=>{let e=``,{size:n}=t;return e+=n[0],e}),u,t):void 0;return{mergedClsPrefix:n,mergedRenderIcon:l,localizedDescription:i(()=>c.value||s.value.description),cssVars:r?void 0:u,themeClass:d==null?void 0:d.themeClass,onRender:d==null?void 0:d.onRender}},render(){let{$slots:t,mergedClsPrefix:n,onRender:r}=this;return r==null||r(),e(`div`,{class:[`${n}-empty`,this.themeClass],style:this.cssVars},this.showIcon?e(`div`,{class:`${n}-empty__icon`},t.icon?t.icon():e(ee,{clsPrefix:n},{default:this.mergedRenderIcon})):null,this.showDescription?e(`div`,{class:`${n}-empty__description`},t.default?t.default():this.localizedDescription):null,t.extra?e(`div`,{class:`${n}-empty__extra`},t.extra()):null)}}),je={color:Object,type:{type:String,default:`default`},round:Boolean,size:String,closable:Boolean,disabled:{type:Boolean,default:void 0}},Me=v(`tag`,`
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
`,[b(`strong`,`
 font-weight: var(--n-font-weight-strong);
 `),p(`border`,`
 pointer-events: none;
 position: absolute;
 left: 0;
 right: 0;
 top: 0;
 bottom: 0;
 border-radius: inherit;
 border: var(--n-border);
 transition: border-color .3s var(--n-bezier);
 `),p(`icon`,`
 display: flex;
 margin: 0 4px 0 0;
 color: var(--n-text-color);
 transition: color .3s var(--n-bezier);
 font-size: var(--n-avatar-size-override);
 `),p(`avatar`,`
 display: flex;
 margin: 0 6px 0 0;
 `),p(`close`,`
 margin: var(--n-close-margin);
 transition:
 background-color .3s var(--n-bezier),
 color .3s var(--n-bezier);
 `),b(`round`,`
 padding: 0 calc(var(--n-height) / 3);
 border-radius: calc(var(--n-height) / 2);
 `,[p(`icon`,`
 margin: 0 4px 0 calc((var(--n-height) - 8px) / -2);
 `),p(`avatar`,`
 margin: 0 6px 0 calc((var(--n-height) - 8px) / -2);
 `),b(`closable`,`
 padding: 0 calc(var(--n-height) / 4) 0 calc(var(--n-height) / 3);
 `)]),b(`icon, avatar`,[b(`round`,`
 padding: 0 calc(var(--n-height) / 3) 0 calc(var(--n-height) / 2);
 `)]),b(`disabled`,`
 cursor: not-allowed !important;
 opacity: var(--n-opacity-disabled);
 `),b(`checkable`,`
 cursor: pointer;
 box-shadow: none;
 color: var(--n-text-color-checkable);
 background-color: var(--n-color-checkable);
 `,[h(`disabled`,[g(`&:hover`,`background-color: var(--n-color-hover-checkable);`,[h(`checked`,`color: var(--n-text-color-hover-checkable);`)]),g(`&:active`,`background-color: var(--n-color-pressed-checkable);`,[h(`checked`,`color: var(--n-text-color-pressed-checkable);`)])]),b(`checked`,`
 color: var(--n-text-color-checked);
 background-color: var(--n-color-checked);
 `,[h(`disabled`,[g(`&:hover`,`background-color: var(--n-color-checked-hover);`),g(`&:active`,`background-color: var(--n-color-checked-pressed);`)])])])]),Ne=Object.assign(Object.assign(Object.assign({},S.props),je),{bordered:{type:Boolean,default:void 0},checked:Boolean,checkable:Boolean,strong:Boolean,triggerClickOnClose:Boolean,onClose:[Array,Function],onMouseenter:Function,onMouseleave:Function,"onUpdate:checked":Function,onUpdateChecked:Function,internalCloseFocusable:{type:Boolean,default:!0},internalCloseIsButtonTag:{type:Boolean,default:!0},onCheckedChange:Function}),Pe=m(`n-tag`),Fe=s({name:`Tag`,props:Ne,slots:Object,setup(e){let t=u(null),{mergedBorderedRef:n,mergedClsPrefixRef:r,inlineThemeDisabled:o,mergedRtlRef:s,mergedComponentPropsRef:c}=x(e),l=i(()=>{var t,n;return e.size||((n=(t=c==null?void 0:c.value)==null?void 0:t.Tag)==null?void 0:n.size)||`medium`}),f=S(`Tag`,`-tag`,Me,R,e,r);a(Pe,{roundRef:d(e,`round`)});function p(){if(!e.disabled&&e.checkable){let{checked:t,onCheckedChange:n,onUpdateChecked:r,"onUpdate:checked":i}=e;r&&r(!t),i&&i(!t),n&&n(!t)}}function m(t){if(e.triggerClickOnClose||t.stopPropagation(),!e.disabled){let{onClose:n}=e;n&&M(n,t)}}let h={setTextContent(e){let{value:n}=t;n&&(n.textContent=e)}},g=C(`Tag`,s,r),_=i(()=>{let{type:t,color:{color:r,textColor:i}={}}=e,a=l.value,{common:{cubicBezierEaseInOut:o},self:{padding:s,closeMargin:c,borderRadius:u,opacityDisabled:d,textColorCheckable:p,textColorHoverCheckable:m,textColorPressedCheckable:h,textColorChecked:g,colorCheckable:_,colorHoverCheckable:v,colorPressedCheckable:b,colorChecked:x,colorCheckedHover:S,colorCheckedPressed:C,closeBorderRadius:w,fontWeightStrong:T,[y(`colorBordered`,t)]:E,[y(`closeSize`,a)]:D,[y(`closeIconSize`,a)]:ee,[y(`fontSize`,a)]:O,[y(`height`,a)]:k,[y(`color`,t)]:A,[y(`textColor`,t)]:j,[y(`border`,t)]:M,[y(`closeIconColor`,t)]:N,[y(`closeIconColorHover`,t)]:P,[y(`closeIconColorPressed`,t)]:F,[y(`closeColorHover`,t)]:I,[y(`closeColorPressed`,t)]:L}}=f.value,R=te(c);return{"--n-font-weight-strong":T,"--n-avatar-size-override":`calc(${k} - 8px)`,"--n-bezier":o,"--n-border-radius":u,"--n-border":M,"--n-close-icon-size":ee,"--n-close-color-pressed":L,"--n-close-color-hover":I,"--n-close-border-radius":w,"--n-close-icon-color":N,"--n-close-icon-color-hover":P,"--n-close-icon-color-pressed":F,"--n-close-icon-color-disabled":N,"--n-close-margin-top":R.top,"--n-close-margin-right":R.right,"--n-close-margin-bottom":R.bottom,"--n-close-margin-left":R.left,"--n-close-size":D,"--n-color":r||(n.value?E:A),"--n-color-checkable":_,"--n-color-checked":x,"--n-color-checked-hover":S,"--n-color-checked-pressed":C,"--n-color-hover-checkable":v,"--n-color-pressed-checkable":b,"--n-font-size":O,"--n-height":k,"--n-opacity-disabled":d,"--n-padding":s,"--n-text-color":i||j,"--n-text-color-checkable":p,"--n-text-color-checked":g,"--n-text-color-hover-checkable":m,"--n-text-color-pressed-checkable":h}}),v=o?O(`tag`,i(()=>{let t=``,{type:r,color:{color:i,textColor:a}={}}=e;return t+=r[0],t+=l.value[0],i&&(t+=`a${A(i)}`),a&&(t+=`b${A(a)}`),n.value&&(t+=`c`),t}),_,e):void 0;return Object.assign(Object.assign({},h),{rtlEnabled:g,mergedClsPrefix:r,contentRef:t,mergedBordered:n,handleClick:p,handleCloseClick:m,cssVars:o?void 0:_,themeClass:v==null?void 0:v.themeClass,onRender:v==null?void 0:v.onRender})},render(){var t,n;let{mergedClsPrefix:r,rtlEnabled:i,closable:a,color:{borderColor:o}={},round:s,onRender:c,$slots:l}=this;c==null||c();let u=j(l.avatar,t=>t&&e(`div`,{class:`${r}-tag__avatar`},t)),d=j(l.icon,t=>t&&e(`div`,{class:`${r}-tag__icon`},t));return e(`div`,{class:[`${r}-tag`,this.themeClass,{[`${r}-tag--rtl`]:i,[`${r}-tag--strong`]:this.strong,[`${r}-tag--disabled`]:this.disabled,[`${r}-tag--checkable`]:this.checkable,[`${r}-tag--checked`]:this.checkable&&this.checked,[`${r}-tag--round`]:s,[`${r}-tag--avatar`]:u,[`${r}-tag--icon`]:d,[`${r}-tag--closable`]:a}],style:this.cssVars,onClick:this.handleClick,onMouseenter:this.onMouseenter,onMouseleave:this.onMouseleave},d||u,e(`span`,{class:`${r}-tag__content`,ref:`contentRef`},(n=(t=this.$slots).default)==null?void 0:n.call(t)),!this.checkable&&a?e(P,{clsPrefix:r,class:`${r}-tag__close`,disabled:this.disabled,onClick:this.handleCloseClick,focusable:this.internalCloseFocusable,round:s,isButtonTag:this.internalCloseIsButtonTag,absolute:!0}):null,!this.checkable&&this.mergedBordered?e(`div`,{class:`${r}-tag__border`,style:{borderColor:o}}):null)}}),Ie=g([v(`base-selection`,`
 --n-padding-single: var(--n-padding-single-top) var(--n-padding-single-right) var(--n-padding-single-bottom) var(--n-padding-single-left);
 --n-padding-multiple: var(--n-padding-multiple-top) var(--n-padding-multiple-right) var(--n-padding-multiple-bottom) var(--n-padding-multiple-left);
 position: relative;
 z-index: auto;
 box-shadow: none;
 width: 100%;
 max-width: 100%;
 display: inline-block;
 vertical-align: bottom;
 border-radius: var(--n-border-radius);
 min-height: var(--n-height);
 line-height: 1.5;
 font-size: var(--n-font-size);
 `,[v(`base-loading`,`
 color: var(--n-loading-color);
 `),v(`base-selection-tags`,`min-height: var(--n-height);`),p(`border, state-border`,`
 position: absolute;
 left: 0;
 right: 0;
 top: 0;
 bottom: 0;
 pointer-events: none;
 border: var(--n-border);
 border-radius: inherit;
 transition:
 box-shadow .3s var(--n-bezier),
 border-color .3s var(--n-bezier);
 `),p(`state-border`,`
 z-index: 1;
 border-color: #0000;
 `),v(`base-suffix`,`
 cursor: pointer;
 position: absolute;
 top: 50%;
 transform: translateY(-50%);
 right: 10px;
 `,[p(`arrow`,`
 font-size: var(--n-arrow-size);
 color: var(--n-arrow-color);
 transition: color .3s var(--n-bezier);
 `)]),v(`base-selection-overlay`,`
 display: flex;
 align-items: center;
 white-space: nowrap;
 pointer-events: none;
 position: absolute;
 top: 0;
 right: 0;
 bottom: 0;
 left: 0;
 padding: var(--n-padding-single);
 transition: color .3s var(--n-bezier);
 `,[p(`wrapper`,`
 flex-basis: 0;
 flex-grow: 1;
 overflow: hidden;
 text-overflow: ellipsis;
 `)]),v(`base-selection-placeholder`,`
 color: var(--n-placeholder-color);
 `,[p(`inner`,`
 max-width: 100%;
 overflow: hidden;
 `)]),v(`base-selection-tags`,`
 cursor: pointer;
 outline: none;
 box-sizing: border-box;
 position: relative;
 z-index: auto;
 display: flex;
 padding: var(--n-padding-multiple);
 flex-wrap: wrap;
 align-items: center;
 width: 100%;
 vertical-align: bottom;
 background-color: var(--n-color);
 border-radius: inherit;
 transition:
 color .3s var(--n-bezier),
 box-shadow .3s var(--n-bezier),
 background-color .3s var(--n-bezier);
 `),v(`base-selection-label`,`
 height: var(--n-height);
 display: inline-flex;
 width: 100%;
 vertical-align: bottom;
 cursor: pointer;
 outline: none;
 z-index: auto;
 box-sizing: border-box;
 position: relative;
 transition:
 color .3s var(--n-bezier),
 box-shadow .3s var(--n-bezier),
 background-color .3s var(--n-bezier);
 border-radius: inherit;
 background-color: var(--n-color);
 align-items: center;
 `,[v(`base-selection-input`,`
 font-size: inherit;
 line-height: inherit;
 outline: none;
 cursor: pointer;
 box-sizing: border-box;
 border:none;
 width: 100%;
 padding: var(--n-padding-single);
 background-color: #0000;
 color: var(--n-text-color);
 transition: color .3s var(--n-bezier);
 caret-color: var(--n-caret-color);
 `,[p(`content`,`
 text-overflow: ellipsis;
 overflow: hidden;
 white-space: nowrap; 
 `)]),p(`render-label`,`
 color: var(--n-text-color);
 `)]),h(`disabled`,[g(`&:hover`,[p(`state-border`,`
 box-shadow: var(--n-box-shadow-hover);
 border: var(--n-border-hover);
 `)]),b(`focus`,[p(`state-border`,`
 box-shadow: var(--n-box-shadow-focus);
 border: var(--n-border-focus);
 `)]),b(`active`,[p(`state-border`,`
 box-shadow: var(--n-box-shadow-active);
 border: var(--n-border-active);
 `),v(`base-selection-label`,`background-color: var(--n-color-active);`),v(`base-selection-tags`,`background-color: var(--n-color-active);`)])]),b(`disabled`,`cursor: not-allowed;`,[p(`arrow`,`
 color: var(--n-arrow-color-disabled);
 `),v(`base-selection-label`,`
 cursor: not-allowed;
 background-color: var(--n-color-disabled);
 `,[v(`base-selection-input`,`
 cursor: not-allowed;
 color: var(--n-text-color-disabled);
 `),p(`render-label`,`
 color: var(--n-text-color-disabled);
 `)]),v(`base-selection-tags`,`
 cursor: not-allowed;
 background-color: var(--n-color-disabled);
 `),v(`base-selection-placeholder`,`
 cursor: not-allowed;
 color: var(--n-placeholder-color-disabled);
 `)]),v(`base-selection-input-tag`,`
 height: calc(var(--n-height) - 6px);
 line-height: calc(var(--n-height) - 6px);
 outline: none;
 display: none;
 position: relative;
 margin-bottom: 3px;
 max-width: 100%;
 vertical-align: bottom;
 `,[p(`input`,`
 font-size: inherit;
 font-family: inherit;
 min-width: 1px;
 padding: 0;
 background-color: #0000;
 outline: none;
 border: none;
 max-width: 100%;
 overflow: hidden;
 width: 1em;
 line-height: inherit;
 cursor: pointer;
 color: var(--n-text-color);
 caret-color: var(--n-caret-color);
 `),p(`mirror`,`
 position: absolute;
 left: 0;
 top: 0;
 white-space: pre;
 visibility: hidden;
 user-select: none;
 -webkit-user-select: none;
 opacity: 0;
 `)]),[`warning`,`error`].map(e=>b(`${e}-status`,[p(`state-border`,`border: var(--n-border-${e});`),h(`disabled`,[g(`&:hover`,[p(`state-border`,`
 box-shadow: var(--n-box-shadow-hover-${e});
 border: var(--n-border-hover-${e});
 `)]),b(`active`,[p(`state-border`,`
 box-shadow: var(--n-box-shadow-active-${e});
 border: var(--n-border-active-${e});
 `),v(`base-selection-label`,`background-color: var(--n-color-active-${e});`),v(`base-selection-tags`,`background-color: var(--n-color-active-${e});`)]),b(`focus`,[p(`state-border`,`
 box-shadow: var(--n-box-shadow-focus-${e});
 border: var(--n-border-focus-${e});
 `)])])]))]),v(`base-selection-popover`,`
 margin-bottom: -3px;
 display: flex;
 flex-wrap: wrap;
 margin-right: -8px;
 `),v(`base-selection-tag-wrapper`,`
 max-width: 100%;
 display: inline-flex;
 padding: 0 7px 3px 0;
 `,[g(`&:last-child`,`padding-right: 0;`),v(`tag`,`
 font-size: 14px;
 max-width: 100%;
 `,[p(`content`,`
 line-height: 1.25;
 text-overflow: ellipsis;
 overflow: hidden;
 `)])])]),Le=s({name:`InternalSelection`,props:Object.assign(Object.assign({},S.props),{clsPrefix:{type:String,required:!0},bordered:{type:Boolean,default:void 0},active:Boolean,pattern:{type:String,default:``},placeholder:String,selectedOption:{type:Object,default:null},selectedOptions:{type:Array,default:null},labelField:{type:String,default:`label`},valueField:{type:String,default:`value`},multiple:Boolean,filterable:Boolean,clearable:Boolean,disabled:Boolean,size:{type:String,default:`medium`},loading:Boolean,autofocus:Boolean,showArrow:{type:Boolean,default:!0},inputProps:Object,focused:Boolean,renderTag:Function,onKeydown:Function,onClick:Function,onBlur:Function,onFocus:Function,onDeleteOption:Function,maxTagCount:[String,Number],ellipsisTagPopoverProps:Object,onClear:Function,onPatternInput:Function,onPatternFocus:Function,onPatternBlur:Function,renderLabel:Function,status:String,inlineThemeDisabled:Boolean,ignoreComposition:{type:Boolean,default:!0},onResize:Function}),setup(e){let{mergedClsPrefixRef:a,mergedRtlRef:o}=x(e),s=C(`InternalSelection`,o,a),c=u(null),f=u(null),p=u(null),m=u(null),h=u(null),g=u(null),_=u(null),v=u(null),b=u(null),w=u(null),T=u(!1),E=u(!1),D=u(!1),ee=S(`InternalSelection`,`-internal-selection`,Ie,ne,e,d(e,`clsPrefix`)),k=i(()=>e.clearable&&!e.disabled&&(D.value||e.active)),A=i(()=>e.selectedOption?e.renderTag?e.renderTag({option:e.selectedOption,handleClose:()=>{}}):e.renderLabel?e.renderLabel(e.selectedOption,!0):N(e.selectedOption[e.labelField],e.selectedOption,!0):e.placeholder),j=i(()=>{let t=e.selectedOption;if(t)return t[e.labelField]}),M=i(()=>e.multiple?!!(Array.isArray(e.selectedOptions)&&e.selectedOptions.length):e.selectedOption!==null);function P(){var t;let{value:n}=c;if(n){let{value:r}=f;r&&(r.style.width=`${n.offsetWidth}px`,e.maxTagCount!==`responsive`&&((t=b.value)==null||t.sync({showAllItemsBeforeCalculate:!1})))}}function F(){let{value:e}=w;e&&(e.style.display=`none`)}function I(){let{value:e}=w;e&&(e.style.display=`inline-block`)}t(d(e,`active`),e=>{e||F()}),t(d(e,`pattern`),()=>{e.multiple&&l(P)});function L(t){let{onFocus:n}=e;n&&n(t)}function R(t){let{onBlur:n}=e;n&&n(t)}function z(t){let{onDeleteOption:n}=e;n&&n(t)}function re(t){let{onClear:n}=e;n&&n(t)}function B(t){let{onPatternInput:n}=e;n&&n(t)}function V(e){var t;(!e.relatedTarget||!((t=p.value)!=null&&t.contains(e.relatedTarget)))&&L(e)}function ae(e){var t;(t=p.value)!=null&&t.contains(e.relatedTarget)||R(e)}function H(e){re(e)}function U(){D.value=!0}function W(){D.value=!1}function G(t){!e.active||!e.filterable||t.target!==f.value&&t.preventDefault()}function K(e){z(e)}let q=u(!1);function oe(t){if(t.key===`Backspace`&&!q.value&&!e.pattern.length){let{selectedOptions:t}=e;t!=null&&t.length&&K(t[t.length-1])}}let J=null;function se(t){let{value:n}=c;n&&(n.textContent=t.target.value,P()),e.ignoreComposition&&q.value?J=t:B(t)}function ce(){q.value=!0}function le(){q.value=!1,e.ignoreComposition&&B(J),J=null}function Y(t){var n;E.value=!0,(n=e.onPatternFocus)==null||n.call(e,t)}function X(t){var n;E.value=!1,(n=e.onPatternBlur)==null||n.call(e,t)}function ue(){var t,n;if(e.filterable)E.value=!1,(t=g.value)==null||t.blur(),(n=f.value)==null||n.blur();else if(e.multiple){let{value:e}=m;e==null||e.blur()}else{let{value:e}=h;e==null||e.blur()}}function de(){var t,n,r;e.filterable?(E.value=!1,(t=g.value)==null||t.focus()):e.multiple?(n=m.value)==null||n.focus():(r=h.value)==null||r.focus()}function fe(){let{value:e}=f;e&&(I(),e.focus())}function pe(){let{value:e}=f;e&&e.blur()}function me(e){let{value:t}=_;t&&t.setTextContent(`+${e}`)}function he(){let{value:e}=v;return e}function ge(){return f.value}let _e=null;function Z(){_e!==null&&window.clearTimeout(_e)}function Q(){e.active||(Z(),_e=window.setTimeout(()=>{M.value&&(T.value=!0)},100))}function ve(){Z()}function ye(e){e||(Z(),T.value=!1)}t(M,e=>{e||(T.value=!1)}),r(()=>{n(()=>{let t=g.value;t&&(e.disabled?t.removeAttribute(`tabindex`):t.tabIndex=E.value?-1:0)})}),ie(p,e.onResize);let{inlineThemeDisabled:be}=e,xe=i(()=>{let{size:t}=e,{common:{cubicBezierEaseInOut:n},self:{fontWeight:r,borderRadius:i,color:a,placeholderColor:o,textColor:s,paddingSingle:c,paddingMultiple:l,caretColor:u,colorDisabled:d,textColorDisabled:f,placeholderColorDisabled:p,colorActive:m,boxShadowFocus:h,boxShadowActive:g,boxShadowHover:_,border:v,borderFocus:b,borderHover:x,borderActive:S,arrowColor:C,arrowColorDisabled:w,loadingColor:T,colorActiveWarning:E,boxShadowFocusWarning:D,boxShadowActiveWarning:O,boxShadowHoverWarning:k,borderWarning:A,borderFocusWarning:j,borderHoverWarning:M,borderActiveWarning:N,colorActiveError:P,boxShadowFocusError:F,boxShadowActiveError:I,boxShadowHoverError:L,borderError:R,borderFocusError:ne,borderHoverError:z,borderActiveError:re,clearColor:B,clearColorHover:ie,clearColorPressed:V,clearSize:ae,arrowSize:H,[y(`height`,t)]:U,[y(`fontSize`,t)]:W}}=ee.value,G=te(c),K=te(l);return{"--n-bezier":n,"--n-border":v,"--n-border-active":S,"--n-border-focus":b,"--n-border-hover":x,"--n-border-radius":i,"--n-box-shadow-active":g,"--n-box-shadow-focus":h,"--n-box-shadow-hover":_,"--n-caret-color":u,"--n-color":a,"--n-color-active":m,"--n-color-disabled":d,"--n-font-size":W,"--n-height":U,"--n-padding-single-top":G.top,"--n-padding-multiple-top":K.top,"--n-padding-single-right":G.right,"--n-padding-multiple-right":K.right,"--n-padding-single-left":G.left,"--n-padding-multiple-left":K.left,"--n-padding-single-bottom":G.bottom,"--n-padding-multiple-bottom":K.bottom,"--n-placeholder-color":o,"--n-placeholder-color-disabled":p,"--n-text-color":s,"--n-text-color-disabled":f,"--n-arrow-color":C,"--n-arrow-color-disabled":w,"--n-loading-color":T,"--n-color-active-warning":E,"--n-box-shadow-focus-warning":D,"--n-box-shadow-active-warning":O,"--n-box-shadow-hover-warning":k,"--n-border-warning":A,"--n-border-focus-warning":j,"--n-border-hover-warning":M,"--n-border-active-warning":N,"--n-color-active-error":P,"--n-box-shadow-focus-error":F,"--n-box-shadow-active-error":I,"--n-box-shadow-hover-error":L,"--n-border-error":R,"--n-border-focus-error":ne,"--n-border-hover-error":z,"--n-border-active-error":re,"--n-clear-size":ae,"--n-clear-color":B,"--n-clear-color-hover":ie,"--n-clear-color-pressed":V,"--n-arrow-size":H,"--n-font-weight":r}}),$=be?O(`internal-selection`,i(()=>e.size[0]),xe,e):void 0;return{mergedTheme:ee,mergedClearable:k,mergedClsPrefix:a,rtlEnabled:s,patternInputFocused:E,filterablePlaceholder:A,label:j,selected:M,showTagsPanel:T,isComposing:q,counterRef:_,counterWrapperRef:v,patternInputMirrorRef:c,patternInputRef:f,selfRef:p,multipleElRef:m,singleElRef:h,patternInputWrapperRef:g,overflowRef:b,inputTagElRef:w,handleMouseDown:G,handleFocusin:V,handleClear:H,handleMouseEnter:U,handleMouseLeave:W,handleDeleteOption:K,handlePatternKeyDown:oe,handlePatternInputInput:se,handlePatternInputBlur:X,handlePatternInputFocus:Y,handleMouseEnterCounter:Q,handleMouseLeaveCounter:ve,handleFocusout:ae,handleCompositionEnd:le,handleCompositionStart:ce,onPopoverUpdateShow:ye,focus:de,focusInput:fe,blur:ue,blurInput:pe,updateCounter:me,getCounter:he,getTail:ge,renderLabel:e.renderLabel,cssVars:be?void 0:xe,themeClass:$==null?void 0:$.themeClass,onRender:$==null?void 0:$.onRender}},render(){let{status:t,multiple:n,size:r,disabled:i,filterable:a,maxTagCount:o,bordered:s,clsPrefix:l,ellipsisTagPopoverProps:u,onRender:d,renderTag:f,renderLabel:p}=this;d==null||d();let m=o===`responsive`,h=typeof o==`number`,g=m||h,_=e(E,null,{default:()=>e(I,{clsPrefix:l,loading:this.loading,showArrow:this.showArrow,showClear:this.mergedClearable&&this.selected,onClear:this.handleClear},{default:()=>{var e,t;return(t=(e=this.$slots).arrow)==null?void 0:t.call(e)}})}),v;if(n){let{labelField:t}=this,n=n=>e(`div`,{class:`${l}-base-selection-tag-wrapper`,key:n.value},f?f({option:n,handleClose:()=>{this.handleDeleteOption(n)}}):e(Fe,{size:r,closable:!n.disabled,disabled:i,onClose:()=>{this.handleDeleteOption(n)},internalCloseIsButtonTag:!1,internalCloseFocusable:!1},{default:()=>p?p(n,!0):N(n[t],n,!0)})),s=()=>(h?this.selectedOptions.slice(0,o):this.selectedOptions).map(n),d=a?e(`div`,{class:`${l}-base-selection-input-tag`,ref:`inputTagElRef`,key:`__input-tag__`},e(`input`,Object.assign({},this.inputProps,{ref:`patternInputRef`,tabindex:-1,disabled:i,value:this.pattern,autofocus:this.autofocus,class:`${l}-base-selection-input-tag__input`,onBlur:this.handlePatternInputBlur,onFocus:this.handlePatternInputFocus,onKeydown:this.handlePatternKeyDown,onInput:this.handlePatternInputInput,onCompositionstart:this.handleCompositionStart,onCompositionend:this.handleCompositionEnd})),e(`span`,{ref:`patternInputMirrorRef`,class:`${l}-base-selection-input-tag__mirror`},this.pattern)):null,y=m?()=>e(`div`,{class:`${l}-base-selection-tag-wrapper`,ref:`counterWrapperRef`},e(Fe,{size:r,ref:`counterRef`,onMouseenter:this.handleMouseEnterCounter,onMouseleave:this.handleMouseLeaveCounter,disabled:i})):void 0,b;if(h){let t=this.selectedOptions.length-o;t>0&&(b=e(`div`,{class:`${l}-base-selection-tag-wrapper`,key:`__counter__`},e(Fe,{size:r,ref:`counterRef`,onMouseenter:this.handleMouseEnterCounter,disabled:i},{default:()=>`+${t}`})))}let x=m?a?e(B,{ref:`overflowRef`,updateCounter:this.updateCounter,getCounter:this.getCounter,getTail:this.getTail,style:{width:`100%`,display:`flex`,overflow:`hidden`}},{default:s,counter:y,tail:()=>d}):e(B,{ref:`overflowRef`,updateCounter:this.updateCounter,getCounter:this.getCounter,style:{width:`100%`,display:`flex`,overflow:`hidden`}},{default:s,counter:y}):h&&b?s().concat(b):s(),S=g?()=>e(`div`,{class:`${l}-base-selection-popover`},m?s():this.selectedOptions.map(n)):void 0,C=g?Object.assign({show:this.showTagsPanel,trigger:`hover`,overlap:!0,placement:`top`,width:`trigger`,onUpdateShow:this.onPopoverUpdateShow,theme:this.mergedTheme.peers.Popover,themeOverrides:this.mergedTheme.peerOverrides.Popover},u):null,w=!this.selected&&(!this.active||!this.pattern&&!this.isComposing)?e(`div`,{class:`${l}-base-selection-placeholder ${l}-base-selection-overlay`},e(`div`,{class:`${l}-base-selection-placeholder__inner`},this.placeholder)):null,T=a?e(`div`,{ref:`patternInputWrapperRef`,class:`${l}-base-selection-tags`},x,m?null:d,_):e(`div`,{ref:`multipleElRef`,class:`${l}-base-selection-tags`,tabindex:i?void 0:0},x,_);v=e(c,null,g?e(k,Object.assign({},C,{scrollable:!0,style:`max-height: calc(var(--v-target-height) * 6.6);`}),{trigger:()=>T,default:S}):T,w)}else if(a){let t=this.pattern||this.isComposing,n=this.active?!t:!this.selected,r=!this.active&&this.selected;v=e(`div`,{ref:`patternInputWrapperRef`,class:`${l}-base-selection-label`,title:this.patternInputFocused?void 0:V(this.label)},e(`input`,Object.assign({},this.inputProps,{ref:`patternInputRef`,class:`${l}-base-selection-input`,value:this.active?this.pattern:``,placeholder:``,readonly:i,disabled:i,tabindex:-1,autofocus:this.autofocus,onFocus:this.handlePatternInputFocus,onBlur:this.handlePatternInputBlur,onInput:this.handlePatternInputInput,onCompositionstart:this.handleCompositionStart,onCompositionend:this.handleCompositionEnd})),r?e(`div`,{class:`${l}-base-selection-label__render-label ${l}-base-selection-overlay`,key:`input`},e(`div`,{class:`${l}-base-selection-overlay__wrapper`},f?f({option:this.selectedOption,handleClose:()=>{}}):p?p(this.selectedOption,!0):N(this.label,this.selectedOption,!0))):null,n?e(`div`,{class:`${l}-base-selection-placeholder ${l}-base-selection-overlay`,key:`placeholder`},e(`div`,{class:`${l}-base-selection-overlay__wrapper`},this.filterablePlaceholder)):null,_)}else v=e(`div`,{ref:`singleElRef`,class:`${l}-base-selection-label`,tabindex:this.disabled?void 0:0},this.label===void 0?e(`div`,{class:`${l}-base-selection-placeholder ${l}-base-selection-overlay`,key:`placeholder`},e(`div`,{class:`${l}-base-selection-placeholder__inner`},this.placeholder)):e(`div`,{class:`${l}-base-selection-input`,title:V(this.label),key:`input`},e(`div`,{class:`${l}-base-selection-input__content`},f?f({option:this.selectedOption,handleClose:()=>{}}):p?p(this.selectedOption,!0):N(this.label,this.selectedOption,!0))),_);return e(`div`,{ref:`selfRef`,class:[`${l}-base-selection`,this.rtlEnabled&&`${l}-base-selection--rtl`,this.themeClass,t&&`${l}-base-selection--${t}-status`,{[`${l}-base-selection--active`]:this.active,[`${l}-base-selection--selected`]:this.selected||this.active&&this.pattern,[`${l}-base-selection--disabled`]:this.disabled,[`${l}-base-selection--multiple`]:this.multiple,[`${l}-base-selection--focus`]:this.focused}],style:this.cssVars,onClick:this.onClick,onMouseenter:this.handleMouseEnter,onMouseleave:this.handleMouseLeave,onKeydown:this.onKeydown,onFocusin:this.handleFocusin,onFocusout:this.handleFocusout,onMousedown:this.handleMouseDown},v,s?e(`div`,{class:`${l}-base-selection__border`}):null,s?e(`div`,{class:`${l}-base-selection__state-border`}):null)}});export{Te as a,Oe as i,Fe as n,pe as o,Ae as r,ie as s,Le as t};