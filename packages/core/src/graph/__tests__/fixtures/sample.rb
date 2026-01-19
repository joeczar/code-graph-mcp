class Calculator
  def add(a, b)
    a + b
  end

  def multiply(a, b)
    a * b
  end
end

class AdvancedCalculator < Calculator
  def divide(a, b)
    a / b
  end
end

module MathHelpers
  def square(x)
    x * x
  end
end
