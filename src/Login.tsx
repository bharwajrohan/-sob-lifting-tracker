import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Logo } from './Logo';
import { KeyRound, ArrowRight, User } from 'lucide-react';

interface User {
  username: string;
  password?: string;
  role: string;
}

interface LoginProps {
  users: User[];
  onLogin: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ users, onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
      onLogin(user);
    } else {
      setError('Invalid username or password');
    }
  };

  return (
    <div className="min-h-screen bg-[#070d1c] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-3xl mb-8">
        <Logo />
      </div>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.8 }}
        className="w-full max-w-md bg-[#0c1a32] border border-[#00d4ff]/20 rounded-2xl p-8 shadow-[0_0_40px_rgba(0,212,255,0.1)] relative z-10"
      >
        <h2 className="text-2xl font-bold text-white mb-6 text-center font-['Exo_2']">STPL SOB Tracker — Login</h2>
        
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-[#8ab4c9] text-sm font-medium mb-2">Username</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-[#00d4ff]" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError('');
                }}
                className="block w-full pl-10 pr-3 py-3 border border-[#00d4ff]/30 rounded-xl bg-[#080f20] text-white placeholder-[#5a7a9a] focus:outline-none focus:ring-2 focus:ring-[#00d4ff] focus:border-transparent transition-all"
                placeholder="Enter username"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-[#8ab4c9] text-sm font-medium mb-2">Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <KeyRound className="h-5 w-5 text-[#00d4ff]" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                className="block w-full pl-10 pr-3 py-3 border border-[#00d4ff]/30 rounded-xl bg-[#080f20] text-white placeholder-[#5a7a9a] focus:outline-none focus:ring-2 focus:ring-[#00d4ff] focus:border-transparent transition-all"
                placeholder="Enter password"
                required
              />
            </div>
          </div>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#00d4ff] to-[#0088ff] text-white font-bold py-3 px-4 rounded-xl hover:shadow-[0_0_20px_rgba(0,212,255,0.4)] transition-all transform hover:-translate-y-0.5"
          >
            Login <ArrowRight size={18} />
          </button>
        </form>
      </motion.div>
    </div>
  );
};
