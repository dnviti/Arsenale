import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Typography, Alert, Box,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';

interface RecoveryKeyConfirmDialogProps {
  open: boolean;
  recoveryKey: string;
  onConfirmed: () => void;
}

export default function RecoveryKeyConfirmDialog({
  open, recoveryKey, onConfirmed,
}: RecoveryKeyConfirmDialogProps) {
  const [step, setStep] = useState<'display' | 'verify'>('display');
  const [input, setInput] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const { copied, copy } = useCopyToClipboard();

  const handleDownload = () => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const blob = new Blob([recoveryKey], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arsenale-recovery-${ts}.key`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleVerify = () => {
    if (input.trim() === recoveryKey.trim()) {
      setInput('');
      setVerifyError('');
      setStep('display');
      onConfirmed();
    } else {
      setVerifyError('Key does not match');
    }
  };

  return (
    <Dialog
      open={open}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown
      onClose={(_e, reason) => {
        if (reason === 'backdropClick' || reason === 'escapeKeyDown') return;
      }}
    >
      {step === 'display' && (
        <>
          <DialogTitle>Save Your Recovery Key</DialogTitle>
          <DialogContent>
            <Alert severity="warning" sx={{ mb: 2 }}>
              Your vault recovery key has been regenerated. Save it now — you will need it to
              recover your vault if you forget your password. This key is shown only once.
            </Alert>
            <Box
              sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                p: 2,
                mb: 2,
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                  userSelect: 'all',
                }}
              >
                {recoveryKey}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<ContentCopyIcon />}
                onClick={() => copy(recoveryKey)}
              >
                {copied ? 'Copied!' : 'Copy'}
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<DownloadIcon />}
                onClick={handleDownload}
              >
                Download
              </Button>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button variant="contained" onClick={() => { setInput(''); setVerifyError(''); setStep('verify'); }}>
              Next
            </Button>
          </DialogActions>
        </>
      )}

      {step === 'verify' && (
        <>
          <DialogTitle>Confirm Your Recovery Key</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Type or paste your recovery key below to confirm you have saved it.
            </Typography>
            <TextField
              fullWidth
              label="Recovery Key"
              value={input}
              onChange={(e) => { setInput(e.target.value); setVerifyError(''); }}
              error={!!verifyError}
              helperText={verifyError}
              autoFocus
              multiline
              minRows={2}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setStep('display')}>Back</Button>
            <Button variant="contained" onClick={handleVerify} disabled={!input.trim()}>
              Done
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
