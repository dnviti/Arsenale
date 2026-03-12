import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Box, Typography, List, ListItemButton, ListItemIcon, ListItemText,
  Collapse, Divider, IconButton, Menu, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button,
} from '@mui/material';
import {
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  ExpandMore,
  ChevronRight,
  Star as StarIcon,
  CreateNewFolder as CreateNewFolderIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  AllInbox as AllInboxIcon,
} from '@mui/icons-material';
import { useDroppable } from '@dnd-kit/core';
import { useSecretStore } from '../../store/secretStore';
import { useAuthStore } from '../../store/authStore';
import { useTeamStore } from '../../store/teamStore';
import { useUiPreferencesStore } from '../../store/uiPreferencesStore';
import { deleteVaultFolder } from '../../api/vault-folders.api';
import type { VaultFolderData } from '../../api/vault-folders.api';
import { extractApiError } from '../../utils/apiError';

// --- Tree building ---

interface FolderNode {
  folder: VaultFolderData;
  children: FolderNode[];
}

function buildFolderTree(folders: VaultFolderData[]): FolderNode[] {
  const map = new Map<string, FolderNode>();
  for (const f of folders) {
    map.set(f.id, { folder: f, children: [] });
  }
  const roots: FolderNode[] = [];
  for (const node of map.values()) {
    const pid = node.folder.parentId;
    if (pid && map.has(pid)) {
      map.get(pid)?.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

// --- Props ---

interface SecretTreeProps {
  onCreateFolder: (scope: 'PERSONAL' | 'TEAM' | 'TENANT', parentId?: string, teamId?: string) => void;
  onEditFolder: (folder: VaultFolderData) => void;
}

// --- Droppable folder item ---

function FolderTreeItem({
  node,
  depth,
  selectedFolderId,
  onSelect,
  onContextMenu,
}: {
  node: FolderNode;
  depth: number;
  selectedFolderId: string | null;
  onSelect: (folderId: string) => void;
  onContextMenu: (e: React.MouseEvent, folder: VaultFolderData) => void;
}) {
  const expandState = useUiPreferencesStore((s) => s.keychainFolderExpandState);
  const toggleFolder = useUiPreferencesStore((s) => s.toggleKeychainFolder);
  const isOpen = expandState[node.folder.id] ?? true;

  const { setNodeRef, isOver } = useDroppable({
    id: `vault-folder-${node.folder.id}`,
    data: { type: 'vault-folder', folderId: node.folder.id },
  });

  // Auto-expand collapsed folders on drag hover after 500ms
  const dragOverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isOver && !isOpen) {
      dragOverTimerRef.current = setTimeout(() => toggleFolder(node.folder.id), 500);
    }
    return () => {
      if (dragOverTimerRef.current) clearTimeout(dragOverTimerRef.current);
    };
  }, [isOver, isOpen, node.folder.id, toggleFolder]);

  const isSelected = selectedFolderId === node.folder.id;

  return (
    <>
      <ListItemButton
        ref={setNodeRef}
        dense
        selected={isSelected}
        onClick={() => onSelect(node.folder.id)}
        onContextMenu={(e) => onContextMenu(e, node.folder)}
        sx={{
          pl: 1.5 + depth * 2,
          py: 0.25,
          ...(isOver && {
            bgcolor: 'action.hover',
            borderLeft: '3px solid',
            borderColor: 'primary.main',
          }),
        }}
      >
        <ListItemIcon sx={{ minWidth: 24 }}>
          {node.children.length > 0 ? (
            <IconButton
              size="small"
              sx={{ p: 0 }}
              onClick={(e) => { e.stopPropagation(); toggleFolder(node.folder.id); }}
            >
              {isOpen ? <ExpandMore sx={{ fontSize: 16 }} /> : <ChevronRight sx={{ fontSize: 16 }} />}
            </IconButton>
          ) : null}
        </ListItemIcon>
        <ListItemIcon sx={{ minWidth: 24 }}>
          {isOpen && node.children.length > 0 ? (
            <FolderOpenIcon sx={{ fontSize: 18 }} />
          ) : (
            <FolderIcon sx={{ fontSize: 18 }} />
          )}
        </ListItemIcon>
        <ListItemText
          primary={node.folder.name}
          primaryTypographyProps={{ variant: 'body2', noWrap: true, fontSize: '0.8rem' }}
        />
      </ListItemButton>

      {node.children.length > 0 && (
        <Collapse in={isOpen}>
          <List disablePadding>
            {node.children.map((child) => (
              <FolderTreeItem
                key={child.folder.id}
                node={child}
                depth={depth + 1}
                selectedFolderId={selectedFolderId}
                onSelect={onSelect}
                onContextMenu={onContextMenu}
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  );
}

// --- Main SecretTree ---

export default function SecretTree({ onCreateFolder, onEditFolder }: SecretTreeProps) {
  const vaultFolders = useSecretStore((s) => s.vaultFolders);
  const vaultTeamFolders = useSecretStore((s) => s.vaultTeamFolders);
  const vaultTenantFolders = useSecretStore((s) => s.vaultTenantFolders);
  const selectedFolderId = useSecretStore((s) => s.selectedFolderId);
  const setSelectedFolderId = useSecretStore((s) => s.setSelectedFolderId);
  const secrets = useSecretStore((s) => s.secrets);
  const fetchVaultFolders = useSecretStore((s) => s.fetchVaultFolders);
  const fetchSecrets = useSecretStore((s) => s.fetchSecrets);

  const user = useAuthStore((s) => s.user);
  const teams = useTeamStore((s) => s.teams);
  const hasTenant = !!user?.tenantId;

  const [deleteFolderTarget, setDeleteFolderTarget] = useState<VaultFolderData | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number; mouseY: number; folder: VaultFolderData;
  } | null>(null);

  // Special filter states
  const [favoritesSelected, setFavoritesSelected] = useState(false);
  const [activeScopeFilter, setActiveScopeFilter] = useState<string | null>(null);

  useEffect(() => {
    fetchVaultFolders();
  }, [fetchVaultFolders]);

  const personalTree = useMemo(() => buildFolderTree(vaultFolders), [vaultFolders]);

  // Group team folders by teamId, ensuring all user teams appear even with 0 folders
  const teamGroups = useMemo(() => {
    const groups = new Map<string, { teamName: string; folders: VaultFolderData[] }>();
    // Seed with all teams the user belongs to
    for (const t of teams) {
      groups.set(t.id, { teamName: t.name, folders: [] });
    }
    // Merge in actual folder data
    for (const f of vaultTeamFolders) {
      if (!f.teamId) continue;
      if (!groups.has(f.teamId)) {
        groups.set(f.teamId, { teamName: f.teamName || 'Unknown Team', folders: [] });
      }
      groups.get(f.teamId)?.folders.push(f);
    }
    return Array.from(groups.entries()).map(([teamId, g]) => ({
      teamId,
      teamName: g.teamName,
      tree: buildFolderTree(g.folders),
    }));
  }, [vaultTeamFolders, teams]);

  const tenantTree = useMemo(() => buildFolderTree(vaultTenantFolders), [vaultTenantFolders]);

  // Root droppable (move secret to no folder)
  const { setNodeRef: rootDropRef, isOver: isOverRoot } = useDroppable({
    id: 'vault-root-drop-zone',
    data: { type: 'vault-root', folderId: null },
  });

  const handleSelectFolder = (folderId: string) => {
    setFavoritesSelected(false);
    setActiveScopeFilter(null);
    useSecretStore.getState().setFilters({ scope: undefined, isFavorite: undefined });
    setSelectedFolderId(folderId === selectedFolderId ? null : folderId);
  };

  const handleSelectScope = (scope: 'PERSONAL' | 'TEAM' | 'TENANT') => {
    setFavoritesSelected(false);
    setSelectedFolderId(null);
    setActiveScopeFilter(scope);
    useSecretStore.getState().setFilters({ scope, isFavorite: undefined });
  };

  const handleSelectAll = () => {
    setFavoritesSelected(false);
    setActiveScopeFilter(null);
    setSelectedFolderId(null);
    // Clear isFavorite and scope filters
    useSecretStore.getState().setFilters({ isFavorite: undefined, scope: undefined });
  };

  const handleSelectFavorites = () => {
    setFavoritesSelected(true);
    setActiveScopeFilter(null);
    setSelectedFolderId(null);
    useSecretStore.getState().setFilters({ isFavorite: true, scope: undefined });
  };

  // Reset isFavorite filter when not in favorites mode
  useEffect(() => {
    if (!favoritesSelected) {
      const { filters } = useSecretStore.getState();
      if (filters.isFavorite !== undefined) {
        useSecretStore.getState().setFilters({ isFavorite: undefined });
      }
    }
  }, [favoritesSelected]);

  const handleContextMenu = (e: React.MouseEvent, folder: VaultFolderData) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, folder });
  };

  const handleDeleteFolder = async () => {
    if (!deleteFolderTarget) return;
    try {
      await deleteVaultFolder(deleteFolderTarget.id);
      if (selectedFolderId === deleteFolderTarget.id) {
        setSelectedFolderId(null);
      }
      await fetchVaultFolders();
      await fetchSecrets();
    } catch (err) {
      console.error(extractApiError(err, 'Failed to delete folder'));
    }
    setDeleteFolderTarget(null);
  };

  const hasFavorites = secrets.some((s) => s.isFavorite);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 1 }}>
        <Typography variant="subtitle2" sx={{ fontSize: '0.85rem' }}>Folders</Typography>
        <IconButton size="small" onClick={() => onCreateFolder('PERSONAL')} title="New Folder">
          <CreateNewFolderIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Tree content */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <List dense disablePadding>
          {/* All Secrets */}
          <ListItemButton
            ref={rootDropRef}
            dense
            selected={selectedFolderId === null && !favoritesSelected && !activeScopeFilter}
            onClick={handleSelectAll}
            sx={{
              pl: 1.5, py: 0.25,
              ...(isOverRoot && {
                bgcolor: 'action.hover',
                borderLeft: '3px solid',
                borderColor: 'primary.main',
              }),
            }}
          >
            <ListItemIcon sx={{ minWidth: 24 }} />
            <ListItemIcon sx={{ minWidth: 24 }}>
              <AllInboxIcon sx={{ fontSize: 18 }} />
            </ListItemIcon>
            <ListItemText
              primary="All Secrets"
              primaryTypographyProps={{ variant: 'body2', fontSize: '0.8rem' }}
            />
          </ListItemButton>

          {/* Favorites */}
          {hasFavorites && (
            <ListItemButton
              dense
              selected={favoritesSelected}
              onClick={handleSelectFavorites}
              sx={{ pl: 1.5, py: 0.25 }}
            >
              <ListItemIcon sx={{ minWidth: 24 }} />
              <ListItemIcon sx={{ minWidth: 24 }}>
                <StarIcon sx={{ fontSize: 18 }} color="warning" />
              </ListItemIcon>
              <ListItemText
                primary="Favorites"
                primaryTypographyProps={{ variant: 'body2', fontSize: '0.8rem' }}
              />
            </ListItemButton>
          )}
        </List>

        {/* Personal folders */}
        <Divider sx={{ my: 0.5 }} />
        <Typography
          variant="caption"
          color={activeScopeFilter === 'PERSONAL' ? 'primary' : 'text.secondary'}
          sx={{
            px: 1.5, py: 0.25, display: 'block', cursor: 'pointer',
            fontWeight: activeScopeFilter === 'PERSONAL' ? 'bold' : undefined,
            '&:hover': { color: 'primary.main' },
          }}
          onClick={() => handleSelectScope('PERSONAL')}
        >
          Personal
        </Typography>
        {personalTree.length > 0 && (
          <List dense disablePadding>
            {personalTree.map((node) => (
              <FolderTreeItem
                key={node.folder.id}
                node={node}
                depth={0}
                selectedFolderId={selectedFolderId}
                onSelect={handleSelectFolder}
                onContextMenu={handleContextMenu}
              />
            ))}
          </List>
        )}

        {/* Tenant folders */}
        {hasTenant && (
          <>
            <Divider sx={{ my: 0.5 }} />
            <Typography
              variant="caption"
              color={activeScopeFilter === 'TENANT' ? 'primary' : 'text.secondary'}
              sx={{
                px: 1.5, py: 0.25, display: 'block', cursor: 'pointer',
                fontWeight: activeScopeFilter === 'TENANT' ? 'bold' : undefined,
                '&:hover': { color: 'primary.main' },
              }}
              onClick={() => handleSelectScope('TENANT')}
            >
              Organization
            </Typography>
            {tenantTree.length > 0 && (
              <List dense disablePadding>
                {tenantTree.map((node) => (
                  <FolderTreeItem
                    key={node.folder.id}
                    node={node}
                    depth={0}
                    selectedFolderId={selectedFolderId}
                    onSelect={handleSelectFolder}
                    onContextMenu={handleContextMenu}
                  />
                ))}
              </List>
            )}
          </>
        )}

        {/* Team folders */}
        {teamGroups.map((group) => (
          <Box key={group.teamId}>
            <Divider sx={{ my: 0.5 }} />
            <Typography
              variant="caption"
              color={activeScopeFilter === group.teamId ? 'primary' : 'text.secondary'}
              sx={{
                px: 1.5, py: 0.25, display: 'block', cursor: 'pointer',
                fontWeight: activeScopeFilter === group.teamId ? 'bold' : undefined,
                '&:hover': { color: 'primary.main' },
              }}
              onClick={() => {
                setFavoritesSelected(false);
                setSelectedFolderId(null);
                setActiveScopeFilter(group.teamId);
                useSecretStore.getState().setFilters({ scope: 'TEAM', isFavorite: undefined });
              }}
            >
              {group.teamName}
            </Typography>
            {group.tree.length > 0 && (
              <List dense disablePadding>
                {group.tree.map((node) => (
                  <FolderTreeItem
                    key={node.folder.id}
                    node={node}
                    depth={0}
                    selectedFolderId={selectedFolderId}
                    onSelect={handleSelectFolder}
                    onContextMenu={handleContextMenu}
                  />
                ))}
              </List>
            )}
          </Box>
        ))}
      </Box>

      {/* Context menu */}
      <Menu
        open={contextMenu !== null}
        onClose={() => setContextMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
      >
        <MenuItem onClick={() => {
          if (contextMenu) onCreateFolder(contextMenu.folder.scope, contextMenu.folder.id, contextMenu.folder.teamId ?? undefined);
          setContextMenu(null);
        }}>
          <ListItemIcon><CreateNewFolderIcon fontSize="small" /></ListItemIcon>
          <ListItemText>New Subfolder</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => {
          if (contextMenu) onEditFolder(contextMenu.folder);
          setContextMenu(null);
        }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Rename</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          if (contextMenu) setDeleteFolderTarget(contextMenu.folder);
          setContextMenu(null);
        }}>
          <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>

      {/* Delete folder confirmation */}
      <Dialog open={!!deleteFolderTarget} onClose={() => setDeleteFolderTarget(null)}>
        <DialogTitle>Delete Folder</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete &quot;{deleteFolderTarget?.name}&quot;?
            Secrets in this folder will be moved to the parent folder.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteFolderTarget(null)}>Cancel</Button>
          <Button onClick={handleDeleteFolder} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
