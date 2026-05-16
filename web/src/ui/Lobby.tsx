import React, { useState } from 'react';
import { useStore } from '../state/store';

export default function Lobby() {
  const { nickname, setNickname, createRoom, joinRoom } = useStore();
  const [name, setName] = useState(nickname);
  const [roomId, setRoomId] = useState('');

  const onCreate = () => {
    if (!name.trim()) return;
    setNickname(name.trim());
    createRoom(name.trim());
  };
  const onJoin = () => {
    if (!name.trim() || !roomId.trim()) return;
    setNickname(name.trim());
    joinRoom(roomId.trim(), name.trim());
  };

  return (
    <div className="lobby">
      <h1>防控作战飞行棋</h1>
      <p className="subtitle">Air Defense Combat Flying Chess — Online</p>
      <div className="card">
        <label>
          Nickname
          <input value={name} onChange={e => setName(e.target.value)} maxLength={16} placeholder="Pilot" />
        </label>
        <div className="row">
          <button className="primary" onClick={onCreate}>Create Room</button>
        </div>
        <div className="divider">or</div>
        <label>
          Room Code
          <input value={roomId} onChange={e => setRoomId(e.target.value.toUpperCase())} maxLength={8} placeholder="ABCDEF" />
        </label>
        <div className="row">
          <button onClick={onJoin}>Join Room</button>
        </div>
      </div>
    </div>
  );
}
