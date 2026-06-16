const form = document.querySelector('#searchForm');
const keywordInput = document.querySelector('#keyword');
const minPriceInput = document.querySelector('#minPrice');
const maxPriceInput = document.querySelector('#maxPrice');
const excludeInput = document.querySelector('#exclude');
const sortSelect = document.querySelector('#sort');
const limitSelect = document.querySelector('#limit');
const statusEl = document.querySelector('#status');
const summaryEl = document.querySelector('#summary');
const resultsEl = document.querySelector('#results');

function yen(value) {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0
  }).format(value || 0);
}

function getMode() {
  return document.querySelector('input[name="mode"]:checked')?.value || 'loose';
}

function modeLabel(mode) {
  if (mode === 'title') return '商品名に含むものだけ';
  if (mode === 'code') return '型番・JANコードで探す';
  return 'ゆるく探す';
}

function setStatus(message, type = '') {
  statusEl.className = `status ${type}`;
  statusEl.textContent = message || '';
}

function renderSummary(data) {
  const stats = data.stats || {};
  summaryEl.classList.remove('hidden');
  summaryEl.innerHTML = `
    <div class="summary-card">
      <span>検索モード</span>
      <strong>${modeLabel(data.mode)}</strong>
    </div>
    <div class="summary-card">
      <span>件数</span>
      <strong>${stats.count || 0}件</strong>
    </div>
    <div class="summary-card">
      <span>最安値</span>
      <strong>${yen(stats.min)}</strong>
    </div>
    <div class="summary-card accent">
      <span>平均価格</span>
      <strong>${yen(stats.average)}</strong>
    </div>
    <div class="summary-card">
      <span>最高値</span>
      <strong>${yen(stats.max)}</strong>
    </div>
  `;
}

function renderItems(items) {
  if (!items.length) {
    resultsEl.innerHTML = `
      <div class="empty">
        <h2>条件に合う商品が見つかりませんでした</h2>
        <p>検索モードを「ゆるく探す」に変えるか、最低価格・除外ワードをゆるめて再検索してください。</p>
      </div>
    `;
    return;
  }

  resultsEl.innerHTML = items.map((item) => `
    <article class="product-card">
      <a class="product-image" href="${item.itemUrl}" target="_blank" rel="nofollow sponsored noopener">
        <img src="${item.imageUrl || 'https://placehold.co/600x420/f7f0e8/202020?text=KauScope'}" alt="">
      </a>
      <div class="product-body">
        <div class="card-topline">
          <p class="source">${item.source || '楽天市場'}</p>
          <span class="point">P${item.pointRate || 0}倍</span>
        </div>
        <h2>${item.name}</h2>
        <p class="shop">${item.shopName || ''}</p>
        <div class="meta">
          <strong>${yen(item.price)}</strong>
          <span>★ ${item.reviewAverage || '-'} / ${item.reviewCount || 0}件</span>
        </div>
        <p class="shipping">${item.shipping || ''}</p>
        <a class="buy-button" href="${item.itemUrl}" target="_blank" rel="nofollow sponsored noopener">楽天で見る</a>
      </div>
    </article>
  `).join('');
}

async function search() {
  const keyword = keywordInput.value.trim();

  if (keyword.length < 2) {
    setStatus('商品名・型番・JANコードは2文字以上で入力してください。', 'error');
    return;
  }

  const params = new URLSearchParams({
    q: keyword,
    mode: getMode(),
    sort: sortSelect.value,
    limit: limitSelect ? limitSelect.value : '60'
  });

  if (minPriceInput.value) params.set('minPrice', minPriceInput.value);
  if (maxPriceInput.value) params.set('maxPrice', maxPriceInput.value);
  if (excludeInput.value.trim()) params.set('exclude', excludeInput.value.trim());

  setStatus('価格を取得中...', 'loading');
  summaryEl.classList.add('hidden');
  resultsEl.innerHTML = '';

  try {
    const response = await fetch(`/api/search?${params.toString()}`);
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || '取得に失敗しました');
    }

    const before = data.filtered?.before ?? data.items.length;
    const after = data.filtered?.after ?? data.items.length;

    renderSummary(data);
    renderItems(data.items || []);
    document.querySelector('.result-area')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (data.demo) {
      setStatus(`デモ表示です。楽天APIキーが設定されると実データに切り替わります。`, 'warning');
    } else if (after === 0) {
      setStatus(`楽天から${before}件取得しましたが、現在の条件では0件です。条件をゆるめてください。`, 'warning');
    } else {
      setStatus(`楽天から${before}件取得し、条件に合う${after}件を表示しています。`, 'success');
    }
  } catch (error) {
    setStatus(error.message || '取得に失敗しました。', 'error');
  }
}

document.querySelectorAll('[data-preset]').forEach((button) => {
  button.addEventListener('click', () => {
    const preset = button.dataset.preset;

    if (preset === 'mobile') {
      minPriceInput.value = '800';
      maxPriceInput.value = '';
      excludeInput.value = 'ケーブル,コード,延長,変換,アダプタ,アダプター,ケース,カバー,フィルム,ストラップ,ホルダー,スタンド,収納袋,ポーチ';
      document.querySelector('input[name="mode"][value="title"]').checked = true;
      sortSelect.value = 'price-asc';
    }

    if (preset === 'power') {
      minPriceInput.value = '10000';
      maxPriceInput.value = '';
      excludeInput.value = 'ケーブル,コード,延長,変換,アダプタ,ケース,カバー,フィルム,収納袋,ポーチ';
      document.querySelector('input[name="mode"][value="title"]').checked = true;
      sortSelect.value = 'price-asc';
    }

    if (preset === 'disaster') {
      minPriceInput.value = '1500';
      maxPriceInput.value = '';
      excludeInput.value = '単品,詰替,交換用,ケース,カバー,ポーチ';
      document.querySelector('input[name="mode"][value="title"]').checked = true;
      sortSelect.value = 'price-asc';
    }

    if (preset === 'clear') {
      minPriceInput.value = '';
      maxPriceInput.value = '';
      excludeInput.value = '';
      document.querySelector('input[name="mode"][value="loose"]').checked = true;
      sortSelect.value = 'standard';
    }
  });
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  search();
});
