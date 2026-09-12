import{B as e,J as t,Ut as n,ct as r,g as i,gn as a,gt as o,k as s,o as c,tt as l,u,vn as d}from"./runtime-core.esm-bundler-Blp3D1W4.js";import{t as f}from"./runtime-dom.esm-bundler-CEFztc8a.js";import{B as p,F as m,G as h,I as g,L as _,R as v,U as y,V as b,W as x,j as S,n as C,t as w}from"./use-theme-BPxAT0OQ.js";import{t as T}from"./use-rtl-BtnaqIOl.js";import{r as E,s as D,t as O}from"./Scrollbar-BGIkiQ6T.js";import{r as k}from"./css-DEmdllcC.js";import{i as A,n as j,t as M}from"./light-DZKN5sjf.js";import{t as N}from"./misc-DDs3MKLt.js";import{n as P,o as F,s as I}from"./use-form-item-DMd-WY4m.js";import{t as ee}from"./keep-DRiZpm3l.js";import{n as L,t as te}from"./omit-_j9wL4dr.js";import{n as R,t as z}from"./Close-CVbk4ZWe.js";import{i as B,n as V,r as H,t as ne}from"./Warning-BFqr2Kf7.js";var re={paddingSmall:`12px 16px 12px`,paddingMedium:`19px 24px 20px`,paddingLarge:`23px 32px 24px`,paddingHuge:`27px 40px 28px`,titleFontSizeSmall:`16px`,titleFontSizeMedium:`18px`,titleFontSizeLarge:`18px`,titleFontSizeHuge:`18px`,closeIconSize:`18px`,closeSize:`22px`};function U(e){let{primaryColor:t,borderRadius:n,lineHeight:r,fontSize:i,cardColor:a,textColor2:o,textColor1:s,dividerColor:c,fontWeightStrong:l,closeIconColor:u,closeIconColorHover:d,closeIconColorPressed:f,closeColorHover:p,closeColorPressed:m,modalColor:h,boxShadow1:g,popoverColor:_,actionColor:v}=e;return Object.assign(Object.assign({},re),{lineHeight:r,color:a,colorModal:h,colorPopover:_,colorTarget:t,colorEmbedded:v,colorEmbeddedModal:v,colorEmbeddedPopover:v,textColor:o,titleTextColor:s,borderColor:c,actionColor:v,titleFontWeight:l,closeColorHover:p,closeColorPressed:m,closeBorderRadius:n,closeIconColor:u,closeIconColorHover:d,closeIconColorPressed:f,fontSizeSmall:i,fontSizeMedium:i,fontSizeLarge:i,fontSizeHuge:i,boxShadow:g,borderRadius:n})}var W={name:`Card`,common:M,self:U},G=v(`card-content`,`
 flex: 1;
 min-width: 0;
 box-sizing: border-box;
 padding: 0 var(--n-padding-left) var(--n-padding-bottom) var(--n-padding-left);
 font-size: var(--n-font-size);
`),ie=_([v(`card`,`
 font-size: var(--n-font-size);
 line-height: var(--n-line-height);
 display: flex;
 flex-direction: column;
 width: 100%;
 box-sizing: border-box;
 position: relative;
 border-radius: var(--n-border-radius);
 background-color: var(--n-color);
 color: var(--n-text-color);
 word-break: break-word;
 transition: 
 color .3s var(--n-bezier),
 background-color .3s var(--n-bezier),
 box-shadow .3s var(--n-bezier),
 border-color .3s var(--n-bezier);
 `,[g({background:`var(--n-color-modal)`}),b(`hoverable`,[_(`&:hover`,`box-shadow: var(--n-box-shadow);`)]),b(`content-segmented`,[_(`>`,[v(`card-content`,`
 padding-top: var(--n-padding-bottom);
 `),p(`content-scrollbar`,[_(`>`,[v(`scrollbar-container`,[_(`>`,[v(`card-content`,`
 padding-top: var(--n-padding-bottom);
 `)])])])])])]),b(`content-soft-segmented`,[_(`>`,[v(`card-content`,`
 margin: 0 var(--n-padding-left);
 padding: var(--n-padding-bottom) 0;
 `),p(`content-scrollbar`,[_(`>`,[v(`scrollbar-container`,[_(`>`,[v(`card-content`,`
 margin: 0 var(--n-padding-left);
 padding: var(--n-padding-bottom) 0;
 `)])])])])])]),b(`footer-segmented`,[_(`>`,[p(`footer`,`
 padding-top: var(--n-padding-bottom);
 `)])]),b(`footer-soft-segmented`,[_(`>`,[p(`footer`,`
 padding: var(--n-padding-bottom) 0;
 margin: 0 var(--n-padding-left);
 `)])]),_(`>`,[v(`card-header`,`
 box-sizing: border-box;
 display: flex;
 align-items: center;
 font-size: var(--n-title-font-size);
 padding:
 var(--n-padding-top)
 var(--n-padding-left)
 var(--n-padding-bottom)
 var(--n-padding-left);
 `,[p(`main`,`
 font-weight: var(--n-title-font-weight);
 transition: color .3s var(--n-bezier);
 flex: 1;
 min-width: 0;
 color: var(--n-title-text-color);
 `),p(`extra`,`
 display: flex;
 align-items: center;
 font-size: var(--n-font-size);
 font-weight: 400;
 transition: color .3s var(--n-bezier);
 color: var(--n-text-color);
 `),p(`close`,`
 margin: 0 0 0 8px;
 transition:
 background-color .3s var(--n-bezier),
 color .3s var(--n-bezier);
 `)]),p(`action`,`
 box-sizing: border-box;
 transition:
 background-color .3s var(--n-bezier),
 border-color .3s var(--n-bezier);
 background-clip: padding-box;
 background-color: var(--n-action-color);
 `),G,v(`card-content`,[_(`&:first-child`,`
 padding-top: var(--n-padding-bottom);
 `)]),p(`content-scrollbar`,`
 display: flex;
 flex-direction: column;
 `,[_(`>`,[v(`scrollbar-container`,[_(`>`,[G])])]),_(`&:first-child >`,[v(`scrollbar-container`,[_(`>`,[v(`card-content`,`
 padding-top: var(--n-padding-bottom);
 `)])])])]),p(`footer`,`
 box-sizing: border-box;
 padding: 0 var(--n-padding-left) var(--n-padding-bottom) var(--n-padding-left);
 font-size: var(--n-font-size);
 `,[_(`&:first-child`,`
 padding-top: var(--n-padding-bottom);
 `)]),p(`action`,`
 background-color: var(--n-action-color);
 padding: var(--n-padding-bottom) var(--n-padding-left);
 border-bottom-left-radius: var(--n-border-radius);
 border-bottom-right-radius: var(--n-border-radius);
 `)]),v(`card-cover`,`
 overflow: hidden;
 width: 100%;
 border-radius: var(--n-border-radius) var(--n-border-radius) 0 0;
 `,[_(`img`,`
 display: block;
 width: 100%;
 `)]),b(`bordered`,`
 border: 1px solid var(--n-border-color);
 `,[_(`&:target`,`border-color: var(--n-color-target);`)]),b(`action-segmented`,[_(`>`,[p(`action`,[_(`&:not(:first-child)`,`
 border-top: 1px solid var(--n-border-color);
 `)])])]),b(`content-segmented, content-soft-segmented`,[_(`>`,[v(`card-content`,`
 transition: border-color 0.3s var(--n-bezier);
 `,[_(`&:not(:first-child)`,`
 border-top: 1px solid var(--n-border-color);
 `)]),p(`content-scrollbar`,`
 transition: border-color 0.3s var(--n-bezier);
 `,[_(`&:not(:first-child)`,`
 border-top: 1px solid var(--n-border-color);
 `)])])]),b(`footer-segmented, footer-soft-segmented`,[_(`>`,[p(`footer`,`
 transition: border-color 0.3s var(--n-bezier);
 `,[_(`&:not(:first-child)`,`
 border-top: 1px solid var(--n-border-color);
 `)])])]),b(`embedded`,`
 background-color: var(--n-color-embedded);
 `)]),x(v(`card`,`
 background: var(--n-color-modal);
 `,[b(`embedded`,`
 background-color: var(--n-color-embedded-modal);
 `)])),h(v(`card`,`
 background: var(--n-color-popover);
 `,[b(`embedded`,`
 background-color: var(--n-color-embedded-popover);
 `)]))]),K={title:[String,Function],contentClass:String,contentStyle:[Object,String],contentScrollable:Boolean,headerClass:String,headerStyle:[Object,String],headerExtraClass:String,headerExtraStyle:[Object,String],footerClass:String,footerStyle:[Object,String],embedded:Boolean,segmented:{type:[Boolean,Object],default:!1},size:String,bordered:{type:Boolean,default:!0},closable:Boolean,hoverable:Boolean,role:String,onClose:[Function,Array],tag:{type:String,default:`div`},cover:Function,content:[String,Function],footer:Function,action:Function,headerExtra:Function,closeFocusable:Boolean},ae=L(K),oe=s({name:`Card`,props:Object.assign(Object.assign({},C.props),K),slots:Object,setup(e){let t=()=>{let{onClose:t}=e;t&&I(t)},{inlineThemeDisabled:n,mergedClsPrefixRef:r,mergedRtlRef:a,mergedComponentPropsRef:o}=S(e),s=C(`Card`,`-card`,ie,W,e,r),c=T(`Card`,a,r),l=i(()=>{var t,n;return e.size||((n=(t=o==null?void 0:o.value)==null?void 0:t.Card)==null?void 0:n.size)||`medium`}),u=i(()=>{let e=l.value,{self:{color:t,colorModal:n,colorTarget:r,textColor:i,titleTextColor:a,titleFontWeight:o,borderColor:c,actionColor:u,borderRadius:d,lineHeight:f,closeIconColor:p,closeIconColorHover:m,closeIconColorPressed:h,closeColorHover:g,closeColorPressed:_,closeBorderRadius:v,closeIconSize:b,closeSize:x,boxShadow:S,colorPopover:C,colorEmbedded:w,colorEmbeddedModal:T,colorEmbeddedPopover:E,[y(`padding`,e)]:D,[y(`fontSize`,e)]:O,[y(`titleFontSize`,e)]:A},common:{cubicBezierEaseInOut:j}}=s.value,{top:M,left:N,bottom:P}=k(D);return{"--n-bezier":j,"--n-border-radius":d,"--n-color":t,"--n-color-modal":n,"--n-color-popover":C,"--n-color-embedded":w,"--n-color-embedded-modal":T,"--n-color-embedded-popover":E,"--n-color-target":r,"--n-text-color":i,"--n-line-height":f,"--n-action-color":u,"--n-title-text-color":a,"--n-title-font-weight":o,"--n-close-icon-color":p,"--n-close-icon-color-hover":m,"--n-close-icon-color-pressed":h,"--n-close-color-hover":g,"--n-close-color-pressed":_,"--n-border-color":c,"--n-box-shadow":S,"--n-padding-top":M,"--n-padding-bottom":P,"--n-padding-left":N,"--n-font-size":O,"--n-title-font-size":A,"--n-close-size":x,"--n-close-icon-size":b,"--n-close-border-radius":v}}),d=n?j(`card`,i(()=>l.value[0]),u,e):void 0;return{rtlEnabled:c,mergedClsPrefix:r,mergedTheme:s,handleCloseClick:t,cssVars:n?void 0:u,themeClass:d==null?void 0:d.themeClass,onRender:d==null?void 0:d.onRender}},render(){let{segmented:t,bordered:n,hoverable:r,mergedClsPrefix:i,rtlEnabled:a,onRender:o,embedded:s,tag:c,$slots:l}=this;return o==null||o(),e(c,{class:[`${i}-card`,this.themeClass,s&&`${i}-card--embedded`,{[`${i}-card--rtl`]:a,[`${i}-card--content-scrollable`]:this.contentScrollable,[`${i}-card--content${typeof t!=`boolean`&&t.content===`soft`?`-soft`:``}-segmented`]:t===!0||t!==!1&&t.content,[`${i}-card--footer${typeof t!=`boolean`&&t.footer===`soft`?`-soft`:``}-segmented`]:t===!0||t!==!1&&t.footer,[`${i}-card--action-segmented`]:t===!0||t!==!1&&t.action,[`${i}-card--bordered`]:n,[`${i}-card--hoverable`]:r}],style:this.cssVars,role:this.role},F(l.cover,t=>{let n=this.cover?P([this.cover()]):t;return n&&e(`div`,{class:`${i}-card-cover`,role:`none`},n)}),F(l.header,t=>{let{title:n}=this,r=n?P(typeof n==`function`?[n()]:[n]):t;return r||this.closable?e(`div`,{class:[`${i}-card-header`,this.headerClass],style:this.headerStyle,role:`heading`},e(`div`,{class:`${i}-card-header__main`,role:`heading`},r),F(l[`header-extra`],t=>{let n=this.headerExtra?P([this.headerExtra()]):t;return n&&e(`div`,{class:[`${i}-card-header__extra`,this.headerExtraClass],style:this.headerExtraStyle},n)}),this.closable&&e(z,{clsPrefix:i,class:`${i}-card-header__close`,onClick:this.handleCloseClick,focusable:this.closeFocusable,absolute:!0})):null}),F(l.default,t=>{let{content:n}=this,r=n?P(typeof n==`function`?[n()]:[n]):t;return r?this.contentScrollable?e(O,{class:`${i}-card__content-scrollbar`,contentClass:[`${i}-card-content`,this.contentClass],contentStyle:this.contentStyle},r):e(`div`,{class:[`${i}-card-content`,this.contentClass],style:this.contentStyle,role:`none`},r):null}),F(l.footer,t=>{let n=this.footer?P([this.footer()]):t;return n&&e(`div`,{class:[`${i}-card__footer`,this.footerClass],style:this.footerStyle,role:`none`},n)}),F(l.action,t=>{let n=this.action?P([this.action()]):t;return n&&e(`div`,{class:`${i}-card__action`,role:`none`},n)}))}}),q=m(`n-message-api`),se=m(`n-message-provider`);function ce(){let e=t(q,null);return e===null&&A(`use-message`,"No outer <n-message-provider /> founded. See prerequisite in https://www.naiveui.com/en-US/os-theme/components/message for more details. If you want to use `useMessage` outside setup, please check https://www.naiveui.com/zh-CN/os-theme/components/message#Q-&-A."),e}var le={closeMargin:`16px 12px`,closeSize:`20px`,closeIconSize:`16px`,width:`365px`,padding:`16px`,titleFontSize:`16px`,metaFontSize:`12px`,descriptionFontSize:`12px`};function J(e){let{textColor2:t,successColor:n,infoColor:r,warningColor:i,errorColor:a,popoverColor:o,closeIconColor:s,closeIconColorHover:c,closeIconColorPressed:l,closeColorHover:u,closeColorPressed:d,textColor1:f,textColor3:p,borderRadius:m,fontWeightStrong:h,boxShadow2:g,lineHeight:_,fontSize:v}=e;return Object.assign(Object.assign({},le),{borderRadius:m,lineHeight:_,fontSize:v,headerFontWeight:h,iconColor:t,iconColorSuccess:n,iconColorInfo:r,iconColorWarning:i,iconColorError:a,color:o,textColor:t,closeIconColor:s,closeIconColorHover:c,closeIconColorPressed:l,closeBorderRadius:m,closeColorHover:u,closeColorPressed:d,headerTextColor:f,descriptionTextColor:p,actionTextColor:t,boxShadow:g})}var Y=w({name:`Notification`,common:M,peers:{Scrollbar:E},self:J}),X=m(`n-notification-provider`),ue=s({name:`NotificationContainer`,props:{scrollable:{type:Boolean,required:!0},placement:{type:String,required:!0}},setup(){let{mergedThemeRef:e,mergedClsPrefixRef:r,wipTransitionCountRef:i}=t(X),a=d(null);return n(()=>{var e,t;i.value>0?(e=a==null?void 0:a.value)==null||e.classList.add(`transitioning`):(t=a==null?void 0:a.value)==null||t.classList.remove(`transitioning`)}),{selfRef:a,mergedTheme:e,mergedClsPrefix:r,transitioning:i}},render(){let{$slots:t,scrollable:n,mergedClsPrefix:r,mergedTheme:i,placement:a}=this;return e(`div`,{ref:`selfRef`,class:[`${r}-notification-container`,n&&`${r}-notification-container--scrollable`,`${r}-notification-container--${a}`]},n?e(O,{theme:i.peers.Scrollbar,themeOverrides:i.peerOverrides.Scrollbar,contentStyle:{overflow:`hidden`}},t):t)}}),de={info:()=>e(H,null),success:()=>e(V,null),warning:()=>e(ne,null),error:()=>e(B,null),default:()=>null},Z={closable:{type:Boolean,default:!0},type:{type:String,default:`default`},avatar:Function,title:[String,Function],description:[String,Function],content:[String,Function],meta:[String,Function],action:[String,Function],onClose:{type:Function,required:!0},keepAliveOnHover:Boolean,onMouseenter:Function,onMouseleave:Function},fe=L(Z),pe=s({name:`Notification`,props:Z,setup(e){let{mergedClsPrefixRef:n,mergedThemeRef:r,props:a}=t(X),{inlineThemeDisabled:o,mergedRtlRef:s}=S(),c=T(`Notification`,s,n),l=i(()=>{let{type:t}=e,{self:{color:n,textColor:i,closeIconColor:a,closeIconColorHover:o,closeIconColorPressed:s,headerTextColor:c,descriptionTextColor:l,actionTextColor:u,borderRadius:d,headerFontWeight:f,boxShadow:p,lineHeight:m,fontSize:h,closeMargin:g,closeSize:_,width:v,padding:b,closeIconSize:x,closeBorderRadius:S,closeColorHover:C,closeColorPressed:w,titleFontSize:T,metaFontSize:E,descriptionFontSize:D,[y(`iconColor`,t)]:O},common:{cubicBezierEaseOut:A,cubicBezierEaseIn:j,cubicBezierEaseInOut:M}}=r.value,{left:N,right:P,top:F,bottom:I}=k(b);return{"--n-color":n,"--n-font-size":h,"--n-text-color":i,"--n-description-text-color":l,"--n-action-text-color":u,"--n-title-text-color":c,"--n-title-font-weight":f,"--n-bezier":M,"--n-bezier-ease-out":A,"--n-bezier-ease-in":j,"--n-border-radius":d,"--n-box-shadow":p,"--n-close-border-radius":S,"--n-close-color-hover":C,"--n-close-color-pressed":w,"--n-close-icon-color":a,"--n-close-icon-color-hover":o,"--n-close-icon-color-pressed":s,"--n-line-height":m,"--n-icon-color":O,"--n-close-margin":g,"--n-close-size":_,"--n-close-icon-size":x,"--n-width":v,"--n-padding-left":N,"--n-padding-right":P,"--n-padding-top":F,"--n-padding-bottom":I,"--n-title-font-size":T,"--n-meta-font-size":E,"--n-description-font-size":D}}),u=o?j(`notification`,i(()=>e.type[0]),l,a):void 0;return{mergedClsPrefix:n,showAvatar:i(()=>e.avatar||e.type!=="default"),handleCloseClick(){e.onClose()},rtlEnabled:c,cssVars:o?void 0:l,themeClass:u==null?void 0:u.themeClass,onRender:u==null?void 0:u.onRender}},render(){var t;let{mergedClsPrefix:n}=this;return(t=this.onRender)==null||t.call(this),e(`div`,{class:[`${n}-notification-wrapper`,this.themeClass],onMouseenter:this.onMouseenter,onMouseleave:this.onMouseleave,style:this.cssVars},e(`div`,{class:[`${n}-notification`,this.rtlEnabled&&`${n}-notification--rtl`,this.themeClass,{[`${n}-notification--closable`]:this.closable,[`${n}-notification--show-avatar`]:this.showAvatar}],style:this.cssVars},this.showAvatar?e(`div`,{class:`${n}-notification__avatar`},this.avatar?R(this.avatar):this.type==="default"?null:e(D,{clsPrefix:n},{default:()=>de[this.type]()})):null,this.closable?e(z,{clsPrefix:n,class:`${n}-notification__close`,onClick:this.handleCloseClick}):null,e(`div`,{ref:`bodyRef`,class:`${n}-notification-main`},this.title?e(`div`,{class:`${n}-notification-main__header`},R(this.title)):null,this.description?e(`div`,{class:`${n}-notification-main__description`},R(this.description)):null,this.content?e(`pre`,{class:`${n}-notification-main__content`},R(this.content)):null,this.meta||this.action?e(`div`,{class:`${n}-notification-main-footer`},this.meta?e(`div`,{class:`${n}-notification-main-footer__meta`},R(this.meta)):null,this.action?e(`div`,{class:`${n}-notification-main-footer__action`},R(this.action)):null):null)))}}),me=Object.assign(Object.assign({},Z),{duration:Number,onClose:Function,onLeave:Function,onAfterEnter:Function,onAfterLeave:Function,onHide:Function,onAfterShow:Function,onAfterHide:Function}),he=s({name:`NotificationEnvironment`,props:Object.assign(Object.assign({},me),{internalKey:{type:String,required:!0},onInternalAfterLeave:{type:Function,required:!0}}),setup(e){let{wipTransitionCountRef:n}=t(X),i=d(!0),a=null;function o(){i.value=!1,a&&window.clearTimeout(a)}function s(e){n.value++,l(()=>{e.style.height=`${e.offsetHeight}px`,e.style.maxHeight=`0`,e.style.transition=`none`,e.offsetHeight,e.style.transition=``,e.style.maxHeight=e.style.height})}function c(t){n.value--,t.style.height=``,t.style.maxHeight=``;let{onAfterEnter:r,onAfterShow:i}=e;r&&r(),i&&i()}function u(e){n.value++,e.style.maxHeight=`${e.offsetHeight}px`,e.style.height=`${e.offsetHeight}px`,e.offsetHeight}function f(t){let{onHide:n}=e;n&&n(),t.style.maxHeight=`0`,t.offsetHeight}function p(){n.value--;let{onAfterLeave:t,onInternalAfterLeave:r,onAfterHide:i,internalKey:a}=e;t&&t(),r(a),i&&i()}function m(){let{duration:t}=e;t&&(a=window.setTimeout(o,t))}function h(e){e.currentTarget===e.target&&a!==null&&(window.clearTimeout(a),a=null)}function g(e){e.currentTarget===e.target&&m()}function _(){let{onClose:t}=e;t?Promise.resolve(t()).then(e=>{e!==!1&&o()}):o()}return r(()=>{e.duration&&(a=window.setTimeout(o,e.duration))}),{show:i,hide:o,handleClose:_,handleAfterLeave:p,handleLeave:f,handleBeforeLeave:u,handleAfterEnter:c,handleBeforeEnter:s,handleMouseenter:h,handleMouseleave:g}},render(){return e(f,{name:`notification-transition`,appear:!0,onBeforeEnter:this.handleBeforeEnter,onAfterEnter:this.handleAfterEnter,onBeforeLeave:this.handleBeforeLeave,onLeave:this.handleLeave,onAfterLeave:this.handleAfterLeave},{default:()=>this.show?e(pe,Object.assign({},ee(this.$props,fe),{onClose:this.handleClose,onMouseenter:this.duration&&this.keepAliveOnHover?this.handleMouseenter:void 0,onMouseleave:this.duration&&this.keepAliveOnHover?this.handleMouseleave:void 0})):null})}}),ge=_([v(`notification-container`,`
 z-index: 4000;
 position: fixed;
 overflow: visible;
 display: flex;
 flex-direction: column;
 align-items: flex-end;
 `,[_(`>`,[v(`scrollbar`,`
 width: initial;
 overflow: visible;
 height: -moz-fit-content !important;
 height: fit-content !important;
 max-height: 100vh !important;
 `,[_(`>`,[v(`scrollbar-container`,`
 height: -moz-fit-content !important;
 height: fit-content !important;
 max-height: 100vh !important;
 `,[v(`scrollbar-content`,`
 padding-top: 12px;
 padding-bottom: 33px;
 `)])])])]),b(`top, top-right, top-left`,`
 top: 12px;
 `,[_(`&.transitioning >`,[v(`scrollbar`,[_(`>`,[v(`scrollbar-container`,`
 min-height: 100vh !important;
 `)])])])]),b(`bottom, bottom-right, bottom-left`,`
 bottom: 12px;
 `,[_(`>`,[v(`scrollbar`,[_(`>`,[v(`scrollbar-container`,[v(`scrollbar-content`,`
 padding-bottom: 12px;
 `)])])])]),v(`notification-wrapper`,`
 display: flex;
 align-items: flex-end;
 margin-bottom: 0;
 margin-top: 12px;
 `)]),b(`top, bottom`,`
 left: 50%;
 transform: translateX(-50%);
 `,[v(`notification-wrapper`,[_(`&.notification-transition-enter-from, &.notification-transition-leave-to`,`
 transform: scale(0.85);
 `),_(`&.notification-transition-leave-from, &.notification-transition-enter-to`,`
 transform: scale(1);
 `)])]),b(`top`,[v(`notification-wrapper`,`
 transform-origin: top center;
 `)]),b(`bottom`,[v(`notification-wrapper`,`
 transform-origin: bottom center;
 `)]),b(`top-right, bottom-right`,[v(`notification`,`
 margin-left: 28px;
 margin-right: 16px;
 `)]),b(`top-left, bottom-left`,[v(`notification`,`
 margin-left: 16px;
 margin-right: 28px;
 `)]),b(`top-right`,`
 right: 0;
 `,[Q(`top-right`)]),b(`top-left`,`
 left: 0;
 `,[Q(`top-left`)]),b(`bottom-right`,`
 right: 0;
 `,[Q(`bottom-right`)]),b(`bottom-left`,`
 left: 0;
 `,[Q(`bottom-left`)]),b(`scrollable`,[b(`top-right`,`
 top: 0;
 `),b(`top-left`,`
 top: 0;
 `),b(`bottom-right`,`
 bottom: 0;
 `),b(`bottom-left`,`
 bottom: 0;
 `)]),v(`notification-wrapper`,`
 margin-bottom: 12px;
 `,[_(`&.notification-transition-enter-from, &.notification-transition-leave-to`,`
 opacity: 0;
 margin-top: 0 !important;
 margin-bottom: 0 !important;
 `),_(`&.notification-transition-leave-from, &.notification-transition-enter-to`,`
 opacity: 1;
 `),_(`&.notification-transition-leave-active`,`
 transition:
 background-color .3s var(--n-bezier),
 color .3s var(--n-bezier),
 opacity .3s var(--n-bezier),
 transform .3s var(--n-bezier-ease-in),
 max-height .3s var(--n-bezier),
 margin-top .3s linear,
 margin-bottom .3s linear,
 box-shadow .3s var(--n-bezier);
 `),_(`&.notification-transition-enter-active`,`
 transition:
 background-color .3s var(--n-bezier),
 color .3s var(--n-bezier),
 opacity .3s var(--n-bezier),
 transform .3s var(--n-bezier-ease-out),
 max-height .3s var(--n-bezier),
 margin-top .3s linear,
 margin-bottom .3s linear,
 box-shadow .3s var(--n-bezier);
 `)]),v(`notification`,`
 background-color: var(--n-color);
 color: var(--n-text-color);
 transition:
 background-color .3s var(--n-bezier),
 color .3s var(--n-bezier),
 opacity .3s var(--n-bezier),
 box-shadow .3s var(--n-bezier);
 font-family: inherit;
 font-size: var(--n-font-size);
 font-weight: 400;
 position: relative;
 display: flex;
 overflow: hidden;
 flex-shrink: 0;
 padding-left: var(--n-padding-left);
 padding-right: var(--n-padding-right);
 width: var(--n-width);
 max-width: calc(100vw - 16px - 16px);
 border-radius: var(--n-border-radius);
 box-shadow: var(--n-box-shadow);
 box-sizing: border-box;
 opacity: 1;
 `,[p(`avatar`,[v(`icon`,`
 color: var(--n-icon-color);
 `),v(`base-icon`,`
 color: var(--n-icon-color);
 `)]),b(`show-avatar`,[v(`notification-main`,`
 margin-left: 40px;
 width: calc(100% - 40px); 
 `)]),b(`closable`,[v(`notification-main`,[_(`> *:first-child`,`
 padding-right: 20px;
 `)]),p(`close`,`
 position: absolute;
 top: 0;
 right: 0;
 margin: var(--n-close-margin);
 transition:
 background-color .3s var(--n-bezier),
 color .3s var(--n-bezier);
 `)]),p(`avatar`,`
 position: absolute;
 top: var(--n-padding-top);
 left: var(--n-padding-left);
 width: 28px;
 height: 28px;
 font-size: 28px;
 display: flex;
 align-items: center;
 justify-content: center;
 `,[v(`icon`,`transition: color .3s var(--n-bezier);`)]),v(`notification-main`,`
 padding-top: var(--n-padding-top);
 padding-bottom: var(--n-padding-bottom);
 box-sizing: border-box;
 display: flex;
 flex-direction: column;
 margin-left: 8px;
 width: calc(100% - 8px);
 `,[v(`notification-main-footer`,`
 display: flex;
 align-items: center;
 justify-content: space-between;
 margin-top: 12px;
 `,[p(`meta`,`
 font-size: var(--n-meta-font-size);
 transition: color .3s var(--n-bezier-ease-out);
 color: var(--n-description-text-color);
 `),p(`action`,`
 cursor: pointer;
 transition: color .3s var(--n-bezier-ease-out);
 color: var(--n-action-text-color);
 `)]),p(`header`,`
 font-weight: var(--n-title-font-weight);
 font-size: var(--n-title-font-size);
 transition: color .3s var(--n-bezier-ease-out);
 color: var(--n-title-text-color);
 `),p(`description`,`
 margin-top: 8px;
 font-size: var(--n-description-font-size);
 white-space: pre-wrap;
 word-wrap: break-word;
 transition: color .3s var(--n-bezier-ease-out);
 color: var(--n-description-text-color);
 `),p(`content`,`
 line-height: var(--n-line-height);
 margin: 12px 0 0 0;
 font-family: inherit;
 white-space: pre-wrap;
 word-wrap: break-word;
 transition: color .3s var(--n-bezier-ease-out);
 color: var(--n-text-color);
 `,[_(`&:first-child`,`margin: 0;`)])])])])]);function Q(e){return v(`notification-wrapper`,[_(`&.notification-transition-enter-from, &.notification-transition-leave-to`,`
 transform: translate(${e.split(`-`)[1]===`left`?`calc(-100%)`:`calc(100%)`}, 0);
 `),_(`&.notification-transition-leave-from, &.notification-transition-enter-to`,`
 transform: translate(0, 0);
 `)])}var $=m(`n-notification-api`),_e=s({name:`NotificationProvider`,props:Object.assign(Object.assign({},C.props),{containerClass:String,containerStyle:[String,Object],to:[String,Object],scrollable:{type:Boolean,default:!0},max:Number,placement:{type:String,default:`top-right`},keepAliveOnHover:Boolean}),setup(e){let{mergedClsPrefixRef:t}=S(e),n=d([]),r={},i=new Set;function s(t){let o=N(),s=()=>{i.add(o),r[o]&&r[o].hide()},c=a(Object.assign(Object.assign({},t),{key:o,destroy:s,hide:s,deactivate:s})),{max:l}=e;if(l&&n.value.length-i.size>=l){let e=!1,t=0;for(let a of n.value){if(!i.has(a.key)){r[a.key]&&(a.destroy(),e=!0);break}t++}e||n.value.splice(t,1)}return n.value.push(c),c}let c=[`info`,`success`,`warning`,`error`].map(e=>t=>s(Object.assign(Object.assign({},t),{type:e})));function l(e){i.delete(e),n.value.splice(n.value.findIndex(t=>t.key===e),1)}let u=C(`Notification`,`-notification`,ge,Y,e,t),f={create:s,info:c[0],success:c[1],warning:c[2],error:c[3],open:m,destroyAll:h},p=d(0);o($,f),o(X,{props:e,mergedClsPrefixRef:t,mergedThemeRef:u,wipTransitionCountRef:p});function m(e){return s(e)}function h(){Object.values(n.value).forEach(e=>{e.hide()})}return Object.assign({mergedClsPrefix:t,notificationList:n,notificationRefs:r,handleAfterLeave:l},f)},render(){var t,n,r;let{placement:i}=this;return e(c,null,(n=(t=this.$slots).default)==null?void 0:n.call(t),this.notificationList.length?e(u,{to:(r=this.to)==null?`body`:r},e(ue,{class:this.containerClass,style:this.containerStyle,scrollable:this.scrollable&&i!==`top`&&i!==`bottom`,placement:i},{default:()=>this.notificationList.map(t=>e(he,Object.assign({ref:e=>{let n=t.key;e===null?delete this.notificationRefs[n]:this.notificationRefs[n]=e}},te(t,[`destroy`,`hide`,`deactivate`]),{internalKey:t.key,onInternalAfterLeave:this.handleAfterLeave,keepAliveOnHover:t.keepAliveOnHover===void 0?this.keepAliveOnHover:t.keepAliveOnHover})))})):null)}});function ve(){let e=t($,null);return e===null&&A(`use-notification`,"No outer `n-notification-provider` found."),e}export{ce as a,oe as c,W as d,U as f,J as i,ae as l,_e as n,q as o,Y as r,se as s,ve as t,K as u};