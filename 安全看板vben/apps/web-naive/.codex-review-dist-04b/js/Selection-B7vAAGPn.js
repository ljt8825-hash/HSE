import{B as e,Ht as t,Ut as n,ct as r,g as i,it as a,k as o,o as s,tt as c,vn as l,wn as u,xt as d}from"./runtime-core.esm-bundler-Blp3D1W4.js";import{B as f,H as p,L as m,P as h,R as g,U as _,V as v,j as y,n as b}from"./use-theme-BPxAT0OQ.js";import{t as x}from"./use-rtl-BtnaqIOl.js";import{n as S,r as C}from"./Follower-CgHcuyay.js";import{d as w,p as T}from"./Scrollbar-CWE-8E6x.js";import{r as ee}from"./css-DEmdllcC.js";import{n as te}from"./light-DZKN5sjf.js";import{t as E}from"./Popover-BJtOYZAs.js";import{t as D}from"./render-ipbixR-R.js";import{t as O}from"./Suffix-50r9FIuH.js";import{t as k}from"./Tag-DPfkrLmL.js";import{t as ne}from"./light-CDobzQDv.js";var A=`v-hidden`,j=S(`[v-hidden]`,{display:`none!important`}),M=o({name:`Overflow`,props:{getCounter:Function,getTail:Function,updateCounter:Function,onUpdateCount:Function,onUpdateOverflow:Function},setup(e,{slots:t}){let n=l(null),i=l(null);function a(r){let{value:a}=n,{getCounter:o,getTail:s}=e,c;if(c=o===void 0?i.value:o(),!a||!c)return;c.hasAttribute(A)&&c.removeAttribute(A);let{children:l}=a;if(r.showAllItemsBeforeCalculate)for(let e of l)e.hasAttribute(A)&&e.removeAttribute(A);let u=a.offsetWidth,d=[],f=t.tail?s==null?void 0:s():null,p=f?f.offsetWidth:0,m=!1,h=a.children.length-+!!t.tail;for(let t=0;t<h-1;++t){if(t<0)continue;let n=l[t];if(m){n.hasAttribute(A)||n.setAttribute(A,``);continue}else n.hasAttribute(A)&&n.removeAttribute(A);let r=n.offsetWidth;if(p+=r,d[t]=r,p>u){let{updateCounter:n}=e;for(let r=t;r>=0;--r){let i=h-1-r;n===void 0?c.textContent=`${i}`:n(i);let a=c.offsetWidth;if(p-=d[r],p+a<=u||r===0){m=!0,t=r-1,f&&(t===-1?(f.style.maxWidth=`${u-a}px`,f.style.boxSizing=`border-box`):f.style.maxWidth=``);let{onUpdateCount:n}=e;n&&n(i);break}}}}let{onUpdateOverflow:g}=e;m?g!==void 0&&g(!0):(g!==void 0&&g(!1),c.setAttribute(A,``))}let o=h();return j.mount({id:`vueuc/overflow`,head:!0,anchorMetaName:C,ssr:o}),r(()=>a({showAllItemsBeforeCalculate:!1})),{selfRef:n,counterRef:i,sync:a}},render(){let{$slots:t}=this;return c(()=>this.sync({showAllItemsBeforeCalculate:!1})),e(`div`,{class:`v-overflow`,ref:`selfRef`},[d(t,`default`),t.counter?t.counter():e(`span`,{style:{display:`inline-block`},ref:`counterRef`}),t.tail?t.tail():null])}});function N(e,n){n&&(r(()=>{let{value:t}=e;t&&T.registerHandler(t,n)}),t(e,(e,t)=>{t&&T.unregisterHandler(t)},{deep:!1}),a(()=>{let{value:t}=e;t&&T.unregisterHandler(t)}))}function P(e){switch(typeof e){case`string`:return e||void 0;case`number`:return String(e);default:return}}function F(e){return Array.isArray(e)?e:[e]}var I={STOP:`STOP`};function L(e,t){let n=t(e);e.children!==void 0&&n!==I.STOP&&e.children.forEach(e=>L(e,t))}function R(e,t={}){let{preserveGroup:n=!1}=t,r=[],i=n?e=>{e.isLeaf||(r.push(e.key),a(e.children))}:e=>{e.isLeaf||(e.isGroup||r.push(e.key),a(e.children))};function a(e){e.forEach(i)}return a(e),r}function z(e,t){let{isLeaf:n}=e;return n===void 0?!t(e):n}function B(e){return e.children}function re(e){return e.key}function V(){return!1}function ie(e,t){let{isLeaf:n}=e;return!(n===!1&&!Array.isArray(t(e)))}function ae(e){return e.disabled===!0}function oe(e,t){return e.isLeaf===!1&&!Array.isArray(t(e))}function H(e){var t;return e==null?[]:Array.isArray(e)?e:(t=e.checkedKeys)==null?[]:t}function U(e){var t;return e==null||Array.isArray(e)||(t=e.indeterminateKeys)==null?[]:t}function W(e,t){let n=new Set(e);return t.forEach(e=>{n.has(e)||n.add(e)}),Array.from(n)}function G(e,t){let n=new Set(e);return t.forEach(e=>{n.has(e)&&n.delete(e)}),Array.from(n)}function K(e){return(e==null?void 0:e.type)===`group`}function se(e){let t=new Map;return e.forEach((e,n)=>{t.set(e.key,n)}),e=>{var n;return(n=t.get(e))==null?null:n}}var q=class extends Error{constructor(){super(),this.message=`SubtreeNotLoadedError: checking a subtree whose required nodes are not fully loaded.`}};function ce(e,t,n,r){return Y(t.concat(e),n,r,!1)}function le(e,t){let n=new Set;return e.forEach(e=>{let r=t.treeNodeMap.get(e);if(r!==void 0){let e=r.parent;for(;e!==null&&!(e.disabled||n.has(e.key));)n.add(e.key),e=e.parent}}),n}function ue(e,t,n,r){let i=Y(t,n,r,!1),a=Y(e,n,r,!0),o=le(e,n),s=[];return i.forEach(e=>{(a.has(e)||o.has(e))&&s.push(e)}),s.forEach(e=>i.delete(e)),i}function J(e,t){let{checkedKeys:n,keysToCheck:r,keysToUncheck:i,indeterminateKeys:a,cascade:o,leafOnly:s,checkStrategy:c,allowNotLoaded:l}=e;if(!o)return r===void 0?i===void 0?{checkedKeys:Array.from(n),indeterminateKeys:Array.from(a)}:{checkedKeys:G(n,i),indeterminateKeys:Array.from(a)}:{checkedKeys:W(n,r),indeterminateKeys:Array.from(a)};let{levelTreeNodeMap:u}=t,d;d=i===void 0?r===void 0?Y(n,t,l,!1):ce(r,n,t,l):ue(i,n,t,l);let f=c===`parent`,p=c===`child`||s,m=d,h=new Set,g=Math.max.apply(null,Array.from(u.keys()));for(let e=g;e>=0;--e){let t=e===0,n=u.get(e);for(let e of n){if(e.isLeaf)continue;let{key:n,shallowLoaded:r}=e;if(p&&r&&e.children.forEach(e=>{!e.disabled&&!e.isLeaf&&e.shallowLoaded&&m.has(e.key)&&m.delete(e.key)}),e.disabled||!r)continue;let i=!0,a=!1,o=!0;for(let t of e.children){let e=t.key;if(!t.disabled){if(o&&(o=!1),m.has(e))a=!0;else if(h.has(e)){a=!0,i=!1;break}else if(i=!1,a)break}}i&&!o?(f&&e.children.forEach(e=>{!e.disabled&&m.has(e.key)&&m.delete(e.key)}),m.add(n)):a&&h.add(n),t&&p&&m.has(n)&&m.delete(n)}}return{checkedKeys:Array.from(m),indeterminateKeys:Array.from(h)}}function Y(e,t,n,r){let{treeNodeMap:i,getChildren:a}=t,o=new Set,s=new Set(e);return e.forEach(e=>{let t=i.get(e);t!==void 0&&L(t,e=>{if(e.disabled)return I.STOP;let{key:t}=e;if(!o.has(t)&&(o.add(t),s.add(t),oe(e.rawNode,a))){if(r)return I.STOP;if(!n)throw new q}})}),s}function de(e,{includeGroup:t=!1,includeSelf:n=!0},r){var i;let a=r.treeNodeMap,o=e==null||(i=a.get(e))==null?null:i,s={keyPath:[],treeNodePath:[],treeNode:o};if(o!=null&&o.ignored)return s.treeNode=null,s;for(;o;)!o.ignored&&(t||!o.isGroup)&&s.treeNodePath.push(o),o=o.parent;return s.treeNodePath.reverse(),n||s.treeNodePath.pop(),s.keyPath=s.treeNodePath.map(e=>e.key),s}function fe(e){if(e.length===0)return null;let t=e[0];return t.isGroup||t.ignored||t.disabled?t.getNext():t}function pe(e,t){let n=e.siblings,r=n.length,{index:i}=e;return t?n[(i+1)%r]:i===n.length-1?null:n[i+1]}function me(e,t,{loop:n=!1,includeDisabled:r=!1}={}){let i=t===`prev`?he:pe,a={reverse:t===`prev`},o=!1,s=null;function c(t){if(t!==null){if(t===e){if(!o)o=!0;else if(!e.disabled&&!e.isGroup){s=e;return}}else if((!t.disabled||r)&&!t.ignored&&!t.isGroup){s=t;return}if(t.isGroup){let e=X(t,a);e===null?c(i(t,n)):s=e}else{let e=i(t,!1);if(e!==null)c(e);else{let e=ge(t);e!=null&&e.isGroup?c(i(e,n)):n&&c(i(t,!0))}}}}return c(e),s}function he(e,t){let n=e.siblings,r=n.length,{index:i}=e;return t?n[(i-1+r)%r]:i===0?null:n[i-1]}function ge(e){return e.parent}function X(e,t={}){let{reverse:n=!1}=t,{children:r}=e;if(r){let{length:e}=r,i=n?e-1:0,a=n?-1:e,o=n?-1:1;for(let e=i;e!==a;e+=o){let n=r[e];if(!n.disabled&&!n.ignored)if(n.isGroup){let e=X(n,t);if(e!==null)return e}else return n}}return null}var Z={getChild(){return this.ignored?null:X(this)},getParent(){let{parent:e}=this;return e!=null&&e.isGroup?e.getParent():e},getNext(e={}){return me(this,`next`,e)},getPrev(e={}){return me(this,`prev`,e)}};function Q(e,t){let n=t?new Set(t):void 0,r=[];function i(e){e.forEach(e=>{r.push(e),!(e.isLeaf||!e.children||e.ignored)&&(e.isGroup||n===void 0||n.has(e.key))&&i(e.children)})}return i(e),r}function _e(e,t){let n=e.key;for(;t;){if(t.key===n)return!0;t=t.parent}return!1}function ve(e,t,n,r,i,a=null,o=0){let s=[];return e.forEach((c,l)=>{var u;let d=Object.create(r);if(d.rawNode=c,d.siblings=s,d.level=o,d.index=l,d.isFirstChild=l===0,d.isLastChild=l+1===e.length,d.parent=a,!d.ignored){let e=i(c);Array.isArray(e)&&(d.children=ve(e,t,n,r,i,d,o+1))}s.push(d),t.set(d.key,d),n.has(o)||n.set(o,[]),(u=n.get(o))==null||u.push(d)}),s}function ye(e,t={}){var n;let r=new Map,i=new Map,{getDisabled:a=ae,getIgnored:o=V,getIsGroup:s=K,getKey:c=re}=t,l=(n=t.getChildren)==null?B:n,u=t.ignoreEmptyChildren?e=>{let t=l(e);return Array.isArray(t)?t.length?t:null:t}:l,d=ve(e,r,i,Object.assign({get key(){return c(this.rawNode)},get disabled(){return a(this.rawNode)},get isGroup(){return s(this.rawNode)},get isLeaf(){return z(this.rawNode,u)},get shallowLoaded(){return ie(this.rawNode,u)},get ignored(){return o(this.rawNode)},contains(e){return _e(this,e)}},Z),u);function f(e){if(e==null)return null;let t=r.get(e);return t&&!t.isGroup&&!t.ignored?t:null}function p(e){if(e==null)return null;let t=r.get(e);return t&&!t.ignored?t:null}function m(e,t){let n=p(e);return n?n.getPrev(t):null}function h(e,t){let n=p(e);return n?n.getNext(t):null}function g(e){let t=p(e);return t?t.getParent():null}function _(e){let t=p(e);return t?t.getChild():null}let v={treeNodes:d,treeNodeMap:r,levelTreeNodeMap:i,maxLevel:Math.max(...i.keys()),getChildren:u,getFlattenedNodes(e){return Q(d,e)},getNode:f,getPrev:m,getNext:h,getParent:g,getChild:_,getFirstAvailableNode(){return fe(d)},getPath(e,t={}){return de(e,t,v)},getCheckedKeys(e,t={}){let{cascade:n=!0,leafOnly:r=!1,checkStrategy:i=`all`,allowNotLoaded:a=!1}=t;return J({checkedKeys:H(e),indeterminateKeys:U(e),cascade:n,leafOnly:r,checkStrategy:i,allowNotLoaded:a},v)},check(e,t,n={}){let{cascade:r=!0,leafOnly:i=!1,checkStrategy:a=`all`,allowNotLoaded:o=!1}=n;return J({checkedKeys:H(t),indeterminateKeys:U(t),keysToCheck:e==null?[]:F(e),cascade:r,leafOnly:i,checkStrategy:a,allowNotLoaded:o},v)},uncheck(e,t,n={}){let{cascade:r=!0,leafOnly:i=!1,checkStrategy:a=`all`,allowNotLoaded:o=!1}=n;return J({checkedKeys:H(t),indeterminateKeys:U(t),keysToUncheck:e==null?[]:F(e),cascade:r,leafOnly:i,checkStrategy:a,allowNotLoaded:o},v)},getNonLeafKeys(e={}){return R(d,e)}};return v}var be=m([g(`base-selection`,`
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
 `,[g(`base-loading`,`
 color: var(--n-loading-color);
 `),g(`base-selection-tags`,`min-height: var(--n-height);`),f(`border, state-border`,`
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
 `),f(`state-border`,`
 z-index: 1;
 border-color: #0000;
 `),g(`base-suffix`,`
 cursor: pointer;
 position: absolute;
 top: 50%;
 transform: translateY(-50%);
 right: 10px;
 `,[f(`arrow`,`
 font-size: var(--n-arrow-size);
 color: var(--n-arrow-color);
 transition: color .3s var(--n-bezier);
 `)]),g(`base-selection-overlay`,`
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
 `,[f(`wrapper`,`
 flex-basis: 0;
 flex-grow: 1;
 overflow: hidden;
 text-overflow: ellipsis;
 `)]),g(`base-selection-placeholder`,`
 color: var(--n-placeholder-color);
 `,[f(`inner`,`
 max-width: 100%;
 overflow: hidden;
 `)]),g(`base-selection-tags`,`
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
 `),g(`base-selection-label`,`
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
 `,[g(`base-selection-input`,`
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
 `,[f(`content`,`
 text-overflow: ellipsis;
 overflow: hidden;
 white-space: nowrap; 
 `)]),f(`render-label`,`
 color: var(--n-text-color);
 `)]),p(`disabled`,[m(`&:hover`,[f(`state-border`,`
 box-shadow: var(--n-box-shadow-hover);
 border: var(--n-border-hover);
 `)]),v(`focus`,[f(`state-border`,`
 box-shadow: var(--n-box-shadow-focus);
 border: var(--n-border-focus);
 `)]),v(`active`,[f(`state-border`,`
 box-shadow: var(--n-box-shadow-active);
 border: var(--n-border-active);
 `),g(`base-selection-label`,`background-color: var(--n-color-active);`),g(`base-selection-tags`,`background-color: var(--n-color-active);`)])]),v(`disabled`,`cursor: not-allowed;`,[f(`arrow`,`
 color: var(--n-arrow-color-disabled);
 `),g(`base-selection-label`,`
 cursor: not-allowed;
 background-color: var(--n-color-disabled);
 `,[g(`base-selection-input`,`
 cursor: not-allowed;
 color: var(--n-text-color-disabled);
 `),f(`render-label`,`
 color: var(--n-text-color-disabled);
 `)]),g(`base-selection-tags`,`
 cursor: not-allowed;
 background-color: var(--n-color-disabled);
 `),g(`base-selection-placeholder`,`
 cursor: not-allowed;
 color: var(--n-placeholder-color-disabled);
 `)]),g(`base-selection-input-tag`,`
 height: calc(var(--n-height) - 6px);
 line-height: calc(var(--n-height) - 6px);
 outline: none;
 display: none;
 position: relative;
 margin-bottom: 3px;
 max-width: 100%;
 vertical-align: bottom;
 `,[f(`input`,`
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
 `),f(`mirror`,`
 position: absolute;
 left: 0;
 top: 0;
 white-space: pre;
 visibility: hidden;
 user-select: none;
 -webkit-user-select: none;
 opacity: 0;
 `)]),[`warning`,`error`].map(e=>v(`${e}-status`,[f(`state-border`,`border: var(--n-border-${e});`),p(`disabled`,[m(`&:hover`,[f(`state-border`,`
 box-shadow: var(--n-box-shadow-hover-${e});
 border: var(--n-border-hover-${e});
 `)]),v(`active`,[f(`state-border`,`
 box-shadow: var(--n-box-shadow-active-${e});
 border: var(--n-border-active-${e});
 `),g(`base-selection-label`,`background-color: var(--n-color-active-${e});`),g(`base-selection-tags`,`background-color: var(--n-color-active-${e});`)]),v(`focus`,[f(`state-border`,`
 box-shadow: var(--n-box-shadow-focus-${e});
 border: var(--n-border-focus-${e});
 `)])])]))]),g(`base-selection-popover`,`
 margin-bottom: -3px;
 display: flex;
 flex-wrap: wrap;
 margin-right: -8px;
 `),g(`base-selection-tag-wrapper`,`
 max-width: 100%;
 display: inline-flex;
 padding: 0 7px 3px 0;
 `,[m(`&:last-child`,`padding-right: 0;`),g(`tag`,`
 font-size: 14px;
 max-width: 100%;
 `,[f(`content`,`
 line-height: 1.25;
 text-overflow: ellipsis;
 overflow: hidden;
 `)])])]),xe=o({name:`InternalSelection`,props:Object.assign(Object.assign({},b.props),{clsPrefix:{type:String,required:!0},bordered:{type:Boolean,default:void 0},active:Boolean,pattern:{type:String,default:``},placeholder:String,selectedOption:{type:Object,default:null},selectedOptions:{type:Array,default:null},labelField:{type:String,default:`label`},valueField:{type:String,default:`value`},multiple:Boolean,filterable:Boolean,clearable:Boolean,disabled:Boolean,size:{type:String,default:`medium`},loading:Boolean,autofocus:Boolean,showArrow:{type:Boolean,default:!0},inputProps:Object,focused:Boolean,renderTag:Function,onKeydown:Function,onClick:Function,onBlur:Function,onFocus:Function,onDeleteOption:Function,maxTagCount:[String,Number],ellipsisTagPopoverProps:Object,onClear:Function,onPatternInput:Function,onPatternFocus:Function,onPatternBlur:Function,renderLabel:Function,status:String,inlineThemeDisabled:Boolean,ignoreComposition:{type:Boolean,default:!0},onResize:Function}),setup(e){let{mergedClsPrefixRef:a,mergedRtlRef:o}=y(e),s=x(`InternalSelection`,o,a),d=l(null),f=l(null),p=l(null),m=l(null),h=l(null),g=l(null),v=l(null),S=l(null),C=l(null),w=l(null),T=l(!1),E=l(!1),O=l(!1),k=b(`InternalSelection`,`-internal-selection`,be,ne,e,u(e,`clsPrefix`)),A=i(()=>e.clearable&&!e.disabled&&(O.value||e.active)),j=i(()=>e.selectedOption?e.renderTag?e.renderTag({option:e.selectedOption,handleClose:()=>{}}):e.renderLabel?e.renderLabel(e.selectedOption,!0):D(e.selectedOption[e.labelField],e.selectedOption,!0):e.placeholder),M=i(()=>{let t=e.selectedOption;if(t)return t[e.labelField]}),P=i(()=>e.multiple?!!(Array.isArray(e.selectedOptions)&&e.selectedOptions.length):e.selectedOption!==null);function F(){var t;let{value:n}=d;if(n){let{value:r}=f;r&&(r.style.width=`${n.offsetWidth}px`,e.maxTagCount!==`responsive`&&((t=C.value)==null||t.sync({showAllItemsBeforeCalculate:!1})))}}function I(){let{value:e}=w;e&&(e.style.display=`none`)}function L(){let{value:e}=w;e&&(e.style.display=`inline-block`)}t(u(e,`active`),e=>{e||I()}),t(u(e,`pattern`),()=>{e.multiple&&c(F)});function R(t){let{onFocus:n}=e;n&&n(t)}function z(t){let{onBlur:n}=e;n&&n(t)}function B(t){let{onDeleteOption:n}=e;n&&n(t)}function re(t){let{onClear:n}=e;n&&n(t)}function V(t){let{onPatternInput:n}=e;n&&n(t)}function ie(e){var t;(!e.relatedTarget||!((t=p.value)!=null&&t.contains(e.relatedTarget)))&&R(e)}function ae(e){var t;(t=p.value)!=null&&t.contains(e.relatedTarget)||z(e)}function oe(e){re(e)}function H(){O.value=!0}function U(){O.value=!1}function W(t){!e.active||!e.filterable||t.target!==f.value&&t.preventDefault()}function G(e){B(e)}let K=l(!1);function se(t){if(t.key===`Backspace`&&!K.value&&!e.pattern.length){let{selectedOptions:t}=e;t!=null&&t.length&&G(t[t.length-1])}}let q=null;function ce(t){let{value:n}=d;n&&(n.textContent=t.target.value,F()),e.ignoreComposition&&K.value?q=t:V(t)}function le(){K.value=!0}function ue(){K.value=!1,e.ignoreComposition&&V(q),q=null}function J(t){var n;E.value=!0,(n=e.onPatternFocus)==null||n.call(e,t)}function Y(t){var n;E.value=!1,(n=e.onPatternBlur)==null||n.call(e,t)}function de(){var t,n;if(e.filterable)E.value=!1,(t=g.value)==null||t.blur(),(n=f.value)==null||n.blur();else if(e.multiple){let{value:e}=m;e==null||e.blur()}else{let{value:e}=h;e==null||e.blur()}}function fe(){var t,n,r;e.filterable?(E.value=!1,(t=g.value)==null||t.focus()):e.multiple?(n=m.value)==null||n.focus():(r=h.value)==null||r.focus()}function pe(){let{value:e}=f;e&&(L(),e.focus())}function me(){let{value:e}=f;e&&e.blur()}function he(e){let{value:t}=v;t&&t.setTextContent(`+${e}`)}function ge(){let{value:e}=S;return e}function X(){return f.value}let Z=null;function Q(){Z!==null&&window.clearTimeout(Z)}function _e(){e.active||(Q(),Z=window.setTimeout(()=>{P.value&&(T.value=!0)},100))}function ve(){Q()}function ye(e){e||(Q(),T.value=!1)}t(P,e=>{e||(T.value=!1)}),r(()=>{n(()=>{let t=g.value;t&&(e.disabled?t.removeAttribute(`tabindex`):t.tabIndex=E.value?-1:0)})}),N(p,e.onResize);let{inlineThemeDisabled:xe}=e,Se=i(()=>{let{size:t}=e,{common:{cubicBezierEaseInOut:n},self:{fontWeight:r,borderRadius:i,color:a,placeholderColor:o,textColor:s,paddingSingle:c,paddingMultiple:l,caretColor:u,colorDisabled:d,textColorDisabled:f,placeholderColorDisabled:p,colorActive:m,boxShadowFocus:h,boxShadowActive:g,boxShadowHover:v,border:y,borderFocus:b,borderHover:x,borderActive:S,arrowColor:C,arrowColorDisabled:w,loadingColor:T,colorActiveWarning:te,boxShadowFocusWarning:E,boxShadowActiveWarning:D,boxShadowHoverWarning:O,borderWarning:ne,borderFocusWarning:A,borderHoverWarning:j,borderActiveWarning:M,colorActiveError:N,boxShadowFocusError:P,boxShadowActiveError:F,boxShadowHoverError:I,borderError:L,borderFocusError:R,borderHoverError:z,borderActiveError:B,clearColor:re,clearColorHover:V,clearColorPressed:ie,clearSize:ae,arrowSize:oe,[_(`height`,t)]:H,[_(`fontSize`,t)]:U}}=k.value,W=ee(c),G=ee(l);return{"--n-bezier":n,"--n-border":y,"--n-border-active":S,"--n-border-focus":b,"--n-border-hover":x,"--n-border-radius":i,"--n-box-shadow-active":g,"--n-box-shadow-focus":h,"--n-box-shadow-hover":v,"--n-caret-color":u,"--n-color":a,"--n-color-active":m,"--n-color-disabled":d,"--n-font-size":U,"--n-height":H,"--n-padding-single-top":W.top,"--n-padding-multiple-top":G.top,"--n-padding-single-right":W.right,"--n-padding-multiple-right":G.right,"--n-padding-single-left":W.left,"--n-padding-multiple-left":G.left,"--n-padding-single-bottom":W.bottom,"--n-padding-multiple-bottom":G.bottom,"--n-placeholder-color":o,"--n-placeholder-color-disabled":p,"--n-text-color":s,"--n-text-color-disabled":f,"--n-arrow-color":C,"--n-arrow-color-disabled":w,"--n-loading-color":T,"--n-color-active-warning":te,"--n-box-shadow-focus-warning":E,"--n-box-shadow-active-warning":D,"--n-box-shadow-hover-warning":O,"--n-border-warning":ne,"--n-border-focus-warning":A,"--n-border-hover-warning":j,"--n-border-active-warning":M,"--n-color-active-error":N,"--n-box-shadow-focus-error":P,"--n-box-shadow-active-error":F,"--n-box-shadow-hover-error":I,"--n-border-error":L,"--n-border-focus-error":R,"--n-border-hover-error":z,"--n-border-active-error":B,"--n-clear-size":ae,"--n-clear-color":re,"--n-clear-color-hover":V,"--n-clear-color-pressed":ie,"--n-arrow-size":oe,"--n-font-weight":r}}),$=xe?te(`internal-selection`,i(()=>e.size[0]),Se,e):void 0;return{mergedTheme:k,mergedClearable:A,mergedClsPrefix:a,rtlEnabled:s,patternInputFocused:E,filterablePlaceholder:j,label:M,selected:P,showTagsPanel:T,isComposing:K,counterRef:v,counterWrapperRef:S,patternInputMirrorRef:d,patternInputRef:f,selfRef:p,multipleElRef:m,singleElRef:h,patternInputWrapperRef:g,overflowRef:C,inputTagElRef:w,handleMouseDown:W,handleFocusin:ie,handleClear:oe,handleMouseEnter:H,handleMouseLeave:U,handleDeleteOption:G,handlePatternKeyDown:se,handlePatternInputInput:ce,handlePatternInputBlur:Y,handlePatternInputFocus:J,handleMouseEnterCounter:_e,handleMouseLeaveCounter:ve,handleFocusout:ae,handleCompositionEnd:ue,handleCompositionStart:le,onPopoverUpdateShow:ye,focus:fe,focusInput:pe,blur:de,blurInput:me,updateCounter:he,getCounter:ge,getTail:X,renderLabel:e.renderLabel,cssVars:xe?void 0:Se,themeClass:$==null?void 0:$.themeClass,onRender:$==null?void 0:$.onRender}},render(){let{status:t,multiple:n,size:r,disabled:i,filterable:a,maxTagCount:o,bordered:c,clsPrefix:l,ellipsisTagPopoverProps:u,onRender:d,renderTag:f,renderLabel:p}=this;d==null||d();let m=o===`responsive`,h=typeof o==`number`,g=m||h,_=e(w,null,{default:()=>e(O,{clsPrefix:l,loading:this.loading,showArrow:this.showArrow,showClear:this.mergedClearable&&this.selected,onClear:this.handleClear},{default:()=>{var e,t;return(t=(e=this.$slots).arrow)==null?void 0:t.call(e)}})}),v;if(n){let{labelField:t}=this,n=n=>e(`div`,{class:`${l}-base-selection-tag-wrapper`,key:n.value},f?f({option:n,handleClose:()=>{this.handleDeleteOption(n)}}):e(k,{size:r,closable:!n.disabled,disabled:i,onClose:()=>{this.handleDeleteOption(n)},internalCloseIsButtonTag:!1,internalCloseFocusable:!1},{default:()=>p?p(n,!0):D(n[t],n,!0)})),c=()=>(h?this.selectedOptions.slice(0,o):this.selectedOptions).map(n),d=a?e(`div`,{class:`${l}-base-selection-input-tag`,ref:`inputTagElRef`,key:`__input-tag__`},e(`input`,Object.assign({},this.inputProps,{ref:`patternInputRef`,tabindex:-1,disabled:i,value:this.pattern,autofocus:this.autofocus,class:`${l}-base-selection-input-tag__input`,onBlur:this.handlePatternInputBlur,onFocus:this.handlePatternInputFocus,onKeydown:this.handlePatternKeyDown,onInput:this.handlePatternInputInput,onCompositionstart:this.handleCompositionStart,onCompositionend:this.handleCompositionEnd})),e(`span`,{ref:`patternInputMirrorRef`,class:`${l}-base-selection-input-tag__mirror`},this.pattern)):null,y=m?()=>e(`div`,{class:`${l}-base-selection-tag-wrapper`,ref:`counterWrapperRef`},e(k,{size:r,ref:`counterRef`,onMouseenter:this.handleMouseEnterCounter,onMouseleave:this.handleMouseLeaveCounter,disabled:i})):void 0,b;if(h){let t=this.selectedOptions.length-o;t>0&&(b=e(`div`,{class:`${l}-base-selection-tag-wrapper`,key:`__counter__`},e(k,{size:r,ref:`counterRef`,onMouseenter:this.handleMouseEnterCounter,disabled:i},{default:()=>`+${t}`})))}let x=m?a?e(M,{ref:`overflowRef`,updateCounter:this.updateCounter,getCounter:this.getCounter,getTail:this.getTail,style:{width:`100%`,display:`flex`,overflow:`hidden`}},{default:c,counter:y,tail:()=>d}):e(M,{ref:`overflowRef`,updateCounter:this.updateCounter,getCounter:this.getCounter,style:{width:`100%`,display:`flex`,overflow:`hidden`}},{default:c,counter:y}):h&&b?c().concat(b):c(),S=g?()=>e(`div`,{class:`${l}-base-selection-popover`},m?c():this.selectedOptions.map(n)):void 0,C=g?Object.assign({show:this.showTagsPanel,trigger:`hover`,overlap:!0,placement:`top`,width:`trigger`,onUpdateShow:this.onPopoverUpdateShow,theme:this.mergedTheme.peers.Popover,themeOverrides:this.mergedTheme.peerOverrides.Popover},u):null,w=!this.selected&&(!this.active||!this.pattern&&!this.isComposing)?e(`div`,{class:`${l}-base-selection-placeholder ${l}-base-selection-overlay`},e(`div`,{class:`${l}-base-selection-placeholder__inner`},this.placeholder)):null,T=a?e(`div`,{ref:`patternInputWrapperRef`,class:`${l}-base-selection-tags`},x,m?null:d,_):e(`div`,{ref:`multipleElRef`,class:`${l}-base-selection-tags`,tabindex:i?void 0:0},x,_);v=e(s,null,g?e(E,Object.assign({},C,{scrollable:!0,style:`max-height: calc(var(--v-target-height) * 6.6);`}),{trigger:()=>T,default:S}):T,w)}else if(a){let t=this.pattern||this.isComposing,n=this.active?!t:!this.selected,r=!this.active&&this.selected;v=e(`div`,{ref:`patternInputWrapperRef`,class:`${l}-base-selection-label`,title:this.patternInputFocused?void 0:P(this.label)},e(`input`,Object.assign({},this.inputProps,{ref:`patternInputRef`,class:`${l}-base-selection-input`,value:this.active?this.pattern:``,placeholder:``,readonly:i,disabled:i,tabindex:-1,autofocus:this.autofocus,onFocus:this.handlePatternInputFocus,onBlur:this.handlePatternInputBlur,onInput:this.handlePatternInputInput,onCompositionstart:this.handleCompositionStart,onCompositionend:this.handleCompositionEnd})),r?e(`div`,{class:`${l}-base-selection-label__render-label ${l}-base-selection-overlay`,key:`input`},e(`div`,{class:`${l}-base-selection-overlay__wrapper`},f?f({option:this.selectedOption,handleClose:()=>{}}):p?p(this.selectedOption,!0):D(this.label,this.selectedOption,!0))):null,n?e(`div`,{class:`${l}-base-selection-placeholder ${l}-base-selection-overlay`,key:`placeholder`},e(`div`,{class:`${l}-base-selection-overlay__wrapper`},this.filterablePlaceholder)):null,_)}else v=e(`div`,{ref:`singleElRef`,class:`${l}-base-selection-label`,tabindex:this.disabled?void 0:0},this.label===void 0?e(`div`,{class:`${l}-base-selection-placeholder ${l}-base-selection-overlay`,key:`placeholder`},e(`div`,{class:`${l}-base-selection-placeholder__inner`},this.placeholder)):e(`div`,{class:`${l}-base-selection-input`,title:P(this.label),key:`input`},e(`div`,{class:`${l}-base-selection-input__content`},f?f({option:this.selectedOption,handleClose:()=>{}}):p?p(this.selectedOption,!0):D(this.label,this.selectedOption,!0))),_);return e(`div`,{ref:`selfRef`,class:[`${l}-base-selection`,this.rtlEnabled&&`${l}-base-selection--rtl`,this.themeClass,t&&`${l}-base-selection--${t}-status`,{[`${l}-base-selection--active`]:this.active,[`${l}-base-selection--selected`]:this.selected||this.active&&this.pattern,[`${l}-base-selection--disabled`]:this.disabled,[`${l}-base-selection--multiple`]:this.multiple,[`${l}-base-selection--focus`]:this.focused}],style:this.cssVars,onClick:this.onClick,onMouseenter:this.handleMouseEnter,onMouseleave:this.handleMouseLeave,onKeydown:this.onKeydown,onFocusin:this.handleFocusin,onFocusout:this.handleFocusout,onMousedown:this.handleMouseDown},v,c?e(`div`,{class:`${l}-base-selection__border`}):null,c?e(`div`,{class:`${l}-base-selection__state-border`}):null)}});export{N as a,se as i,ye as n,Q as r,xe as t};