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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10001] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
        <h2 className="text-2xl font-bold mb-4">Create Network Connection</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Source Device</label>
            <select 
              value={sourceId} 
              onChange={(e) => setSourceId(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md p-2"
            >
              <option value="">Select source...</option>
              {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Target Device</label>
            <select 
              value={targetId} 
              onChange={(e) => setTargetId(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md p-2"
            >
              <option value="">Select target...</option>
              {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={onClose} className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
            <button 
              onClick={handleSubmit} 
              disabled={!sourceId || !targetId}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Create Connection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
