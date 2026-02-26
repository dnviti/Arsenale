import { useState, useMemo } from 'react';
import {
  Box, Typography, List, ListItemButton, ListItemIcon, ListItemText,
  Collapse, Menu, MenuItem, Divider, IconButton,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button,
  FormControl, InputLabel, Select,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import {
  Computer as RdpIcon,
  Terminal as SshIcon,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  ExpandMore,
  ChevronRight,
  Share as ShareIcon,
  PlayArrow as ConnectIcon,
  OpenInNew as OpenInNewIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CreateNewFolder as CreateNewFolderIcon,
  Add as AddIcon,
  DriveFileMove as MoveIcon,
} from '@mui/icons-material';
import { useConnectionsStore, Folder } from '../../store/connectionsStore';
import { useTabsStore } from '../../store/tabsStore';
import { useNotificationStore } from '../../store/notificationStore';
import { ConnectionData, deleteConnection, updateConnection } from '../../api/connections.api';
import { deleteFolder } from '../../api/folders.api';
import { openConnectionWindow } from '../../utils/openConnectionWindow';

function getErrorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
}

// Consistent indentation: base padding + depth * indent step
const BASE_PL = 2;
const INDENT = 2;
function depthPl(depth: number) { return BASE_PL + depth * INDENT; }

// --- Tree helpers ---

interface FolderNode {
  folder: Folder;
  children: FolderNode[];
}

function buildFolderTree(folders: Folder[]): FolderNode[] {
  const map = new Map<string, FolderNode>();
  for (const f of folders) {
    map.set(f.id, { folder: f, children: [] });
  }
  const roots: FolderNode[] = [];
  for (const node of map.values()) {
    const pid = node.folder.parentId;
    if (pid && map.has(pid)) {
      map.get(pid)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

// --- ConnectionItem ---

interface ConnectionItemProps {
  conn: ConnectionData;
  depth: number;
  onEdit: (conn: ConnectionData) => void;
  onDelete: (conn: ConnectionData) => void;
  onMove: (conn: ConnectionData) => void;
}

function ConnectionItem({ conn, depth, onEdit, onDelete, onMove }: ConnectionItemProps) {
  const openTab = useTabsStore((s) => s.openTab);
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number } | null>(null);

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ mouseX: event.clientX - 2, mouseY: event.clientY - 4 });
  };

  const handleCloseMenu = () => setContextMenu(null);

  const handleConnect = () => {
    handleCloseMenu();
    openTab(conn);
  };

  const handleOpenInNewWindow = () => {
    handleCloseMenu();
    openConnectionWindow(conn.id);
  };

  const handleEdit = () => {
    handleCloseMenu();
    onEdit(conn);
  };

  const handleDelete = () => {
    handleCloseMenu();
    onDelete(conn);
  };

  const handleMove = () => {
    handleCloseMenu();
    onMove(conn);
  };

  return (
    <>
      <ListItemButton
        dense
        onDoubleClick={() => openTab(conn)}
        onContextMenu={handleContextMenu}
        sx={{ pl: depthPl(depth) }}
      >
        <ListItemIcon sx={{ minWidth: 32 }}>
          {conn.type === 'RDP' ? (
            <RdpIcon fontSize="small" color="primary" />
          ) : (
            <SshIcon fontSize="small" color="secondary" />
          )}
        </ListItemIcon>
        <ListItemText
          primary={conn.name}
          secondary={`${conn.host}:${conn.port}`}
          primaryTypographyProps={{ variant: 'body2', noWrap: true }}
          secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
        />
      </ListItemButton>

      <Menu
        open={contextMenu !== null}
        onClose={handleCloseMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        <MenuItem onClick={handleConnect}>
          <ListItemIcon><ConnectIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Connect</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleOpenInNewWindow}>
          <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Open in New Window</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleMove} disabled={!conn.isOwner}>
          <ListItemIcon><MoveIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Move to Folder</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleEdit} disabled={!conn.isOwner}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleDelete} disabled={!conn.isOwner}>
          <ListItemIcon><DeleteIcon fontSize="small" color={conn.isOwner ? 'error' : undefined} /></ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}

// --- FolderItem ---

