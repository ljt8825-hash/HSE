const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const BASE = 'G:/safety_vault/04_现场管理/27、HSE月度考核';
const map = {8:'8月管理员考核结果.xlsx',9:'9月管理员月度考核结果.xlsx',10:'10月管理员月度考核结果.xlsx',11:'11月管理员月度考核结果(1).xlsx',12:'12月管理员月度考核结果.xlsx',1:'1月管理员月度考核结果(1).xlsx',2:'2月管理员月度考核结果(1).xlsx',3:'3月管理员月度考核结果(1).xlsx',4:'4月管理员月度考核结果.xlsx',5:'5月管理员月度考核结果.xlsx',6:'6月管理员月度考核结果.xlsx',7:'7月管理员月度考核结果.xlsx'};
const key = {2025:['8月管理员考核结果.xlsx','9月管理员月度考核结果.xlsx','10月管理员月度考核结果.xlsx','11月管理员月度考核结果(1).xlsx','12月管理员月度考核结果.xlsx'],2026:['1月管理员月度考核结果(1).xlsx','2月管理员月度考核结果(1).xlsx','3月管理员月度考核结果(1).xlsx','4月管理员月度考核结果.xlsx','5月管理员月度考核结果.xlsx','6月管理员月度考核结果.xlsx','7月管理员月度考核结果.xlsx']};
const order2025 = [8,9,10,11,12];
const order2026 = [1,2,3,4,5,6,7];
function show(name){
  const f=path.join(BASE,name.replace(/(\d+)月/,(mm)=>`${mm}月`).includes('月')?BASE:''); // unused
}
for (const year of [2025,2026]){
  const months = year===2025?order2025:order2026;
  for (const mm of months){
    const fname = key[year].find((f)=>f.includes(String(mm)+'月'));
    if(!fname) continue;
    const ydir = path.join(BASE, year+'年');
    if(!fs.existsSync(ydir)) continue;
    // 找实际文件名
    const mdir=path.join(ydir, mm+'月');
    if(!fs.existsSync(mdir)) continue;
    const files=fs.readdirSync(mdir).filter((f)=>f.includes('管理员')&&/\.xlsx$/i.test(f));
    const real=files[0];
    let wb; try{wb=XLSX.readFile(path.join(mdir,real));}catch(e){console.log(year+'/'+mm+' 读取失败');continue;}
    const ws=wb.Sheets['管理员月度考核结果'];
    const data=XLSX.utils.sheet_to_json(ws,{header:1,defval:null});
    console.log('\n##### '+year+'-'+String(mm).padStart(2,'0')+' 文件['+real+'] 总行'+data.length+' #####');
    for(let r=0;r<Math.min(4,data.length);r++){
      const row=data[r];
      const cells=(row||[]).slice(0,20).map((v,i)=>v==null?`[${i}∅]`:(/^\d/.test(String(v))?`[${i}${v}]`:`[${i}${String(v).slice(0,10)}]`)).join('');
      console.log('  R'+r+': '+cells);
    }
  }
}
process.exit(0);