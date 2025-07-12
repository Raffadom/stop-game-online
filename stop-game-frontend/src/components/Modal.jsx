export default function Modal({ children, onClose, showClose = true }) {
  return (
    // Fundo do overlay do modal: Adiciona uma opacidade um pouco maior no modo escuro para manter o contraste.
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-75 flex items-center justify-center z-50 p-4">
      {/* Container principal do modal: Altera o fundo, sombra e texto no modo escuro. */}
      <div className="bg-white p-8 rounded-xl shadow-2xl max-w-lg w-full relative transform transition-all duration-300 scale-100 opacity-100 dark:bg-gray-800 dark:shadow-none dark:text-gray-100">
        {showClose && (
          // Botão de fechar do modal: Adapta a cor do ícone e do hover no modo escuro.
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-gray-600 hover:text-gray-900 text-3xl font-bold p-1 rounded-full hover:bg-gray-200 transition-colors dark:text-gray-300 dark:hover:text-gray-50 dark:hover:bg-gray-700"
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