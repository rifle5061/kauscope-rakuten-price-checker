const form = document.getElementById('searchForm');
const keywordInput = document.getElementById('keyword');
const minPriceInput = document.getElementById('minPrice');
const maxPriceInput = document.getElementById('maxPrice');
const excludeInput = document.getElementById('exclude');
const sortInput = document.getElementById('sort');
const results = document.getElementById('results');
const statusEl = document.getElementById('status');
const statsEl = document.getElementById('stats');
const itemsEl = document.getElementById('items');
const resultTitle = document.getElementById('resultTitle');
const resultMeta = document.getElementById('resultMeta');
const relaxButton = document.getElementById('relaxButton');

let lastKeyword = '';

function yen(value) {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function selectedMode() {
  return document.querySelector('input[name="mode"]:checked')?.value || 'name';
}

function modeLabel(mode) {
  if (mode === 'loose') return 'ゆるく探す';
  if (mode === 'exact') return '型番・JANコードで探す';
  return '商品名に含むものだけ';
}

function buildQuery(keyword, modeOverride = null) {
  const params = new URLSearchParams();
  params.set('q', keyword);
  params.set('mode', modeOverride || selectedMode());
  params.set('sort', sortInput.value || 'priceAsc');

  if (minPriceInput.value) params.set('minPrice', minPriceInput.value);
  if (maxPriceInput.value) params.set('maxPrice', maxPriceInput.value);
  if (excludeInput.value.trim()) params.set('exclude', excludeInput.value.trim());

  return params.toString();
}

function renderStats(stats) {
  const cards = [
    ['最安値', yen(stats.min)],
    ['最高値', yen(stats.max)],
    ['平均価格', yen(stats.average)],
    ['表示件数', `${stats.count}件`]
  ];

  statsEl.innerHTML = cards
    .map(([label, value]) => `
      <article class="stat-card">
        <span>${label}</span>
        <strong>${value}</strong>
      </article>
    `)
    .join('');
}

function renderItems(items) {
  itemsEl.innerHTML = items
    .map((item) => `
      <article class="item-card">
        <a href="${item.itemUrl}" target="_blank" rel="nofollow sponsored noopener" class="item-image-wrap">
          <img src="${item.imageUrl || 'https://placehold.co/600x420/f7f0e8/202020?text=KauScope'}" alt="" loading="lazy" />
        </a>
        <div class="item-body">
          <p class="shop">${item.shopName || '楽天市場'}</p>
          <h3>${item.name}</h3>
          <p class="price">${yen(item.price)}</p>
          <div class="item-sub">
            <span>★ ${item.reviewAverage || '-'}</span>
            <span>${item.reviewCount || 0}件</span>
            <span>ポイント${item.pointRate || 0}倍</span>
          </div>
          <p class="shipping">${item.shipping || ''}</p>
          <a href="${item.itemUrl}" target="_blank" rel="nofollow sponsored noopener" class="buy-button">楽天で見る</a>
        </div>
      </article>
    `)
    .join('');
}

function showLoading(keyword) {
  results.classList.remove('hidden');
  relaxButton.classList.add('hidden');
  resultTitle.textContent = `「${keyword}」を検索中`;
  resultMeta.textContent = '';
  statusEl.className = 'status loading';
  statusEl.textContent = '楽天市場の商品情報を取得しています...';
  statsEl.innerHTML = '';
  itemsEl.innerHTML = '';
}

function renderNoResults(data) {
  renderStats(data.stats || { count: 0, min: 0, max: 0, average: 0 });
  itemsEl.innerHTML = '';
  statusEl.className = 'status warn';
  statusEl.innerHTML = `
    条件に合う商品が見つかりませんでした。<br>
    検索モードを「ゆるく探す」にするか、最低価格・除外ワードを調整してください。
  `;
  relaxButton.classList.remove('hidden');
}

async function search(keyword, modeOverride = null) {
  lastKeyword = keyword;
  showLoading(keyword);

  try {
    const response = await fetch(`/api/search?${buildQuery(keyword, modeOverride)}`);
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || '取得に失敗しました。');
    }

    const mode = data.mode || modeOverride || selectedMode();
    resultTitle.textContent = `「${data.keyword}」の価格相場`;
    resultMeta.textContent = `${modeLabel(mode)}｜取得 ${data.filtered?.before ?? 0}件 → 表示 ${data.filtered?.after ?? 0}件${data.demo ? '｜デモ表示' : ''}`;

    if (!data.items || data.items.length === 0) {
      renderNoResults(data);
      return;
    }

    relaxButton.classList.add('hidden');
    statusEl.className = 'status success';
    statusEl.textContent = `楽天市場から${data.items.length}件を表示しています。商品名・価格・送料条件を確認してから購入してください。`;

    renderStats(data.stats);
    renderItems(data.items);
  } catch (error) {
    results.classList.remove('hidden');
    resultTitle.textContent = '取得に失敗しました';
    resultMeta.textContent = '';
    statusEl.className = 'status error';
    statusEl.textContent = error.message || '取得に失敗しました。';
    statsEl.innerHTML = '';
    itemsEl.innerHTML = '';
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const keyword = keywordInput.value.trim();
  if (!keyword) return;
  search(keyword);
});

relaxButton.addEventListener('click', () => {
  if (!lastKeyword) return;
  const loose = document.querySelector('input[name="mode"][value="loose"]');
  if (loose) loose.checked = true;
  search(lastKeyword, 'loose');
});

document.querySelectorAll('.preset').forEach((button) => {
  button.addEventListener('click', () => {
    const preset = button.dataset.preset;
    if (preset === 'mobile') {
      minPriceInput.value = '500';
      maxPriceInput.value = '';
      excludeInput.value = 'ケーブル, コード, ケース, カバー, フィルム, ポーチ, ストラップ, 変換, アダプタ';
      document.querySelector('input[name="mode"][value="name"]').checked = true;
    }
    if (preset === 'power') {
      minPriceInput.value = '10000';
      maxPriceInput.value = '';
      excludeInput.value = 'ケーブル, コード, ケース, カバー, フィルム, ポーチ, ストラップ, 変換, アダプタ';
      document.querySelector('input[name="mode"][value="name"]').checked = true;
    }
    if (preset === 'disaster') {
      minPriceInput.value = '1000';
      maxPriceInput.value = '';
      excludeInput.value = '単品, 交換用, 詰替, ケース, ポーチ, 袋のみ';
      document.querySelector('input[name="mode"][value="name"]').checked = true;
    }
    if (preset === 'clear') {
      minPriceInput.value = '';
      maxPriceInput.value = '';
      excludeInput.value = '';
    }
  });
});
