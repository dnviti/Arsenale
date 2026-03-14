import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import {
  Dialog, AppBar, Toolbar, Typography, Box, IconButton, Card, CardContent,
  Table, TableHead, TableBody, TableRow, TableCell, TablePagination,
  Select, MenuItem, FormControl, InputLabel, TextField, Stack,
  CircularProgress, Chip, Alert, Collapse, TableSortLabel, InputAdornment,
  Tooltip,
} from '@mui/material';
import {
  Close as CloseIcon,
  Search as SearchIcon,
  KeyboardArrowDown as ExpandIcon,
  KeyboardArrowUp as CollapseIcon,
  Pause as PauseIcon,
  PlayArrow as PlayIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { getAuditLogs, getAuditGateways, getAuditCountries, AuditLogEntry, AuditAction, AuditLogParams, AuditGateway } from '../../api/audit.api';
import { useUiPreferencesStore } from '../../store/uiPreferencesStore';
import { ACTION_LABELS, getActionColor, formatDetails, ALL_ACTIONS, TARGET_TYPES } from '../Audit/auditConstants';
import IpGeoCell from '../Audit/IpGeoCell';
import { SlideUp } from '../common/SlideUp';

interface AuditLogDialogProps {
  open: boolean;
  onClose: () => void;
  onGeoIpClick?: (ip: string) => void;
}

const AUTO_REFRESH_INTERVAL_MS = 10_000;

export default function AuditLogDialog({ open, onClose, onGeoIpClick }: AuditLogDialogProps) {
  const auditLogAction = useUiPreferencesStore((s) => s.auditLogAction);
  const auditLogSearch = useUiPreferencesStore((s) => s.auditLogSearch);
  const auditLogTargetType = useUiPreferencesStore((s) => s.auditLogTargetType);
  const auditLogGatewayId = useUiPreferencesStore((s) => s.auditLogGatewayId);
  const auditLogSortBy = useUiPreferencesStore((s) => s.auditLogSortBy);
  const auditLogSortOrder = useUiPreferencesStore((s) => s.auditLogSortOrder);
  const autoRefreshPaused = useUiPreferencesStore((s) => s.auditLogAutoRefreshPaused);
  const setUiPref = useUiPreferencesStore((s) => s.set);

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(auditLogSearch);
  const [gateways, setGateways] = useState<AuditGateway[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [geoCountry, setGeoCountry] = useState('');
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  // Debounce search input → store
  useEffect(() => {
    const timer = setTimeout(() => {
      setUiPref('auditLogSearch', searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, setUiPref]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: AuditLogParams = {
        page: page + 1,
        limit: rowsPerPage,
        sortBy: auditLogSortBy as 'createdAt' | 'action',
        sortOrder: auditLogSortOrder as 'asc' | 'desc',
      };
      if (auditLogAction) params.action = auditLogAction as AuditAction;
      if (auditLogSearch) params.search = auditLogSearch;
      if (auditLogTargetType) params.targetType = auditLogTargetType;
      if (auditLogGatewayId) params.gatewayId = auditLogGatewayId;
      if (ipAddress) params.ipAddress = ipAddress;
      if (geoCountry) params.geoCountry = geoCountry;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (flaggedOnly) params.flaggedOnly = true;

      const result = await getAuditLogs(params);
      setLogs(result.data);
      setTotal(result.total);
    } catch {
      setError('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, auditLogAction, auditLogSearch, auditLogTargetType, auditLogGatewayId, ipAddress, geoCountry, startDate, endDate, auditLogSortBy, auditLogSortOrder, flaggedOnly]);

  useEffect(() => {
    if (open) {
      fetchLogs();
      getAuditGateways().then(setGateways).catch(() => {});
      getAuditCountries().then(setCountries).catch(() => {});
    }
  }, [open, fetchLogs]);

  // Auto-refresh: poll every 10s when on page 0, not paused, and dialog is open
  const fetchLogsRef = useRef(fetchLogs);
  fetchLogsRef.current = fetchLogs;

  useEffect(() => {
    if (!open || autoRefreshPaused || page !== 0) return;
    const id = setInterval(() => {
      fetchLogsRef.current();
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [open, autoRefreshPaused, page]);

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(e.target.value, 10));
    setPage(0);
  };

  const handleSort = (field: 'createdAt' | 'action') => {
    if (auditLogSortBy === field) {
      setUiPref('auditLogSortOrder', auditLogSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setUiPref('auditLogSortBy', field);
      setUiPref('auditLogSortOrder', field === 'createdAt' ? 'desc' : 'asc');
    }
    setPage(0);
  };

  const hasActiveFilters = auditLogAction || auditLogSearch || auditLogTargetType || auditLogGatewayId || ipAddress || geoCountry || startDate || endDate || flaggedOnly;

  return (
    <Dialog
      fullScreen
      open={open}
      onClose={onClose}
      TransitionComponent={SlideUp}
    >
      <AppBar position="static" sx={{ position: 'relative' }}>
        <Toolbar variant="dense">
          <IconButton edge="start" color="inherit" onClick={onClose} sx={{ mr: 1 }}>
            <CloseIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flex: 1 }}>Activity Log</Typography>
          <Tooltip title={autoRefreshPaused ? 'Resume live updates' : 'Pause live updates'}>
            <IconButton
              color="inherit"
              onClick={() => setUiPref('auditLogAutoRefreshPaused', !autoRefreshPaused)}
              sx={{ mr: 0.5 }}
            >
              {autoRefreshPaused ? <PlayIcon /> : <PauseIcon />}
            </IconButton>
          </Tooltip>
          <Chip
            label={autoRefreshPaused ? 'Paused' : 'Live'}
            size="small"
            color={autoRefreshPaused ? 'default' : 'success'}
            variant={autoRefreshPaused ? 'outlined' : 'filled'}
            sx={{
              color: autoRefreshPaused ? 'inherit' : undefined,
              fontWeight: 600,
              ...(!autoRefreshPaused && {
                '& .MuiChip-label::before': {
                  content: '""',
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: 'currentColor',
                  mr: 0.75,
                  animation: 'auditLivePulse 1.5s ease-in-out infinite',
                },
                '@keyframes auditLivePulse': {
                  '0%, 100%': { opacity: 1 },
                  '50%': { opacity: 0.3 },
                },
              }),
            }}
          />
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        <Card sx={{ mb: 2 }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Search across target, IP address, and details..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
                  ),
                },
              }}
              sx={{ mb: 1.5 }}
            />
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>Action</InputLabel>
                <Select
                  value={auditLogAction}
                  label="Action"
                  onChange={(e) => {
                    setUiPref('auditLogAction', e.target.value);
                    setPage(0);
                  }}
                >
                  <MenuItem value="">All Actions</MenuItem>
                  {ALL_ACTIONS.map((action) => (
                    <MenuItem key={action} value={action}>
                      {ACTION_LABELS[action]}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>Target Type</InputLabel>
                <Select
                  value={auditLogTargetType}
                  label="Target Type"
                  onChange={(e) => {
                    setUiPref('auditLogTargetType', e.target.value);
                    setPage(0);
                  }}
                >
                  <MenuItem value="">All Types</MenuItem>
                  {TARGET_TYPES.map((type) => (
                    <MenuItem key={type} value={type}>{type}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              {gateways.length > 0 && (
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel>Gateway</InputLabel>
                  <Select
                    value={auditLogGatewayId}
                    label="Gateway"
                    onChange={(e) => {
                      setUiPref('auditLogGatewayId', e.target.value);
                      setPage(0);
                    }}
                  >
                    <MenuItem value="">All Gateways</MenuItem>
                    {gateways.map((gw) => (
                      <MenuItem key={gw.id} value={gw.id}>{gw.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              {countries.length > 0 && (
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel>Country</InputLabel>
                  <Select
                    value={geoCountry}
                    label="Country"
                    onChange={(e) => {
                      setGeoCountry(e.target.value);
                      setPage(0);
                    }}
                  >
                    <MenuItem value="">All Countries</MenuItem>
                    {countries.map((c) => (
                      <MenuItem key={c} value={c}>{c}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <TextField
                size="small"
                label="IP Address"
                value={ipAddress}
                onChange={(e) => { setIpAddress(e.target.value); setPage(0); }}
                sx={{ width: 160 }}
              />
              <TextField
                size="small"
                type="date"
                label="From"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPage(0); }}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                size="small"
                type="date"
                label="To"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPage(0); }}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <Tooltip title="Show only flagged entries (e.g. impossible travel)">
                <Chip
                  icon={<WarningIcon fontSize="small" />}
                  label="Flagged"
                  size="small"
                  color={flaggedOnly ? 'warning' : 'default'}
                  variant={flaggedOnly ? 'filled' : 'outlined'}
                  onClick={() => { setFlaggedOnly(!flaggedOnly); setPage(0); }}
                  sx={{ cursor: 'pointer' }}
                />
              </Tooltip>
            </Stack>
          </CardContent>
        </Card>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Card>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : logs.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Typography color="text.secondary">
                {hasActiveFilters
                  ? 'No logs match your filters'
                  : 'No activity recorded yet'}
              </Typography>
            </Box>
          ) : (
            <>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" />
                    <TableCell>
                      <TableSortLabel
                        active={auditLogSortBy === 'createdAt'}
                        direction={auditLogSortBy === 'createdAt' ? (auditLogSortOrder as 'asc' | 'desc') : 'asc'}
                        onClick={() => handleSort('createdAt')}
                      >
                        Date/Time
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={auditLogSortBy === 'action'}
                        direction={auditLogSortBy === 'action' ? (auditLogSortOrder as 'asc' | 'desc') : 'asc'}
                        onClick={() => handleSort('action')}
                      >
                        Action
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>Target</TableCell>
                    <TableCell>IP Address</TableCell>
                    <TableCell>Details</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {logs.map((log) => {
                    const isExpanded = expandedRowId === log.id;
                    return (
                      <Fragment key={log.id}>
                        <TableRow
                          hover
                          onClick={() => setExpandedRowId(isExpanded ? null : log.id)}
                          sx={{ cursor: 'pointer', '& > *': { borderBottom: isExpanded ? 'unset' : undefined } }}
                        >
                          <TableCell padding="checkbox">
                            <IconButton size="small">
                              {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
                            </IconButton>
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            {new Date(log.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                              <Chip
                                label={ACTION_LABELS[log.action] || log.action}
                                color={getActionColor(log.action)}
                                size="small"
                              />
                              {log.flags?.includes('IMPOSSIBLE_TRAVEL') && (
                                <Tooltip title="Impossible travel detected">
                                  <WarningIcon color="warning" fontSize="small" />
                                </Tooltip>
                              )}
                            </Box>
                          </TableCell>
                          <TableCell>
                            {log.targetType
                              ? `${log.targetType}${log.targetId ? ` ${log.targetId.slice(0, 8)}...` : ''}`
                              : '\u2014'}
                          </TableCell>
                          <TableCell>
                            <IpGeoCell ipAddress={log.ipAddress} geoCountry={log.geoCountry} geoCity={log.geoCity} onGeoIpClick={onGeoIpClick} />
                          </TableCell>
                          <TableCell sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {formatDetails(log.details)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell colSpan={6} sx={{ py: 0, borderBottom: isExpanded ? undefined : 'none' }}>
                            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                              <Box sx={{ py: 2, px: 3 }}>
                                {log.details && typeof log.details === 'object' && Object.keys(log.details).length > 0 ? (
                                  <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 1, maxWidth: 600 }}>
                                    {Object.entries(log.details).map(([key, value]) => (
                                      <Fragment key={key}>
                                        <Typography variant="body2" fontWeight={600} color="text.secondary">
                                          {key}
                                        </Typography>
                                        <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                                          {Array.isArray(value) ? value.join(', ') : String(value)}
                                        </Typography>
                                      </Fragment>
                                    ))}
                                  </Box>
                                ) : (
                                  <Typography variant="body2" color="text.secondary">No additional details</Typography>
                                )}
                                {log.targetId && (
                                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                    Full Target ID: {log.targetId}
                                  </Typography>
                                )}
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              <TablePagination
                component="div"
                count={total}
                page={page}
                onPageChange={handleChangePage}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                rowsPerPageOptions={[25, 50, 100]}
              />
            </>
          )}
        </Card>
      </Box>
    </Dialog>
  );
}
