import React, { useState } from 'react';
import { Shield, Plus, Edit2, Trash2 } from 'lucide-react';

interface User {
  username: string;
  password?: string;
  role: string;
}

interface UserManagementProps {
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  currentUserRole: string;
}

export const UserManagement: React.FC<UserManagementProps> = ({ users, setUsers, currentUserRole }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'Viewer' });

  if (currentUserRole !== 'Admin') {
    return (
      <div className="bg-[#FFFFFF] p-6 rounded-[12px] shadow-sm border border-[#E2E8F0]">
        <h3 className="text-lg font-bold text-[#1E293B] mb-4 flex items-center gap-2">
          <Shield className="text-[#005689]" size={20} />
          User Role Management
        </h3>
        <p className="text-sm text-[#64748B]">You do not have permission to manage users.</p>
      </div>
    );
  }

  const handleSave = async () => {
    const { hashPassword } = await import('./utils/crypto');
    
    if (editingUser) {
      const passwordToSave = editingUser.password && editingUser.password.length > 0 
        ? (editingUser.password.length === 64 ? editingUser.password : await hashPassword(editingUser.password)) 
        : editingUser.password;
        
      setUsers(users.map(u => u.username === editingUser.username ? { ...editingUser, password: passwordToSave } : u));
      setEditingUser(null);
    } else {
      if (users.find(u => u.username === newUser.username)) {
        alert("Username already exists");
        return;
      }
      
      const passwordToSave = newUser.password ? await hashPassword(newUser.password) : '';
      setUsers([...users, { ...newUser, password: passwordToSave }]);
      setNewUser({ username: '', password: '', role: 'Viewer' });
    }
    setIsEditing(false);
  };

  const handleDelete = (username: string) => {
    if (username === 'admin') {
      alert("Cannot delete the primary admin account");
      return;
    }
    if (window.confirm(`Are you sure you want to delete user "${username}"?`)) {
      setUsers(prev => prev.filter(u => u.username !== username));
    }
  };

  return (
    <div className="bg-[#FFFFFF] p-6 rounded-[12px] shadow-sm border border-[#E2E8F0]">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-[#1E293B] flex items-center gap-2">
          <Shield className="text-[#005689]" size={20} />
          User Management
        </h3>
        {!isEditing && (
          <button 
            onClick={() => {
              setEditingUser(null);
              setNewUser({ username: '', password: '', role: 'Viewer' });
              setIsEditing(true);
            }} 
            className="flex items-center gap-1 text-sm bg-[#005689] text-white px-3 py-1.5 rounded-lg hover:bg-[#00426a] transition-colors"
          >
            <Plus size={16} /> Add User
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="border border-[#E2E8F0] p-4 rounded-lg bg-[#F8FAFC] space-y-4 mb-4">
          <h4 className="font-semibold text-[#1E293B]">{editingUser ? 'Edit User' : 'Add New User'}</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1">Username</label>
              <input 
                value={editingUser ? editingUser.username : newUser.username}
                onChange={e => editingUser ? setEditingUser({...editingUser, username: e.target.value}) : setNewUser({...newUser, username: e.target.value})}
                disabled={!!editingUser && editingUser.username === 'admin'}
                className="w-full border border-[#CBD5E1] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#005689] outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1">Password</label>
              <input 
                type="password"
                placeholder={editingUser ? "Leave blank to keep same" : ""}
                value={editingUser ? (editingUser.password || '') : newUser.password}
                onChange={e => editingUser ? setEditingUser({...editingUser, password: e.target.value}) : setNewUser({...newUser, password: e.target.value})}
                className="w-full border border-[#CBD5E1] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#005689] outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1">Role</label>
              <select 
                value={editingUser ? editingUser.role : newUser.role}
                onChange={e => editingUser ? setEditingUser({...editingUser, role: e.target.value}) : setNewUser({...newUser, role: e.target.value})}
                disabled={!!editingUser && editingUser.username === 'admin'}
                className="w-full border border-[#CBD5E1] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#005689] outline-none"
              >
                <option value="Admin">Admin</option>
                <option value="Tracker">Tracker</option>
                <option value="Viewer">Viewer</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-sm text-[#64748B] hover:bg-[#E2E8F0] rounded-lg">Cancel</button>
            <button onClick={handleSave} className="px-3 py-1.5 text-sm bg-[#10B981] text-white hover:bg-[#059669] rounded-lg">Save User</button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto border border-[#E2E8F0] rounded-xl">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-[#F1F5F9] text-[#475569]">
            <tr>
              <th className="p-3 font-semibold border-b border-[#E2E8F0]">Username</th>
              <th className="p-3 font-semibold border-b border-[#E2E8F0]">Role</th>
              <th className="p-3 font-semibold border-b border-[#E2E8F0] text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {users.map(user => (
              <tr key={user.username} className="hover:bg-[#F8FAFC]">
                <td className="p-3 font-medium text-[#1E293B]">{user.username}</td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    user.role === 'Admin' ? 'bg-purple-100 text-purple-700' :
                    user.role === 'Tracker' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {user.role}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex justify-center gap-2">
                    <button 
                      onClick={() => {
                        setEditingUser(user);
                        setIsEditing(true);
                      }}
                      className="text-[#005689] hover:bg-[#E0F2FE] p-1.5 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit2 size={16} />
                    </button>
                    {user.username !== 'admin' && (
                      <button 
                        onClick={() => handleDelete(user.username)}
                        className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
