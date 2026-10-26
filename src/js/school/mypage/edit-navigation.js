const id = new URLSearchParams(location.search).get('semester_id');
const nav = document.createElement('nav'); nav.className = 'edit-navigation no-print'; nav.setAttribute('aria-label', '大会編集');
for (const [path, label] of [['basic/', '基本設定'], ['', '大会運営・結果'], ['documents/', '大会資料・タイムテーブル']]) {
  const link = document.createElement('a'); link.href = `/mypage/edit/${path}?semester_id=${encodeURIComponent(id ?? '')}`; link.textContent = label;
  if (location.pathname === `/mypage/edit/${path}`) link.setAttribute('aria-current', 'page'); nav.append(link);
}
(document.querySelector('.system-detail-main') ?? document.querySelector('main')).prepend(nav);
