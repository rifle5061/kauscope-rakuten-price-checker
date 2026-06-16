const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

const RAKUTEN_ENDPOINT =
  'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401';

const SITE_URL = (
  process.env.RAKUTEN_REFERER_URL ||
  process.env.SITE_URL ||
  'https://kauscope.onrender.com'
).replace(/\/+$/, '');

const ORIGIN_URL = (() => {
  try {
    return new URL(SITE_URL).origin;
  } catch {
    return 'https://kauscope.onrender.com';
  }
})();

const REFERER_URL = `${ORIGIN_URL}/`;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.static('public'));

function getFirstImageUrl(images) {
  if (!Array.isArray(images) || images.length === 0) return '';
  const first = images[0];
  if (typeof first === 'string') return first;
  return first && (first.imageUrl || first.url) ? first.imageUrl || first.url : '';
}

function normalizeRakutenItems(payload) {
  const rawItems = payload.Items || payload.items || [];

  return rawItems
    .map((row) => row.Item || row.item || row)
    .map((item) => ({
      source: '楽天市場',
      name: item.itemName || item.name || '',
      price: Number(item.itemPrice || item.price || 0),
      shopName: item.shopName || '',
      imageUrl:
        getFirstImageUrl(item.mediumImageUrls) ||
        getFirstImageUrl(item.smallImageUrls) ||
        item.imageUrl ||
        '',
      itemUrl: item.affiliateUrl || item.itemUrl || item.url || '',
      reviewAverage: item.reviewAverage || '',
      reviewCount: Number(item.reviewCount || 0),
      pointRate: Number(item.pointRate || 0),
      shipping: item.postageFlag === 0 ? '送料無料の可能性' : '送料別の可能性'
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
  const base = keyword.includes('ポータブル')
    ? 29800
    : keyword.includes('米')
      ? 3980
      : 2480;

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
      shipping: index % 2 === 0 ? '送料無料の可能性' : '送料別の可能性'
    };
  });
}

app.get('/api/search', async (req, res) => {
  const keyword = String(req.query.q || '').trim();
  const hits = Math.min(Math.max(Number(req.query.hits || 30), 1), 30);

  if (keyword.length < 2) {
    return res.status(400).json({
      ok: false,
      message: '商品名は2文字以上で入力してください。'
    });
  }

  const applicationId = process.env.RAKUTEN_APPLICATION_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  const affiliateId = process.env.RAKUTEN_AFFILIATE_ID;

  if (!applicationId || !accessKey) {
    const items = demoItems(keyword);
    return res.json({
      ok: true,
      demo: true,
      keyword,
      source: 'demo',
      stats: buildStats(items),
      items: items.sort((a, b) => a.price - b.price)
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
    elements:
      'itemName,itemPrice,itemUrl,affiliateUrl,mediumImageUrls,smallImageUrls,shopName,reviewAverage,reviewCount,pointRate,postageFlag'
  });

  if (affiliateId) {
    params.set('affiliateId', affiliateId);
  }

  try {
    const response = await fetch(`${RAKUTEN_ENDPOINT}?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        accessKey,
        Referer: REFERER_URL,
        Origin: ORIGIN_URL,
        'User-Agent': `KauScope/1.0 (${ORIGIN_URL})`
      }
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        message:
          payload.error_description ||
          payload.message ||
          '楽天APIの取得に失敗しました。',
        details: payload,
        refererSent: REFERER_URL,
        originSent: ORIGIN_URL
      });
    }

    const items = normalizeRakutenItems(payload).sort((a, b) => a.price - b.price);

    return res.json({
      ok: true,
      demo: false,
      keyword,
      source: 'rakuten',
      stats: buildStats(items),
      items
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'サーバー側で取得エラーが発生しました。',
      details: error.message || String(error)
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`KauScope is running on port ${PORT}`);
  console.log(`Rakuten API Referer: ${REFERER_URL}`);
});