interface FolderItemProps {
  node: FolderNode;
  connections: ConnectionData[];
  folderMap: Map<string, ConnectionData[]>;
  depth: number;
  onEditConnection: (conn: ConnectionData) => void;
  onDeleteConnection: (conn: ConnectionData) => void;
  onMoveConnection: (conn: ConnectionData) => void;
  onCreateConnection: (folderId: string) => void;
  onCreateFolder: (parentId?: string) => void;
  onEditFolder: (folder: Folder) => void;
  onDeleteFolder: (folder: Folder) => void;
}

function FolderItem({
  node, connections, folderMap, depth,
  onEditConnection, onDeleteConnection, onMoveConnection, onCreateConnection,
  onCreateFolder, onEditFolder, onDeleteFolder,
}: FolderItemProps) {
  const [open, setOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number } | null>(null);

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ mouseX: event.clientX - 2, mouseY: event.clientY - 4 });
  };

  const handleCloseMenu = () => setContextMenu(null);

  return (
    <>
      <ListItemButton
        dense
        onClick={() => setOpen(!open)}
        onContextMenu={handleContextMenu}
        sx={{ pl: depthPl(depth) }}
      >
        <ListItemIcon sx={{ minWidth: 32 }}>
          {open ? <FolderOpenIcon fontSize="small" /> : <FolderIcon fontSize="small" />}
        </ListItemIcon>
        <ListItemText
          primary={node.folder.name}
          primaryTypographyProps={{ variant: 'body2' }}
        />
        {open ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
      </ListItemButton>

      <Menu
        open={contextMenu !== null}
        onClose={handleCloseMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        <MenuItem onClick={() => { handleCloseMenu(); onCreateConnection(node.folder.id); }}>
          <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
          <ListItemText>New Connection</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { handleCloseMenu(); onCreateFolder(node.folder.id); }}>
          <ListItemIcon><CreateNewFolderIcon fontSize="small" /></ListItemIcon>
          <ListItemText>New Subfolder</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { handleCloseMenu(); onEditFolder(node.folder); }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Rename</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { handleCloseMenu(); onDeleteFolder(node.folder); }}>
          <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>

      <Collapse in={open}>
        <List disablePadding>
          {node.children.map((child) => (
            <FolderItem
              key={child.folder.id}
              node={child}
              connections={folderMap.get(child.folder.id) || []}
              folderMap={folderMap}
              depth={depth + 1}
              onEditConnection={onEditConnection}
              onDeleteConnection={onDeleteConnection}
              onMoveConnection={onMoveConnection}
              onCreateConnection={onCreateConnection}
              onCreateFolder={onCreateFolder}
              onEditFolder={onEditFolder}
              onDeleteFolder={onDeleteFolder}
            />
          ))}
          {connections.map((conn) => (
            <ConnectionItem
              key={conn.id}
              conn={conn}
              depth={depth + 1}
              onEdit={onEditConnection}
              onDelete={onDeleteConnection}
              onMove={onMoveConnection}
            />
          ))}
        </List>
      </Collapse>
    </>
  );
}

// --- ConnectionTree ---

interface ConnectionTreeProps {
  onEditConnection: (conn: ConnectionData) => void;
  onCreateConnection: (folderId?: string) => void;
  onCreateFolder: (parentId?: string) => void;
  onEditFolder: (folder: Folder) => void;
}

