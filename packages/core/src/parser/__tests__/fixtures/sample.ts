export function greet(name: string): string {
  return `Hello, ${name}!`;
}

export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  multiply(a: number, b: number): number {
    return a * b;
  }
}

interface User {
  id: number;
  name: string;
}

export function createUser(id: number, name: string): User {
  return { id, name };
}
