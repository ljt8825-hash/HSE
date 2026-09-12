import{B as e,Ut as t,g as n,k as r,vn as i}from"./runtime-core.esm-bundler-Blp3D1W4.js";import{t as a}from"./runtime-dom.esm-bundler-CEFztc8a.js";import{d as o,g as s}from"./naive-BMniTMHP.js";import{B as c,G as l,H as u,L as d,R as f,U as p,V as m,W as h,j as g,n as _}from"./use-theme-BPxAT0OQ.js";import{a as v}from"./Scrollbar-CWE-8E6x.js";import{i as y}from"./css-DEmdllcC.js";import{n as b}from"./light-DZKN5sjf.js";import{n as x}from"./misc-DDs3MKLt.js";import{n as S}from"./format-length-mj6Hk3Qj.js";import{t as C}from"./flatten-CoLVt70p.js";import{t as w}from"./get-slot-6kXJmSMP.js";import{n as T,t as E}from"./Loading-BLxWq2Nd.js";function D(e,t=`default`,n=[]){let{children:r}=e;if(typeof r==`object`&&r&&!Array.isArray(r)){let e=r[t];if(typeof e==`function`)return e()}return n}var O=d([f(`descriptions`,{fontSize:`var(--n-font-size)`},[f(`descriptions-separator`,`
 display: inline-block;
 margin: 0 8px 0 2px;
 `),f(`descriptions-table-wrapper`,[f(`descriptions-table`,[f(`descriptions-table-row`,[f(`descriptions-table-header`,{padding:`var(--n-th-padding)`}),f(`descriptions-table-content`,{padding:`var(--n-td-padding)`})])])]),u(`bordered`,[f(`descriptions-table-wrapper`,[f(`descriptions-table`,[f(`descriptions-table-row`,[d(`&:last-child`,[f(`descriptions-table-content`,{paddingBottom:0})])])])])]),m(`left-label-placement`,[f(`descriptions-table-content`,[d(`> *`,{verticalAlign:`top`})])]),m(`left-label-align`,[d(`th`,{textAlign:`left`})]),m(`center-label-align`,[d(`th`,{textAlign:`center`})]),m(`right-label-align`,[d(`th`,{textAlign:`right`})]),m(`bordered`,[f(`descriptions-table-wrapper`,`
 border-radius: var(--n-border-radius);
 overflow: hidden;
 background: var(--n-merged-td-color);
 border: 1px solid var(--n-merged-border-color);
 `,[f(`descriptions-table`,[f(`descriptions-table-row`,[d(`&:not(:last-child)`,[f(`descriptions-table-content`,{borderBottom:`1px solid var(--n-merged-border-color)`}),f(`descriptions-table-header`,{borderBottom:`1px solid var(--n-merged-border-color)`})]),f(`descriptions-table-header`,`
 font-weight: 400;
 background-clip: padding-box;
 background-color: var(--n-merged-th-color);
 `,[d(`&:not(:last-child)`,{borderRight:`1px solid var(--n-merged-border-color)`})]),f(`descriptions-table-content`,[d(`&:not(:last-child)`,{borderRight:`1px solid var(--n-merged-border-color)`})])])])])]),f(`descriptions-header`,`
 font-weight: var(--n-th-font-weight);
 font-size: 18px;
 transition: color .3s var(--n-bezier);
 line-height: var(--n-line-height);
 margin-bottom: 16px;
 color: var(--n-title-text-color);
 `),f(`descriptions-table-wrapper`,`
 transition:
 background-color .3s var(--n-bezier),
 border-color .3s var(--n-bezier);
 `,[f(`descriptions-table`,`
 width: 100%;
 border-collapse: separate;
 border-spacing: 0;
 box-sizing: border-box;
 `,[f(`descriptions-table-row`,`
 box-sizing: border-box;
 transition: border-color .3s var(--n-bezier);
 `,[f(`descriptions-table-header`,`
 font-weight: var(--n-th-font-weight);
 line-height: var(--n-line-height);
 display: table-cell;
 box-sizing: border-box;
 color: var(--n-th-text-color);
 transition:
 color .3s var(--n-bezier),
 background-color .3s var(--n-bezier),
 border-color .3s var(--n-bezier);
 `),f(`descriptions-table-content`,`
 vertical-align: top;
 line-height: var(--n-line-height);
 display: table-cell;
 box-sizing: border-box;
 color: var(--n-td-text-color);
 transition:
 color .3s var(--n-bezier),
 background-color .3s var(--n-bezier),
 border-color .3s var(--n-bezier);
 `,[c(`content`,`
 transition: color .3s var(--n-bezier);
 display: inline-block;
 color: var(--n-td-text-color);
 `)]),c(`label`,`
 font-weight: var(--n-th-font-weight);
 transition: color .3s var(--n-bezier);
 display: inline-block;
 margin-right: 14px;
 color: var(--n-th-text-color);
 `)])])])]),f(`descriptions-table-wrapper`,`
 --n-merged-th-color: var(--n-th-color);
 --n-merged-td-color: var(--n-td-color);
 --n-merged-border-color: var(--n-border-color);
 `),h(f(`descriptions-table-wrapper`,`
 --n-merged-th-color: var(--n-th-color-modal);
 --n-merged-td-color: var(--n-td-color-modal);
 --n-merged-border-color: var(--n-border-color-modal);
 `)),l(f(`descriptions-table-wrapper`,`
 --n-merged-th-color: var(--n-th-color-popover);
 --n-merged-td-color: var(--n-td-color-popover);
 --n-merged-border-color: var(--n-border-color-popover);
 `))]),k=`DESCRIPTION_ITEM_FLAG`;function A(e){return typeof e==`object`&&e&&!Array.isArray(e)?e.type&&e.type.DESCRIPTION_ITEM_FLAG:!1}var j=r({name:`Descriptions`,props:Object.assign(Object.assign({},_.props),{title:String,column:{type:Number,default:3},columns:Number,labelPlacement:{type:String,default:`top`},labelAlign:{type:String,default:`left`},separator:{type:String,default:`:`},size:String,bordered:Boolean,labelClass:String,labelStyle:[Object,String],contentClass:String,contentStyle:[Object,String]}),slots:Object,setup(e){let{mergedClsPrefixRef:t,inlineThemeDisabled:r,mergedComponentPropsRef:i}=g(e),a=n(()=>{var t,n;return e.size||((n=(t=i==null?void 0:i.value)==null?void 0:t.Descriptions)==null?void 0:n.size)||`medium`}),o=_(`Descriptions`,`-descriptions`,O,s,e,t),c=n(()=>{let{bordered:t}=e,n=a.value,{common:{cubicBezierEaseInOut:r},self:{titleTextColor:i,thColor:s,thColorModal:c,thColorPopover:l,thTextColor:u,thFontWeight:d,tdTextColor:f,tdColor:m,tdColorModal:h,tdColorPopover:g,borderColor:_,borderColorModal:v,borderColorPopover:y,borderRadius:b,lineHeight:x,[p(`fontSize`,n)]:S,[p(t?`thPaddingBordered`:`thPadding`,n)]:C,[p(t?`tdPaddingBordered`:`tdPadding`,n)]:w}}=o.value;return{"--n-title-text-color":i,"--n-th-padding":C,"--n-td-padding":w,"--n-font-size":S,"--n-bezier":r,"--n-th-font-weight":d,"--n-line-height":x,"--n-th-text-color":u,"--n-td-text-color":f,"--n-th-color":s,"--n-th-color-modal":c,"--n-th-color-popover":l,"--n-td-color":m,"--n-td-color-modal":h,"--n-td-color-popover":g,"--n-border-radius":b,"--n-border-color":_,"--n-border-color-modal":v,"--n-border-color-popover":y}}),l=r?b(`descriptions`,n(()=>{let t=``,{bordered:n}=e;return n&&(t+=`a`),t+=a.value[0],t}),c,e):void 0;return{mergedClsPrefix:t,cssVars:r?void 0:c,themeClass:l==null?void 0:l.themeClass,onRender:l==null?void 0:l.onRender,compitableColumn:S(e,[`columns`,`column`]),inlineThemeDisabled:r,mergedSize:a}},render(){let t=this.$slots.default,n=t?C(t()):[];n.length;let{contentClass:r,labelClass:i,compitableColumn:a,labelPlacement:o,labelAlign:s,mergedSize:c,bordered:l,title:u,cssVars:d,mergedClsPrefix:f,separator:p,onRender:m}=this;m==null||m();let h=n.filter(e=>A(e)),g=h.reduce((t,n,s)=>{let c=n.props||{},u=h.length-1===s,d=[`label`in c?c.label:D(n,`label`)],m=[D(n)],g=c.span||1,_=t.span;t.span+=g;let v=c.labelStyle||c[`label-style`]||this.labelStyle,y=c.contentStyle||c[`content-style`]||this.contentStyle;if(o===`left`)l?t.row.push(e(`th`,{class:[`${f}-descriptions-table-header`,i],colspan:1,style:v},d),e(`td`,{class:[`${f}-descriptions-table-content`,r],colspan:u?(a-_)*2+1:g*2-1,style:y},m)):t.row.push(e(`td`,{class:`${f}-descriptions-table-content`,colspan:u?(a-_)*2:g*2},e(`span`,{class:[`${f}-descriptions-table-content__label`,i],style:v},[...d,p&&e(`span`,{class:`${f}-descriptions-separator`},p)]),e(`span`,{class:[`${f}-descriptions-table-content__content`,r],style:y},m)));else{let n=u?(a-_)*2:g*2;t.row.push(e(`th`,{class:[`${f}-descriptions-table-header`,i],colspan:n,style:v},d)),t.secondRow.push(e(`td`,{class:[`${f}-descriptions-table-content`,r],colspan:n,style:y},m))}return(t.span>=a||u)&&(t.span=0,t.row.length&&(t.rows.push(t.row),t.row=[]),o!==`left`&&t.secondRow.length&&(t.rows.push(t.secondRow),t.secondRow=[])),t},{span:0,row:[],secondRow:[],rows:[]}).rows.map(t=>e(`tr`,{class:`${f}-descriptions-table-row`},t));return e(`div`,{style:d,class:[`${f}-descriptions`,this.themeClass,`${f}-descriptions--${o}-label-placement`,`${f}-descriptions--${s}-label-align`,`${f}-descriptions--${c}-size`,l&&`${f}-descriptions--bordered`]},u||this.$slots.header?e(`div`,{class:`${f}-descriptions-header`},u||w(this,`header`)):null,e(`div`,{class:`${f}-descriptions-table-wrapper`},e(`table`,{class:`${f}-descriptions-table`},e(`tbody`,null,o===`top`&&e(`tr`,{class:`${f}-descriptions-table-row`,style:{visibility:`collapse`}},x(a*2,e(`td`,null))),g))))}}),M={label:String,span:{type:Number,default:1},labelClass:String,labelStyle:[Object,String],contentClass:String,contentStyle:[Object,String]},N=r({name:`DescriptionsItem`,[k]:!0,props:M,slots:Object,render(){return null}}),P=d([d(`@keyframes spin-rotate`,`
 from {
 transform: rotate(0);
 }
 to {
 transform: rotate(360deg);
 }
 `),f(`spin-container`,`
 position: relative;
 `,[f(`spin-body`,`
 position: absolute;
 top: 50%;
 left: 50%;
 transform: translateX(-50%) translateY(-50%);
 `,[v()])]),f(`spin-body`,`
 display: inline-flex;
 align-items: center;
 justify-content: center;
 flex-direction: column;
 `),f(`spin`,`
 display: inline-flex;
 height: var(--n-size);
 width: var(--n-size);
 font-size: var(--n-size);
 color: var(--n-color);
 `,[m(`rotate`,`
 animation: spin-rotate 2s linear infinite;
 `)]),f(`spin-description`,`
 display: inline-block;
 font-size: var(--n-font-size);
 color: var(--n-text-color);
 transition: color .3s var(--n-bezier);
 margin-top: 8px;
 `),f(`spin-content`,`
 opacity: 1;
 transition: opacity .3s var(--n-bezier);
 pointer-events: all;
 `,[m(`spinning`,`
 user-select: none;
 -webkit-user-select: none;
 pointer-events: none;
 opacity: var(--n-opacity-spinning);
 `)])]),F={small:20,medium:18,large:16},I=r({name:`Spin`,props:Object.assign(Object.assign(Object.assign({},_.props),{contentClass:String,contentStyle:[Object,String],description:String,size:{type:[String,Number],default:`medium`},show:{type:Boolean,default:!0},rotate:{type:Boolean,default:!0},spinning:{type:Boolean,validator:()=>!0,default:void 0},delay:Number}),T),slots:Object,setup(e){let{mergedClsPrefixRef:r,inlineThemeDisabled:a}=g(e),s=_(`Spin`,`-spin`,P,o,e,r),c=n(()=>{let{size:t}=e,{common:{cubicBezierEaseInOut:n},self:r}=s.value,{opacitySpinning:i,color:a,textColor:o}=r;return{"--n-bezier":n,"--n-opacity-spinning":i,"--n-size":typeof t==`number`?y(t):r[p(`size`,t)],"--n-color":a,"--n-text-color":o}}),l=a?b(`spin`,n(()=>{let{size:t}=e;return typeof t==`number`?String(t):t[0]}),c,e):void 0,u=S(e,[`spinning`,`show`]),d=i(!1);return t(t=>{let n;if(u.value){let{delay:r}=e;if(r){n=window.setTimeout(()=>{d.value=!0},r),t(()=>{clearTimeout(n)});return}}d.value=u.value}),{mergedClsPrefix:r,active:d,mergedStrokeWidth:n(()=>{let{strokeWidth:t}=e;if(t!==void 0)return t;let{size:n}=e;return F[typeof n==`number`?`medium`:n]}),cssVars:a?void 0:c,themeClass:l==null?void 0:l.themeClass,onRender:l==null?void 0:l.onRender}},render(){var t,n;let{$slots:r,mergedClsPrefix:i,description:o}=this,s=r.icon&&this.rotate,c=(o||r.description)&&e(`div`,{class:`${i}-spin-description`},o||((t=r.description)==null?void 0:t.call(r))),l=r.icon?e(`div`,{class:[`${i}-spin-body`,this.themeClass]},e(`div`,{class:[`${i}-spin`,s&&`${i}-spin--rotate`],style:r.default?``:this.cssVars},r.icon()),c):e(`div`,{class:[`${i}-spin-body`,this.themeClass]},e(E,{clsPrefix:i,style:r.default?``:this.cssVars,stroke:this.stroke,"stroke-width":this.mergedStrokeWidth,radius:this.radius,scale:this.scale,class:`${i}-spin`}),c);return(n=this.onRender)==null||n.call(this),r.default?e(`div`,{class:[`${i}-spin-container`,this.themeClass],style:this.cssVars},e(`div`,{class:[`${i}-spin-content`,this.active&&`${i}-spin-content--spinning`,this.contentClass],style:this.contentStyle},r),e(a,{name:`fade-in-transition`},{default:()=>this.active?l:null})):l}});export{N as n,j as r,I as t};