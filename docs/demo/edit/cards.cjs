const { chromium } = require('playwright'); const path = require('path')
;(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } })
  const go = async (o, h, pp, u) => { await p.goto('file://' + path.join(__dirname, 'card.html') + '?' + new URLSearchParams({ h, p: pp, u })); await p.waitForTimeout(600); await p.screenshot({ path: path.join(__dirname, o) }) }
  await go('title.png', 'From harvest to buyer.', 'A live walkthrough of the deployed SEED X application', 'Real website · demo accounts · demo data')
  await go('end.png', 'Better Farming Starts with Better Connections.', 'From Farm to Future.', 'seedxsss.tejash-shastri-rx.workers.dev')
  await b.close() })()
