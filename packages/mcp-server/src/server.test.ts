import { describe, it, expect } from 'vitest';
import { createServer } from './server.js';

describe('createServer', () => {
  it('should create a server instance', () => {
    const server = createServer();
    expect(server).toBeDefined();
    expect(server).toBeInstanceOf(Object);
  });

  it('should have setRequestHandler method', () => {
    const server = createServer();
    expect(server).toHaveProperty('setRequestHandler');
    expect(typeof server.setRequestHandler).toBe('function');
  });

  it('should have connect method', () => {
    const server = createServer();
    expect(server).toHaveProperty('connect');
    expect(typeof server.connect).toBe('function');
  });
});
