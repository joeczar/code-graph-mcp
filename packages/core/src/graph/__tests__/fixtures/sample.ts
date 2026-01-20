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

export class AdvancedCalculator extends Calculator {
  divide(a: number, b: number): number {
    return a / b;
  }
}
