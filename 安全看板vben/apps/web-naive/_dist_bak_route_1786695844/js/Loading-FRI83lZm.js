import{B as e,J as t,k as n,rt as r,wn as i}from"./runtime-core.esm-bundler-Blp3D1W4.js";import{B as a,L as o,N as s,P as c,R as l,a as u,r as d}from"./use-theme-BPxAT0OQ.js";import{n as f,t as p}from"./icon-switch.cssr-DvNC2T5C.js";function m(e,n,i){if(!n)return;let a=c(),o=t(s,null),l=()=>{let t=i.value;n.mount({id:t===void 0?e:t+e,head:!0,anchorMetaName:u,props:{bPrefix:t?`.${t}-`:void 0},ssr:a,parent:o==null?void 0:o.styleMountTarget}),o!=null&&o.preflightStyleDisabled||d.mount({id:`n-global`,head:!0,anchorMetaName:u,ssr:a,parent:o==null?void 0:o.styleMountTarget})};a?l():r(l)}var h=o([o(`@keyframes rotator`,`
 0% {
 -webkit-transform: rotate(0deg);
 transform: rotate(0deg);
 }
 100% {
 -webkit-transform: rotate(360deg);
 transform: rotate(360deg);
 }`),l(`base-loading`,`
 position: relative;
 line-height: 0;
 width: 1em;
 height: 1em;
 `,[a(`transition-wrapper`,`
 position: absolute;
 width: 100%;
 height: 100%;
 `,[p()]),a(`placeholder`,`
 position: absolute;
 left: 50%;
 top: 50%;
 transform: translateX(-50%) translateY(-50%);
 `,[p({left:`50%`,top:`50%`,originalTransform:`translateX(-50%) translateY(-50%)`})]),a(`container`,`
 animation: rotator 3s linear infinite both;
 `,[a(`icon`,`
 height: 1em;
 width: 1em;
 `)])])]),g=`1.6s`,_=n({name:`BaseLoading`,props:Object.assign({clsPrefix:{type:String,required:!0},show:{type:Boolean,default:!0}},{strokeWidth:{type:Number,default:28},stroke:{type:String,default:void 0},scale:{type:Number,default:1},radius:{type:Number,default:100}}),setup(e){m(`-base-loading`,h,i(e,`clsPrefix`))},render(){let{clsPrefix:t,radius:n,strokeWidth:r,stroke:i,scale:a}=this,o=n/a;return e(`div`,{class:`${t}-base-loading`,role:`img`,"aria-label":`loading`},e(f,null,{default:()=>this.show?e(`div`,{key:`icon`,class:`${t}-base-loading__transition-wrapper`},e(`div`,{class:`${t}-base-loading__container`},e(`svg`,{class:`${t}-base-loading__icon`,viewBox:`0 0 ${2*o} ${2*o}`,xmlns:`http://www.w3.org/2000/svg`,style:{color:i}},e(`g`,null,e(`animateTransform`,{attributeName:`transform`,type:`rotate`,values:`0 ${o} ${o};270 ${o} ${o}`,begin:`0s`,dur:g,fill:`freeze`,repeatCount:`indefinite`}),e(`circle`,{class:`${t}-base-loading__icon`,fill:`none`,stroke:`currentColor`,"stroke-width":r,"stroke-linecap":`round`,cx:o,cy:o,r:n-r/2,"stroke-dasharray":5.67*n,"stroke-dashoffset":18.48*n},e(`animateTransform`,{attributeName:`transform`,type:`rotate`,values:`0 ${o} ${o};135 ${o} ${o};450 ${o} ${o}`,begin:`0s`,dur:g,fill:`freeze`,repeatCount:`indefinite`}),e(`animate`,{attributeName:`stroke-dashoffset`,values:`${5.67*n};${1.42*n};${5.67*n}`,begin:`0s`,dur:g,fill:`freeze`,repeatCount:`indefinite`})))))):e(`div`,{key:`placeholder`,class:`${t}-base-loading__placeholder`},this.$slots)}))}});export{m as n,_ as t};