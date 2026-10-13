let audio: AudioContext | null = null;
export async function enableNotificationSound() {
  audio ??= new AudioContext();
  await audio.resume();
}
export function playNotificationSound() {
  if (!audio || audio.state !== "running") return false;
  const oscillator = audio.createOscillator(), gain = audio.createGain();
  oscillator.frequency.value = 740;
  gain.gain.setValueAtTime(0.05, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.18);
  oscillator.connect(gain); gain.connect(audio.destination);
  oscillator.start(); oscillator.stop(audio.currentTime + 0.2);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  return true;
}
export function showMailNotification(title: string, tag: string, onClick?: () => void) {
  if (!("Notification" in window) || Notification.permission !== "granted") return false;
  try {
    const notification = new Notification(title, { tag, silent: true });
    notification.onclick = () => { window.focus(); onClick?.(); notification.close(); };
    window.setTimeout(() => notification.close(), 10_000);
    return true;
  } catch { return false; }
}
