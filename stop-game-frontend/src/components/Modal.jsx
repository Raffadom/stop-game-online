export default function Modal({ children, onClose, showClose = true }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-8 rounded-xl shadow-2xl max-w-lg w-full relative transform transition-all duration-300 scale-100 opacity-100">
        {showClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-gray-600 hover:text-gray-900 text-3xl font-bold p-1 rounded-full hover:bg-gray-200 transition-colors"
            aria-label="Fechar"
          >
            ×
          </button>
        )}
        {children}
      </div>
    </div>
  );
}