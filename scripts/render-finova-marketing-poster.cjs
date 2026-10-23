// Standalone social-media artwork renderer. No Next.js APIs are used here.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'artifacts', 'marketing');
const logo = fs.readFileSync(path.join(root, 'public', 'brand', 'finova-primary-logo-on-white.png')).toString('base64');
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const txt = (x, y, content, size, fill = '#ffffff', weight = 500, other = '') =>
  `<text x="${x}" y="${y}" font-family="Segoe UI,Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" ${other}>${escape(content)}</text>`;
const rect = (x,y,w,h,r,fill,other='') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${other}/>`;
const circle = (x,y,r,fill,other='') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${other}/>`;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1350" viewBox="0 0 1080 1350">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#071833"/><stop offset=".55" stop-color="#0b2657"/><stop offset="1" stop-color="#061730"/></linearGradient>
  <radialGradient id="orb"><stop stop-color="#1e5eff" stop-opacity=".62"/><stop offset="1" stop-color="#1e5eff" stop-opacity="0"/></radialGradient>
  <radialGradient id="tealOrb"><stop stop-color="#18c5c2" stop-opacity=".37"/><stop offset="1" stop-color="#18c5c2" stop-opacity="0"/></radialGradient>
  <linearGradient id="headline" x1="0" y1="0" x2="1" y2=".12"><stop stop-color="#c1fff2"/><stop offset=".5" stop-color="#51e7d8"/><stop offset="1" stop-color="#4fb2ff"/></linearGradient>
  <linearGradient id="pageCard" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#f4f8fd"/></linearGradient>
  <linearGradient id="balance" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e7f2ff"/><stop offset="1" stop-color="#edfdf9"/></linearGradient>
  <linearGradient id="button" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#dffdfb"/><stop offset="1" stop-color="#fff"/></linearGradient>
  <linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#1e5eff" stop-opacity=".23"/><stop offset="1" stop-color="#1e5eff" stop-opacity="0"/></linearGradient>
  <linearGradient id="feature" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#62bffc" stop-opacity=".18"/><stop offset="1" stop-color="#62bffc" stop-opacity=".035"/></linearGradient>
  <linearGradient id="iconBox" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#246aff" stop-opacity=".54"/><stop offset="1" stop-color="#1bddc3" stop-opacity=".42"/></linearGradient>
  <pattern id="grid" width="68" height="68" patternUnits="userSpaceOnUse"><path d="M68 0H0V68" fill="none" stroke="#9cd5ff" stroke-opacity=".07" stroke-width="1"/></pattern>
  <filter id="shadow" x="-30%" y="-30%" width="160%" height="180%"><feGaussianBlur stdDeviation="19"/></filter>
  <clipPath id="safeLogo">${rect(68,68,390,130,25,'#fff')}</clipPath>
</defs>

${rect(0,0,1080,1350,0,'url(#bg)')}
${rect(0,0,1080,1350,0,'url(#grid)')}
<ellipse cx="1035" cy="615" rx="460" ry="480" fill="url(#orb)"/>
<ellipse cx="25" cy="1150" rx="520" ry="390" fill="url(#tealOrb)"/>
<circle cx="946" cy="769" r="440" fill="none" stroke="#61d9e8" stroke-opacity=".16" stroke-width="2"/>
<circle cx="946" cy="769" r="535" fill="none" stroke="#61d9e8" stroke-opacity=".09" stroke-width="2"/>
${circle(994,330,4,'#a1fff1')}${circle(54,860,3,'#a1fff1')}

${rect(67,81,390,127,25,'#00122e','opacity=".65" filter="url(#shadow)"')}
${rect(68,68,390,130,25,'#ffffff')}
<image x="83" y="81" width="361" height="106" preserveAspectRatio="xMidYMid meet" xlink:href="data:image/png;base64,${logo}" clip-path="url(#safeLogo)" />
${rect(730,80,283,61,31,'#7be5f1','fill-opacity=".08" stroke="#8cdee8" stroke-opacity=".38" stroke-width="1.5"')}
${txt(871,118,'TÀI CHÍNH CÁ NHÂN',18,'#c6f4fb',750,'text-anchor="middle" letter-spacing="1.5"')}

