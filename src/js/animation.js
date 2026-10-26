
document.addEventListener('DOMContentLoaded', () => {
const magnets = document.querySelectorAll('.filterhover');

  magnets.forEach((el) => {
    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();

      const x = e.clientX - (rect.left + rect.width / 2);
      const y = e.clientY - (rect.top + rect.height / 2);

      const moveX = x * 0.08;
      const moveY = y * 0.3;
      el.style.transition = "transform 0.3s ease-in";
      el.style.transform = `
        translate(${moveX}px, ${moveY - 3}px)
        scale(1.015)
      `;
    });
el.addEventListener('mouseleave', () => {
  el.style.transition = 'transform 0.28s cubic-bezier(0.1, 1.4, 0.3, 1)';
  el.style.transform = 'translate(0px, 0px)';
});
  });
  // MAGNETフロートイン対象を取得
  const targets = document.querySelectorAll(
    '.magnet-float-target'
  );

  // 対象がなければ終了
  if (!targets.length) return;

  // Intersection Observer
  const observer = new IntersectionObserver(
    (entries) => {

      entries.forEach((entry) => {

        // 画面内に入ったか
        if (entry.isIntersecting) {

          // アニメーション開始
          entry.target.classList.add(
            'magnet-float-in'
          );

          // 一度発動したら監視を終了
          observer.unobserve(entry.target);
        }

      });

    },
    {
      // 少し画面に入ったところで発動
      threshold: 0.35
    }
  );

  // すべての対象を監視
  targets.forEach((target) => {
    observer.observe(target);
  });
 
});