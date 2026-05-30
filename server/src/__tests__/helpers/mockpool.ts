/**
 * Reusable pool mock factory.
 * Usage in test files:
 *
 *   jest.mock('../../db/pool', () => require('../helpers/mockPool').poolModuleMock())
 *
 * Then import and cast:
 *   import pool from '../../db/pool'
 *   import { getMockPool, getMockClient } from '../helpers/mockPool'
 */

export interface MockClient {
  query: jest.Mock
  release: jest.Mock
}

// Singleton mocks — reset in beforeEach
const _mockQuery   = jest.fn()
const _mockConnect = jest.fn()
const _mockClient: MockClient = {
  query:   jest.fn(),
  release: jest.fn(),
}

/** Returns the jest.mock factory value for pool */
export function poolModuleMock() {
  return {
    __esModule: true,
    default: {
      query:   _mockQuery,
      connect: _mockConnect,
      on:      jest.fn(),
    },
  }
}

export function getMockQuery()   { return _mockQuery }
export function getMockConnect() { return _mockConnect }
export function getMockClient()  { return _mockClient }

/** Call in beforeEach to clear state between tests */
export function resetMocks() {
  _mockQuery.mockReset()
  _mockConnect.mockReset()
  _mockClient.query.mockReset()
  _mockClient.release.mockReset()
  // Default: connect returns a working client
  _mockConnect.mockResolvedValue(_mockClient)
}
