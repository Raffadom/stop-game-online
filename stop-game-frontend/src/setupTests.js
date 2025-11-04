import '@testing-library/jest-dom'

// Mock mais específico do socket.io-client
const mockSocket = {
  on: vi.fn(),
  emit: vi.fn(),
  off: vi.fn(),
  disconnect: vi.fn(),
  connect: vi.fn(),
  connected: false,
  id: 'test-socket-id'
}

// Mock do socket.io-client para testes
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket)
}))

// Mock do socket.js específico
vi.mock('./socket.js', () => ({
  socket: mockSocket
}))

// Mock global do localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
global.localStorage = localStorageMock

// Mock global do sessionStorage
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
global.sessionStorage = sessionStorageMock