export default function ConnectionTree({ onEditConnection, onCreateConnection, onCreateFolder, onEditFolder }: ConnectionTreeProps) {
  const ownConnections = useConnectionsStore((s) => s.ownConnections);
  const sharedConnections = useConnectionsStore((s) => s.sharedConnections);
  const folders = useConnectionsStore((s) => s.folders);
  const fetchConnections = useConnectionsStore((s) => s.fetchConnections);
  const notify = useNotificationStore((s) => s.notify);
  const [deleteTarget, setDeleteTarget] = useState<ConnectionData | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<Folder | null>(null);
  const [moveTarget, setMoveTarget] = useState<ConnectionData | null>(null);
  const [moveDestination, setMoveDestination] = useState('');

  const handleOpenMoveDialog = (conn: ConnectionData) => {
    setMoveTarget(conn);
    setMoveDestination(conn.folderId || '');
  };

  const handleConfirmMove = async () => {
    if (!moveTarget) return;
    const newFolderId = moveDestination || null;
    if (newFolderId === moveTarget.folderId) {
      setMoveTarget(null);
      return;
    }
    try {
      await updateConnection(moveTarget.id, { folderId: newFolderId });
      await fetchConnections();
    } catch (err) {
      notify(getErrorMessage(err, 'Failed to move connection'));
    }
    setMoveTarget(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteConnection(deleteTarget.id);
      await fetchConnections();
    } catch (err) {
      notify(getErrorMessage(err, 'Failed to delete connection'));
    }
    setDeleteTarget(null);
  };

  const handleConfirmDeleteFolder = async () => {
    if (!deleteFolderTarget) return;
    try {
      await deleteFolder(deleteFolderTarget.id);
      await fetchConnections();
    } catch (err) {
      notify(getErrorMessage(err, 'Failed to delete folder'));
    }
    setDeleteFolderTarget(null);
  };

  // Group own connections by folder
  const rootConnections = ownConnections.filter((c) => !c.folderId);
  const folderMap = new Map<string, ConnectionData[]>();
  ownConnections.forEach((c) => {
    if (c.folderId) {
      const list = folderMap.get(c.folderId) || [];
      list.push(c);
      folderMap.set(c.folderId, list);
    }
  });

  // Build hierarchical tree from flat folders list
  const folderTree = useMemo(() => buildFolderTree(folders), [folders]);

  return (
    <Box sx={{ py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2, mb: 1 }}>
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
          My Connections
        </Typography>
        <IconButton size="small" onClick={() => onCreateFolder()} title="New Folder">
          <CreateNewFolderIcon fontSize="small" />
        </IconButton>
      </Box>
      <List disablePadding>
        {folderTree.map((node) => (
          <FolderItem
            key={node.folder.id}
            node={node}
            connections={folderMap.get(node.folder.id) || []}
            folderMap={folderMap}
            depth={0}
            onEditConnection={onEditConnection}
            onDeleteConnection={setDeleteTarget}
            onMoveConnection={handleOpenMoveDialog}
            onCreateConnection={onCreateConnection}
            onCreateFolder={onCreateFolder}
            onEditFolder={onEditFolder}
            onDeleteFolder={setDeleteFolderTarget}
          />
        ))}
        {rootConnections.map((conn) => (
          <ConnectionItem
            key={conn.id}
            conn={conn}
            depth={0}
            onEdit={onEditConnection}
            onDelete={setDeleteTarget}
            onMove={handleOpenMoveDialog}
          />
        ))}
      </List>

      {sharedConnections.length > 0 && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', px: 2, mt: 2, mb: 1 }}>
            <ShareIcon fontSize="small" sx={{ mr: 1 }} />
            <Typography variant="subtitle2">Shared with me</Typography>
          </Box>
          <List disablePadding>
            {sharedConnections.map((conn) => (
              <ConnectionItem
                key={conn.id}
                conn={conn}
                depth={0}
                onEdit={onEditConnection}
                onDelete={setDeleteTarget}
                onMove={handleOpenMoveDialog}
              />
            ))}
          </List>
        </>
      )}

      {/* Move to Folder dialog */}
      <Dialog open={moveTarget !== null} onClose={() => setMoveTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Move &quot;{moveTarget?.name}&quot;</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel>Destination Folder</InputLabel>
            <Select
              value={moveDestination}
              label="Destination Folder"
              onChange={(e: SelectChangeEvent) => setMoveDestination(e.target.value)}
            >
              <MenuItem value="">Root (no folder)</MenuItem>
              {folders.map((f) => (
                <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMoveTarget(null)}>Cancel</Button>
          <Button onClick={handleConfirmMove} variant="contained">Move</Button>
        </DialogActions>
      </Dialog>

      {/* Delete connection confirmation */}
      <Dialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete Connection</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Delete folder confirmation */}
      <Dialog open={deleteFolderTarget !== null} onClose={() => setDeleteFolderTarget(null)}>
        <DialogTitle>Delete Folder</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete &quot;{deleteFolderTarget?.name}&quot;?
            Connections in this folder will be moved to the root level.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteFolderTarget(null)}>Cancel</Button>
          <Button onClick={handleConfirmDeleteFolder} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
