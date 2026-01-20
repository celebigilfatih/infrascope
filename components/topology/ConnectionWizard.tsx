'use client';

import React, { useState } from 'react';

interface ConnectionWizardProps {
  isOpen: boolean;
  onClose: () => void;
  devices: any[];
  onCreateConnection: (data: any) => Promise<void>;
}

export const ConnectionWizard: React.FC<ConnectionWizardProps> = ({
  isOpen,
  onClose,
  devices,
  onCreateConnection,
}) => {
  // const [step, setStep] = useState(1);
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async () => {
    await onCreateConnection({
      sourceDeviceId: sourceId,
      targetDeviceId: targetId,
      status: 'UP',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10001] p-4">
      <div className="bg-[#000044] border border-blue-800 rounded-xl shadow-2xl max-w-2xl w-full p-8 text-white">
        <h2 className="text-2xl font-extrabold mb-6 tracking-tight">Ağ Bağlantısı Oluştur</h2>
        <div className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">Kaynak Cihaz</label>
            <select 
              value={sourceId} 
              onChange={(e) => setSourceId(e.target.value)}
              className="w-full bg-[#000033] border border-blue-800 rounded-lg p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            >
              <option value="">Kaynak seçin...</option>
              {devices.map(d => <option key={d.id} value={d.id} className="bg-[#000033]">{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">Hedef Cihaz</label>
            <select 
              value={targetId} 
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full bg-[#000033] border border-blue-800 rounded-lg p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            >
              <option value="">Hedef seçin...</option>
              {devices.map(d => <option key={d.id} value={d.id} className="bg-[#000033]">{d.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-4 mt-8">
            <button 
              onClick={onClose} 
              className="px-6 py-2.5 border border-blue-800 rounded-lg text-blue-300 font-bold hover:bg-blue-900/30 transition-all"
            >
              İptal
            </button>
            <button 
              onClick={handleSubmit} 
              disabled={!sourceId || !targetId}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20 transition-all"
            >
              Bağlantı Oluştur
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