<path d="M72 260h35" stroke="#21d0c8" stroke-width="4" stroke-linecap="round"/>
${txt(126,268,'CÙNG FINOVA',21,'#a9f0f1',760,'letter-spacing="3.2"')}
${txt(66,368,'Làm chủ tài chính.',78,'#ffffff',800,'letter-spacing="-2.7"')}
${txt(66,461,'Sống an tâm hơn.',77,'url(#headline)',800,'letter-spacing="-2.7"')}
${txt(73,526,'Ghi chép thu chi, kiểm soát ngân sách',29,'#d3e4f3',450)}
${txt(73,570,'và xem báo cáo trong một ứng dụng.',29,'#d3e4f3',450)}

${rect(760,543,253,56,28,'#168d95','fill-opacity=".63" stroke="#abfff4" stroke-opacity=".43" stroke-width="1.5"')}
${txt(785,579,'✦',25,'#a9ffe7',700)}
${txt(821,577,'Rõ ràng mỗi ngày',17,'#ffffff',740)}

${rect(87,644,920,420,34,'#001128','opacity=".75" filter="url(#shadow)"')}
${rect(78,624,922,425,34,'url(#pageCard)','stroke="#ffffff" stroke-width="2"')}
${txt(119,677,'Tổng quan tài chính',28,'#0b1f4a',760,'letter-spacing="-.5"')}
${txt(121,704,'Dữ liệu minh họa',14,'#8693a7',500)}
${rect(825,650,134,39,17,'#e9f1ff')}
${txt(892,676,'Tháng này  ▾',16,'#2b568c',680,'text-anchor="middle"')}

${rect(119,724,267,107,19,'url(#balance)','stroke="#cfe4f5"')}
${rect(401,724,267,107,19,'#f7f9fd','stroke="#e3eaf4"')}
${rect(683,724,276,107,19,'#f7f9fd','stroke="#e3eaf4"')}
${txt(138,758,'Tổng số dư',16,'#64748b',570)}
${txt(138,803,'24.650.000 ₫',28,'#1e5eff',800,'letter-spacing="-.7"')}
${txt(421,758,'Thu nhập',16,'#64748b',570)}
${txt(421,803,'+18.500.000 ₫',26,'#047857',790,'letter-spacing="-.9"')}
${txt(703,758,'Chi tiêu',16,'#64748b',570)}
${txt(703,803,'−7.250.000 ₫',26,'#c2410c',790,'letter-spacing="-.9"')}

${rect(119,849,561,168,20,'#ffffff','stroke="#e3eaf4"')}
${txt(138,879,'Xu hướng dòng tiền',17,'#132b52',740)}
${txt(138,899,'Theo dõi tình hình thu chi theo thời gian',12,'#8290a2',450)}
<g transform="translate(137 915)">
  <path d="M0 65H523 M0 39H523 M0 11H523" fill="none" stroke="#e6edf6" stroke-dasharray="5 6"/>
  <path d="M0 61C42 57 70 24 105 44S165 73 203 42S266 24 302 41S373 50 408 22S474 36 523 7L523 76H0Z" fill="url(#area)"/>
  <path d="M0 61C42 57 70 24 105 44S165 73 203 42S266 24 302 41S373 50 408 22S474 36 523 7" fill="none" stroke="#1e5eff" stroke-width="4.5" stroke-linecap="round"/>
  ${circle(523,7,7,'#1e5eff','stroke="#ffffff" stroke-width="3"')}
</g>
${txt(144,1007,'Tuần 1',12,'#8c9bad',500)}${txt(308,1007,'Tuần 2',12,'#8c9bad',500)}${txt(469,1007,'Tuần 3',12,'#8c9bad',500)}${txt(617,1007,'Tuần 4',12,'#8c9bad',500)}

