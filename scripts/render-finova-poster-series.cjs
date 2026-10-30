// Finova Facebook carousel campaign. Run: node scripts/render-finova-poster-series.cjs
// Draws editable SVG artwork and renders 1080x1350 PNGs using the approved PNG logo.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'artifacts', 'marketing', 'finova-intro-series');
const logo = fs.readFileSync(path.join(ROOT, 'public', 'brand', 'finova-primary-logo-on-white.png')).toString('base64');
const W = 1080, H = 1350;
const C = { navy:'#0B1F4A', midnight:'#071733', blue:'#1E5EFF', cyan:'#18C5C2', teal:'#087D79', pale:'#F5FAFF', ink:'#102951', muted:'#5B7293', green:'#047857', orange:'#C2410C', white:'#FFFFFF' };
const e = (s) => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const r = (x,y,w,h,rad=0,fill='#fff',extra='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rad}" fill="${fill}" ${extra}/>`;
const circle = (x,y,rad,fill,extra='')=>`<circle cx="${x}" cy="${y}" r="${rad}" fill="${fill}" ${extra}/>`;
const t = (x,y,s,size=24,color=C.navy,weight=600,extra='')=>`<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}" font-family="Segoe UI,Arial,sans-serif" ${extra}>${e(s)}</text>`;
const p = (d,stroke,width=3,extra='')=>`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const label=(x,y,s,dark=false)=>`${r(x,y,230,43,21,dark?'#173A65':'#DDF7F5')}${t(x+115,y+28,s,16,dark?'#B7F8F5':C.teal,750,'text-anchor="middle" letter-spacing="1.8"')}`;
const small=(x,y,s,color=C.muted)=>t(x,y,s,16,color,480);
const money=(x,y,s,color=C.ink,size=30)=>t(x,y,s,size,color,790,'font-variant-numeric="tabular-nums"');
const defs=`<defs>
 <linearGradient id="light" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FCFEFF"/><stop offset=".67" stop-color="#EBF6FF"/><stop offset="1" stop-color="#DDF7F5"/></linearGradient>
 <linearGradient id="dark" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#071733"/><stop offset=".62" stop-color="#0C2B60"/><stop offset="1" stop-color="#082149"/></linearGradient>
 <linearGradient id="royal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#3295FF"/><stop offset="1" stop-color="#1753DE"/></linearGradient>
 <linearGradient id="aqua" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#A6FFF0"/><stop offset="1" stop-color="#18C5C2"/></linearGradient>
 <linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#1E5EFF" stop-opacity=".22"/><stop offset="1" stop-color="#1E5EFF" stop-opacity="0"/></linearGradient>
 <linearGradient id="tealArea" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#18C5C2" stop-opacity=".25"/><stop offset="1" stop-color="#18C5C2" stop-opacity="0"/></linearGradient>
 <radialGradient id="glow"><stop stop-color="#1E5EFF" stop-opacity=".43"/><stop offset="1" stop-color="#1E5EFF" stop-opacity="0"/></radialGradient>
 <filter id="shadow" x="-35%" y="-35%" width="170%" height="190%"><feDropShadow dx="0" dy="15" stdDeviation="20" flood-color="#042451" flood-opacity=".17"/></filter>
 <filter id="subshadow" x="-35%" y="-35%" width="170%" height="190%"><feDropShadow dx="0" dy="7" stdDeviation="10" flood-color="#042451" flood-opacity=".11"/></filter>
 <pattern id="grid" width="54" height="54" patternUnits="userSpaceOnUse"><path d="M54 0H0V54" fill="none" stroke="#79D3E9" stroke-opacity=".09"/></pattern>
 </defs>`;
function base(n, dark=false, topic='GIỚI THIỆU'){
 const fg=dark?'#FFFFFF':C.navy;
 return `${r(0,0,W,H,0,dark?'url(#dark)':'url(#light)')}
 ${dark?r(0,0,W,H,0,'url(#grid)'):''}
 ${circle(1100,710,480,dark?'url(#glow)':'#DBF2FF',dark?'':'opacity=".55"')}
 ${circle(1032,720,445,'none',`stroke="${dark?'#58CEE7':'#9ADCDD'}" stroke-opacity=".18" stroke-width="2"`)}
 ${circle(1032,720,345,'none',`stroke="${dark?'#58CEE7':'#9ADCDD'}" stroke-opacity=".16" stroke-width="2"`)}
 ${r(66,62,337,114,25,'#FFFFFF','filter="url(#subshadow)"')}
 <image x="80" y="73" width="309" height="93" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${logo}"/>
 ${r(812,91,201,53,26,dark?'#193B68':'#FFFFFF',`stroke="${dark?'#4E86B0':'#D5E7F5'}" stroke-width="1.5"`)}
 ${t(912,124,String(n).padStart(2,'0')+' / 07',20,dark?'#D4F2FD':'#245181',750,'text-anchor="middle" letter-spacing="2"')}
 ${label(70,224,topic,dark)}
 ${r(67,1242,946,2,1,dark?'#6E9AC0':'#B4D5EC','opacity=".45"')}
 ${t(70,1294,'FINOVA  ·  RÕ TIỀN, VỮNG TƯƠNG LAI',16,dark?'#B6D6EC':'#547291',750,'letter-spacing="1.1"')}
 ${t(1010,1294,'0'+n,20,fg,760,'text-anchor="end"')}`;
}
function headline(lines,dark=false){return lines.map((s,i)=>t(69,345+i*87,s,70,i===1?(dark?'#68E8DC':C.blue):(dark?'#FFFFFF':C.navy),820,'letter-spacing="-2"')).join('');}
function desc(lines,dark=false,start=546){return lines.map((s,i)=>t(73,start+i*38,s,26,dark?'#D1E5F4':'#4B6583',460)).join('');}
function mockCard(x,y,w,h,extra=''){return r(x,y,w,h,25,'#FFFFFF',`stroke="#DFEAF5" stroke-width="1.5" ${extra}`);}
function sparkline(x,y,w=500,teal=false){return `<g transform="translate(${x} ${y})">
 ${p(`M0 120H${w} M0 70H${w} M0 20H${w}`,'#E0EBF6',1.5,'stroke-dasharray="6 9"')}
 <path d="M0 116 C55 113 64 56 120 76 S224 127 290 69 S403 89 ${w} 31 L${w} 145 H0Z" fill="${teal?'url(#tealArea)':'url(#area)'}"/>
 ${p(`M0 116 C55 113 64 56 120 76 S224 127 290 69 S403 89 ${w} 31`,teal?'#16B9B7':C.blue,6)}
 ${circle(w,31,7,teal?'#16B9B7':C.blue,'stroke="#FFFFFF" stroke-width="3"')}</g>`;}
function donut(x,y,rad,percent,color=C.blue,dark=false){const c=2*Math.PI*rad;return `<g>
 ${circle(x,y,rad,'none',`stroke="${dark?'#2E4B73':'#E0ECFA'}" stroke-width="22"`)}
 ${circle(x,y,rad,'none',`stroke="${color}" stroke-width="22" stroke-linecap="round" stroke-dasharray="${(c*percent/100).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${x} ${y})"`)}
 ${t(x,y+12,percent+'%',35,dark?'#FFFFFF':C.navy,820,'text-anchor="middle"')}</g>`;}
const slides=[];

// 01: Brand overview. Spacious large type and compact financial dashboard.
slides.push({slug:'01-gioi-thieu',title:'Finova — Rõ tiền, vững tương lai',dark:true,body:()=>`
 ${headline(['Hiểu rõ tiền bạc.','Chủ động tương lai.'],true)}
 ${desc(['Thu chi, ngân sách và báo cáo tài chính','trong một trải nghiệm dễ theo dõi.'],true,547)}
 ${r(78,671,924,472,35,'#F8FBFF','filter="url(#shadow)"')}
 ${t(117,727,'Tổng quan tài chính',29,C.ink,760)}${t(117,753,'Dữ liệu minh họa',15,'#8193A9',500)}
 ${mockCard(113,780,269,124)}${mockCard(397,780,269,124)}${mockCard(681,780,280,124)}
 ${small(135,820,'Tổng số dư')}${money(135,868,'24.650.000 ₫',C.blue,28)}
 ${small(418,820,'Thu nhập')}${money(418,868,'+18,5 triệu',C.green,28)}
 ${small(701,820,'Chi tiêu')}${money(701,868,'−7,25 triệu',C.orange,28)}
 ${mockCard(113,925,559,185)}${mockCard(690,925,271,185)}
 ${t(137,961,'Xu hướng dòng tiền',19,C.ink,730)}${sparkline(137,976,509)}
 ${t(714,961,'Ngân sách tháng',19,C.ink,730)}${donut(785,1044,49,68)}
 ${t(853,1038,'Đã dùng',17,C.ink,680)}${t(853,1063,'hạn mức',15,C.muted,500)}
 ${t(544,1191,'Rõ ràng từng khoản tiền  •  Tự tin mỗi kế hoạch',20,'#BCEBEF',600,'text-anchor="middle"')}`});

// 02: Money in / money out.
slides.push({slug:'02-theo-doi-thu-chi',title:'Theo dõi thu chi',dark:false,body:()=>`
 ${headline(['Biết tiền vào đâu.','Rõ tiền ra đâu.'])}
 ${desc(['Ghi lại từng khoản thu chi, phân loại dễ hiểu','và theo dõi dòng tiền mỗi ngày.'],false,542)}
 ${r(210,665,655,475,38,'#E0EFFC')}
 ${r(251,638,565,503,36,'#0B1F4A','filter="url(#shadow)"')}
 ${r(263,649,541,480,29,'#FFFFFF')}
 ${t(300,707,'Giao dịch gần đây',27,C.ink,760)}${t(300,736,'Dữ liệu minh họa',14,'#8B9AB0',500)}
 ${r(291,762,482,75,19,'#F0F9FF')}${circle(332,799,22,'#D7F5EB')}${t(332,805,'+',24,C.green,770,'text-anchor="middle"')}
 ${t(373,793,'Thu nhập',20,C.ink,710)}${small(373,816,'Hôm nay')}${money(753,803,'+5.000.000 ₫',C.green,22).replace('x="753"','x="753" text-anchor="end"')}
 ${r(291,850,482,75,19,'#FAFCFF')}${circle(332,887,22,'#FFE9DF')}${t(332,894,'−',24,C.orange,770,'text-anchor="middle"')}
 ${t(373,881,'Ăn uống',20,C.ink,710)}${small(373,904,'Hôm nay')}${money(753,891,'−85.000 ₫',C.orange,22).replace('x="753"','x="753" text-anchor="end"')}
 ${r(291,938,482,75,19,'#FAFCFF')}${circle(332,975,22,'#E7F0FF')}${t(332,983,'↗',23,C.blue,770,'text-anchor="middle"')}
 ${t(373,969,'Di chuyển',20,C.ink,710)}${small(373,992,'Hôm qua')}${money(753,979,'−42.000 ₫',C.orange,22).replace('x="753"','x="753" text-anchor="end"')}
 ${r(291,1032,482,73,19,'url(#royal)')}${t(532,1078,'+ Thêm giao dịch',22,'#FFFFFF',760,'text-anchor="middle"')}
 ${r(73,760,169,79,20,'#FFFFFF','filter="url(#subshadow)"')}${t(157,792,'THU NHẬP',13,C.teal,740,'text-anchor="middle"')}${t(157,820,'+ 18,5 tr',22,C.green,780,'text-anchor="middle"')}
 ${r(792,934,214,87,21,'#FFFFFF','filter="url(#subshadow)"')}${t(899,969,'CHI TIÊU',14,C.orange,740,'text-anchor="middle"')}${t(899,1001,'− 7,25 tr',23,C.orange,780,'text-anchor="middle"')}
 ${t(540,1199,'Mỗi khoản ghi lại, một điều rõ hơn.',22,C.teal,690,'text-anchor="middle"')}`});

// 03: Multiple wallets.
slides.push({slug:'03-quan-ly-nhieu-vi',title:'Quản lý nhiều ví',dark:true,body:()=>`
 ${headline(['Nhiều ví khác nhau.','Một nơi quản lý.'],true)}
 ${desc(['Theo dõi số dư theo từng ví và nhìn thấy','bức tranh tài chính chung của bạn.'],true,546)}
 ${r(87,674,905,470,35,'#F8FBFF','filter="url(#shadow)"')}
 ${t(125,730,'Ví của tôi',29,C.ink,770)}${t(125,758,'Dữ liệu minh họa',15,'#8498AE',500)}
 ${r(120,796,387,153,27,'url(#royal)')}${circle(448,823,73,'#83B9FF','opacity=".16"')}
 ${t(146,838,'Ví chi tiêu',19,'#D2EDFF',650)}${money(146,903,'8.250.000 ₫','#FFFFFF',35)}
 ${r(531,796,419,153,27,'#E8F6F6')}
 ${t(559,838,'Ví tiết kiệm',19,C.teal,650)}${money(559,903,'16.400.000 ₫',C.navy,35)}
 ${r(120,971,830,134,26,'#FFFFFF','stroke="#DFEAF5" stroke-width="1.5"')}
 ${circle(173,1038,31,'#E3EEFF')}${t(173,1048,'⇄',33,C.blue,700,'text-anchor="middle"')}
 ${t(228,1023,'Chuyển tiền giữa các ví',23,C.ink,750)}${t(228,1057,'Theo dõi luồng tiền giữa các tài khoản của bạn.',18,C.muted,460)}
 ${t(540,1197,'Mỗi ví rõ ràng, tổng thể dễ hiểu.',22,'#BDECF2',690,'text-anchor="middle"')}`});

// 04: Budget.
slides.push({slug:'04-kiem-soat-ngan-sach',title:'Kiểm soát ngân sách',dark:false,body:()=>`
 ${headline(['Chi tiêu có kế hoạch.','Nhẹ đầu mỗi tháng.'])}
 ${desc(['Đặt hạn mức cho các nhóm chi tiêu','và chủ động theo dõi tiến độ sử dụng.'],false,543)}
 ${r(83,683,915,455,35,'#FFFFFF','filter="url(#shadow)"')}
 ${t(121,743,'Ngân sách tháng',29,C.ink,770)}${t(121,771,'Dữ liệu minh họa',15,'#8093AA',500)}
 ${donut(270,962,116,68,C.blue)}
 ${t(270,1120,'Đã sử dụng',19,C.muted,640,'text-anchor="middle"')}
 ${t(452,836,'Ăn uống',22,C.ink,720)}${t(952,836,'72%',22,C.ink,750,'text-anchor="end"')}
 ${r(452,855,500,16,8,'#E5EEF8')}${r(452,855,360,16,8,'url(#royal)')}
 ${t(452,929,'Mua sắm',22,C.ink,720)}${t(952,929,'48%',22,C.ink,750,'text-anchor="end"')}
 ${r(452,948,500,16,8,'#E5EEF8')}${r(452,948,240,16,8,'#18C5C2')}
 ${t(452,1022,'Di chuyển',22,C.ink,720)}${t(952,1022,'30%',22,C.ink,750,'text-anchor="end"')}
 ${r(452,1041,500,16,8,'#E5EEF8')}${r(452,1041,150,16,8,'#6C99FF')}
 ${t(540,1198,'Chủ động ngân sách, tự tin chi tiêu.',22,C.teal,700,'text-anchor="middle"')}`});

// 05: Reporting insights.
slides.push({slug:'05-bao-cao-truc-quan',title:'Báo cáo trực quan',dark:true,body:()=>`
 ${headline(['Số liệu dễ hiểu.','Quyết định tự tin.'],true)}
 ${desc(['Xem xu hướng thu chi qua báo cáo trực quan,','theo kỳ và theo danh mục.'],true,544)}
 ${r(78,669,925,472,35,'#FFFFFF','filter="url(#shadow)"')}
 ${t(117,727,'Phân tích dòng tiền',29,C.ink,770)}${t(117,756,'Dữ liệu minh họa',15,'#8093AA',500)}
 ${mockCard(112,784,604,310)}${t(140,825,'Thu nhập và chi tiêu',20,C.ink,710)}
 ${p('M144 1042H679 M144 992H679 M144 942H679 M144 892H679','#DBE7F3',1.5,'stroke-dasharray="5 8"')}
 ${[0,1,2,3,4].map((i)=>`${r(167+i*102,1018-[92,140,116,171,152][i],32,[92,140,116,171,152][i],8,C.blue)}${r(205+i*102,1018-[66,92,86,110,81][i],32,[66,92,86,110,81][i],8,'#18C5C2')}`).join('')}
 ${t(164,1065,'T1',14,C.muted,600)}${t(267,1065,'T2',14,C.muted,600)}${t(369,1065,'T3',14,C.muted,600)}${t(471,1065,'T4',14,C.muted,600)}${t(572,1065,'T5',14,C.muted,600)}
 ${mockCard(735,784,227,310)}${t(757,826,'Tổng quan',20,C.ink,730)}
 ${t(757,878,'Thu nhập',17,C.muted,530)}${money(757,919,'18,5 tr',C.green,30)}
 ${r(754,948,187,1,0,'#E0E9F4')}
 ${t(757,993,'Chi tiêu',17,C.muted,530)}${money(757,1035,'7,25 tr',C.orange,30)}
 ${circle(154,1120,7,C.blue)}${t(174,1126,'Thu nhập',16,C.muted,590)}${circle(285,1120,7,C.cyan)}${t(305,1126,'Chi tiêu',16,C.muted,590)}
 ${t(540,1193,'Thấy xu hướng. Hiểu dòng tiền.',22,'#BCECF2',690,'text-anchor="middle"')}`});

// 06: Financial goals.
slides.push({slug:'06-muc-tieu-tiet-kiem',title:'Mục tiêu tiết kiệm',dark:false,body:()=>`
 ${headline(['Mục tiêu rõ ràng.','Từng bước tiến gần.'])}
 ${desc(['Đặt mục tiêu tiết kiệm và theo dõi','hành trình tích lũy của riêng bạn.'],false,544)}
 ${r(92,682,898,451,37,'#FFFFFF','filter="url(#shadow)"')}
 ${t(128,746,'Mục tiêu của tôi',29,C.ink,770)}${t(128,776,'Dữ liệu minh họa',15,'#8598AE',500)}
 ${r(127,811,824,255,27,'#F4FAFF','stroke="#DFEAF4" stroke-width="1.5"')}
 ${circle(199,877,39,'#D7F8F4')}${t(199,890,'✦',38,C.teal,730,'text-anchor="middle"')}
 ${t(254,865,'Quỹ dự phòng',27,C.ink,770)}${t(254,900,'Một bước vững vàng cho tương lai',18,C.muted,490)}
 ${t(151,966,'Đã tích lũy',18,C.muted,580)}${money(151,1007,'12.000.000 ₫',C.blue,34)}
 ${t(929,966,'20.000.000 ₫',18,C.muted,630,'text-anchor="end"')}
 ${r(151,1024,778,15,8,'#DCEAF7')}${r(151,1024,467,15,8,'url(#royal)')}
 ${r(688,819,229,48,24,'#D8F8F3')}${t(803,851,'60% hoàn thành',18,C.teal,740,'text-anchor="middle"')}
 ${t(540,1193,'Kiên trì hôm nay, an tâm ngày mai.',22,C.teal,690,'text-anchor="middle"')}`});

// 07: Campaign ending / follow CTA. Avoids launch promises.
slides.push({slug:'07-theo-doi-finova',title:'Theo dõi Finova',dark:true,body:()=>`
 ${headline(['Rõ tiền hôm nay.','Vững tương lai.'],true)}
 ${desc(['Tài chính cá nhân dễ theo dõi hơn','khi mọi thông tin ở đúng một nơi.'],true,547)}
 ${r(95,676,890,448,39,'#FFFFFF','filter="url(#shadow)"')}
 ${r(130,720,820,108,25,'#EAF4FF')}${circle(193,772,25,'#D4E9FF')}${t(193,781,'✓',27,C.blue,770,'text-anchor="middle"')}
 ${t(241,760,'Thu chi minh bạch',25,C.ink,750)}${t(241,790,'Ghi chép và phân loại dễ dàng',18,C.muted,500)}
 ${r(130,842,820,108,25,'#ECFBF8')}${circle(193,894,25,'#D6F7F0')}${t(193,903,'✓',27,C.teal,770,'text-anchor="middle"')}
 ${t(241,882,'Ngân sách chủ động',25,C.ink,750)}${t(241,912,'Theo dõi hạn mức và mục tiêu',18,C.muted,500)}
 ${r(130,964,820,108,25,'#EFF4FF')}${circle(193,1016,25,'#DDE9FF')}${t(193,1025,'✓',27,C.blue,770,'text-anchor="middle"')}
 ${t(241,1004,'Báo cáo trực quan',25,C.ink,750)}${t(241,1034,'Hiểu dòng tiền qua từng con số',18,C.muted,500)}
 ${r(258,1146,563,68,29,'url(#royal)')}${t(539,1191,'THEO DÕI FINOVA  →',24,'#FFFFFF',780,'text-anchor="middle" letter-spacing=".6"')}
 ${t(540,622,'Finova đang được hoàn thiện.',18,'#B9E1F0',540,'text-anchor="middle"')}`});

const image = (slide, index) => {
 const content = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}${base(index+1,slide.dark,slide.title.toUpperCase())}${slide.body()}</svg>`;
 return content;
};

