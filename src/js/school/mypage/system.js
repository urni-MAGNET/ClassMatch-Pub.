document.addEventListener("click", e => {
  const card = e.target.closest(".existing-system-card");
  if (!card) return;
  window.location.href = `/mypage/edit/?semester_id=${encodeURIComponent(card.id)}`;
});
