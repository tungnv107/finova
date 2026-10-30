// Alternative Facebook poster: bright editorial layout and a central app preview.
// Standalone SVG -> PNG renderer. Does not use Next.js APIs.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'artifacts', 'marketing');
const logo = fs.readFileSync(path.join(root, 'public', 'brand', 'finova-primary-logo-on-white.png')).toString('base64');
const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const text = (x, y, value, size, color = '#0B1F4A', weight = 600, other = '') =>
  `<text x="${x}" y="${y}" font-family="Segoe UI,Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}" ${other}>${esc(value)}</text>`;
const rect = (x, y, w, h, r, fill, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1350" viewBox="0 0 1080 1350">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2=".95" y2="1"><stop stop-color="#f8fbff"/><stop offset=".6" stop-color="#ecf8fc"/><stop offset="1" stop-color="#e8eeff"/></linearGradient>
  <linearGradient id="blue" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1381ff"/><stop offset="1" stop-color="#1e5eff"/></linearGradient>
  <linearGradient id="mint" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#abfff1"/><stop offset="1" stop-color="#4bd9d4"/></linearGradient>
  <linearGradient id="balance" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1d70fa"/><stop offset="1" stop-color="#1050c7"/></linearGradient>
  <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#f4f8ff"/></linearGradient>
  <linearGradient id="chart" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#32c9c2" stop-opacity=".25"/><stop offset="1" stop-color="#32c9c2" stop-opacity="0"/></linearGradient>
  <filter id="softShadow" x="-40%" y="-40%" width="180%" height="200%"><feDropShadow dx="0" dy="15" stdDeviation="22" flood-color="#0b316c" flood-opacity=".17"/></filter>
  <filter id="cardShadow" x="-40%" y="-40%" width="180%" height="200%"><feDropShadow dx="0" dy="12" stdDeviation="17" flood-color="#21437c" flood-opacity=".13"/></filter>
  <pattern id="dots" patternUnits="userSpaceOnUse" width="22" height="22"><circle cx="2" cy="2" r="1.6" fill="#1e5eff" fill-opacity=".13"/></pattern>
  <clipPath id="screenClip">${rect(368,610,369,535,35,'#ffffff')}</clipPath>
</defs>

${rect(0,0,1080,1350,0,'url(#bg)')}
<circle cx="1120" cy="-85" r="325" fill="#d4e8ff" fill-opacity=".65"/>
<circle cx="1045" cy="-68" r="228" fill="none" stroke="#b5d6fb" stroke-width="3"/>
<path d="M0 939 C230 807 337 846 565 940 S937 1060 1080 898 V1350 H0Z" fill="#d9f6f3" opacity=".68"/>
<path d="M0 1124 C266 1000 455 1087 665 1118 S968 1106 1080 1030 V1350 H0Z" fill="#c6e8ff" opacity=".44"/>
${rect(41,685,255,310,0,'url(#dots)','opacity=".64"')}
<circle cx="925" cy="699" r="200" fill="none" stroke="#78d8dc" stroke-opacity=".38" stroke-width="2"/>
<circle cx="925" cy="699" r="252" fill="none" stroke="#78d8dc" stroke-opacity=".21" stroke-width="2"/>

${rect(67,64,386,126,26,'#ffffff','filter="url(#cardShadow)"')}
<image x="82" y="76" width="357" height="104" preserveAspectRatio="xMidYMid meet" xlink:href="data:image/png;base64,${logo}" />
${rect(709,85,304,61,30,'#ffffff','stroke="#dce9fa" stroke-width="2"')}
<circle cx="747" cy="115" r="7" fill="#18c5c2"/>
${text(773,123,'TÀI CHÍNH CÁ NHÂN',17,'#244d80',750,'letter-spacing="1.4"')}

${rect(70,226,252,46,23,'#d9f8f4')}
${text(196,256,'CÙNG FINOVA',18,'#087d79',800,'text-anchor="middle" letter-spacing="2.4"')}
${text(66,371,'Tiền bạc',91,'#0b1f4a',800,'letter-spacing="-3"')}
${text(66,465,'trong tầm tay.',83,'#1e5eff',800,'letter-spacing="-3.2"')}
${text(73,525,'Theo dõi thu chi, lập ngân sách',29,'#47607f',470)}
${text(73,563,'và hiểu dòng tiền mỗi ngày.',29,'#47607f',470)}
<path d="M793 289l11 20 20 11-20 11-11 20-11-20-20-11 20-11Z" fill="#33cfc8" opacity=".76"/>
<circle cx="881" cy="427" r="7" fill="#1e5eff" opacity=".5"/>

<!-- Product screen: an illustrative UI, not real account data. -->
<ellipse cx="553" cy="890" rx="349" ry="350" fill="#d5e9ff" opacity=".82"/>
<ellipse cx="553" cy="890" rx="291" ry="295" fill="#b8f3e9" opacity=".55"/>
${rect(352,595,401,563,49,'#0b1f4a','filter="url(#softShadow)"')}
${rect(363,605,379,542,39,'url(#paper)')}
<g clip-path="url(#screenClip)">
  ${rect(368,610,369,535,35,'#f8fbff')}
  ${rect(477,620,140,16,8,'#0b1f4a')}
  ${text(387,674,'Tổng quan tài chính',26,'#102b57',760)}
  ${text(388,697,'Dữ liệu minh họa',13,'#8799b3',450)}
  ${rect(384,717,336,132,25,'url(#balance)')}
  <circle cx="690" cy="738" r="64" fill="#5badff" opacity=".2"/>
  <circle cx="690" cy="738" r="40" fill="none" stroke="#ffffff" stroke-opacity=".2" stroke-width="2"/>
  ${text(408,759,'TỔNG SỐ DƯ',15,'#cde7ff',720,'letter-spacing="1"')}
  ${text(408,811,'24.650.000 ₫',34,'#ffffff',800,'letter-spacing="-.7"')}
  ${rect(384,862,160,107,21,'#ffffff','stroke="#e0e9f4" stroke-width="1.5"')}
  ${rect(555,862,165,107,21,'#ffffff','stroke="#e0e9f4" stroke-width="1.5"')}
  <circle cx="410" cy="885" r="9" fill="#d4f8e6"/>
  <path d="M410 891v-11m-5 5 5-5 5 5" fill="none" stroke="#06845e" stroke-width="2.3" stroke-linecap="round"/>
  ${text(427,891,'Thu nhập',14,'#56718f',650)}
  ${text(398,940,'+18,5 tr',28,'#047857',800)}
  <circle cx="583" cy="885" r="9" fill="#ffeadf"/>
  <path d="M583 879v11m-5-5 5 5 5-5" fill="none" stroke="#c2410c" stroke-width="2.3" stroke-linecap="round"/>
  ${text(600,891,'Chi tiêu',14,'#56718f',650)}
  ${text(568,940,'−7,25 tr',28,'#c2410c',800)}
  ${rect(384,982,336,127,20,'#ffffff','stroke="#e0e9f4" stroke-width="1.5"')}
  ${text(402,1011,'Dòng tiền tháng này',16,'#162f59',760)}
  <path d="M402 1075H703 M402 1048H703" stroke="#e3edf7" stroke-width="2" stroke-dasharray="5 7"/>
  <path d="M403 1083 C446 1072 453 1039 490 1054 S552 1082 590 1050 S648 1065 701 1028 L701 1092 H403Z" fill="url(#chart)"/>
  <path d="M403 1083 C446 1072 453 1039 490 1054 S552 1082 590 1050 S648 1065 701 1028" fill="none" stroke="#18bbb5" stroke-width="5" stroke-linecap="round"/>
  <circle cx="701" cy="1028" r="6" fill="#1e5eff" stroke="#ffffff" stroke-width="3"/>
  ${rect(385,1120,336,2,1,'#e7edf6')}
</g>

<!-- Floating feature cards frame the phone. -->
${rect(66,757,306,145,25,'#ffffff','stroke="#e1ebf7" stroke-width="2" filter="url(#cardShadow)"')}
${rect(87,780,59,59,18,'#e1f9f6')}
<rect x="105" y="794" width="24" height="31" rx="5" fill="none" stroke="#079b9b" stroke-width="3"/>
<path d="M111 804h13m-13 7h13m-13 7h9" stroke="#079b9b" stroke-width="2.7" stroke-linecap="round"/>
${text(159,805,'Thu chi rõ ràng',21,'#0b1f4a',780)}
${text(159,836,'Ghi chép dễ dàng',15,'#667d98',500)}
${text(90,874,'Hiểu từng khoản tiền',17,'#087d79',650)}

${rect(736,895,282,156,26,'#ffffff','stroke="#e1ebf7" stroke-width="2" filter="url(#cardShadow)"')}
${rect(757,916,56,56,18,'#e3efff')}
<circle cx="785" cy="944" r="19" fill="none" stroke="#1e5eff" stroke-width="5"/>
<path d="M785 925a19 19 0 0 1 18 22" fill="none" stroke="#18c5c2" stroke-width="5" stroke-linecap="round"/>
${text(826,940,'Ngân sách',21,'#0b1f4a',780)}
${text(826,964,'chủ động',21,'#0b1f4a',780)}
${text(760,1008,'Theo dõi hạn mức',16,'#667d98',520)}
${text(760,1032,'chi tiêu mỗi tháng',16,'#667d98',520)}

${rect(68,1200,944,112,31,'#0b1f4a')}
${text(98,1248,'Rõ tiền hôm nay.',28,'#ffffff',760)}
${text(98,1284,'Vững vàng ngày mai.',23,'#b8d7f0',530)}
${rect(715,1223,269,65,27,'url(#blue)')}
${text(833,1264,'Theo dõi Finova',21,'#ffffff',750,'text-anchor="middle"')}
<circle cx="961" cy="1254" r="17" fill="#ffffff" fill-opacity=".24"/>
${text(961,1261,'→',22,'#ffffff',720,'text-anchor="middle"')}
</svg>`;

async function render() {
  fs.mkdirSync(output, {recursive: true});
  const svgPath = path.join(output, 'finova-social-poster-v2.svg');
  const pngPath = path.join(output, 'finova-social-poster-v2-1080x1350.png');
  fs.writeFileSync(svgPath, svg, 'utf8');
  await sharp(Buffer.from(svg)).png({compressionLevel: 9}).toFile(pngPath);
  const {width, height} = await sharp(pngPath).metadata();
  if (width !== 1080 || height !== 1350) throw new Error('Unexpected poster dimensions');
  console.log(JSON.stringify({svgPath, pngPath, width, height}));
}

render().catch((error) => { console.error(error); process.exitCode = 1; });