${rect(698,849,261,168,20,'#ffffff','stroke="#e3eaf4"')}
${txt(718,879,'Ngân sách tháng',17,'#132b52',740)}
<circle cx="765" cy="947" r="44" fill="none" stroke="#deebfb" stroke-width="15"/>
<circle cx="765" cy="947" r="44" fill="none" stroke="#1e5eff" stroke-width="15" stroke-dasharray="188 277" stroke-linecap="round" transform="rotate(-90 765 947)"/>
${txt(765,955,'68%',21,'#163b72',810,'text-anchor="middle"')}
${txt(828,937,'Đã sử dụng',16,'#133b74',760)}
${txt(828,960,'Theo dõi',13,'#8794a7',440)}
${txt(828,977,'hạn mức',13,'#8794a7',440)}

${rect(68,1091,304,116,22,'url(#feature)','stroke="#9fcfe8" stroke-opacity=".35"')}
${rect(388,1091,304,116,22,'url(#feature)','stroke="#9fcfe8" stroke-opacity=".35"')}
${rect(708,1091,304,116,22,'url(#feature)','stroke="#9fcfe8" stroke-opacity=".35"')}

${rect(86,1119,57,60,17,'url(#iconBox)')}
<g stroke="#b8fff9" stroke-width="2.7" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M104 1132h20a4 4 0 0 1 4 4v32h-24a4 4 0 0 1-4-4v-28a4 4 0 0 1 4-4Z"/><path d="M108 1142h15M108 1152h15M108 1162h9"/></g>
${txt(158,1146,'Thu chi rõ ràng',18,'#f5fbff',760)}${txt(158,1174,'Ghi chép dễ dàng',13,'#b8d4e8',470)}

${rect(406,1119,57,60,17,'url(#iconBox)')}
<g stroke="#b8fff9" stroke-width="2.7" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="434" cy="1149" r="19"/><path d="M434 1130v19l15 10M434 1149l-11 13"/></g>
${txt(478,1146,'Chủ động ngân sách',17,'#f5fbff',750)}${txt(478,1174,'Theo dõi hạn mức',13,'#b8d4e8',470)}

${rect(726,1119,57,60,17,'url(#iconBox)')}
<g stroke="#b8fff9" stroke-width="2.7" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M740 1165v-30M740 1165h30M746 1157l8-9 6 5 13-17M766 1136h7v7"/></g>
${txt(798,1146,'Báo cáo trực quan',18,'#f5fbff',750)}${txt(798,1174,'Hiểu rõ dòng tiền',13,'#b8d4e8',470)}

${rect(68,1247,391,78,23,'#00142e','opacity=".52" filter="url(#shadow)"')}
${rect(68,1240,391,78,23,'url(#button)')}
${txt(96,1290,'Khám phá Finova',25,'#08345e',800)}
${circle(418,1279,22,'#1e5eff')}${txt(418,1289,'→',28,'#ffffff',700,'text-anchor="middle"')}
${txt(1014,1277,'Quản lý tiền bạc đơn giản hơn.',18,'#c1d9eb',570,'text-anchor="end"')}
${txt(1014,1306,'Tự tin với kế hoạch của bạn.',18,'#c1d9eb',570,'text-anchor="end"')}
</svg>`;

async function main() {
  fs.mkdirSync(outDir, {recursive: true});
  const svgPath = path.join(outDir, 'finova-social-poster.svg');
  const pngPath = path.join(outDir, 'finova-social-poster-1080x1350.png');
  fs.writeFileSync(svgPath, svg, 'utf8');
  await sharp(Buffer.from(svg)).png({compressionLevel:9}).toFile(pngPath);
  const info = await sharp(pngPath).metadata();
  console.log(JSON.stringify({svgPath,pngPath,width:info.width,height:info.height,bytes:info.size}));
}

main().catch((err) => {console.error(err); process.exitCode = 1;});
