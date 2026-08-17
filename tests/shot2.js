const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const FILE = 'file://' + path.resolve('/home/claude/video-buffer-doctor.html');
const WEBM = fs.readFileSync('/home/claude/test.webm');

(async () => {
  for (const scheme of ['light','dark']) {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport:{width:390,height:844}, colorScheme: scheme });
    const page = await ctx.newPage();
    const errs=[]; page.on('pageerror',e=>errs.push(e.message));
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('file://')) return route.continue();
      if (/\.m3u8/.test(url)) return route.abort('failed');
      if (/\.mp4|mov_bbb/.test(url)) return route.fulfill({status:200,headers:{'content-type':'video/webm','access-control-allow-origin':'*'},body:WEBM});
      if (/__down/.test(url)) {
        const m=url.match(/bytes=(\d+)/);
        if (m && m[1]==='0'){ await new Promise(r=>setTimeout(r,25+Math.random()*40)); return route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:''}); }
        const size=1_200_000; await new Promise(r=>setTimeout(r, size*8/(9e6)*1000*(0.7+Math.random()*0.6)));
        return route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:Buffer.alloc(size,3)});
      }
      if (/jsdelivr|unpkg/.test(url)) return route.abort('failed');
      if (/__up/.test(url)) { await new Promise(r=>setTimeout(r,500)); return route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:'ok'}); }
      await new Promise(r=>setTimeout(r,40+Math.random()*30));
      return route.fulfill({status:200,body:'x'});
    });
    await page.goto(FILE);
    await page.screenshot({path:`/home/claude/shots/intro-${scheme}.png`,fullPage:true});
    await page.click('#startBtn');
    await page.waitForTimeout(9000);
    await page.screenshot({path:`/home/claude/shots/running-${scheme}.png`,fullPage:true});
    await page.waitForSelector('#result:not(.hidden)',{timeout:140000});
    await page.screenshot({path:`/home/claude/shots/result-${scheme}.png`,fullPage:true});
    const info = await page.evaluate(()=>({
      v:document.querySelector('.verdict h2').textContent,
      dl:document.querySelector('.tile .v').textContent,
      pts:document.querySelectorAll('#chartBox svg path').length
    }));
    console.log(scheme, JSON.stringify(info), 'errors:', errs);
    await browser.close();
  }
})();
