// src/components/Alert.jsx

import React, { useEffect } from 'react';

export default function Alert({ message, type, onClose }) {
  const bgColor = type === 'success' ? 'bg-green-500' : 'bg-red-500';
  const textColor = 'text-white';
  const icon = type === 'success' ? '✅' : '❌';

  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000); // Fecha o alerta automaticamente após 5 segundos

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-xl flex items-center space-x-3 ${bgColor} ${textColor}`}>
      <span className="text-2xl">{icon}</span>
      <p className="font-semibold">{message}</p>
      <button onClick={onClose} className="text-white hover:text-gray-200 focus:outline-none ml-4 text-xl">
        &times;
      </button>
    </div>
  );
}