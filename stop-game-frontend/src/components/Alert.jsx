// src/components/Alert.jsx

import { useState, useEffect } from 'react';

export default function Alert({ 
  type = 'info', 
  message, 
  onClose, 
  autoClose = true, 
  duration = 5000 
}) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (autoClose) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => {
          onClose && onClose();
        }, 300);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [autoClose, duration, onClose]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => {
      onClose && onClose();
    }, 300);
  };

  const getAlertStyles = () => {
    const baseStyles = "flex items-center justify-between p-4 rounded-lg shadow-lg";
    
    switch (type) {
      case 'success':
        return `${baseStyles} bg-green-100 border border-green-200 text-green-800 dark:bg-green-900 dark:border-green-700 dark:text-green-200`;
      case 'error':
        return `${baseStyles} bg-red-100 border border-red-200 text-red-800 dark:bg-red-900 dark:border-red-700 dark:text-red-200`;
      case 'warning':
        return `${baseStyles} bg-yellow-100 border border-yellow-200 text-yellow-800 dark:bg-yellow-900 dark:border-yellow-700 dark:text-yellow-200`;
      default:
        return `${baseStyles} bg-blue-100 border border-blue-200 text-blue-800 dark:bg-blue-900 dark:border-blue-700 dark:text-blue-200`;
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return (
          <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" data-testid="success-icon">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" data-testid="error-icon">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'warning':
        return (
          <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" data-testid="warning-icon">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" data-testid="info-icon">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  if (!isVisible) return null;

  return (
    <div 
      className={`fixed top-4 right-4 z-50 transform transition-all duration-300 ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
      data-testid="alert-container"
    >
      <div className={getAlertStyles()} data-testid={`alert-${type}`}>
        <div className="flex items-center" data-testid="alert-content">
          {getIcon()}
          <div className="flex-1" data-testid="alert-message">
            <p className="font-medium text-sm">{message}</p>
          </div>
        </div>
        
        <button
          onClick={handleClose}
          className="ml-4 text-current hover:opacity-70 transition-opacity"
          data-testid="alert-close-btn"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Barra de progresso para auto-close */}
        {autoClose && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black bg-opacity-20 rounded-b-lg overflow-hidden" data-testid="alert-progress-container">
            <div 
              className="h-full bg-current opacity-50"
              style={{
                animation: `shrink ${duration}ms linear`
              }}
              data-testid="alert-progress-bar"
            />
          </div>
        )}
      </div>
    </div>
  );
}