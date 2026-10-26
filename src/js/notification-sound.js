// Native media playback follows the browser/tab and device volume settings.
// A page cannot reliably read the operating system's silent-mode setting.
const urls = {
  info: new URL('../audio/notification-info.mp3', import.meta.url).href,
  success: new URL('../audio/notification-success.mp3', import.meta.url).href,
  warning: new URL('../audio/notification-warning.mp3', import.meta.url).href,
  error: new URL('../audio/notification-error.mp3', import.meta.url).href,
  result: new URL('../audio/match-result.mp3', import.meta.url).href,
  message: new URL('../audio/announcement.mp3', import.meta.url).href,
  mention: new URL('../audio/mention.mp3', import.meta.url).href
};
let active;
export async function playNotificationSound(kind = 'info') {
  if (typeof Audio === 'undefined') return false;
  try {
    active?.pause();
    active = new Audio(urls[kind === 'error' ? 'warning' : kind] ?? urls.info);
    await active.play();
    return true;
  } catch {
    // Autoplay denial never blocks the notification or replays old alerts later.
    return false;
  }
}
