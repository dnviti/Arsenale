import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Box, IconButton, Slider, Typography, Stack, Select, MenuItem } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import ReplayIcon from '@mui/icons-material/Replay';
import { getRecordingStreamUrl } from '../../api/recordings.api';
import { useAuthStore } from '../../store/authStore';
import '@xterm/xterm/css/xterm.css';

interface AsciicastHeader {
  version: number;
  width: number;
  height: number;
}

type AsciicastEvent = [number, string, string]; // [time, type, data]

interface SshPlayerProps {
  recordingId: string;
  onError?: (message: string) => void;
}

export default function SshPlayer({ recordingId, onError }: SshPlayerProps) {
  const termRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const eventsRef = useRef<AsciicastEvent[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indexRef = useRef(0);
  const startTimeRef = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loaded, setLoaded] = useState(false);

  // Parse asciicast v2 data
  const parseAsciicast = useCallback((text: string): { header: AsciicastHeader; events: AsciicastEvent[] } => {
    const lines = text.trim().split('\n');
    const header = JSON.parse(lines[0]) as AsciicastHeader;
    const events: AsciicastEvent[] = [];
    for (let i = 1; i < lines.length; i++) {
      try {
        const parsed = JSON.parse(lines[i]) as AsciicastEvent;
        if (parsed[1] === 'o') events.push(parsed); // only output events
      } catch { /* skip malformed lines */ }
    }
    return { header, events };
  }, []);

  // Load recording data
  useEffect(() => {
    const url = getRecordingStreamUrl(recordingId);
    const token = useAuthStore.getState().accessToken;
    fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load recording');
        return res.text();
      })
      .then((text) => {
        const { header, events } = parseAsciicast(text);
        eventsRef.current = events;

        const term = new Terminal({
          cols: header.width || 80,
          rows: header.height || 24,
          disableStdin: true,
          cursorBlink: false,
          theme: { background: '#1e1e1e' },
        });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        if (termRef.current) {
          term.open(termRef.current);
          fitAddon.fit();
        }

        terminalRef.current = term;
        fitAddonRef.current = fitAddon;

        if (events.length > 0) {
          setDuration(events[events.length - 1][0]);
        }
        setLoaded(true);
      })
      .catch((err) => {
        onError?.(err.message);
      });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      terminalRef.current?.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingId]);

  // Playback engine
  const scheduleNext = useCallback(() => {
    const events = eventsRef.current;
    const idx = indexRef.current;
    if (idx >= events.length) {
      setPlaying(false);
      return;
    }

    const event = events[idx];
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    const delay = Math.max(0, (event[0] - elapsed) * (1000 / speed));

    timerRef.current = setTimeout(() => {
      terminalRef.current?.write(event[2]);
      setCurrentTime(event[0]);
      indexRef.current = idx + 1;
      scheduleNext();
    }, delay);
  }, [speed]);

  const play = useCallback(() => {
    if (!loaded) return;
    const events = eventsRef.current;
    if (indexRef.current >= events.length) {
      // Restart from beginning
      indexRef.current = 0;
      terminalRef.current?.reset();
    }
    const currentEventTime = indexRef.current > 0 ? events[indexRef.current - 1]?.[0] ?? 0 : 0;
    startTimeRef.current = Date.now() - currentEventTime * 1000;
    setPlaying(true);
    scheduleNext();
  }, [loaded, scheduleNext]);

  const pause = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPlaying(false);
  }, []);

  const seekTo = useCallback((_: Event | React.SyntheticEvent, value: number | number[]) => {
    const targetTime = value as number;
    if (timerRef.current) clearTimeout(timerRef.current);

    terminalRef.current?.reset();
    const events = eventsRef.current;

    // Replay all events up to target time
    let i = 0;
    for (; i < events.length && events[i][0] <= targetTime; i++) {
      terminalRef.current?.write(events[i][2]);
    }
    indexRef.current = i;
    setCurrentTime(targetTime);

    if (playing) {
      startTimeRef.current = Date.now() - targetTime * 1000;
      scheduleNext();
    }
  }, [playing, scheduleNext]);

  const restart = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    terminalRef.current?.reset();
    indexRef.current = 0;
    setCurrentTime(0);
    setPlaying(false);
  }, []);

  // Handle speed changes during playback
  useEffect(() => {
    if (playing) {
      if (timerRef.current) clearTimeout(timerRef.current);
      const currentEventTime = eventsRef.current[indexRef.current - 1]?.[0] ?? 0;
      startTimeRef.current = Date.now() - currentEventTime * 1000;
      scheduleNext();
    }
  }, [speed, playing, scheduleNext]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box ref={termRef} sx={{ flex: 1, bgcolor: '#1e1e1e', borderRadius: 1, overflow: 'hidden' }} />
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1, px: 1 }}>
        {playing ? (
          <IconButton size="small" onClick={pause}><PauseIcon /></IconButton>
        ) : (
          <IconButton size="small" onClick={play} disabled={!loaded}><PlayArrowIcon /></IconButton>
        )}
        <IconButton size="small" onClick={restart} disabled={!loaded}><ReplayIcon /></IconButton>
        <Typography variant="caption" sx={{ minWidth: 40 }}>{formatTime(currentTime)}</Typography>
        <Slider
          size="small"
          value={currentTime}
          max={duration || 1}
          onChange={seekTo}
          sx={{ flex: 1 }}
        />
        <Typography variant="caption" sx={{ minWidth: 40 }}>{formatTime(duration)}</Typography>
        <Select
          size="small"
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          sx={{ minWidth: 70, '& .MuiSelect-select': { py: 0.5, fontSize: '0.75rem' } }}
        >
          <MenuItem value={0.5}>0.5x</MenuItem>
          <MenuItem value={1}>1x</MenuItem>
          <MenuItem value={2}>2x</MenuItem>
          <MenuItem value={4}>4x</MenuItem>
          <MenuItem value={8}>8x</MenuItem>
        </Select>
      </Stack>
    </Box>
  );
}
