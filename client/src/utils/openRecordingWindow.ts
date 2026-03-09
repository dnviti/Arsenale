export function openRecordingWindow(recordingId: string, width?: number | null, height?: number | null) {
  const w = width || 1024;
  const h = (height || 768) + 60; // extra space for player controls
  const left = Math.round((window.screen.width - w) / 2);
  const top = Math.round((window.screen.height - h) / 2);

  window.open(
    `/recording/${recordingId}`,
    `arsenale-rec-${recordingId}`,
    `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
  );
}
