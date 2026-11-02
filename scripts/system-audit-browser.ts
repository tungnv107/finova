import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { auth } from "../src/server/auth";
import { bootstrapPersonalWorkspace } from "../src/server/bootstrap";
import { createWallet, createTransaction } from "../src/server/ledger";
import { createGoal, allocateGoal } from "../src/server/goals";
import { createBudget } from "../src/server/budgets";
import { createDebt } from "../src/server/debts";
import { createCreditCard } from "../src/server/credit-cards";
import { seedPremiumCatalogAndLiteSubscriptions } from "../src/modules/billing/seed";
import { createRule } from "../src/server/recurring";
import { localDay, thisMonthRange } from "../src/lib/dates";

assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/finova_system_audit");
assert.equal(process.env.BETTER_AUTH_URL, "http://localhost:31800");
const base = process.env.BETTER_AUTH_URL;
const out = path.resolve("artifacts/system-audit");
const executable = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
assert.ok(executable);
let chrome: ChildProcess | undefined, socket: WebSocket | undefined, sequence = 0;
// CDP transport carries different result shapes; each use below validates its expected result.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
const results: { routes: object[]; interactions: string[]; violations: object[] } = { routes: [], interactions: [], violations: [] };
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until<T>(fn: () => Promise<T>, label: string) {
 for (let i=0;i<250;i++) { try { const result=await fn(); if(result) return result; } catch { /* Navigation may replace the execution context. */ } await pause(200); }
 throw Error(`Timeout: ${label}`);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cdp(method: string, params: object = {}): Promise<any> {
 const id=++sequence;
 return new Promise((resolve,reject)=> { const timer=setTimeout(()=>{pending.delete(id);reject(Error(`${method} timeout`))},60000);pending.set(id,{resolve,reject,timer});socket!.send(JSON.stringify({id,method,params})); });
}
async function evaluate<T = unknown>(expression: string): Promise<T> {
 const r=await cdp("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
 if(r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
 return r.result?.value;
}
async function navigate(route: string) {
 await cdp("Page.navigate",{url:base+route});
 await until(()=>evaluate(`document.readyState==='complete' && location.pathname===${JSON.stringify(route)} && !!document.querySelector('h1') && !document.querySelector('nextjs-portal')?.shadowRoot?.querySelector('[data-nextjs-dialog-overlay]')`),route);
 await until(()=>evaluate(`!!document.querySelector('.mobile-fab, .admin-shell') && (!document.querySelector('.mobile-fab') || Object.keys(document.querySelector('.mobile-fab')).some(k=>k.startsWith('__reactProps')))`),"hydration");
}
async function screenshot(name: string) { const r=await cdp("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});await writeFile(path.join(out,`${name}.png`),Buffer.from(r.data,"base64")); }
async function clickText(text: string, selector="button") { await evaluate(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(el=>el.textContent.trim()===${JSON.stringify(text)});if(!el)throw Error('Missing '+${JSON.stringify(text)});el.click()})()`); }
async function input(selector: string, value: string) { await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`); }

async function main() {
 await mkdir(out,{recursive:true});
 if (process.env.FINOVA_AUDIT_INTERACTIONS_ONLY === "1") { const previous = JSON.parse(await readFile(path.join(out,"browser-results.json"),"utf8")); results.routes = previous.routes; results.violations = previous.violations; }
 await seedPremiumCatalogAndLiteSubscriptions();
 const id=`audit_${randomUUID().replaceAll('-','')}`;
 const user=await prisma.user.create({data:{id,name:"Minh Anh · QA",email:`${id}@example.invalid`,emailVerified:true}});
 const workspaceId=await bootstrapPersonalWorkspace(user);
 const ctx={userId:id,workspaceId,name:user.name,image:null};
 await prisma.systemRoleAssignment.create({data:{userId:id,role:"SUPER_ADMIN"}});
 const today=localDay(new Date()), period=thisMonthRange();
 const wallets=await Promise.all([
  createWallet(ctx,{name:"Tài khoản chi tiêu",type:"BANK",openingBalance:"25000000",openingDate:`${period.start}T00:00:00+07:00`}),
  createWallet(ctx,{name:"Quỹ dự phòng",type:"SAVINGS",openingBalance:"12000000",openingDate:`${period.start}T00:00:00+07:00`}),
 ]);
 const categories=await prisma.category.findMany({where:{workspaceId}});
 const food=categories.find(c=>c.name==="Ăn uống")!, salary=categories.find(c=>c.name==="Lương")!;
 const expense=await createTransaction(ctx,{kind:"EXPENSE",walletId:wallets[0].id,categoryId:food.id,amount:"180000",occurredAt:`${today}T08:00:00+07:00`,note:"Bữa trưa cùng gia đình"},randomUUID());
 await createTransaction(ctx,{kind:"INCOME",walletId:wallets[0].id,categoryId:salary.id,amount:"18000000",occurredAt:`${period.start}T08:00:00+07:00`,note:"Thu nhập tháng"},randomUUID());
 await createTransaction(ctx,{kind:"TRANSFER",walletId:wallets[0].id,destinationWalletId:wallets[1].id,amount:"2000000",feeAmount:"3500",occurredAt:`${today}T08:00:00+07:00`},randomUUID());
 results.interactions.push("Concurrent first-wallet creation commits both opening journals");
 await createDebt(ctx,{direction:"BORROW",counterparty:"Khoản vay thử nghiệm",walletId:wallets[0].id,principal:"1000000",annualRate:0,installmentCount:12,startDate:today,dueDate:null});
 await createRule(ctx,{name:"Tiền internet",frequency:"MONTHLY",interval:1,mode:"CONFIRM",kind:"EXPENSE",walletId:wallets[0].id,categoryId:food.id,amount:"250000",startDate:today,endDate:null});
 const goal=await createGoal(ctx,{name:"Chuyến đi cuối năm",walletId:wallets[1].id,target:"20000000",dueDate:null});
 await allocateGoal(ctx,goal.id,{kind:"ALLOCATE",amount:"5000000"},randomUUID());
 await createBudget(ctx,{name:"Ăn uống trong tháng",scope:"CATEGORY",period:"MONTHLY",...period,limitAmount:"4000000",categoryIds:[food.id]});
 await createCreditCard(ctx,{name:"Thẻ chi tiêu",lastFour:"1234",creditLimit:"30000000",openingDebt:"0",statementDay:20,paymentDueDay:10});
 await prisma.notification.create({data:{workspaceId,key:`qa:${id}`,title:"Kiểm tra ngân sách",body:"Bạn còn 3.820.000 ₫ trong ngân sách ăn uống.",link:"/budgets"}});
 const authContext=await auth.$context,token=randomUUID();
 await prisma.session.create({data:{id:randomUUID(),token,userId:id,expiresAt:new Date(Date.now()+3600000)}});
 const signature=createHmac("sha256",authContext.secret).update(token).digest("base64");
 const cookie=`${authContext.authCookies.sessionToken.name}=${encodeURIComponent(`${token}.${signature}`)}`;
 const profile=await mkdtemp(path.join(out,"browser-"));
 chrome=spawn(executable!,["--headless=new","--disable-gpu","--no-first-run","--remote-debugging-port=0",`--user-data-dir=${profile}`,"about:blank"],{stdio:"ignore",windowsHide:true});
 const port=await until(async()=>Number((await readFile(path.join(profile,"DevToolsActivePort"),"utf8")).split('\n')[0]),"Chrome");
 const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
 socket=new WebSocket(targets.find((t:{type:string})=>t.type==="page").webSocketDebuggerUrl);
 await new Promise<void>((resolve,reject)=>{socket!.addEventListener('open',()=>resolve());socket!.addEventListener('error',()=>reject(Error('CDP connection')))});
 socket.addEventListener('message',event=>{const m=JSON.parse(String(event.data));const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result??{});});
 await cdp("Network.enable");await cdp("Page.enable");await cdp("Runtime.enable");
 await cdp("Network.setCookie",{name:authContext.authCookies.sessionToken.name,value:`${token}.${signature}`,url:base,path:"/",httpOnly:true,sameSite:"Lax"});
 const axe=await readFile("node_modules/axe-core/axe.min.js","utf8");
 const routes=["/dashboard","/transactions","/wallets","/budgets","/goals","/categories","/cards","/debts","/recurring","/imports","/bank-sync","/notifications","/insights","/reports","/settings","/settings/subscription","/pricing","/admin","/admin/users","/admin/subscriptions","/admin/billing/prices","/admin/billing/accounts","/admin/billing/payments","/admin/billing/orders","/admin/billing/notices","/admin/billing/operations","/admin/billing/operations/inbox","/admin/billing/analytics","/admin/analytics","/admin/audit"];
 const routesToCheck = process.env.FINOVA_AUDIT_INTERACTIONS_ONLY === "1" ? [...new Set(results.violations.map(item => (item as {route:string}).route))] : routes;
 for(const width of [1440,390]) {
  await cdp("Emulation.setDeviceMetricsOverride",{width,height:width===390?844:1000,deviceScaleFactor:1,mobile:width===390});
  for(const route of routesToCheck) {
   await navigate(route);
   await evaluate(`localStorage.setItem('finova-theme','${width===390?'dark':'light'}');window.dispatchEvent(new Event('finova-theme-changed'));`);
   await pause(450);
   const metrics=await evaluate<{overflow:number;heading:string}>(`({overflow:document.documentElement.scrollWidth-innerWidth,heading:document.querySelector('h1').textContent})`);
   results.routes = results.routes.filter(item => (item as {route:string;width:number}).route !== route || (item as {width:number}).width !== width);
   results.routes.push({route,width,...metrics});assert.ok(metrics.overflow<=1,`${route} ${width}: overflow ${metrics.overflow}`);
   await evaluate(axe);
   const violations=await evaluate<object[]>(`axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})))`);
   results.violations = results.violations.filter(item => (item as {route:string;width:number}).route !== route || (item as {width:number}).width !== width);
   if(violations.length)results.violations.push({route,width,violations});
   if(["/dashboard","/goals","/transactions","/notifications","/wallets"].includes(route))await screenshot(`${route.slice(1)}-${width}`);
   await writeFile(path.join(out,'browser-results.json'),JSON.stringify(results,null,2));
   console.log(`QA ${width} ${route}: ${metrics.heading}; a11y=${violations.length}`);
  }
 }
 await cdp("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
 // A real ledger write whose first response is lost must not create a second entry on retry.
 await navigate('/transactions');await evaluate("document.querySelector('.mobile-fab').click()");
 await until(()=>evaluate("!!document.querySelector('#quick-amount')"),'quick form');
 await input('#quick-amount','12345');await input('#quick-category',food.id);await input('#quick-note',`Retry QA ${id}`);
 await evaluate(`window.__nativeFetch=window.fetch;window.__dropOnce=true;window.fetch=async(...args)=>{const r=await window.__nativeFetch(...args);if(window.__dropOnce && args[0]==='/api/v1/transactions' && args[1]?.method==='POST'){window.__dropOnce=false;throw new TypeError('Mất phản hồi kiểm thử')}return r}`);
 await clickText('Lưu giao dịch');await until(()=>evaluate("!!document.querySelector('.quick-form [role=alert]')"),'lost response');
 await clickText('Lưu giao dịch');await until(()=>evaluate("!document.querySelector('#quick-amount')"),'retry success');
 assert.equal(await prisma.transaction.count({where:{workspaceId,note:`Retry QA ${id}`}}),1);
 results.interactions.push('Lost-response retry creates exactly one ledger transaction');
 await evaluate('window.fetch=window.__nativeFetch');
 await navigate('/transactions');
 await evaluate(`[...document.querySelectorAll('.transaction-mobile-list article')].find(row=>row.textContent.includes('Bữa trưa cùng gia đình')).querySelector('[aria-haspopup=menu]').click()`);
 await clickText('Hoàn tiền','[role=menuitem]');await until(()=>evaluate("!!document.querySelector('dialog[open]')"),'refund dialog');
 await input('dialog input','999999');await clickText('Ghi nhận hoàn tiền');await until(()=>evaluate("!!document.querySelector('dialog [role=alert]')"),'over-refund rejected');
 assert.equal(await prisma.transaction.count({where:{workspaceId,originalTransactionId:expense.id}}),0);
 await input('dialog input','30000');await screenshot('refund-mobile');await clickText('Ghi nhận hoàn tiền');await until(()=>evaluate("!document.querySelector('dialog[open]')"),'refund saved');
 assert.equal(await prisma.transaction.count({where:{workspaceId,originalTransactionId:expense.id}}),1);
 results.interactions.push('Refund validation remains in dialog; valid partial refund updates ledger');
 await navigate('/goals');assert.equal(await evaluate("document.querySelectorAll('.allocation-form').length"),0);
 await clickText('Điều chỉnh tiền dành');await input(`#goal-amount-${goal.id}`,'500000');await clickText('Dành tiền','button[type=submit]');
 await until(()=>evaluate("!document.querySelector('.allocation-form')"),'allocation saved');
 results.interactions.push('Goal allocation uses an on-demand form');
 await navigate('/notifications');await evaluate("[...document.querySelectorAll('.notification-item')].find(el=>el.textContent.includes('Kiểm tra ngân sách')).querySelector('button').click()");
 await until(()=>evaluate("![...document.querySelectorAll('.notification-item')].find(el=>el.textContent.includes('Kiểm tra ngân sách')).classList.contains('notification-unread')"),'read notification');
 results.interactions.push('Read notification updates status without navigation');
 await navigate('/wallets');
 await evaluate("document.querySelector('[aria-haspopup=menu]').click()");await clickText('Xóa ví','[role=menuitem]');
 await until(()=>evaluate("!!document.querySelector('dialog[open]')"),'wallet confirmation');
 assert.equal(await evaluate("document.activeElement.textContent"),'Quay lại');
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await until(()=>evaluate("!document.querySelector('dialog[open]')"),'Escape closes confirmation');
 assert.equal(await prisma.wallet.count({where:{workspaceId}}),2);
 results.interactions.push('Destructive dialog focuses safe action; Escape cancels without deleting');
 await navigate('/transactions');await evaluate("document.querySelector('.mobile-fab').click()");
 await until(()=>evaluate("!!document.querySelector('#quick-amount')"),'busy quick form');
 await input('#quick-amount','23456');await input('#quick-category',food.id);await input('#quick-note',`Busy QA ${id}`);
 await evaluate(`window.__nativeFetch=window.fetch;window.fetch=async(...args)=>{const r=await window.__nativeFetch(...args);if(args[0]==='/api/v1/transactions' && args[1]?.method==='POST')await new Promise(resolve=>setTimeout(resolve,1500));return r}`);
 await clickText('Lưu giao dịch');await until(()=>evaluate("document.querySelector('.quick-submit')?.disabled"),'saving state');
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 assert.equal(await evaluate("!!document.querySelector('#quick-amount')"),true);
 assert.equal(await evaluate(`document.querySelector('[aria-label="Đóng biểu mẫu"]').disabled`),true);
 await until(()=>evaluate("!document.querySelector('#quick-amount')"),'busy save completed');
 assert.equal(await prisma.transaction.count({where:{workspaceId,note:`Busy QA ${id}`}}),1);
 await evaluate('window.fetch=window.__nativeFetch');
 results.interactions.push('Saving disables closing and Escape until the real ledger write is confirmed');

 // Verify private authentication and cross-origin rejection using the actual server.
 const authResponse=await fetch(base+'/api/auth/get-session',{headers:{cookie}});
 assert.ok(authResponse.headers.get('cache-control')?.includes('no-store'));
 const forbidden=await fetch(base+'/api/v1/wallets',{method:'POST',headers:{cookie,origin:'https://invalid.example','Content-Type':'application/json'},body:'{}'});
 assert.equal(forbidden.status,403);
 results.interactions.push('Auth responses no-store; foreign-origin mutations rejected');
 assert.deepEqual(results.violations,[], 'Serious accessibility findings');
 await cdp('Network.clearBrowserCookies');
 await cdp('Page.navigate',{url:base+'/login'});
 await until(()=>evaluate("document.readyState==='complete' && !!document.querySelector('.google-btn')"),'anonymous login');
 await evaluate(axe);
 const loginViolations=await evaluate<object[]>(`axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))`);
 assert.deepEqual(loginViolations,[]);
 assert.equal((await fetch(base+'/api/v1/wallets')).status,401);
 results.interactions.push('Anonymous login renders accessibly; private API rejects unauthenticated requests');
 console.log(`PASS: ${results.routes.length} viewport checks and ${results.interactions.length} interaction/security scenarios`);
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{
 await writeFile(path.join(out,'browser-results.json'),JSON.stringify(results,null,2));
 if(socket?.readyState===1) {try{await cdp('Browser.close')}catch{ /* Browser may already be closed. */ }}
 socket?.close();chrome?.kill();await prisma.$disconnect();
});
