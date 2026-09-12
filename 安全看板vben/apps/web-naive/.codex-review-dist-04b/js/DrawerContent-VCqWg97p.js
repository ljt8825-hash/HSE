import{B as e,Ht as t,J as n,Ut as r,Yt as i,et as a,g as o,gt as s,it as c,k as l,vn as u,wn as d}from"./runtime-core.esm-bundler-Blp3D1W4.js";import{S as f,t as p}from"./runtime-dom.esm-bundler-CEFztc8a.js";import{B as m,L as h,R as g,V as _,i as v,j as y,n as b}from"./use-theme-BPxAT0OQ.js";import{t as x}from"./use-rtl-BtnaqIOl.js";import{a as S,t as C}from"./Scrollbar-CWE-8E6x.js";import{i as w,n as T}from"./light-DZKN5sjf.js";import{d as E,n as D,o as O,r as k,s as A,t as j,u as M}from"./src-CUbiFWM1.js";import{t as N}from"./use-merged-state-zglAmQ1M.js";import{t as P}from"./use-is-mounted-BhqLseZT.js";import{t as F}from"./format-length-mj6Hk3Qj.js";import{a as I,l as L,u as R}from"./light-BmqVi9Hd.js";import{t as z}from"./src-DYgETFML.js";import{t as B}from"./event-DLQ7I3I8.js";import{o as V}from"./resolve-slot-DbAlC7Z4.js";import{t as H}from"./Close-BaKf5mos.js";var U=l({name:`NDrawerContent`,inheritAttrs:!1,props:{blockScroll:Boolean,show:{type:Boolean,default:void 0},displayDirective:{type:String,required:!0},placement:{type:String,required:!0},contentClass:String,contentStyle:[Object,String],nativeScrollbar:{type:Boolean,required:!0},scrollbarProps:Object,trapFocus:{type:Boolean,default:!0},autoFocus:{type:Boolean,default:!0},showMask:{type:[Boolean,String],required:!0},maxWidth:Number,maxHeight:Number,minWidth:Number,minHeight:Number,resizable:Boolean,onClickoutside:Function,onAfterLeave:Function,onAfterEnter:Function,onEsc:Function},setup(e){let i=u(!!e.show),a=u(null),l=n(E),d=0,p=``,m=null,h=u(!1),g=u(!1),_=o(()=>e.placement===`top`||e.placement===`bottom`),{mergedClsPrefixRef:v,mergedRtlRef:b}=y(e),S=x(`Drawer`,b,v),C=R,w=e=>{g.value=!0,d=_.value?e.clientY:e.clientX,p=document.body.style.cursor,document.body.style.cursor=_.value?`ns-resize`:`ew-resize`,document.body.addEventListener(`mousemove`,I),document.body.addEventListener(`mouseleave`,C),document.body.addEventListener(`mouseup`,R)},T=()=>{m!==null&&(window.clearTimeout(m),m=null),g.value?h.value=!0:m=window.setTimeout(()=>{h.value=!0},300)},D=()=>{m!==null&&(window.clearTimeout(m),m=null),h.value=!1},{doUpdateHeight:j,doUpdateWidth:N}=l,P=t=>{let{maxWidth:n}=e;if(n&&t>n)return n;let{minWidth:r}=e;return r&&t<r?r:t},F=t=>{let{maxHeight:n}=e;if(n&&t>n)return n;let{minHeight:r}=e;return r&&t<r?r:t};function I(t){var n,r;if(g.value)if(_.value){let r=((n=a.value)==null?void 0:n.offsetHeight)||0,i=d-t.clientY;r+=e.placement===`bottom`?i:-i,r=F(r),j(r),d=t.clientY}else{let n=((r=a.value)==null?void 0:r.offsetWidth)||0,i=d-t.clientX;n+=e.placement===`right`?i:-i,n=P(n),N(n),d=t.clientX}}function R(){g.value&&(d=0,g.value=!1,document.body.style.cursor=p,document.body.removeEventListener(`mousemove`,I),document.body.removeEventListener(`mouseup`,R),document.body.removeEventListener(`mouseleave`,C))}r(()=>{e.show&&(i.value=!0)}),t(()=>e.show,e=>{e||R()}),c(()=>{R()});let z=o(()=>{let{show:t}=e,n=[[f,t]];return e.showMask||n.push([k,e.onClickoutside,void 0,{capture:!0}]),n});function B(){var t;i.value=!1,(t=e.onAfterLeave)==null||t.call(e)}return L(o(()=>e.blockScroll&&i.value)),s(M,a),s(O,null),s(A,null),{bodyRef:a,rtlEnabled:S,mergedClsPrefix:l.mergedClsPrefixRef,isMounted:l.isMountedRef,mergedTheme:l.mergedThemeRef,displayed:i,transitionName:o(()=>({right:`slide-in-from-right-transition`,left:`slide-in-from-left-transition`,top:`slide-in-from-top-transition`,bottom:`slide-in-from-bottom-transition`})[e.placement]),handleAfterLeave:B,bodyDirectives:z,handleMousedownResizeTrigger:w,handleMouseenterResizeTrigger:T,handleMouseleaveResizeTrigger:D,isDragging:g,isHoverOnResizeTrigger:h}},render(){let{$slots:t,mergedClsPrefix:n}=this;return this.displayDirective===`show`||this.displayed||this.show?i(e(`div`,{role:`none`},e(z,{disabled:!this.showMask||!this.trapFocus,active:this.show,autoFocus:this.autoFocus,onEsc:this.onEsc},{default:()=>e(p,{name:this.transitionName,appear:this.isMounted,onAfterEnter:this.onAfterEnter,onAfterLeave:this.handleAfterLeave},{default:()=>i(e(`div`,a(this.$attrs,{role:`dialog`,ref:`bodyRef`,"aria-modal":`true`,class:[`${n}-drawer`,this.rtlEnabled&&`${n}-drawer--rtl`,`${n}-drawer--${this.placement}-placement`,this.isDragging&&`${n}-drawer--unselectable`,this.nativeScrollbar&&`${n}-drawer--native-scrollbar`]}),[this.resizable?e(`div`,{class:[`${n}-drawer__resize-trigger`,(this.isDragging||this.isHoverOnResizeTrigger)&&`${n}-drawer__resize-trigger--hover`],onMouseenter:this.handleMouseenterResizeTrigger,onMouseleave:this.handleMouseleaveResizeTrigger,onMousedown:this.handleMousedownResizeTrigger}):null,this.nativeScrollbar?e(`div`,{class:[`${n}-drawer-content-wrapper`,this.contentClass],style:this.contentStyle,role:`none`},t):e(C,Object.assign({},this.scrollbarProps,{contentStyle:this.contentStyle,contentClass:[`${n}-drawer-content-wrapper`,this.contentClass],theme:this.mergedTheme.peers.Scrollbar,themeOverrides:this.mergedTheme.peerOverrides.Scrollbar}),t)]),this.bodyDirectives)})})),[[f,this.displayDirective===`if`||this.displayed||this.show]]):null}}),{cubicBezierEaseIn:W,cubicBezierEaseOut:G}=v;function K({duration:e=`0.3s`,leaveDuration:t=`0.2s`,name:n=`slide-in-from-bottom`}={}){return[h(`&.${n}-transition-leave-active`,{transition:`transform ${t} ${W}`}),h(`&.${n}-transition-enter-active`,{transition:`transform ${e} ${G}`}),h(`&.${n}-transition-enter-to`,{transform:`translateY(0)`}),h(`&.${n}-transition-enter-from`,{transform:`translateY(100%)`}),h(`&.${n}-transition-leave-from`,{transform:`translateY(0)`}),h(`&.${n}-transition-leave-to`,{transform:`translateY(100%)`})]}var{cubicBezierEaseIn:q,cubicBezierEaseOut:J}=v;function Y({duration:e=`0.3s`,leaveDuration:t=`0.2s`,name:n=`slide-in-from-left`}={}){return[h(`&.${n}-transition-leave-active`,{transition:`transform ${t} ${q}`}),h(`&.${n}-transition-enter-active`,{transition:`transform ${e} ${J}`}),h(`&.${n}-transition-enter-to`,{transform:`translateX(0)`}),h(`&.${n}-transition-enter-from`,{transform:`translateX(-100%)`}),h(`&.${n}-transition-leave-from`,{transform:`translateX(0)`}),h(`&.${n}-transition-leave-to`,{transform:`translateX(-100%)`})]}var{cubicBezierEaseIn:X,cubicBezierEaseOut:Z}=v;function Q({duration:e=`0.3s`,leaveDuration:t=`0.2s`,name:n=`slide-in-from-right`}={}){return[h(`&.${n}-transition-leave-active`,{transition:`transform ${t} ${X}`}),h(`&.${n}-transition-enter-active`,{transition:`transform ${e} ${Z}`}),h(`&.${n}-transition-enter-to`,{transform:`translateX(0)`}),h(`&.${n}-transition-enter-from`,{transform:`translateX(100%)`}),h(`&.${n}-transition-leave-from`,{transform:`translateX(0)`}),h(`&.${n}-transition-leave-to`,{transform:`translateX(100%)`})]}var{cubicBezierEaseIn:$,cubicBezierEaseOut:ee}=v;function te({duration:e=`0.3s`,leaveDuration:t=`0.2s`,name:n=`slide-in-from-top`}={}){return[h(`&.${n}-transition-leave-active`,{transition:`transform ${t} ${$}`}),h(`&.${n}-transition-enter-active`,{transition:`transform ${e} ${ee}`}),h(`&.${n}-transition-enter-to`,{transform:`translateY(0)`}),h(`&.${n}-transition-enter-from`,{transform:`translateY(-100%)`}),h(`&.${n}-transition-leave-from`,{transform:`translateY(0)`}),h(`&.${n}-transition-leave-to`,{transform:`translateY(-100%)`})]}var ne=h([g(`drawer`,`
 word-break: break-word;
 line-height: var(--n-line-height);
 position: absolute;
 pointer-events: all;
 box-shadow: var(--n-box-shadow);
 transition:
 background-color .3s var(--n-bezier),
 color .3s var(--n-bezier);
 background-color: var(--n-color);
 color: var(--n-text-color);
 box-sizing: border-box;
 `,[Q(),Y(),te(),K(),_(`unselectable`,`
 user-select: none; 
 -webkit-user-select: none;
 `),_(`native-scrollbar`,[g(`drawer-content-wrapper`,`
 overflow: auto;
 height: 100%;
 `)]),m(`resize-trigger`,`
 position: absolute;
 background-color: #0000;
 transition: background-color .3s var(--n-bezier);
 `,[_(`hover`,`
 background-color: var(--n-resize-trigger-color-hover);
 `)]),g(`drawer-content-wrapper`,`
 box-sizing: border-box;
 `),g(`drawer-content`,`
 height: 100%;
 display: flex;
 flex-direction: column;
 `,[_(`native-scrollbar`,[g(`drawer-body-content-wrapper`,`
 height: 100%;
 overflow: auto;
 `)]),g(`drawer-body`,`
 flex: 1 0 0;
 overflow: hidden;
 `),g(`drawer-body-content-wrapper`,`
 box-sizing: border-box;
 padding: var(--n-body-padding);
 `),g(`drawer-header`,`
 font-weight: var(--n-title-font-weight);
 line-height: 1;
 font-size: var(--n-title-font-size);
 color: var(--n-title-text-color);
 padding: var(--n-header-padding);
 transition: border .3s var(--n-bezier);
 border-bottom: 1px solid var(--n-divider-color);
 border-bottom: var(--n-header-border-bottom);
 display: flex;
 justify-content: space-between;
 align-items: center;
 `,[m(`main`,`
 flex: 1;
 `),m(`close`,`
 margin-left: 6px;
 transition:
 background-color .3s var(--n-bezier),
 color .3s var(--n-bezier);
 `)]),g(`drawer-footer`,`
 display: flex;
 justify-content: flex-end;
 border-top: var(--n-footer-border-top);
 transition: border .3s var(--n-bezier);
 padding: var(--n-footer-padding);
 `)]),_(`right-placement`,`
 top: 0;
 bottom: 0;
 right: 0;
 border-top-left-radius: var(--n-border-radius);
 border-bottom-left-radius: var(--n-border-radius);
 `,[m(`resize-trigger`,`
 width: 3px;
 height: 100%;
 top: 0;
 left: 0;
 transform: translateX(-1.5px);
 cursor: ew-resize;
 `)]),_(`left-placement`,`
 top: 0;
 bottom: 0;
 left: 0;
 border-top-right-radius: var(--n-border-radius);
 border-bottom-right-radius: var(--n-border-radius);
 `,[m(`resize-trigger`,`
 width: 3px;
 height: 100%;
 top: 0;
 right: 0;
 transform: translateX(1.5px);
 cursor: ew-resize;
 `)]),_(`top-placement`,`
 top: 0;
 left: 0;
 right: 0;
 border-bottom-left-radius: var(--n-border-radius);
 border-bottom-right-radius: var(--n-border-radius);
 `,[m(`resize-trigger`,`
 width: 100%;
 height: 3px;
 bottom: 0;
 left: 0;
 transform: translateY(1.5px);
 cursor: ns-resize;
 `)]),_(`bottom-placement`,`
 left: 0;
 bottom: 0;
 right: 0;
 border-top-left-radius: var(--n-border-radius);
 border-top-right-radius: var(--n-border-radius);
 `,[m(`resize-trigger`,`
 width: 100%;
 height: 3px;
 top: 0;
 left: 0;
 transform: translateY(-1.5px);
 cursor: ns-resize;
 `)])]),h(`body`,[h(`>`,[g(`drawer-container`,`
 position: fixed;
 `)])]),g(`drawer-container`,`
 position: relative;
 position: absolute;
 left: 0;
 right: 0;
 top: 0;
 bottom: 0;
 pointer-events: none;
 `,[h(`> *`,`
 pointer-events: all;
 `)]),g(`drawer-mask`,`
 background-color: rgba(0, 0, 0, .3);
 position: absolute;
 left: 0;
 right: 0;
 top: 0;
 bottom: 0;
 `,[_(`invisible`,`
 background-color: rgba(0, 0, 0, 0)
 `),S({enterDuration:`0.2s`,leaveDuration:`0.2s`,enterCubicBezier:`var(--n-bezier-in)`,leaveCubicBezier:`var(--n-bezier-out)`})])]),re=l({name:`Drawer`,inheritAttrs:!1,props:Object.assign(Object.assign({},b.props),{show:Boolean,width:[Number,String],height:[Number,String],placement:{type:String,default:`right`},maskClosable:{type:Boolean,default:!0},showMask:{type:[Boolean,String],default:!0},to:[String,Object],displayDirective:{type:String,default:`if`},nativeScrollbar:{type:Boolean,default:!0},zIndex:Number,onMaskClick:Function,scrollbarProps:Object,contentClass:String,contentStyle:[Object,String],trapFocus:{type:Boolean,default:!0},onEsc:Function,autoFocus:{type:Boolean,default:!0},closeOnEsc:{type:Boolean,default:!0},blockScroll:{type:Boolean,default:!0},maxWidth:Number,maxHeight:Number,minWidth:Number,minHeight:Number,resizable:Boolean,defaultWidth:{type:[Number,String],default:251},defaultHeight:{type:[Number,String],default:251},onUpdateWidth:[Function,Array],onUpdateHeight:[Function,Array],"onUpdate:width":[Function,Array],"onUpdate:height":[Function,Array],"onUpdate:show":[Function,Array],onUpdateShow:[Function,Array],onAfterEnter:Function,onAfterLeave:Function,drawerStyle:[String,Object],drawerClass:String,target:null,onShow:Function,onHide:Function}),setup(e){let{mergedClsPrefixRef:t,namespaceRef:n,inlineThemeDisabled:r}=y(e),i=P(),a=b(`Drawer`,`-drawer`,ne,I,e,t),c=u(e.defaultWidth),l=u(e.defaultHeight),f=N(d(e,`width`),c),p=N(d(e,`height`),l),m=o(()=>{let{placement:t}=e;return t===`top`||t===`bottom`?``:F(f.value)}),h=o(()=>{let{placement:t}=e;return t===`left`||t===`right`?``:F(p.value)}),g=t=>{let{onUpdateWidth:n,"onUpdate:width":r}=e;n&&V(n,t),r&&V(r,t),c.value=t},_=t=>{let{onUpdateHeight:n,"onUpdate:width":r}=e;n&&V(n,t),r&&V(r,t),l.value=t},v=o(()=>[{width:m.value,height:h.value},e.drawerStyle||``]);function x(t){let{onMaskClick:n,maskClosable:r}=e;r&&D(!1),n&&n(t)}function S(e){x(e)}let C=R();function w(t){var n;(n=e.onEsc)==null||n.call(e),e.show&&e.closeOnEsc&&B(t)&&(C.value||D(!1))}function D(t){let{onHide:n,onUpdateShow:r,"onUpdate:show":i}=e;r&&V(r,t),i&&V(i,t),n&&!t&&V(n,t)}s(E,{isMountedRef:i,mergedThemeRef:a,mergedClsPrefixRef:t,doUpdateShow:D,doUpdateHeight:_,doUpdateWidth:g});let O=o(()=>{let{common:{cubicBezierEaseInOut:e,cubicBezierEaseIn:t,cubicBezierEaseOut:n},self:{color:r,textColor:i,boxShadow:o,lineHeight:s,headerPadding:c,footerPadding:l,borderRadius:u,bodyPadding:d,titleFontSize:f,titleTextColor:p,titleFontWeight:m,headerBorderBottom:h,footerBorderTop:g,closeIconColor:_,closeIconColorHover:v,closeIconColorPressed:y,closeColorHover:b,closeColorPressed:x,closeIconSize:S,closeSize:C,closeBorderRadius:w,resizableTriggerColorHover:T}}=a.value;return{"--n-line-height":s,"--n-color":r,"--n-border-radius":u,"--n-text-color":i,"--n-box-shadow":o,"--n-bezier":e,"--n-bezier-out":n,"--n-bezier-in":t,"--n-header-padding":c,"--n-body-padding":d,"--n-footer-padding":l,"--n-title-text-color":p,"--n-title-font-size":f,"--n-title-font-weight":m,"--n-header-border-bottom":h,"--n-footer-border-top":g,"--n-close-icon-color":_,"--n-close-icon-color-hover":v,"--n-close-icon-color-pressed":y,"--n-close-size":C,"--n-close-color-hover":b,"--n-close-color-pressed":x,"--n-close-icon-size":S,"--n-close-border-radius":w,"--n-resize-trigger-color-hover":T}}),k=r?T(`drawer`,void 0,O,e):void 0;return{mergedClsPrefix:t,namespace:n,mergedBodyStyle:v,handleOutsideClick:S,handleMaskClick:x,handleEsc:w,mergedTheme:a,cssVars:r?void 0:O,themeClass:k==null?void 0:k.themeClass,onRender:k==null?void 0:k.onRender,isMounted:i}},render(){let{mergedClsPrefix:t}=this;return e(j,{to:this.to,show:this.show},{default:()=>{var n;return(n=this.onRender)==null||n.call(this),i(e(`div`,{class:[`${t}-drawer-container`,this.namespace,this.themeClass],style:this.cssVars,role:`none`},this.showMask?e(p,{name:`fade-in-transition`,appear:this.isMounted},{default:()=>this.show?e(`div`,{"aria-hidden":!0,class:[`${t}-drawer-mask`,this.showMask===`transparent`&&`${t}-drawer-mask--invisible`],onClick:this.handleMaskClick}):null}):null,e(U,Object.assign({},this.$attrs,{class:[this.drawerClass,this.$attrs.class],style:[this.mergedBodyStyle,this.$attrs.style],blockScroll:this.blockScroll,contentStyle:this.contentStyle,contentClass:this.contentClass,placement:this.placement,scrollbarProps:this.scrollbarProps,show:this.show,displayDirective:this.displayDirective,nativeScrollbar:this.nativeScrollbar,onAfterEnter:this.onAfterEnter,onAfterLeave:this.onAfterLeave,trapFocus:this.trapFocus,autoFocus:this.autoFocus,resizable:this.resizable,maxHeight:this.maxHeight,minHeight:this.minHeight,maxWidth:this.maxWidth,minWidth:this.minWidth,showMask:this.showMask,onEsc:this.handleEsc,onClickoutside:this.handleOutsideClick}),this.$slots)),[[D,{zIndex:this.zIndex,enabled:this.show}]])}})}}),ie=l({name:`DrawerContent`,props:{title:String,headerClass:String,headerStyle:[Object,String],footerClass:String,footerStyle:[Object,String],bodyClass:String,bodyStyle:[Object,String],bodyContentClass:String,bodyContentStyle:[Object,String],nativeScrollbar:{type:Boolean,default:!0},scrollbarProps:Object,closable:Boolean},slots:Object,setup(){let e=n(E,null);e||w(`drawer-content`,"`n-drawer-content` must be placed inside `n-drawer`.");let{doUpdateShow:t}=e;function r(){t(!1)}return{handleCloseClick:r,mergedTheme:e.mergedThemeRef,mergedClsPrefix:e.mergedClsPrefixRef}},render(){let{title:t,mergedClsPrefix:n,nativeScrollbar:r,mergedTheme:i,bodyClass:a,bodyStyle:o,bodyContentClass:s,bodyContentStyle:c,headerClass:l,headerStyle:u,footerClass:d,footerStyle:f,scrollbarProps:p,closable:m,$slots:h}=this;return e(`div`,{role:`none`,class:[`${n}-drawer-content`,r&&`${n}-drawer-content--native-scrollbar`]},h.header||t||m?e(`div`,{class:[`${n}-drawer-header`,l],style:u,role:`none`},e(`div`,{class:`${n}-drawer-header__main`,role:`heading`,"aria-level":`1`},h.header===void 0?t:h.header()),m&&e(H,{onClick:this.handleCloseClick,clsPrefix:n,class:`${n}-drawer-header__close`,absolute:!0})):null,r?e(`div`,{class:[`${n}-drawer-body`,a],style:o,role:`none`},e(`div`,{class:[`${n}-drawer-body-content-wrapper`,s],style:c,role:`none`},h)):e(C,Object.assign({themeOverrides:i.peerOverrides.Scrollbar,theme:i.peers.Scrollbar},p,{class:`${n}-drawer-body`,contentClass:[`${n}-drawer-body-content-wrapper`,s],contentStyle:c}),h),h.footer?e(`div`,{class:[`${n}-drawer-footer`,d],style:f,role:`none`},h.footer()):null)}});export{re as n,ie as t};