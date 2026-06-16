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

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, ' ')
    .trim();
}

function splitKeyword(keyword) {
  return normalizeText(keyword)
    .split(/[ 　,、]+/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function getFirstImageUrl(images) {
  if (!Array.isArray(images) || images.length === 0) return '';
  const first = images[0];
  if (typeof first === 'string') return first;
  return first && (first.imageUrl || first.url) ? first.imageUrl || first.url : '';
}

function improveRakutenImageUrl(url) {
  if (!url) return '';

  let improved = String(url);

  // 楽天のサムネイルURLに付く _ex=128x128 / ex=128x128 を大きめに変更。
  // 元画像が小さい場合は限界がありますが、API既定の荒いサムネ拡大よりは改善します。
  improved = improved.replace(/([?&])_?ex=\d+x\d+/i, '$1_ex=600x600');

  if (!/[?&]_?ex=\d+x\d+/i.test(improved)) {
    improved += (improved.includes('?') ? '&' : '?') + '_ex=600x600';
  }

  return improved;
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
      imageUrl: improveRakutenImageUrl(
        getFirstImageUrl(item.mediumImageUrls) ||
        getFirstImageUrl(item.smallImageUrls) ||
        item.imageUrl ||
        ''
      ),
      itemUrl: item.affiliateUrl || item.itemUrl || item.url || '',
      reviewAverage: item.reviewAverage || '',
      reviewCount: Number(item.reviewCount || 0),
      pointRate: Number(item.pointRate || 0),
      shipping: item.postageFlag === 0 ? '送料無料の可能性' : '送料別の可能性'
    }))
    .filter((item) => item.name && Number.isFinite(item.price) && item.price > 0);
}

function buildStats(items) {
  if (!items.length) return { count: 0, min: 0, max: 0, average: 0 };

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
    : keyword.includes('モバイル')
      ? 1980
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
    `USBケーブル ${keyword} 対応`,
    `${keyword} 収納ケース`
  ];

  return names.map((name, index) => {
    const price = index >= 6 ? 298 + index * 80 : base + ((seed + index * 921) % 7200);

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

async function fetchRakutenPage({ applicationId, accessKey, affiliateId, keyword, page }) {
  const params = new URLSearchParams({
    applicationId,
    accessKey,
    keyword,
    hits: '30',
    page: String(page),
    format: 'json',
    formatVersion: '2',
    elements:
      'itemName,itemPrice,itemUrl,affiliateUrl,mediumImageUrls,smallImageUrls,shopName,reviewAverage,reviewCount,pointRate,postageFlag'
  });

  if (affiliateId) params.set('affiliateId', affiliateId);

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
    const error = new Error(
      payload.error_description ||
      payload.message ||
      '楽天APIの取得に失敗しました。'
    );
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function parseExcludeWords(value) {
  return String(value || '')
    .split(/[,\n、]+/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function filterItems(items, options) {
  const keyword = options.keyword || '';
  const mode = options.mode || 'loose';
  const minPrice = Number(options.minPrice || 0);
  const maxPrice = Number(options.maxPrice || 0);
  const excludeWords = parseExcludeWords(options.exclude);

  const tokens = splitKeyword(keyword);
  const normalizedKeyword = normalizeText(keyword);

  return items.filter((item) => {
    const name = item.name || '';
    const normalizedName = normalizeText(name);
    const price = Number(item.price || 0);

    if (minPrice > 0 && price < minPrice) return false;
    if (maxPrice > 0 && price > maxPrice) return false;

    if (excludeWords.some((word) => normalizedName.includes(normalizeText(word)))) return false;

    if (mode === 'title') {
      if (!tokens.length) return true;
      return tokens.every((token) => normalizedName.includes(token));
    }

    if (mode === 'code') {
      if (!normalizedKeyword) return true;

      const keywordNoSpace = normalizedKeyword.replace(/\s+/g, '');
      const nameNoSpace = normalizedName.replace(/\s+/g, '');

      if (/^\d{8,14}$/.test(keywordNoSpace)) {
        return nameNoSpace.includes(keywordNoSpace);
      }

      return tokens.every((token) => normalizedName.includes(token));
    }

    return true;
  });
}

function sortItems(items, sort) {
  const copy = [...items];

  if (sort === 'price-asc') return copy.sort((a, b) => a.price - b.price);
  if (sort === 'price-desc') return copy.sort((a, b) => b.price - a.price);
  if (sort === 'review-desc') return copy.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));

  return copy;
}

app.get('/api/search', async (req, res) => {
  const keyword = String(req.query.q || '').trim();
  const limit = Math.min(Math.max(Number(req.query.limit || req.query.hits || 60), 1), 120);
  const mode = String(req.query.mode || 'loose');
  const minPrice = String(req.query.minPrice || '').trim();
  const maxPrice = String(req.query.maxPrice || '').trim();
  const exclude = String(req.query.exclude || '').trim();
  const sort = String(req.query.sort || 'standard');

  if (keyword.length < 2) {
    return res.status(400).json({
      ok: false,
      message: '商品名・型番・JANコードは2文字以上で入力してください。'
    });
  }

  const applicationId = process.env.RAKUTEN_APPLICATION_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  const affiliateId = process.env.RAKUTEN_AFFILIATE_ID;

  if (!applicationId || !accessKey) {
    const rawItems = Array.from({ length: Math.ceil(limit / 8) }, () => demoItems(keyword)).flat().slice(0, limit);
    const filtered = filterItems(rawItems, { keyword, mode, minPrice, maxPrice, exclude });
    const finalItems = sortItems(filtered, sort);

    return res.json({
      ok: true,
      demo: true,
      keyword,
      source: 'demo',
      mode,
      requestedLimit: limit,
      stats: buildStats(finalItems),
      filtered: {
        before: rawItems.length,
        after: finalItems.length,
        minPrice: Number(minPrice || 0),
        maxPrice: Number(maxPrice || 0),
        excludeWords: parseExcludeWords(exclude)
      },
      items: finalItems
    });
  }

  try {
    const pagesToFetch = Math.ceil(limit / 30);
    const payloads = [];

    for (let page = 1; page <= pagesToFetch; page += 1) {
      const payload = await fetchRakutenPage({
        applicationId,
        accessKey,
        affiliateId,
        keyword,
        page
      });

      payloads.push(payload);

      const currentItems = normalizeRakutenItems(payload);
      if (currentItems.length < 30) break;
    }

    const rawItems = payloads.flatMap((payload) => normalizeRakutenItems(payload)).slice(0, limit);
    const filtered = filterItems(rawItems, { keyword, mode, minPrice, maxPrice, exclude });
    const finalItems = sortItems(filtered, sort);

    return res.json({
      ok: true,
      demo: false,
      keyword,
      source: 'rakuten',
      mode,
      requestedLimit: limit,
      stats: buildStats(finalItems),
      filtered: {
        before: rawItems.length,
        after: finalItems.length,
        minPrice: Number(minPrice || 0),
        maxPrice: Number(maxPrice || 0),
        excludeWords: parseExcludeWords(exclude)
      },
      items: finalItems
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      ok: false,
      message: error.message || 'サーバー側で取得エラーが発生しました。',
      details: error.payload || String(error),
      refererSent: REFERER_URL,
      originSent: ORIGIN_URL
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`KauScope is running on port ${PORT}`);
  console.log(`Rakuten API Referer: ${REFERER_URL}`);
});
