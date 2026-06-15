import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// No dependency server. Node 18+ required for global fetch.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || readEnvFile().PORT || 3000);
const RAKUTEN_ENDPOINT = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401';

const env = { ...readEnvFile(), ...process.env };

function readEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return {};

  return fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .reduce((acc, line) => {
      const index = line.indexOf('=');
      if (index === -1) return acc;
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
      acc[key] = value;
      return acc;
    }, {});
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(payload));
}

function normalizeRakutenItems(payload) {
  const rawItems = payload?.Items || payload?.items || [];

  return rawItems
    .map((row) => row?.Item || row?.item || row)
    .map((item) => ({
      source: '楽天市場',
      name: item.itemName || item.name || '',
      price: Number(item.itemPrice || item.price || 0),
      shopName: item.shopName || '',
      imageUrl: item.mediumImageUrls?.[0]?.imageUrl || item.smallImageUrls?.[0]?.imageUrl || item.imageUrl || '',
      itemUrl: item.affiliateUrl || item.itemUrl || item.url || '',
      reviewAverage: item.reviewAverage || '',
      reviewCount: Number(item.reviewCount || 0),
      pointRate: Number(item.pointRate || 0),
      shipping: item.postageFlag === 0 ? '送料無料の可能性' : '送料は販売ページで確認'
    }))
    .filter((item) => item.name && Number.isFinite(item.price) && item.price > 0);
}

function buildStats(items) {
  if (!items.length) {
    return { count: 0, min: 0, max: 0, average: 0 };
  }

  const prices = items.map((item) => item.price);
  const total = prices.reduce((sum, price) => sum + price, 0);

  return {
    count: items.length,
    min: Math.min(...prices),
    max: Math.max(...prices),
    average: Math.round(total / items.length)
  };
}

function demoItems(keyword = '防災セット') {
  const seed = keyword.length * 137;
  const base = keyword.includes('ポータブル') ? 29800 : keyword.includes('米') ? 3980 : 2480;
  const names = [
    `${keyword} スタンダードモデル`,
    `${keyword} コスパ重視セット`,
    `${keyword} プレミアム仕様`,
    `${keyword} 家族向けパック`,
    `${keyword} コンパクトタイプ`,
    `${keyword} 人気ショップ限定`,
    `${keyword} 長期保存タイプ`,
    `${keyword} まとめ買いセット`
  ];

  return names.map((name, index) => {
    const price = base + ((seed + index * 921) % 7200);
    return {
      source: '楽天市場',
      name,
      price,
      shopName: ['KauScope Demo Store', '楽天デモショップ', '暮らしの備え市場', 'ガジェット倉庫'][index % 4],
      imageUrl: `https://placehold.co/600x420/f7f0e8/202020?text=${encodeURIComponent('KauScope')}`,
      itemUrl: 'https://www.rakuten.co.jp/',
      reviewAverage: (3.8 + (index % 12) / 10).toFixed(1),
      reviewCount: 12 + index * 47,
      pointRate: 1 + (index % 5),
      shipping: index % 2 === 0 ? '送料無料の可能性' : '送料は販売ページで確認'
    };
  });
}

async function handleSearch(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const keyword = String(requestUrl.searchParams.get('q') || '').trim();
  const hits = Math.min(Number(requestUrl.searchParams.get('hits') || 30), 30);

  if (keyword.length < 2) {
    return sendJson(res, 400, {
      ok: false,
      message: '商品名は2文字以上で入力してください。'
    });
  }

  const applicationId = env.RAKUTEN_APPLICATION_ID;
  const accessKey = env.RAKUTEN_ACCESS_KEY;
  const affiliateId = env.RAKUTEN_AFFILIATE_ID;

  if (!applicationId || !accessKey) {
    const items = demoItems(keyword).sort((a, b) => a.price - b.price);
    return sendJson(res, 200, {
      ok: true,
      demo: true,
      keyword,
      source: 'demo',
      stats: buildStats(items),
      items
    });
  }

  const params = new URLSearchParams({
    applicationId,
    accessKey,
    keyword,
    hits: String(hits),
    sort: '+itemPrice',
    format: 'json',
    formatVersion: '2',
    elements: 'itemName,itemPrice,itemUrl,affiliateUrl,mediumImageUrls,smallImageUrls,shopName,reviewAverage,reviewCount,pointRate,postageFlag'
  });

  if (affiliateId) params.set('affiliateId', affiliateId);

  try {
    const response = await fetch(`${RAKUTEN_ENDPOINT}?${params.toString()}`, {
      headers: { 'Accept': 'application/json' }
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return sendJson(res, response.status, {
        ok: false,
        message: payload?.error_description || payload?.message || '楽天APIの取得に失敗しました。',
        details: payload
      });
    }

    const items = normalizeRakutenItems(payload).sort((a, b) => a.price - b.price);
    return sendJson(res, 200, {
      ok: true,
      demo: false,
      keyword,
      source: 'rakuten',
      stats: buildStats(items),
      items
    });
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      message: 'サーバー側で取得エラーが発生しました。',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  let filePath = path.normalize(decodeURIComponent(requestUrl.pathname));

  if (filePath === '/' || filePath === '') filePath = '/index.html';
  const absolutePath = path.join(publicDir, filePath);

  if (!absolutePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(absolutePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(absolutePath).toLowerCase();
    const contentType = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    }[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/search')) {
    handleSearch(req, res);
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`KauScope is running: http://localhost:${PORT}`);
});
