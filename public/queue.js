const notice = document.getElementById('queue-update');
async function checkQueue() {
  if (document.hidden || !notice.hidden) return;
  try {
    const response = await fetch('/queue/revision');
    if (response.ok && (await response.text()) !== notice.dataset.revision) notice.hidden = false;
  } catch {
    // При восстановлении соединения очередь проверится снова.
  }
}
setInterval(checkQueue, 15000);
document.addEventListener('visibilitychange', checkQueue);
