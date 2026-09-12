import{B as e,E as t,k as n,wn as r}from"./runtime-core.esm-bundler-Blp3D1W4.js";import{H as i,L as a,R as o,V as s}from"./use-theme-BPxAT0OQ.js";import{o as c,s as l}from"./Scrollbar-BGIkiQ6T.js";import{n as u}from"./Loading-FRI83lZm.js";function d(e,...n){return typeof e==`function`?e(...n):typeof e==`string`?t(e):typeof e==`number`?t(String(e)):null}var f=c(`close`,()=>e(`svg`,{viewBox:`0 0 12 12`,version:`1.1`,xmlns:`http://www.w3.org/2000/svg`,"aria-hidden":!0},e(`g`,{stroke:`none`,"stroke-width":`1`,fill:`none`,"fill-rule":`evenodd`},e(`g`,{fill:`currentColor`,"fill-rule":`nonzero`},e(`path`,{d:`M2.08859116,2.2156945 L2.14644661,2.14644661 C2.32001296,1.97288026 2.58943736,1.95359511 2.7843055,2.08859116 L2.85355339,2.14644661 L6,5.293 L9.14644661,2.14644661 C9.34170876,1.95118446 9.65829124,1.95118446 9.85355339,2.14644661 C10.0488155,2.34170876 10.0488155,2.65829124 9.85355339,2.85355339 L6.707,6 L9.85355339,9.14644661 C10.0271197,9.32001296 10.0464049,9.58943736 9.91140884,9.7843055 L9.85355339,9.85355339 C9.67998704,10.0271197 9.41056264,10.0464049 9.2156945,9.91140884 L9.14644661,9.85355339 L6,6.707 L2.85355339,9.85355339 C2.65829124,10.0488155 2.34170876,10.0488155 2.14644661,9.85355339 C1.95118446,9.65829124 1.95118446,9.34170876 2.14644661,9.14644661 L5.293,6 L2.14644661,2.85355339 C1.97288026,2.67998704 1.95359511,2.41056264 2.08859116,2.2156945 L2.14644661,2.14644661 L2.08859116,2.2156945 Z`}))))),p=o(`base-close`,`
 display: flex;
 align-items: center;
 justify-content: center;
 cursor: pointer;
 background-color: transparent;
 color: var(--n-close-icon-color);
 border-radius: var(--n-close-border-radius);
 height: var(--n-close-size);
 width: var(--n-close-size);
 font-size: var(--n-close-icon-size);
 outline: none;
 border: none;
 position: relative;
 padding: 0;
`,[s(`absolute`,`
 height: var(--n-close-icon-size);
 width: var(--n-close-icon-size);
 `),a(`&::before`,`
 content: "";
 position: absolute;
 width: var(--n-close-size);
 height: var(--n-close-size);
 left: 50%;
 top: 50%;
 transform: translateY(-50%) translateX(-50%);
 transition: inherit;
 border-radius: inherit;
 `),i(`disabled`,[a(`&:hover`,`
 color: var(--n-close-icon-color-hover);
 `),a(`&:hover::before`,`
 background-color: var(--n-close-color-hover);
 `),a(`&:focus::before`,`
 background-color: var(--n-close-color-hover);
 `),a(`&:active`,`
 color: var(--n-close-icon-color-pressed);
 `),a(`&:active::before`,`
 background-color: var(--n-close-color-pressed);
 `)]),s(`disabled`,`
 cursor: not-allowed;
 color: var(--n-close-icon-color-disabled);
 background-color: transparent;
 `),s(`round`,[a(`&::before`,`
 border-radius: 50%;
 `)])]),m=n({name:`BaseClose`,props:{isButtonTag:{type:Boolean,default:!0},clsPrefix:{type:String,required:!0},disabled:{type:Boolean,default:void 0},focusable:{type:Boolean,default:!0},round:Boolean,onClick:Function,absolute:Boolean},setup(t){return u(`-base-close`,p,r(t,`clsPrefix`)),()=>{let{clsPrefix:n,disabled:r,absolute:i,round:a,isButtonTag:o}=t;return e(o?`button`:`div`,{type:o?`button`:void 0,tabindex:r||!t.focusable?-1:0,"aria-disabled":r,"aria-label":`close`,role:o?void 0:`button`,disabled:r,class:[`${n}-base-close`,i&&`${n}-base-close--absolute`,r&&`${n}-base-close--disabled`,a&&`${n}-base-close--round`],onMousedown:e=>{t.focusable||e.preventDefault()},onClick:t.onClick},e(l,{clsPrefix:n},{default:()=>e(f,null)}))}}});export{d as n,m as t};