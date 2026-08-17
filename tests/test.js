const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FILE = 'file://' + path.resolve('/home/claude/video-buffer-doctor.html');
const WEBM = fs.readFileSync('/home/claude/test.webm');

function randBytes(n){ return Buffer.alloc(n, 7); }

async function runCase(name, {mock, latency=30, mbps=20, blockAll=false}){
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport:{width:390,height:844} });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: '+e.message));
  page.on('console', m => { if(m.type()==='error') errors.push('CONSOLE: '+m.text()); });

  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('file://')) return route.continue();
    if (blockAll) return route.abort('failed');
    if (mock.lossy && (/__down\?bytes=0/.test(url) || /favicon/.test(url))) {
      if (Math.random() < 0.2) return route.abort('failed');
      await new Promise(r=>setTimeout(r, 20 + Math.random()*180));
      return route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:''});
    }

    // video
    if (/\.mp4|\.m3u8|mov_bbb/.test(url)) {
      if (/\.m3u8/.test(url)) return route.abort('failed');       // no native HLS in chromium
      return route.fulfill({ status:200, headers:{'content-type':'video/webm','access-control-allow-origin':'*'}, body: WEBM });
    }
    // download endpoints
    if (/speed\.cloudflare\.com\/__down/.test(url) || /jsdelivr|unpkg/.test(url)) {
      const m = url.match(/bytes=(\d+)/);
      const isPing = m && m[1] === '0';
      if (isPing) { await new Promise(r=>setTimeout(r, latency)); return route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:''}); }
      const size = mbps < 4 ? 400_000 : 3_000_000;
      const ms = size*8/(mbps*1e6)*1000;
      await new Promise(r=>setTimeout(r, ms));
      return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','content-type':'application/octet-stream'},body:randBytes(size)});
    }
    if (/speed\.cloudflare\.com\/__up/.test(url)) {
      await new Promise(r=>setTimeout(r, 400));
      return route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:'ok'});
    }
    // favicon probes (no-cors)
    const isMeta = /cdninstagram|fbcdn|instagram\.com|facebook\.com/.test(url);
    await new Promise(r=>setTimeout(r, isMeta ? latency*(mock.metaSlow?6:1) : latency));
    return route.fulfill({status:200, body:'x'});
  });

  await page.goto(FILE);
  await page.click('#startBtn');
  await page.waitForSelector('#result:not(.hidden)', { timeout: 140000 });

  const out = await page.evaluate(() => {
    const t = [...document.querySelectorAll('.tile')].map(e => e.querySelector('.k').textContent + '=' + e.querySelector('.v').textContent.trim());
    const f = [...document.querySelectorAll('.finding')].map(e => e.className.replace('finding ','') + ' | ' + e.querySelector('h3').textContent);
    return {
      verdict: document.querySelector('.verdict h2').textContent,
      verdictSev: document.querySelector('.verdict').className,
      tiles: t,
      findings: f,
      chartPaths: document.querySelectorAll('#chartBox svg path').length,
      chartSvg: !!document.querySelector('#chartBox svg'),
      meters: document.querySelectorAll('.meter').length,
      checklist: document.querySelectorAll('details').length,
      rawRows: document.querySelectorAll('table tbody tr').length,
      dash: (document.querySelector('#chartBox svg')||{}).innerHTML ? /1080p/.test(document.querySelector('#chartBox svg').innerHTML) : false
    };
  });

  fs.mkdirSync('/home/claude/shots',{recursive:true});
  await page.screenshot({ path:`/home/claude/shots/${name}.png`, fullPage:true });
  await browser.close();
  return { out, errors };
}

(async () => {
  const cases = [
    ['lossy-jittery',  { mock:{lossy:true}, latency:60, mbps:30 }],
    ['fast-network',   { mock:{}, latency:20, mbps:40 }],
  ];
  for (const [name, cfg] of cases) {
    const t0 = Date.now();
    try {
      const { out, errors } = await runCase(name, cfg);
      console.log('\n===== ' + name + ' (' + ((Date.now()-t0)/1000).toFixed(0) + 's) =====');
      console.log('verdict :', out.verdictSev, '|', out.verdict);
      console.log('tiles   :', out.tiles.join('  '));
      console.log('findings:'); out.findings.forEach(x=>console.log('   -', x));
      console.log('chart svg:', out.chartSvg, 'paths:', out.chartPaths, '5Mbps ref:', out.dash,
                  '| meters:', out.meters, '| details:', out.checklist, '| rawRows:', out.rawRows);
      console.log('errors  :', errors.length ? errors : 'none');
    } catch(e) {
      console.log('\n===== ' + name + ' FAILED: ' + e.message);
    }
  }
})();
