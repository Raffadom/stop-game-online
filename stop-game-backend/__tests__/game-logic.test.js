// Mock do Firebase Admin SDK para testes
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn()
  },
  firestore: () => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn(),
        get: jest.fn(() => Promise.resolve({
          exists: true,
          data: () => ({ test: true })
        })),
        update: jest.fn(),
        delete: jest.fn()
      })),
      add: jest.fn(),
      where: jest.fn(() => ({
        get: jest.fn(() => Promise.resolve({
          docs: []
        }))
      }))
    }))
  }),
  FieldValue: {
    serverTimestamp: jest.fn()
  },
  app: jest.fn()
}));

// Mock das variáveis de ambiente
process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify({
  project_id: 'test-project',
  private_key: 'test-key',
  client_email: 'test@test.com'
});

describe('Game Logic Tests', () => {
  
  describe('Room Management', () => {
    it('should generate unique room codes', () => {
      // Mock da função de geração de código
      const generateRoomCode = () => {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
      };
      
      const code1 = generateRoomCode();
      const code2 = generateRoomCode();
      
      expect(code1).toHaveLength(6);
      expect(code2).toHaveLength(6);
      expect(code1).not.toBe(code2);
    });

    it('should validate room code format', () => {
      const isValidRoomCode = (code) => {
        return /^[A-Z0-9]{6}$/.test(code);
      };
      
      expect(isValidRoomCode('ABC123')).toBe(true);
      expect(isValidRoomCode('abc123')).toBe(false);
      expect(isValidRoomCode('ABCD12')).toBe(true);
      expect(isValidRoomCode('AB123')).toBe(false);
      expect(isValidRoomCode('ABC1234')).toBe(false);
    });
  });

  describe('Player Management', () => {
    it('should validate player names', () => {
      const isValidPlayerName = (name) => {
        if (!name || typeof name !== 'string') return false;
        const trimmed = name.trim();
        return trimmed.length >= 2 && trimmed.length <= 20;
      };
      
      expect(isValidPlayerName('João')).toBe(true);
      expect(isValidPlayerName('A')).toBe(false);
      expect(isValidPlayerName('')).toBe(false);
      expect(isValidPlayerName(null)).toBe(false);
      expect(isValidPlayerName(undefined)).toBe(false);
      expect(isValidPlayerName('A'.repeat(25))).toBe(false);
      expect(isValidPlayerName('   João   ')).toBe(true);
    });
  });

  describe('Game Themes', () => {
    it('should have valid default themes', () => {
      const defaultThemes = ['Nome', 'Cidade', 'País', 'Marca', 'Cor', 'Animal'];
      
      expect(defaultThemes).toHaveLength(6);
      expect(defaultThemes).toContain('Nome');
      expect(defaultThemes).toContain('Animal');
    });

    it('should validate theme names', () => {
      const isValidTheme = (theme) => {
        if (!theme || typeof theme !== 'string') return false;
        const trimmed = theme.trim();
        return trimmed.length >= 2 && trimmed.length <= 30;
      };
      
      expect(isValidTheme('Filme')).toBe(true);
      expect(isValidTheme('A')).toBe(false);
      expect(isValidTheme('')).toBe(false);
      expect(isValidTheme(null)).toBe(false);
      expect(isValidTheme(undefined)).toBe(false);
    });
  });

  describe('Game Round', () => {
    it('should generate valid letters for rounds', () => {
      const generateLetter = () => {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        return letters[Math.floor(Math.random() * letters.length)];
      };
      
      const letter = generateLetter();
      expect(letter).toMatch(/^[A-Z]$/);
    });

    it('should validate round duration', () => {
      const isValidDuration = (duration) => {
        return Number.isInteger(duration) && duration >= 30 && duration <= 300;
      };
      
      expect(isValidDuration(60)).toBe(true);
      expect(isValidDuration(29)).toBe(false);
      expect(isValidDuration(301)).toBe(false);
      expect(isValidDuration('60')).toBe(false);
    });
  });
});