async function main(){
 fs.mkdirSync(OUT,{recursive:true});
 const entries=[];
 for(let i=0;i<slides.length;i++){
  const s=slides[i], stem=`finova-${s.slug}`;
  const svgPath=path.join(OUT,stem+'.svg'), pngPath=path.join(OUT,stem+'-1080x1350.png');
  const svg=image(s,i);
  fs.writeFileSync(svgPath,svg,'utf8');
  await sharp(Buffer.from(svg)).png({compressionLevel:9}).toFile(pngPath);
  const meta=await sharp(pngPath).metadata();
  if(meta.width!==W||meta.height!==H)throw new Error(`Bad size: ${stem}`);
  entries.push({title:s.title,file:path.basename(pngPath),svg:path.basename(svgPath),bytes:fs.statSync(pngPath).size});
 }
 const tileW=360,tileH=450,gap=22,pad=35,cols=4,rows=2;
 const composites=[];
 for(let i=0;i<entries.length;i++){
  const input=await sharp(path.join(OUT,entries[i].file)).resize(tileW,tileH).toBuffer();
  composites.push({input,left:pad+(i%cols)*(tileW+gap),top:pad+Math.floor(i/cols)*(tileH+gap)});
 }
 const sheetW=pad*2+cols*tileW+(cols-1)*gap, sheetH=pad*2+rows*tileH+(rows-1)*gap;
 await sharp({create:{width:sheetW,height:sheetH,channels:3,background:'#D8E5F2'}}).composite(composites).png().toFile(path.join(OUT,'finova-series-contact-sheet.png'));
 fs.writeFileSync(path.join(OUT,'manifest.json'),JSON.stringify({size:`${W}x${H}`,count:entries.length,entries},null,2),'utf8');
 console.log(JSON.stringify({output:OUT,count:entries.length,contactSheet:`${sheetW}x${sheetH}`,entries},null,2));
}
main().catch(err=>{console.error(err);process.exitCode=1;});
