// Test fixture for call relationship extraction

function helper() {
  return 42;
}

function main() {
  const result = helper();
  return result;
}

class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  calculate(): number {
    return this.add(1, 2);
  }
}
