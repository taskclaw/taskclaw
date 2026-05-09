/**
 * Reusable BullMQ Queue mock for unit tests.
 */

export function createBullQueueMock() {
  return {
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    getJob: jest.fn().mockResolvedValue(null),
    close: jest.fn().mockResolvedValue(undefined),
  };
}
