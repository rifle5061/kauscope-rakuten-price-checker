const form = document.querySelector('#searchForm');
const input = document.querySelector('#keyword');
const statusEl = document.querySelector('#status');
const summaryEl = document.querySelector('#summary');
const insightEl = document.querySelector('#insight');
const itemsEl = document.querySelector('#items');
const template = document.querySelector('#itemTemplate');

const yen = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0
});

function setText(id, value) {
  document.querySelector(id).textContent = value;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function buildInsight(keyword, stats, items) {
  if (!items.length) return '';
  const cheapest = items[0];
  const diff = stats.average > 0 ? Math.max(0, Math.round((1 - cheapest.price / stats.average) * 100)) : 0;

  if (diff >= 10) {
    return `<strong>${escapeHtml(keyword)}</strong> は、平均価格より約${diff}%安い候補があります。まずは最安値の商品から確認するのがおすすめです。`;
  }

  return `<strong>${escapeHtml(keyword)}</strong> は、取得した範囲では大きな価格差が少なめです。レビュー数・送料・ポイント還元も合わせて確認してください。`;
}

function render(data) {
  const { stats, items, keyword, demo } = data;

  summaryEl.hidden = false;
  insightEl.hidden = false;
  itemsEl.innerHTML = '';

  setText('#minPrice', stats.count ? yen.format(stats.min) : '-');
  setText('#maxPrice', stats.count ? yen.format(stats.max) : '-');
  setText('#avgPrice', stats.count ? yen.format(stats.average) : '-');
  setText('#itemCount', `${stats.count}件`);

  insightEl.innerHTML = buildInsight(keyword, stats, items);

  if (!items.length) {
    statusEl.textContent = '該当する商品が見つかりませんでした。検索語を変えて試してください。';
    return;
  }

  statusEl.textContent = demo
    ? 'デモモードで表示中です。楽天APIキーを設定すると実データに切り替わります。'
    : '楽天市場の商品データを取得しました。';

  items.slice(0, 12).forEach((item) => {
    const node = template.content.cloneNode(true);
    const imageLink = node.querySelector('.image-wrap');
    const image = node.querySelector('img');
    const title = node.querySelector('h3');
    const shop = node.querySelector('.shop');
    const price = node.querySelector('.price');
    const review = node.querySelector('.review');
    const point = node.querySelector('.point');
    const shipping = node.querySelector('.shipping');
    const button = node.querySelector('.buy-button');

    imageLink.href = item.itemUrl;
    image.src = item.imageUrl || 'https://placehold.co/600x420/f7f0e8/202020?text=No+Image';
    image.alt = item.name;
    title.textContent = item.name;
    shop.textContent = item.shopName || 'ショップ名未取得';
    price.textContent = yen.format(item.price);
    review.textContent = item.reviewAverage ? `★${item.reviewAverage} / ${item.reviewCount || 0}件` : 'レビュー未取得';
    point.textContent = item.pointRate ? `P${item.pointRate}倍` : 'P確認';
    shipping.textContent = item.shipping || '送料は販売ページで確認';
    button.href = item.itemUrl;

    itemsEl.appendChild(node);
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const keyword = input.value.trim();
  if (keyword.length < 2) {
    statusEl.textContent = '商品名は2文字以上で入力してください。';
    return;
  }

  const button = form.querySelector('button');
  button.disabled = true;
  statusEl.textContent = '価格を取得しています...';

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(keyword)}&hits=30`);
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || '取得に失敗しました。');
    }

    render(data);
  } catch (error) {
    statusEl.textContent = error.message || 'エラーが発生しました。';
  } finally {
    button.disabled = false;
  }
});

// First view demo.
form.dispatchEvent(new Event('submit'));
