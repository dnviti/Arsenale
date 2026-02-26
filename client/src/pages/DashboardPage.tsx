import { useEffect } from 'react';
import { Box } from '@mui/material';
import MainLayout from '../components/Layout/MainLayout';
import { useConnectionsStore } from '../store/connectionsStore';
import { useVaultStore } from '../store/vaultStore';

export default function DashboardPage() {
  const fetchConnections = useConnectionsStore((s) => s.fetchConnections);
  const checkVaultStatus = useVaultStore((s) => s.checkStatus);

  useEffect(() => {
    checkVaultStatus();
    fetchConnections();
  }, []);

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <MainLayout />
    </Box>
  );
}
