import { useState, useEffect } from 'react';
import { boardsApi } from '../api/boards';
import { usersApi } from '../api/users';
import { alert, useConfirm } from './AlertSystem';

const ROLE_OPTIONS = ['admin', 'editor', 'viewer'];
const ROLE_COLORS = {
  admin: 'var(--red)',
  editor: 'var(--orange)',
  viewer: 'var(--teal)'
};

export default function BoardMembers({ board, boardId, myRole, onClose, onBoardUpdated }) {
  const confirm = useConfirm();
  const [orgMembers, setOrgMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [addRole, setAddRole] = useState('editor');
  const [loading, setLoading] = useState(false);

  const isAdmin = myRole === 'admin';
  const members = board?.members || [];

  useEffect(() => {
    usersApi.getOrgMembers().then(res => setOrgMembers(res.data || [])).catch(() => {});
  }, []);

  // Users not yet on the board
  const memberUserIds = new Set(members.map(m => (m.user?._id || m.user)?.toString()));
  const availableUsers = orgMembers.filter(u => {
    if (memberUserIds.has(u._id)) return false;
    if (search && !u.name.toLowerCase().includes(search.toLowerCase()) && !u.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleAddMember = async (userId) => {
    setLoading(true);
    try {
      const res = await boardsApi.addMember(boardId, userId, addRole);
      onBoardUpdated(res.data);
      alert.success('User added');
      setSearch('');
    } catch (err) {
      alert.error(err.response?.data?.error || 'Failed to add user');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      const res = await boardsApi.updateMemberRole(boardId, userId, newRole);
      onBoardUpdated(res.data);
    } catch (err) {
      alert.error(err.response?.data?.error || 'Failed to update role');
    }
  };

  const handleRemove = async (userId) => {
    if (!(await confirm({ title: 'Remove User', message: 'Remove this user from the project?', confirmText: 'Remove', variant: 'danger' }))) return;
    try {
      const res = await boardsApi.removeMember(boardId, userId);
      onBoardUpdated(res.data);
      alert.success('User removed');
    } catch (err) {
      alert.error(err.response?.data?.error || 'Failed to remove user');
    }
  };

  const initials = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h3>Project Users</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body" style={{ padding: '16px 24px 20px' }}>
          {/* Add members section (admin only) */}
          {isAdmin && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                Add User
              </label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  className="form-input"
                  placeholder="Search by name or email..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ flex: 1 }}
                />
                <select
                  className="form-input"
                  value={addRole}
                  onChange={e => setAddRole(e.target.value)}
                  style={{ width: 110 }}
                >
                  {ROLE_OPTIONS.map(r => (
                    <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
              </div>
              {search && (
                <div className="board-members-search-results">
                  {availableUsers.length === 0 ? (
                    <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-tertiary)' }}>No users found</div>
                  ) : (
                    availableUsers.slice(0, 5).map(u => (
                      <div
                        key={u._id}
                        className="board-member-search-item"
                        onClick={() => !loading && handleAddMember(u._id)}
                      >
                        <div className="board-member-avatar">
                          {u.avatar ? (
                            <img src={`/uploads/avatars/${u.avatar.split('/').pop()}`} alt="" />
                          ) : (
                            initials(u.name)
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 550 }}>{u.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{u.email}</div>
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--teal)' }}>+ Add</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Current members */}
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 10 }}>
            {members.length} User{members.length !== 1 ? 's' : ''}
          </label>
          <div className="board-members-list">
            {members.map(m => {
              const u = m.user || {};
              const userId = u._id || m.user;
              const isCreator = board.createdBy?._id?.toString() === userId?.toString()
                || board.createdBy?.toString() === userId?.toString();
              return (
                <div key={userId} className="board-member-row">
                  <div className="board-member-avatar">
                    {u.avatar ? (
                      <img src={`/uploads/avatars/${u.avatar.split('/').pop()}`} alt="" />
                    ) : (
                      initials(u.name)
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 550, display: 'flex', gap: 6, alignItems: 'center' }}>
                      {u.name || 'Unknown'}
                      {isCreator && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 400 }}>Creator</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{u.email}</div>
                  </div>
                  {isAdmin ? (
                    <select
                      className="board-member-role-select"
                      value={m.role}
                      onChange={e => handleRoleChange(userId, e.target.value)}
                      style={{ '--role-color': ROLE_COLORS[m.role] }}
                    >
                      {ROLE_OPTIONS.map(r => (
                        <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="board-member-role-badge" style={{ '--role-color': ROLE_COLORS[m.role] }}>
                      {m.role}
                    </span>
                  )}
                  {isAdmin && !isCreator && (
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => handleRemove(userId)}
                      style={{ color: 'var(--red)', padding: '4px 6px' }}
                      title="Remove user"
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z"/></svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Role legend */}
          <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Roles</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <div><strong style={{ color: ROLE_COLORS.admin }}>Admin</strong> — Full control, manage users, columns, settings</div>
              <div><strong style={{ color: ROLE_COLORS.editor }}>Editor</strong> — Create & edit tasks, update statuses</div>
              <div><strong style={{ color: ROLE_COLORS.viewer }}>Viewer</strong> — View tasks, add comments</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
