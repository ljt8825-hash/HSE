import{B as e,k as t,wn as n}from"./runtime-core.esm-bundler-Blp3D1W4.js";import{B as r,L as i,R as a}from"./use-theme-BPxAT0OQ.js";import{t as o}from"./use-style-Cr7JTzYi.js";import{n as s,t as c}from"./icon-switch.cssr-D1kt9IDo.js";var l=i([i(`@keyframes rotator`,`
 0% {
 -webkit-transform: rotate(0deg);
 transform: rotate(0deg);
 }
 100% {
 -webkit-transform: rotate(360deg);
 transform: rotate(360deg);
 }`),a(`base-loading`,`
 position: relative;
 line-height: 0;
 width: 1em;
 height: 1em;
 `,[r(`transition-wrapper`,`
 position: absolute;
 width: 100%;
 height: 100%;
 `,[c()]),r(`placeholder`,`
 position: absolute;
 left: 50%;
 top: 50%;
 transform: translateX(-50%) translateY(-50%);
 `,[c({left:`50%`,top:`50%`,originalTransform:`translateX(-50%) translateY(-50%)`})]),r(`container`,`
 animation: rotator 3s linear infinite both;
 `,[r(`icon`,`
 height: 1em;
 width: 1em;
 `)])])]),u=`1.6s`,d={strokeWidth:{type:Number,default:28},stroke:{type:String,default:void 0},scale:{type:Number,default:1},radius:{type:Number,default:100}},f=t({name:`BaseLoading`,props:Object.assign({clsPrefix:{type:String,required:!0},show:{type:Boolean,default:!0}},d),setup(e){o(`-base-loading`,l,n(e,`clsPrefix`))},render(){let{clsPrefix:t,radius:n,strokeWidth:r,stroke:i,scale:a}=this,o=n/a;return e(`div`,{class:`${t}-base-loading`,role:`img`,"aria-label":`loading`},e(s,null,{default:()=>this.show?e(`div`,{key:`icon`,class:`${t}-base-loading__transition-wrapper`},e(`div`,{class:`${t}-base-loading__container`},e(`svg`,{class:`${t}-base-loading__icon`,viewBox:`0 0 ${2*o} ${2*o}`,xmlns:`http://www.w3.org/2000/svg`,style:{color:i}},e(`g`,null,e(`animateTransform`,{attributeName:`transform`,type:`rotate`,values:`0 ${o} ${o};270 ${o} ${o}`,begin:`0s`,dur:u,fill:`freeze`,repeatCount:`indefinite`}),e(`circle`,{class:`${t}-base-loading__icon`,fill:`none`,stroke:`currentColor`,"stroke-width":r,"stroke-linecap":`round`,cx:o,cy:o,r:n-r/2,"stroke-dasharray":5.67*n,"stroke-dashoffset":18.48*n},e(`animateTransform`,{attributeName:`transform`,type:`rotate`,values:`0 ${o} ${o};135 ${o} ${o};450 ${o} ${o}`,begin:`0s`,dur:u,fill:`freeze`,repeatCount:`indefinite`}),e(`animate`,{attributeName:`stroke-dashoffset`,values:`${5.67*n};${1.42*n};${5.67*n}`,begin:`0s`,dur:u,fill:`freeze`,repeatCount:`indefinite`})))))):e(`div`,{key:`placeholder`,class:`${t}-base-loading__placeholder`},this.$slots)}))}});export{d as n,f as t};