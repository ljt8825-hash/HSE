import{B as e,g as t,k as n}from"./runtime-core.esm-bundler-Blp3D1W4.js";import{R as r,U as i,V as a,j as o,n as s}from"./use-theme-BPxAT0OQ.js";import{n as c}from"./light-DZKN5sjf.js";import{n as l}from"./format-length-mj6Hk3Qj.js";import{n as u}from"./light-BmqVi9Hd.js";var d=r(`text`,`
 transition: color .3s var(--n-bezier);
 color: var(--n-text-color);
`,[a(`strong`,`
 font-weight: var(--n-font-weight-strong);
 `),a(`italic`,{fontStyle:`italic`}),a(`underline`,{textDecoration:`underline`}),a(`code`,`
 line-height: 1.4;
 display: inline-block;
 font-family: var(--n-font-famliy-mono);
 transition: 
 color .3s var(--n-bezier),
 border-color .3s var(--n-bezier),
 background-color .3s var(--n-bezier);
 box-sizing: border-box;
 padding: .05em .35em 0 .35em;
 border-radius: var(--n-code-border-radius);
 font-size: .9em;
 color: var(--n-code-text-color);
 background-color: var(--n-code-color);
 border: var(--n-code-border);
 `)]),f=n({name:`Text`,props:Object.assign(Object.assign({},s.props),{code:Boolean,type:{type:String,default:`default`},delete:Boolean,strong:Boolean,italic:Boolean,underline:Boolean,depth:[String,Number],tag:String,as:{type:String,validator:()=>!0,default:void 0}}),setup(e){let{mergedClsPrefixRef:n,inlineThemeDisabled:r}=o(e),a=s(`Typography`,`-text`,d,u,e,n),f=t(()=>{let{depth:t,type:n}=e,r=n==="default"?t===void 0?`textColor`:`textColor${t}Depth`:i(`textColor`,n),{common:{fontWeightStrong:o,fontFamilyMono:s,cubicBezierEaseInOut:c},self:{codeTextColor:l,codeBorderRadius:u,codeColor:d,codeBorder:f,[r]:p}}=a.value;return{"--n-bezier":c,"--n-text-color":p,"--n-font-weight-strong":o,"--n-font-famliy-mono":s,"--n-code-border-radius":u,"--n-code-text-color":l,"--n-code-color":d,"--n-code-border":f}}),p=r?c(`text`,t(()=>`${e.type[0]}${e.depth||``}`),f,e):void 0;return{mergedClsPrefix:n,compitableTag:l(e,[`as`,`tag`]),cssVars:r?void 0:f,themeClass:p==null?void 0:p.themeClass,onRender:p==null?void 0:p.onRender}},render(){var t,n,r;let{mergedClsPrefix:i}=this;(t=this.onRender)==null||t.call(this);let a=[`${i}-text`,this.themeClass,{[`${i}-text--code`]:this.code,[`${i}-text--delete`]:this.delete,[`${i}-text--strong`]:this.strong,[`${i}-text--italic`]:this.italic,[`${i}-text--underline`]:this.underline}],o=(r=(n=this.$slots).default)==null?void 0:r.call(n);return this.code?e(`code`,{class:a,style:this.cssVars},this.delete?e(`del`,null,o):o):this.delete?e(`del`,{class:a,style:this.cssVars},o):e(this.compitableTag||`span`,{class:a,style:this.cssVars},o)}});export{f as t};